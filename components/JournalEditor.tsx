import { haptic } from '@/util/haptics';
import { MotionPressable, MotionReveal } from '@/components/motion/Motion';
import { Alert, ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DatePickerModal } from './DatePickerModal';
import { completeDraft, discardDraftRecording, flushDraft, hydrateDraft, localDreamDate, updateDraft, useCaptureDraft } from '@/util/drafts';
import { saveDream } from '@/util/journal';
import { saveDreamWithoutAI } from '@/util/processDream';
import DreamAudioPlayer from './DreamAudioPlayer';
import { useJournalColors } from './journal/theme';
import { stopRecordingPlayback } from '@/util/audio-playback';

type Props = { openBottomSheet: () => void };
export default function JournalEditor({ openBottomSheet }: Props) {
  const { draft, hydrated, persistenceError } = useCaptureDraft();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const saveBusy = useRef(false);
  const router = useRouter();
  const colors = useJournalColors();
  const { fontScale } = useWindowDimensions();
  const ink = colors.ink;
  const muted = colors.muted;
  const card = colors.surface;
  useEffect(() => { void hydrateDraft(); }, []);
  async function handleSave() {
    if (saveBusy.current || !draft) return;
    if (!draft.text.trim() && !draft.audioUri) { setError('Write a few words or keep a recording before saving.'); haptic('error'); return; }
    if (draft.temporaryAudioUri || draft.recordingState === 'recording' || draft.recordingState === 'paused') { setError('Finish or recover your recording before saving this dream.'); haptic('error'); return; }
    saveBusy.current = true;
    setSaving(true); setError(null);
    try {
      const current = await flushDraft();
      const text = current.text.trim();
      const basic = saveDreamWithoutAI(text, new Date(`${current.dreamDate}T12:00:00`));
      const saved = await saveDream({ ...basic, id: current.id, title: text ? basic.title : 'A dream in your voice', transcript: text, original_text: text, dream_date: current.dreamDate, local_audio_uri: current.audioUri, audio_length: current.audioLength, processing_status: 'idle' });
      // Local persistence is the success boundary. Sync and AI never block this navigation.
      stopRecordingPlayback();
      await completeDraft(current.id).catch(() => undefined);
      haptic('success');
      router.replace({ pathname: '/Dream/[id]', params: { id: String(saved.id) } });
    } catch (failure) { haptic('error'); setError(failure instanceof Error ? failure.message : 'Your dream could not be saved. Your draft is still here; please retry.'); }
    finally { saveBusy.current = false; setSaving(false); }
  }
  function removeAudio() {
    if (!draft) return;
    Alert.alert('Remove this recording?', 'Your written dream stays in the draft.', [{ text: 'Keep', style: 'cancel' }, { text: 'Remove audio', style: 'destructive', onPress: () => { stopRecordingPlayback(); void discardDraftRecording(draft.id).catch(() => setError('Could not remove audio. Please try again.')); } }]);
  }
  if (!hydrated || !draft) return <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={{ color: muted }}>Restoring your draft…</Text></View>;
  const selectedDate = new Date(`${draft.dreamDate}T12:00:00`);
  const canSave = Boolean(draft.text.trim() || draft.audioUri);
  return <MotionReveal key={fontScale} style={{ flex: 1 }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24, gap: 20 }} showsVerticalScrollIndicator={false}>
      <View><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.heading, { color: ink }]}>New dream</Text><Text style={[styles.intro, { color: muted }]}>Write your dream below, or record it with your voice.</Text></View>
      <MotionPressable accessibilityRole="button" accessibilityLabel="Choose dream date" onPress={() => setShowDatePicker(true)} style={[styles.date, { backgroundColor: card }]}>
        <View style={[styles.row, { flex: 1 }]}><Feather accessible={false} name="calendar" size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text style={[styles.caption, { color: muted }]}>Dream date</Text><Text style={[styles.dateText, { color: ink }]}>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</Text></View></View><Feather accessible={false} name="chevron-down" size={18} color={muted} />
      </MotionPressable>
      <DatePickerModal isVisible={showDatePicker} onClose={() => setShowDatePicker(false)} selectedDate={selectedDate} onDateChange={date => { if (Platform.OS === 'android') setShowDatePicker(false); void updateDraft({ dreamDate: localDreamDate(date) }).catch(() => undefined); }} maximumDate={new Date()} />
      <View style={[styles.paper, { backgroundColor: card }]}>
        <TextInput accessibilityLabel="Your dream" multiline textAlignVertical="top" value={draft.text} onChangeText={text => { setError(null); void updateDraft({ text }).catch(() => undefined); }} editable={!saving}
          placeholder="I remember…" placeholderTextColor={colors.muted} style={[styles.input, { color: ink }]} />
        <View style={styles.draftStatus}><Feather accessible={false} name={persistenceError ? 'alert-circle' : 'check-circle'} size={13} color={persistenceError ? '#C75B72' : '#8E6CD0'} /><Text style={[styles.draftLabel, { color: muted }]}>{persistenceError ? 'Draft needs attention' : 'Draft saved'}</Text></View>
      </View>
      {(draft.audioUri || draft.temporaryAudioUri) ? <View style={[styles.audio, { backgroundColor: card }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View style={styles.row}><Feather accessible={false} name="mic" size={18} color={colors.accent} /><Text style={[styles.dateText, { color: ink }]}>{draft.audioUri ? 'Recording saved' : 'Recover your recording'}</Text></View><MotionPressable accessibilityRole="button" accessibilityLabel="Remove draft recording" onPress={removeAudio} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Feather accessible={false} name="trash-2" size={18} color={muted} /></MotionPressable></View>
        {draft.audioUri && <DreamAudioPlayer key={`${draft.id}:${draft.audioUri}`} audio_url={draft.audioUri} id={draft.id} ownerId={draft.ownerId || 'device'} title="Draft recording" draft duration={draft.audioLength} />}
        <Text style={[styles.intro, { color: muted, fontSize: 16 }]}>{draft.recordingState === 'interrupted' ? 'Recording interrupted. Recovered audio is attached.' : 'Save your dream, then turn the recording into text.'}</Text>
        {draft.temporaryAudioUri && <MotionPressable accessibilityRole="button" onPress={openBottomSheet}><Text style={{ color: '#9A80CC', fontFamily: 'Outfit_600SemiBold' }}>Open recording recovery</Text></MotionPressable>}
      </View> : <MotionPressable accessibilityRole="button" accessibilityLabel="Record audio" accessibilityHint="Opens voice recording so you can speak your dream" onPress={openBottomSheet} style={styles.voice}><View style={styles.mic}><Feather accessible={false} name="mic" size={22} color={colors.accent} /></View><View style={{ flex: 1 }}><Text style={[styles.dateText, { color: ink }]}>Record audio</Text><Text style={[styles.intro, { color: muted, fontSize: 16 }]}>Speak instead of typing.</Text></View><Feather accessible={false} name="arrow-up-right" size={20} color={colors.accent} /></MotionPressable>}
      {(error || persistenceError) && <Text accessibilityRole="alert" style={styles.error}>{error || persistenceError}</Text>}
    </ScrollView>
    <MotionPressable accessibilityRole="button" accessibilityLabel={saving ? 'Saving dream' : 'Save dream'} accessibilityState={{ disabled: saving || !canSave, busy: saving }} haptic="none" onPress={handleSave} disabled={saving || !canSave} style={[styles.save, { backgroundColor: colors.accent, opacity: saving || !canSave ? 0.55 : 1 }]}>
      {saving ? <ActivityIndicator color="#FFF" /> : <Feather accessible={false} name="check" color="#FFF" size={20} />}<Text maxFontSizeMultiplier={2} style={styles.saveText}>{saving ? 'Saving…' : 'Save dream'}</Text>
    </MotionPressable>
    <Text maxFontSizeMultiplier={2} style={[styles.footnote, { color: muted }]}>Your draft stays here if you close this page.</Text>
  </MotionReveal>;
}
const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }, eyebrow: { color: '#9A80CC', fontSize: 10, letterSpacing: 2, fontFamily: 'Outfit_500Medium', marginTop: 10 }, heading: { fontSize: 38, fontFamily: 'Outfit_600SemiBold', marginTop: 10 }, intro: { fontSize: 17, fontFamily: 'Outfit_400Regular', lineHeight: 23, marginTop: 7 }, date: { padding: 16, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, draftLabel: { fontSize: 14, fontFamily: 'Outfit_400Regular' }, caption: { fontSize: 14, fontFamily: 'Outfit_400Regular' }, dateText: { fontSize: 17, fontFamily: 'Outfit_500Medium', marginTop: 3 }, paper: { padding: 20, borderRadius: 24, minHeight: 270 }, input: { fontFamily: 'Outfit_400Regular', fontSize: 20, lineHeight: 30, minHeight: 220 }, draftStatus: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 15 }, voice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10 }, mic: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#EEE5F9', alignItems: 'center', justifyContent: 'center' }, audio: { borderRadius: 22, padding: 18, gap: 14 }, save: { backgroundColor: '#8E6CD0', flexDirection: 'row', gap: 10, justifyContent: 'center', alignItems: 'center', padding: 18, borderRadius: 20 }, saveText: { color: '#FFF', fontSize: 17, fontFamily: 'Outfit_600SemiBold' }, footnote: { fontFamily: 'Outfit_400Regular', textAlign: 'center', fontSize: 14, paddingTop: 10, paddingBottom: 4 }, error: { color: '#C75B72', fontFamily: 'Outfit_400Regular', lineHeight: 21 } });
