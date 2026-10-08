import { MotionPressable } from '@/components/motion/Motion';
import { useEffect, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AudioModule } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import { onboardingReviews } from '@/constants/OnboardingReviews';
import { useOnboarding } from '@/contexts/OnboardingProvider';
import { getDreamPlan, questions, recallSnapshot } from '@/util/onboarding';
import { storage } from '@/util/storage';
import { InitialiseNotifications } from '@/util/notification';
import { art, Button, DreamArt, Heading, OnboardingShell, palette, SmallNote, tap, ui } from './OnboardingUI';

export default function OnboardingFlow({ onOffer, onFinish }: { onOffer?: () => void; onFinish?: () => void }) {
  const { answers, step, setStep, setAnswer, completeOnboarding } = useOnboarding();
  const [permissionBusy, setPermissionBusy] = useState<'mic' | 'notification' | null>(null);
  const [micGranted, setMicGranted] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [reflection, setReflection] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const plan = getDreamPlan(answers);
  const snapshot = recallSnapshot(answers);
  const question = step >= 1 && step <= questions.length ? questions[step - 1] : null;
  const selected = question ? answers[question.id] : null;
  const dark = step === 15;
  const next = () => setStep(step + 1);
  const finish = () => { if (onFinish) { onFinish(); return; } completeOnboarding(); router.replace('/(tabs)'); };

  useEffect(() => {
    if (Platform.OS !== 'android' || step === 0) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setStep(step - 1); return true; });
    return () => subscription.remove();
  }, [step, setStep]);

  useEffect(() => {
    if (step !== 15) return;
    // The routine is derived locally from the answers. This is a short reveal, not a remote AI job.
    const timer = setTimeout(() => setStep(16), 1800);
    return () => clearTimeout(timer);
  }, [step, setStep]);

  useEffect(() => {
    if (step !== 17 || Platform.OS === 'web') return;
    void AudioModule.getRecordingPermissionsAsync().then(status => setMicGranted(status.granted)).catch(() => {});
    void Notifications.getPermissionsAsync().then(status => setNotificationGranted(status.granted && Boolean(storage.getBoolean('notifications')))).catch(() => {});
  }, [step]);

  const enablePermission = async (type: 'mic' | 'notification') => {
    if (permissionBusy) return;
    tap();
    setPermissionBusy(type);
    setPermissionMessage('');
    try {
      if (Platform.OS === 'web') {
        setPermissionMessage('You can enable this in the iOS or Android app. Writing works without any permissions.');
        return;
      }
      const status = type === 'mic' ? await AudioModule.requestRecordingPermissionsAsync() : await Notifications.requestPermissionsAsync();
      if (!status.granted) {
        setPermissionMessage('Access wasn’t enabled. You can continue, or change permissions in your device settings.');
        return;
      }
      if (type === 'mic') setMicGranted(true);
      else {
        storage.set('notifications', true);
        storage.set('dreamReminders', true);
        await InitialiseNotifications();
        setNotificationGranted(true);
      }
    } catch {
      setPermissionMessage('That couldn’t be enabled right now. You can still continue and try again in Settings.');
    } finally { setPermissionBusy(null); }
  };

  let content;
  if (step === 0) content = <>
    <View style={styles.welcomeSpace} />
    <DreamArt source={art.moon} size={300} />
    <Heading eyebrow="DREAM JOURNAL" title={'Write or record\nyour dreams.'} description="Save entries, search your journal, and request AI transcripts or summaries." />
    <View style={styles.introChip}><Ionicons name="sparkles-outline" color={palette.violet} size={16} /><Text style={styles.introText}>Set up your journal</Text></View>
  </>;
  else if (question) content = <>
    <View style={styles.questionTop}><Text style={styles.questionCount}>ABOUT YOU</Text><Text style={styles.questionCount}>{step} OF {questions.length}</Text></View>
    <View style={styles.questionMoon}><Ionicons name={question.options[0].icon} size={28} color={palette.violet} /></View>
    <Heading eyebrow={question.eyebrow} title={question.title} description={question.description} />
    <View style={{ gap: 12 }}>
      {question.options.map(option => <MotionPressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected === option.id, selected: selected === option.id }}
        haptic="none" onPress={() => { tap(); setAnswer(question.id, option.id); }}
        style={({ pressed }) => [styles.option, selected === option.id && styles.optionSelected, pressed && { opacity: .8 }]}>
        <View style={[styles.optionIcon, selected === option.id && { backgroundColor: '#E2D8F8' }]}><Ionicons name={option.icon} size={23} color={palette.violet} /></View>
        <View style={{ flex: 1 }}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.optionDescription}>{option.description}</Text></View>
        <View style={[styles.radio, selected === option.id && styles.radioSelected]}>{selected === option.id && <Ionicons name="checkmark" size={13} color="#FFF" />}</View>
      </MotionPressable>)}
    </View>
  </>;
  else if (step === 7) content = <>
    <Heading eyebrow="YOUR ANSWERS" title={'Your dream\nrecall.'} description="Based on your selected answer." />
    <DreamArt source={art.moon} size={210} />
    <View style={[ui.card, styles.snapshot]}>
      <Text style={ui.eyebrow}>YOUR SELF-REPORTED RECALL</Text>
      <Text style={styles.snapshotTitle}>{snapshot.label}</Text>
      <View style={styles.recallBars}>{[1, 2, 3, 4].map(level => <View key={level} style={[styles.recallBar, { height: 24 + level * 13, backgroundColor: level <= snapshot.level ? palette.violet : palette.pale }]} />)}</View>
      <View style={styles.barLabels}><Text style={styles.optionDescription}>Few details</Text><Text style={styles.optionDescription}>Vivid details</Text></View>
      <Text style={styles.snapshotCaption}>Your answer: {questions[1].options.find(option => option.id === answers.recall)?.title}</Text>
    </View>
    <SmallNote>Self-reported recall, not a test result.</SmallNote>
  </>;
  else if (step === 8) content = <>
    <DreamArt source={art.moon} size={235} />
    <Heading eyebrow="GETTING STARTED" title={answers.obstacle === 'busy' ? 'Short on time?\nSave a few details.' : answers.obstacle === 'words' ? 'Start with what\nyou remember.' : answers.obstacle === 'habit' ? 'Set a reminder\nto write.' : 'Record before\ndetails fade.'} description="An entry can be a few words or a voice recording." />
    <View style={[ui.card, { backgroundColor: '#F5EEF8', borderColor: '#EADBED' }]}><View style={ui.row}><Ionicons name="cloud-outline" size={25} color="#A8789D" /><Text style={[ui.cardTitle, { flex: 1 }]}>Start with one detail</Text></View><Text style={ui.body}>Record a place, person, or feeling you remember.</Text></View>
  </>;
  else if (step === 9) content = <>
    <Heading eyebrow="TEXT ENTRIES" title={'Short entries\nwork too.'} description="You can add details later." />
    <DreamArt source={art.journal} size={250} />
    <View style={ui.card}><Text style={styles.handwritten}>“A blue door. Someone laughing.\nI felt like I was coming home.”</Text><View style={styles.exampleTag}><Text style={ui.pillText}>EXAMPLE ENTRY</Text></View></View>
  </>;
  else if (step === 10) content = <>
    <DreamArt source={art.journal} size={220} />
    <Heading eyebrow="SAVE AND REVIEW" title={'Keep a record\nto revisit.'} />
    <View style={styles.comparison}>
      <View style={[styles.compareCard, { backgroundColor: '#F0EDF3' }]}><Text style={styles.compareLabel}>WITHOUT A ROUTINE</Text><Ionicons name="cloud-outline" size={30} color={palette.muted} /><Text style={ui.cardTitle}>Without an entry</Text><Text style={ui.body}>Details may be difficult to recall later.</Text></View>
      <View style={[styles.compareCard, { backgroundColor: '#EDE5FC', borderColor: '#D7C8F5' }]}><Text style={[styles.compareLabel, { color: palette.violet }]}>WITH DREAM AI</Text><Ionicons name="book-outline" size={30} color={palette.violet} /><Text style={ui.cardTitle}>Saved entry</Text><Text style={ui.body}>Save text or audio, then review it later.</Text></View>
    </View>
    <SmallNote>Journaling does not guarantee improved recall or sleep.</SmallNote>
  </>;
  else if (step === 11 && onboardingReviews.length) content = <>
    <DreamArt source={art.moon} size={195} />
    <Heading eyebrow="APP REVIEWS" title={'Dream AI\nreviews.'} description="Experiences from people who use Dream AI." />
    {onboardingReviews.slice(0, 3).map(review => <View key={review.sourceUrl} style={ui.card}><View style={[ui.row, { gap: 4, marginBottom: 13 }]}>{Array.from({ length: review.rating }, (_, i) => <Ionicons key={i} name="star" size={15} color={palette.violet} />)}</View><Text style={[ui.body, { color: palette.ink }]}>{review.quote}</Text><MotionPressable accessibilityRole="link" onPress={() => void Linking.openURL(review.sourceUrl)}><Text style={[ui.link, { textAlign: 'left' }]}>{review.author} · Read original review</Text></MotionPressable></View>)}
  </>;
  else if (step === 11) content = <>
    <DreamArt source={art.moon} size={200} />
    <Heading eyebrow="YOUR GOAL" title={'What would you\nlike to do?'} description="Choose one." />
    {['Keep a record of my dreams.', 'Find recurring themes.', 'Review my dreams later.'].map((text, index) => <MotionPressable key={text} accessibilityRole="radio" accessibilityState={{ checked: reflection === text, selected: reflection === text }} haptic="none" onPress={() => { tap(); setReflection(text); }} style={[ui.card, styles.reflectionCard, reflection === text && styles.optionSelected]}><View style={styles.reflectionIcon}><Ionicons name={(['moon-outline', 'planet-outline', 'heart-outline'] as const)[index]} size={22} color={palette.violet} /></View><Text style={[ui.body, { flex: 1, color: palette.ink }]}>{text}</Text>{reflection === text && <Ionicons name="checkmark-circle" size={20} color={palette.violet} />}</MotionPressable>)}

  </>;
  else if (step === 12) content = <>
    <DreamArt source={art.journal} size={270} />
    <Heading eyebrow="01 / WRITE" title={'Write a\ndream entry.'} description="Add text, a title, and the date of your dream." />
    <View style={ui.card}><View style={[ui.row, { marginBottom: 14 }]}><View style={styles.optionIcon}><Ionicons name="create-outline" size={22} color={palette.violet} /></View><View><Text style={ui.cardTitle}>The house by the sea</Text><Text style={styles.optionDescription}>An example journal entry</Text></View></View><Text style={ui.body}>I remember open windows, the sound of waves, and feeling like I’d been here before…</Text></View>
  </>;
  else if (step === 13) content = <>
    <View style={ui.pill}><Text style={ui.pillText}>FREE RECORDING</Text></View>
    <DreamArt source={art.voice} size={260} />
    <Heading eyebrow="02 / RECORD" title={'Record\nyour dream.'} description="Save a voice recording. Request AI transcription when you need it." />
    <View style={[ui.card, styles.waveCard]}><Ionicons name="mic" size={24} color={palette.violet} /><View style={styles.wave}>{[12, 24, 39, 21, 34, 50, 30, 18, 38, 24, 12].map((height, i) => <View key={i} style={{ width: 5, height, borderRadius: 6, backgroundColor: i % 3 ? '#BAA7EE' : palette.violet }} />)}</View><Text style={ui.pillText}>VOICE → WORDS</Text></View>
    <SmallNote>Microphone access is optional. You can always write instead.</SmallNote>
  </>;
  else if (step === 14) content = <>
    <View style={ui.pill}><Text style={ui.pillText}>OPTIONAL AI · FREE PREVIEWS</Text></View>
    <DreamArt source={art.moon} size={240} />
    <Heading eyebrow="03 / SUMMARIZE" title={'Create a\nsummary.'} description="Request an AI title, summary, and tags. Your original entry is retained." />
    <View style={ui.card}><View style={[ui.row, { marginBottom: 12 }]}><Ionicons name="sparkles" size={19} color={palette.violet} /><Text style={ui.cardTitle}>An example summary</Text></View><Text style={ui.body}>A familiar seaside home, open windows, and a feeling of returning somewhere you belong.</Text><View style={styles.tags}>{['ocean', 'home', 'familiarity'].map(tag => <View key={tag} style={styles.tag}><Text style={ui.pillText}>{tag}</Text></View>)}</View></View>
    <SmallNote>Requested content is sent to AI services. Results may contain mistakes.</SmallNote>
  </>;
  else if (step === 15) content = <>
    <View style={{ height: 35 }} />
    <DreamArt source={art.moon} size={270} />
    <Heading dark eyebrow="YOUR JOURNALING PLAN" title={'Preparing\nyour plan…'} description="Using your selected answers." />
    {['Your goal', plan.rhythm, plan.voice ? 'Voice entries' : 'Text entries'].map(text => <View key={text} style={[ui.row, { justifyContent: 'center', marginBottom: 18 }]}><Ionicons name="checkmark-circle" size={20} color="#CAB8FC" /><Text style={[ui.body, { color: '#DFD7EF' }]}>{text}</Text></View>)}
  </>;
  else if (step === 16) content = <>
    <View style={ui.pill}><Text style={ui.pillText}>MADE FROM YOUR ANSWERS</Text></View>
    <Heading eyebrow="YOUR JOURNALING PLAN" title={'Your plan.'} description={plan.goal} />
    <DreamArt source={art.journal} size={195} />
    {[{ title: plan.rhythm, detail: answers.obstacle === 'habit' ? 'Enable an optional daily reminder in Settings.' : 'Record after waking, while you remember the details.', icon: 'sunny-outline' }, { title: plan.capture, detail: plan.captureDetail, icon: plan.voice ? 'mic-outline' : 'create-outline' }, { title: plan.reflect, detail: plan.reflectDetail, icon: 'sparkles-outline' }].map((item, i) => <View key={item.title} style={[ui.card, ui.row]}><View style={styles.planNumber}><Text style={styles.planNumberText}>{i + 1}</Text></View><View style={{ flex: 1 }}><Text style={ui.cardTitle}>{item.title}</Text><Text style={ui.body}>{item.detail}</Text></View></View>)}
  </>;
  else content = <>
    <DreamArt source={plan.voice ? art.voice : art.journal} size={230} />
    <Heading eyebrow="PERMISSIONS" title={'Optional\npermissions.'} description="You can continue without enabling either." />
    <PermissionCard icon="mic-outline" title="Microphone" detail="Needed for free voice recording. AI transcription is optional." enabled={micGranted} busy={permissionBusy === 'mic'} disabled={Boolean(permissionBusy)} onPress={() => void enablePermission('mic')} />
    <PermissionCard icon="alarm-outline" title="Morning reminder" detail="An optional daily reminder at 8 AM. You can turn it off in Settings." enabled={notificationGranted} busy={permissionBusy === 'notification'} disabled={Boolean(permissionBusy)} onPress={() => void enablePermission('notification')} />
    {permissionMessage ? <View accessibilityLiveRegion="polite"><Text style={[ui.body, { textAlign: 'center' }]}>{permissionMessage}</Text>{Platform.OS !== 'web' && <MotionPressable accessibilityRole="button" onPress={() => void Linking.openSettings()}><Text style={ui.link}>Open device settings</Text></MotionPressable>}</View> : null}
  </>;

  const label = step === 0 ? 'Start' : step === 6 ? 'Review answers' : step === 16 ? 'Continue' : step === 17 ? 'Continue' : 'Continue';
  return <>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <OnboardingShell step={step} dark={dark} onBack={step > 0 && step !== 15 ? () => setStep(step === 16 ? 14 : step - 1) : undefined} onSkip={step === 0 ? finish : undefined}
      footer={step === 15 ? <Text style={[ui.note, { color: '#C7BED8' }]}>Your plan is created on this device.</Text> : <>
        <Button label={label} disabled={(question ? !selected : false) || Boolean(permissionBusy)} onPress={step === 17 ? onOffer ?? (() => router.push('/onboarding/final')) : next} />
        {(step === 0 || question || step === 17) && <SmallNote>{step === 0 ? '6 questions · About 2 minutes' : question ? 'Your answers stay on this device.' : 'Optional. Change these in Settings.'}</SmallNote>}
        {step === 11 && Platform.OS !== 'web' && <MotionPressable accessibilityRole="button" onPress={async () => { try { if (await StoreReview.hasAction()) await StoreReview.requestReview(); else setReviewMessage('Ratings aren’t available on this device right now.'); } catch { setReviewMessage('You can leave a rating in your app store later.'); } }}><Text style={ui.link}>Rate Dream AI</Text></MotionPressable>}
        {step === 11 && reviewMessage ? <SmallNote>{reviewMessage}</SmallNote> : null}
      </>}>
      {content}
    </OnboardingShell>
  </>;
}

