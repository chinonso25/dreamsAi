import { haptic } from '@/util/haptics';
import { MotionPressable, MotionReveal, useMotionPreference } from '@/components/motion/Motion';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import { useJournalColors } from '@/components/journal/theme';
import { useRecordingPlayback } from '@/util/audio-playback';
import { useAuth } from '@/contexts/AuthProvider';
import { useSubscription } from '@/contexts/SubscriptionProvider';
import { storage } from '@/util/storage';
import { InitialiseNotifications } from '@/util/notification';
import { useJournalStore } from '@/util/journal';

export default function SettingsScreen() {
  const { fontScale } = useWindowDimensions();
  const colors = useJournalColors();
  const reduced = useMotionPreference();
  const playingTrack = useRecordingPlayback(state => state.track);
  const { user, isGuest, loading, error, reconnect, sendEmailCode, verifyEmailCode, deleteAccount } = useAuth();
  const { isSubscribed, restorePurchases, showPaywall, isLoading } = useSubscription();
  const allEntries = useJournalStore(state => state.entries);
  const entries = allEntries.filter(entry => entry.user_id === user?.id || entry.user_id === 'device');
  const [legalVisible, setLegalVisible] = useState(false);
  const [reminders, setReminders] = useState(Boolean(storage.getBoolean('dreamReminders') && storage.getBoolean('notifications')));
  const [hour, setHour] = useState(storage.getNumber('reminderHour') ?? 8);
  const [minute, setMinute] = useState(storage.getNumber('reminderMinute') ?? 0);
  const [timeVisible, setTimeVisible] = useState(false);
  const [accountVisible, setAccountVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState('');
  const [billingBusy, setBillingBusy] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deletionNotice, setDeletionNotice] = useState('');
  const time = new Date(); time.setHours(hour, minute, 0, 0);
  const toggleReminder = async (enabled: boolean) => {
    try {
      if (enabled && !(await Notifications.requestPermissionsAsync()).granted) {
        Alert.alert('Allow dream reminders', 'Enable notifications in your device settings, then return here to turn on your reminder.'); return;
      }
      storage.set('notifications', enabled); storage.set('dreamReminders', enabled); setReminders(enabled);
      await InitialiseNotifications();
    } catch { Alert.alert('Reminder not updated', 'Your preference is saved. Please try scheduling the reminder again.'); }
  };
  const changeTime = async (date: Date) => {
    setHour(date.getHours()); setMinute(date.getMinutes());
    storage.set('reminderHour', date.getHours()); storage.set('reminderMinute', date.getMinutes());
    try { await InitialiseNotifications(); } catch { Alert.alert('Reminder not scheduled', 'Your chosen time is saved. Toggle the reminder to try again.'); }
  };
  const emailAction = async () => {
    setMessage('');
    try {
      if (!codeSent) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setMessage('Enter a valid email address.'); return; }
        await sendEmailCode(email); setCodeSent(true); setMessage('Check your inbox for a six-digit code.');
      } else {
        if (!/^\d{6}$/.test(code.trim())) { setMessage('Enter the six-digit code from your email.'); return; }
        await verifyEmailCode(email, code); setAccountVisible(false); setCode(''); setCodeSent(false);
        Alert.alert('Email account added', 'Use this email to recover your dreams on another device.');
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not connect. Please try again.'); }
  };
  const exportJournal = async () => {
    try {
      const text = entries.map(entry => `${entry.title || 'Untitled dream'}\nDream date: ${entry.dream_date}\n\n${entry.original_text || entry.transcript}\n${entry.summary ? `\nSummary\n${entry.summary}\n` : ''}${entry.mood ? `\nMood: ${entry.mood}` : ''}\n${entry.tags?.length ? `Tags: ${entry.tags.join(', ')}` : ''}`).join('\n\n————————————\n\n');
      if (!text) { Alert.alert('Your journal is waiting', 'Save your first dream before exporting.'); return; }
      if (Platform.OS !== 'web' && await Sharing.isAvailableAsync()) {
        const file = new File(Paths.cache, 'my-dream-journal.txt'); file.create({ overwrite: true }); file.write(text);
        await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Export your dream journal', UTI: 'public.plain-text' });
      } else await Share.share({ title: 'My dream journal', message: text });
    } catch { Alert.alert('Could not export', 'Your journal remains saved. Please try again.'); }
  };
  const billingAction = async (restore = false) => {
    if (billingBusy) return; setBillingBusy(true);
    try {
      if (restore) { if (await restorePurchases()) Alert.alert('Premium restored', 'Your premium features are ready to use.'); }
      else { const result = await showPaywall(); if (result === 'unavailable' || result === 'error') Alert.alert('Store connection unavailable', 'Your journal is ready to use. Please try again or restore an existing purchase.'); }
    } finally { setBillingBusy(false); }
  };
  const confirmDeletion = async () => {
    setDeleteMessage('');
    try {
      const result = await deleteAccount();
      setDeleteVisible(false);
      setDeletionNotice(result.cleanupWarning || 'Your account and its journal have been deleted. You can start a fresh journal as a guest. Your store subscription has not been canceled.');
      setAccountVisible(false); setEmail(''); setCode(''); setCodeSent(false);
    } catch (cause) { setDeleteMessage(cause instanceof Error ? cause.message : 'Could not confirm account deletion. Your journal has been retained. Please try again.'); }
  };
  const row = (icon: keyof typeof Ionicons.glyphMap, title: string, subtitle: string, action?: () => void, trailing?: React.ReactNode) => {
    const content = <><View accessible={false} style={[styles.icon, { backgroundColor: colors.accentSoft }]}><Ionicons accessible={false} name={icon} size={21} color={colors.accent} /></View><View accessible={!action} accessibilityLabel={`${title}. ${subtitle}`} style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text><Text style={[styles.small, { color: colors.muted }]}>{subtitle}</Text></View>{trailing || (action && <Ionicons accessible={false} name="chevron-forward" size={18} color={colors.muted} />)}</>;
    return action ? <MotionPressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} onPress={action} style={[styles.row, { borderColor: colors.border }]}>{content}</MotionPressable> : <View style={[styles.row, { borderColor: colors.border }]}>{content}</View>;
  };
  const section = (label: string) => <Text style={[styles.section, { color: colors.muted }]}>{label}</Text>;
  const openHelpPage = (path: string) => {
    void Linking.openURL(`https://thedreamer.app/${path}`).catch(() => {
      Alert.alert('Could not open this page', `Visit thedreamer.app/${path} in your browser.`);
    });
  };
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}><ScrollView key={fontScale} contentContainerStyle={[styles.page, { paddingBottom: playingTrack ? 200 : 130 }]} keyboardShouldPersistTaps="handled">
    <MotionReveal style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8 }}><MotionPressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.navigate('/(tabs)')} style={{ minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', gap: 6, borderRadius: 16, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons accessible={false} name="arrow-back" size={21} color={colors.accent} /><Text style={{ color: colors.accent, fontFamily: 'Outfit_500Medium', fontSize: 16 }}>Back</Text></MotionPressable><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.heading, { color: colors.ink, marginTop: 0 }]}>Settings</Text></MotionReveal>
    <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 26 }]}>{row(isGuest ? 'person-circle-outline' : 'shield-checkmark-outline', isGuest ? 'Your account' : 'Email account', isGuest ? 'Add an email to recover your dreams' : user?.email || 'Your journal is connected', isGuest ? () => { setAccountVisible(true); setMessage(''); } : undefined)}</View>
    {error && <MotionPressable onPress={() => void reconnect()} accessibilityRole="button" style={[styles.notice, { backgroundColor: colors.accentSoft }]}><Text style={[styles.small, { color: colors.ink }]}>{error} Tap to reconnect.</Text></MotionPressable>}
    {deletionNotice !== '' && <View style={[styles.notice, { backgroundColor: colors.accentSoft }]}><Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.ink }]}>{deletionNotice}</Text></View>}
    {section('REMINDERS')}<View style={[styles.card, { backgroundColor: colors.surface }]}>{row('alarm-outline', 'Dream reminder', reminders ? 'Daily at your chosen time' : 'Off', undefined, <Switch accessibilityLabel="Dream reminders" value={reminders} onValueChange={value => { haptic('selection'); void toggleReminder(value); }} trackColor={{ false: colors.border, true: colors.accent }} />)}{row('time-outline', 'Reminder time', time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), () => setTimeVisible(true))}</View>
    {section('PREMIUM')}<View style={[styles.card, { backgroundColor: colors.surface }]}>{row('sparkles-outline', isSubscribed ? 'Premium active' : 'Dreamer Premium', 'Turn recordings into text and summarize dreams', () => void billingAction(), billingBusy || isLoading ? <ActivityIndicator color={colors.accent} /> : undefined)}{row('refresh-outline', 'Restore purchases', 'Reconnect an existing App Store subscription', () => void billingAction(true))}</View>
    {section('YOUR JOURNAL')}<View style={[styles.card, { backgroundColor: colors.surface }]}>{row('download-outline', 'Export my dreams', 'Keep a readable copy of your journal', () => void exportJournal())}{row('moon-outline', 'Appearance', 'Matches your phone’s light or dark mode')}</View>
    {!isGuest && user && <>{section('YOUR ACCOUNT')}<View style={[styles.card, { backgroundColor: colors.surface }]}><MotionPressable accessibilityRole="button" disabled={loading} onPress={() => { setDeleteMessage(''); setDeleteVisible(true); }} style={styles.row}><View style={[styles.icon, { backgroundColor: colors.elevated }]}><Ionicons accessible={false} name="trash-outline" size={21} color={colors.danger} /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.danger }]}>Delete my account</Text><Text style={[styles.small, { color: colors.muted }]}>Remove your account, dreams, and recordings</Text></View><Ionicons accessible={false} name="chevron-forward" size={18} color={colors.danger} /></MotionPressable></View></>}
    {section('HELP & LEGAL')}<View style={[styles.card, { backgroundColor: colors.surface }]}>{row('help-circle-outline', 'Help & support', 'Get help with your journal', () => openHelpPage('support'))}{row('card-outline', 'Subscription help', 'Renewals and cancellation', () => openHelpPage('subscriptions'))}{row('document-text-outline', 'Privacy & terms', 'How we care for your information', () => setLegalVisible(!legalVisible), <Ionicons accessible={false} name={legalVisible ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />)}{legalVisible && <MotionReveal subtle>{row('shield-checkmark-outline', 'Privacy policy', 'How your information is used', () => openHelpPage('privacy'))}{row('document-text-outline', 'Terms of use', 'App license and service terms', () => openHelpPage('terms'))}{row('trash-outline', 'Data deletion help', 'Account and guest journal information', () => openHelpPage('delete-account'))}</MotionReveal>}</View>
    <Text style={[styles.footer, { color: colors.muted }]}>Private by default · AI runs when you ask.{'\n'}The Dreamer · {Constants.expoConfig?.version || '1.0.3'}</Text>
  </ScrollView>
    <Modal visible={deleteVisible} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={() => { if (!loading) setDeleteVisible(false); }}><SettingsSheet><Ionicons accessible={false} name="trash-outline" size={30} color={colors.danger} /><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.heroTitle, { color: colors.ink }]}>Delete your account?</Text><Text style={[styles.description, { color: colors.muted }]}>This permanently removes your email account, its journal, and its recordings. Export any dreams you want to keep first. This cannot be undone.</Text><Text style={[styles.description, { color: colors.muted }]}>Deleting your account does not cancel a store subscription. Manage any subscription in your App Store or Google Play settings.</Text>{deleteMessage !== '' && <Text accessibilityLiveRegion="assertive" style={[styles.small, { color: colors.danger, marginTop: 16 }]}>{deleteMessage}</Text>}<MotionPressable accessibilityRole="button" accessibilityLabel="Permanently delete my account and journal" accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={() => void confirmDeletion()} style={[styles.button, { backgroundColor: colors.danger, opacity: loading ? .6 : 1 }]}>{loading ? <ActivityIndicator color="#FFF" /> : <Text maxFontSizeMultiplier={2} style={styles.buttonText}>Delete account & journal</Text>}</MotionPressable><MotionPressable accessibilityRole="button" disabled={loading} onPress={() => setDeleteVisible(false)} style={[styles.button, { backgroundColor: colors.elevated }]}><Text style={[styles.buttonText, { color: colors.ink }]}>Keep my account</Text></MotionPressable></SettingsSheet></Modal>
    {timeVisible && (Platform.OS === 'android' ? <DateTimePicker value={time} mode="time" onChange={(_, date) => { setTimeVisible(false); if (date) void changeTime(date); }} /> : <Modal transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={() => setTimeVisible(false)}><SettingsSheet><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.heroTitle, { color: colors.ink }]}>Reminder time</Text>{Platform.OS === 'web' ? <View style={{ flexDirection: 'row', gap: 12 }}><TextInput accessibilityLabel="Reminder hour" keyboardType="number-pad" value={String(hour)} onChangeText={value => { const next = Number(value); if (Number.isInteger(next) && next >= 0 && next < 24) { const date = new Date(time); date.setHours(next); void changeTime(date); } }} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} /><TextInput accessibilityLabel="Reminder minute" keyboardType="number-pad" value={String(minute)} onChangeText={value => { const next = Number(value); if (Number.isInteger(next) && next >= 0 && next < 60) { const date = new Date(time); date.setMinutes(next); void changeTime(date); } }} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} /></View> : <DateTimePicker value={time} mode="time" display="spinner" textColor={colors.ink} onChange={(_, date) => { if (date) void changeTime(date); }} />}<MotionPressable accessibilityRole="button" onPress={() => setTimeVisible(false)} style={[styles.button, { backgroundColor: colors.accent }]}><Text maxFontSizeMultiplier={2} style={styles.buttonText}>Done</Text></MotionPressable></SettingsSheet></Modal>)}
    <Modal visible={accountVisible} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={() => setAccountVisible(false)}><SettingsSheet><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text maxFontSizeMultiplier={2} accessibilityRole="header" style={[styles.heroTitle, { color: colors.ink, flex: 1 }]}>{codeSent ? 'Enter email code' : 'Sign in with email'}</Text><MotionPressable style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Close account recovery" accessibilityRole="button" onPress={() => setAccountVisible(false)}><Text maxFontSizeMultiplier={2} style={{ fontFamily: 'Outfit_500Medium', fontSize: 16, color: colors.ink }}>Close</Text></MotionPressable></View><Text style={[styles.description, { color: colors.muted }]}>No password required. Your saved dreams will stay with your account.</Text><TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} editable={!codeSent && !loading} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} />{codeSent && <TextInput accessibilityLabel="Email sign-in code" autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="Six-digit code" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.border }]} />}{Boolean(message) && <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.muted, marginVertical: 12 }]}>{message}</Text>}<MotionPressable disabled={loading} accessibilityRole="button" onPress={() => void emailAction()} style={[styles.button, { backgroundColor: colors.accent }]}>{loading ? <ActivityIndicator color="#FFF" /> : <Text maxFontSizeMultiplier={2} style={styles.buttonText}>{codeSent ? 'Verify code' : 'Send code'}</Text>}</MotionPressable>{codeSent && <MotionPressable disabled={loading} accessibilityRole="button" onPress={() => { setCodeSent(false); setCode(''); setMessage(''); }}><Text style={[styles.footer, { color: colors.accent }]}>Change email or request another code</Text></MotionPressable>}</SettingsSheet></Modal>
  </SafeAreaView>;
}
function SettingsSheet({ children }: { children: React.ReactNode }) {
  const { fontScale } = useWindowDimensions();
  const colors = useJournalColors();
  return <View style={styles.overlay}><KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView key={fontScale} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }} contentContainerStyle={styles.sheet}>{children}</ScrollView></KeyboardAvoidingView></View>;
}
const styles = StyleSheet.create({ page: { padding: 24, paddingBottom: 130, maxWidth: 680, width: '100%', alignSelf: 'center' }, eyebrow: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, letterSpacing: 2, marginTop: 20 }, heading: { fontFamily: 'Outfit_600SemiBold', fontSize: 36, marginTop: 8 }, description: { fontFamily: 'Outfit_400Regular', fontSize: 17, lineHeight: 23, marginTop: 10 }, hero: { padding: 24, borderRadius: 28, marginTop: 28 }, heroTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 22, marginTop: 12 }, button: { minHeight: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 14, marginTop: 20 }, buttonText: { color: '#FFF', fontFamily: 'Outfit_600SemiBold', fontSize: 17 }, section: { fontFamily: 'Outfit_600SemiBold', fontSize: 14, letterSpacing: 1.5, marginTop: 30, marginBottom: 12 }, card: { borderRadius: 24, paddingHorizontal: 18 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth }, icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, rowTitle: { fontFamily: 'Outfit_500Medium', fontSize: 17 }, small: { fontFamily: 'Outfit_400Regular', fontSize: 14, lineHeight: 21, marginTop: 4 }, footer: { textAlign: 'center', fontFamily: 'Outfit_400Regular', fontSize: 14, marginTop: 26 }, notice: { padding: 16, borderRadius: 18, marginTop: 16 }, overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }, sheet: { padding: 24, paddingBottom: 45, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, input: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16, fontFamily: 'Outfit_400Regular', fontSize: 16 } });
