import { haptic } from '@/util/haptics';
import { ReduceMotion } from 'react-native-reanimated';
import { MotionPressable, useMotionPreference } from '@/components/motion/Motion';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState, type RecordingStatus } from 'expo-audio';
import { beginRecordingAudio, endRecordingAudio } from '@/util/audio-playback';
import { Feather } from '@expo/vector-icons';
import { AudioWaveform, recordingLevel } from './AudioWaveform';
import { useJournalColors } from './journal/theme';
import { discardDraftRecording, hydrateDraft, retainRecording, updateDraft, useCaptureDraft } from '@/util/drafts';

const MAX_SECONDS = 600;
type Props = { onRecordingSaved?: () => void };
const Overlay = ({ children }: { children?: React.ReactNode }) => <FullWindowOverlay>{children}</FullWindowOverlay>;
const RecorderBottomSheet = forwardRef<BottomSheetModal, Props>(({ onRecordingSaved }, ref) => {
  const sheet = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => sheet.current!);
  const nativeEventHandler = useRef<(event: RecordingStatus) => void>(() => undefined);
  const recording = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }, event => nativeEventHandler.current(event));
  const status = useAudioRecorderState(recording, 100);
  const colors = useJournalColors();
  const [levels, setLevels] = useState<number[]>([]);
  const { draft } = useCaptureDraft();
  const prepared = useRef(false);
  const busy = useRef(false);
  const recordingDraftId = useRef<string | null>(null);
  const interruptionRequested = useRef(false);
  const duration = useRef(0);
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const { bottom } = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const reduced = useMotionPreference();
  const { fontScale } = useWindowDimensions();
  const ink = dark ? '#F8F4FF' : '#302A45';
  const surface = dark ? '#211D32' : '#FAF7FF';
  useEffect(() => { duration.current = status.durationMillis; }, [status.durationMillis]);
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => {
      try {
        const level = recordingLevel(recording.getStatus().metering);
        setLevels(current => [...current.slice(-39), level]);
      } catch { /* The interruption handler retains audio if media services reset. */ }
    }, 100);
    return () => clearInterval(timer);
  }, [state, recording]);

  const finish = async (interrupted = false, close = true) => {
    if (busy.current) { if (interrupted) interruptionRequested.current = true; return; }
    if (!prepared.current || !recordingDraftId.current) return;
    interruptionRequested.current = false;
    busy.current = true;
    if (mounted.current) { setState('saving'); setError(null); }
    const id = recordingDraftId.current;
    let elapsed = duration.current / 1000;
    try {
      try { elapsed = Math.max(duration.current, recording.getStatus().durationMillis) / 1000; } catch { /* Use the last known duration if native media services reset. */ }
      await recording.stop();
      prepared.current = false;
      if (!recording.uri) throw new Error('The recording has no audio file. Your written draft is safe.');
      await retainRecording(id, recording.uri, elapsed, interrupted);
      await endRecordingAudio();
      if (mounted.current) {
        setState('idle');
        if (!interrupted && close) haptic('success');
        if (close) sheet.current?.dismiss();
        onRecordingSaved?.();
      }
    } catch (failure) {
      if (prepared.current) { try { recording.pause(); } catch { /* Keep the last captured file even if media services reset. */ } }
      // Keep the temporary URI so copying can be retried without recording again.
      const uri = recording.uri;
      if (uri) {
        try { await updateDraft({ temporaryAudioUri: uri, audioLength: elapsed, recordingState: 'interrupted' }, id); } catch { /* original error is shown below */ }
      }
      if (mounted.current) { if (!interrupted && close) haptic('error'); setState(prepared.current ? 'paused' : 'idle'); setError(failure instanceof Error ? failure.message : 'We could not keep the recording. Retry before leaving.'); }
    } finally {
      if (!prepared.current || !mounted.current) await endRecordingAudio().catch(() => undefined);
      busy.current = false;
    }
  };
  useEffect(() => {
    nativeEventHandler.current = async event => {
      if ((!event.hasError && !event.mediaServicesDidReset && !event.isFinished) || busy.current || !prepared.current || !recordingDraftId.current) return;
      busy.current = true;
      prepared.current = false;
      const id = recordingDraftId.current;
      try {
        const uri = event.url || recording.uri;
        if (!uri) throw new Error('The recording was interrupted before an audio file was available. Your written draft is safe; you can start again.');
        await retainRecording(id, uri, duration.current / 1000, true);
        await endRecordingAudio();
        if (mounted.current) { setState('idle'); setError(event.hasError ? 'Recording was interrupted. The audio captured so far has been kept.' : null); }
      } catch (failure) {
        try { await updateDraft({ recordingState: 'interrupted', temporaryAudioUri: event.url || recording.uri || undefined, audioLength: duration.current / 1000 }, id); } catch { /* Keep the original interruption error. */ }
        if (mounted.current) { setState('idle'); setError(failure instanceof Error ? failure.message : 'Recording was interrupted. Retry recovery or start again.'); }
      } finally { await endRecordingAudio().catch(() => undefined); busy.current = false; }
    };
  }, [recording]);
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active' && prepared.current) void finishRef.current(true, false);
    });
    return () => {
      mounted.current = false;
      listener.remove();
      if (prepared.current) void finishRef.current(true, false);
    };
  }, []);
  useEffect(() => {
    if (status.durationMillis >= MAX_SECONDS * 1000 && prepared.current && !busy.current) {
      void finishRef.current(true, false);
    }
  }, [status.durationMillis]);

  async function start() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await hydrateDraft();
      const current = useCaptureDraft.getState().draft!;
      if (current.audioUri || current.temporaryAudioUri) {
        setError('This draft already has a recording. Keep it, or explicitly discard it before starting again.');
        return;
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone access is off. Allow it in your device settings, or write your dream instead.');
      await beginRecordingAudio();
      await recording.prepareToRecordAsync();
      recordingDraftId.current = current.id;
      prepared.current = true;
      // Persist ownership before starting, so interruption can never attach this file to another entry.
      await updateDraft({ recordingState: 'recording', temporaryAudioUri: recording.uri ?? undefined, audioLength: 0 }, current.id);
      duration.current = 0;
      setLevels([]);
      recording.record({ forDuration: MAX_SECONDS });
      setState('recording');
      haptic('light');
    } catch (failure) {
      haptic('error');
      setError(failure instanceof Error ? failure.message : 'Recording could not start. Please try again.');
      if (prepared.current) {
        await recording.stop().catch(() => undefined);
        prepared.current = false;
      }
      await endRecordingAudio().catch(() => undefined);
    } finally { busy.current = false; if (interruptionRequested.current && prepared.current) void finishRef.current(true, false); }
  }
  async function togglePause() {
    if (busy.current || !prepared.current) return;
    busy.current = true;
    try {
      if (state === 'recording') { recording.pause(); setState('paused'); await updateDraft({ recordingState: 'paused' }, recordingDraftId.current!); }
      else { recording.record({ forDuration: Math.max(1, MAX_SECONDS - duration.current / 1000) }); setState('recording'); await updateDraft({ recordingState: 'recording' }, recordingDraftId.current!); }
          haptic('selection');
    } catch { haptic('error'); setError('We could not change recording state. Finish to keep the audio captured so far.'); }
    finally { busy.current = false; if (interruptionRequested.current && prepared.current) void finishRef.current(true, false); }
  }
  async function retryRetention() {
    if (!draft?.temporaryAudioUri || busy.current) return;
    busy.current = true;
    setState('saving');
    try {
      await retainRecording(draft.id, draft.temporaryAudioUri, draft.audioLength ?? 0, true);
      haptic('success');
      setError(null);
      sheet.current?.dismiss();
      onRecordingSaved?.();
    } catch (failure) { haptic('error'); setError(failure instanceof Error ? failure.message : 'The recording could not be recovered.'); }
    finally { busy.current = false; setState('idle'); }
  }
  function discard() {
    Alert.alert('Discard this recording?', 'Your written dream will stay. This audio will be removed from the draft.', [
      { text: 'Use recording', style: 'cancel' },
      { text: 'Clear audio', style: 'destructive', onPress: async () => {
        if (busy.current) return;
        if (prepared.current) await finish(false, false);
        if (prepared.current) return;
        const current = useCaptureDraft.getState().draft;
        if (current) await discardDraftRecording(current.id).catch(() => setError('Could not discard the audio. Please retry.'));
        setState('idle');
      } },
    ]);
  }
  const hasRecording = Boolean(draft?.audioUri || draft?.temporaryAudioUri);
  const active = state === 'recording' || state === 'paused';
  const seconds = active ? Math.floor(status.durationMillis / 1000) : Math.floor(draft?.audioLength ?? 0);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <BottomSheetModal ref={sheet} index={0} overrideReduceMotion={reduced ? ReduceMotion.Always : ReduceMotion.System} snapPoints={[fontScale > 1.3 ? '90%' : '72%']} enableDynamicSizing={false} accessible={false}
    backdropComponent={props => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={.35} pressBehavior={active || state === 'saving' ? 'none' : 'close'} />}
    enablePanDownToClose={!active && state !== 'saving'} containerComponent={Platform.OS === 'ios' ? Overlay : undefined}
    backgroundStyle={{ backgroundColor: surface, borderRadius: 30 }} handleIndicatorStyle={{ backgroundColor: '#B5A6D6', width: 42 }}
    onDismiss={() => { if (prepared.current) void finish(true, false); }}>
    <BottomSheetView accessible={false} style={{ flex: 1, height: '100%' }}><BottomSheetScrollView style={{ flex: 1 }} key={fontScale} contentContainerStyle={[styles.body, { paddingBottom: 20 }]} accessible={false}>

      <Text maxFontSizeMultiplier={2} style={[styles.heading, { color: ink }]}>{state === 'paused' ? 'Recording paused' : state === 'recording' ? 'Recording' : hasRecording ? 'Recording saved' : 'Voice recording'}</Text>
      <Text style={[styles.copy, { color: dark ? '#BFB4D3' : '#756D88' }]}>{active ? 'Tap Finish recording when you’re done.' : hasRecording ? 'Your audio is kept with this dream draft.' : 'Tap Start recording, then tell your dream.'}</Text>
      <View style={[styles.waveCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.recordingLabel}><Feather accessible={false} name={state === 'paused' ? 'pause' : 'mic'} size={18} color={colors.accent} /><Text style={[styles.secondaryText, { color: colors.ink }]}>{state === 'recording' ? 'Listening to your dream' : state === 'paused' ? 'Take your time' : hasRecording ? 'Your recording is ready' : 'Your voice, your dream'}</Text></View>
        <AudioWaveform levels={levels} />
        <Text style={[styles.note, { color: colors.muted }]}>{state === 'recording' ? 'The wave follows your voice.' : state === 'paused' ? 'Resume when you’re ready.' : hasRecording ? 'Keep this audio or clear it to start again.' : 'A wave will appear as you speak.'}</Text>
      </View>
      <Text maxFontSizeMultiplier={2} style={[styles.clock, { color: ink }]}>{clock}</Text>
      <Text style={[styles.note, { color: dark ? '#BFB4D3' : '#756D88' }]}>{draft?.recordingState === 'interrupted' ? 'Recording interrupted. Keep the captured audio or discard it to start again.' : 'Up to 10 minutes · saved only to this dream'}</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</BottomSheetScrollView><View key={`actions:${fontScale}`} style={{ flexShrink: 0, paddingHorizontal: 24, paddingBottom: bottom + 16, gap: 8 }}>
      {active ? <View style={styles.row}>
        <MotionPressable accessibilityRole="button" accessibilityLabel={state === 'paused' ? 'Resume recording' : 'Pause recording'} haptic="none" onPress={togglePause} style={[styles.secondary, { borderColor: '#BBA5DA' }]}><Text maxFontSizeMultiplier={2} style={[styles.secondaryText, { color: ink }]}>{state === 'paused' ? 'Resume' : 'Pause'}</Text></MotionPressable>
        <MotionPressable accessibilityRole="button" accessibilityLabel="Finish recording" haptic="none" onPress={() => finish(false)} style={styles.primary}><Text maxFontSizeMultiplier={2} style={styles.buttonText}>Finish recording</Text></MotionPressable>
      </View> : hasRecording ? <View style={styles.row}>
        <MotionPressable accessibilityRole="button" onPress={discard} style={styles.secondary}><Text maxFontSizeMultiplier={2} style={[styles.secondaryText, { color: ink }]}>Clear audio</Text></MotionPressable>
        <MotionPressable accessibilityRole="button" haptic={draft?.temporaryAudioUri ? 'none' : 'light'} onPress={draft?.temporaryAudioUri ? retryRetention : () => sheet.current?.dismiss()} style={styles.primary}><Text maxFontSizeMultiplier={2} style={styles.buttonText}>{draft?.temporaryAudioUri ? 'Recover audio' : 'Use recording'}</Text></MotionPressable>
      </View> : <MotionPressable accessibilityRole="button" accessibilityLabel="Start recording" disabled={state === 'saving'} haptic="none" onPress={start} style={[styles.primary, { width: '100%', flexBasis: 'auto', flexGrow: 0 }]}><Text maxFontSizeMultiplier={2} style={styles.buttonText}>{state === 'saving' ? 'Saving recording…' : 'Start recording'}</Text></MotionPressable>}
      <MotionPressable accessibilityRole="button" disabled={state === 'saving'} onPress={() => active ? finish(true) : sheet.current?.dismiss()} style={{ padding: 16 }}><Text maxFontSizeMultiplier={2} style={[styles.secondaryText, { color: dark ? '#BFB4D3' : '#756D88' }]}>{active ? 'Close & keep captured audio' : 'Back to draft'}</Text></MotionPressable>
    </View></BottomSheetView>
  </BottomSheetModal>;
});
RecorderBottomSheet.displayName = 'RecorderBottomSheet';
export default RecorderBottomSheet;
const styles = StyleSheet.create({
  waveCard: { alignSelf: 'stretch', padding: 22, borderRadius: 24, borderWidth: 1, gap: 18, marginTop: 10 }, recordingLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }, body: { paddingHorizontal: 24, alignItems: 'center', gap: 14 }, eyebrow: { fontSize: 11, letterSpacing: 2, marginTop: 20, fontFamily: 'Outfit_500Medium' }, heading: { fontSize: 30, fontFamily: 'Outfit_600SemiBold', textAlign: 'center' }, copy: { fontSize: 17, textAlign: 'center', lineHeight: 23, fontFamily: 'Outfit_400Regular' }, clock: { fontSize: 40, fontVariant: ['tabular-nums'], fontFamily: 'Outfit_500Medium' }, note: { textAlign: 'center', fontSize: 14, lineHeight: 21 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%', marginTop: 8 }, primary: { backgroundColor: '#6243BB', minHeight: 60, borderRadius: 18, padding: 16, flexGrow: 1, flexBasis: 140, alignItems: 'center', justifyContent: 'center' }, secondary: { borderWidth: 1, borderColor: '#BBA5DA', borderRadius: 18, minHeight: 52, padding: 16, flexGrow: 1, flexBasis: 140, alignItems: 'center', justifyContent: 'center' }, secondaryText: { fontFamily: 'Outfit_500Medium', fontSize: 17, textAlign: 'center' }, buttonText: { fontSize: 17, textAlign: 'center', color: '#FFF', fontFamily: 'Outfit_600SemiBold' }, error: { color: '#C75B72', textAlign: 'center', fontSize: 16, lineHeight: 24 },
});