function PermissionCard({ icon, title, detail, enabled, busy, disabled, onPress }: { icon: 'mic-outline' | 'alarm-outline'; title: string; detail: string; enabled: boolean; busy: boolean; disabled: boolean; onPress: () => void }) {
  return <View style={ui.card}><View style={[ui.row, { marginBottom: 12 }]}><View style={styles.optionIcon}><Ionicons name={icon} size={24} color={palette.violet} /></View><View style={{ flex: 1 }}><Text style={ui.cardTitle}>{title}</Text><Text style={ui.body}>{detail}</Text></View></View><MotionPressable accessibilityRole="button" accessibilityState={{ disabled: enabled || disabled }} disabled={enabled || disabled} haptic="none" onPress={onPress} style={[styles.enableButton, enabled && { backgroundColor: '#EAF3ED' }]}><Text style={[ui.pillText, enabled && { color: palette.green }]}>{enabled ? '✓ Enabled' : busy ? 'Enabling…' : 'Enable'}</Text></MotionPressable></View>;
}

const styles = StyleSheet.create({
  welcomeSpace: { height: 14 },
  introChip: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingVertical: 13 },
  introText: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: palette.violet },
  questionTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  questionCount: { fontFamily: 'Outfit_500Medium', fontSize: 10, letterSpacing: 1.8, color: palette.muted },
  questionMoon: { alignSelf: 'center', height: 52, width: 52, borderRadius: 20, backgroundColor: palette.pale, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  option: { padding: 14, borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 78 },
  optionSelected: { backgroundColor: '#F0EAFB', borderColor: palette.violet },
  optionIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#F3EEFB', alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: 'Outfit_500Medium', fontSize: 16, color: palette.ink, marginBottom: 4 },
  optionDescription: { fontFamily: 'Outfit_400Regular', fontSize: 12, lineHeight: 17, color: palette.muted },
  radio: { height: 20, width: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#DAD2E7', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { backgroundColor: palette.violet, borderColor: palette.violet },
  snapshot: { alignItems: 'center', paddingVertical: 25 },
  snapshotTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 26, color: palette.ink, marginVertical: 14 },
  recallBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 13, marginBottom: 15, marginTop: 8 },
  recallBar: { width: 43, borderRadius: 12 },
  barLabels: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  snapshotCaption: { fontFamily: 'Outfit_500Medium', fontSize: 13, color: palette.violet, marginTop: 21 },
  handwritten: { fontFamily: 'Outfit_400Regular', fontSize: 21, lineHeight: 31, color: palette.ink, textAlign: 'center', paddingVertical: 14 },
  exampleTag: { alignItems: 'center', marginTop: 12 },
  comparison: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  compareCard: { flex: 1, minWidth: 140, padding: 18, borderRadius: 22, gap: 12, borderWidth: 1, borderColor: palette.line },
  compareLabel: { fontFamily: 'Outfit_600SemiBold', fontSize: 9, letterSpacing: 1.1, color: palette.muted },
  reflectionCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17 },
  reflectionIcon: { height: 42, width: 42, borderRadius: 21, backgroundColor: palette.pale, alignItems: 'center', justifyContent: 'center' },
  waveCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  tag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: palette.pale },
  planNumber: { height: 35, width: 35, backgroundColor: palette.pale, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planNumberText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: palette.violet },
  enableButton: { backgroundColor: palette.pale, borderRadius: 14, padding: 14, alignItems: 'center' },
});
