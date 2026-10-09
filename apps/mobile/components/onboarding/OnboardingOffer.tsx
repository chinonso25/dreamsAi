import { MotionPressable } from '@/components/motion/Motion';
import { useRef, useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useOnboarding } from '@/contexts/OnboardingProvider';
import { useSubscription } from '@/contexts/SubscriptionProvider';
import { discountedOffering, periodLabel } from '@/util/onboarding-offer';
import { storage } from '@/util/storage';
import { art, Button, DreamArt, Heading, OnboardingShell, palette, SmallNote, ui } from './OnboardingUI';

export default function OnboardingOffer({ onBack, onFinish }: { onBack?: () => void; onFinish?: () => void }) {
  const { completeOnboarding, setStep } = useOnboarding();
  const { offerings, isLoading, isSubscribed, showPaywall, restorePurchases, reloadOfferings } = useSubscription();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [discount, setDiscount] = useState(false);
  const [message, setMessage] = useState('');
  const openLegalPage = (path: 'privacy' | 'terms') => {
    void Linking.openURL(`https://thedreamer.app/${path}`).catch(() => {
      Alert.alert('Could not open this page', `Visit thedreamer.app/${path} in your browser.`);
    });
  };
  const current = offerings?.[0];
  const alternative = discountedOffering(current, offerings);
  const offering = discount ? alternative : current;
  const packages = offering?.availablePackages ?? [];
  const finish = () => { if (onFinish) { onFinish(); return; } completeOnboarding(); router.replace('/(tabs)'); };
  const decline = () => {
    if (busy) return;
    const key = `onboarding_discount_seen_${alternative?.identifier}`;
    if (!discount && alternative && !storage.getBoolean(key)) {
      storage.set(key, true);
      setDiscount(true);
      setMessage('');
    } else finish();
  };
  const purchase = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await showPaywall(offering, { offerOnDecline: false });
      if (result === 'purchased' || result === 'restored') finish();
      else if (result === 'cancelled') {
        const key = `onboarding_discount_seen_${alternative?.identifier}`;
        if (!discount && alternative && !storage.getBoolean(key)) { storage.set(key, true); setDiscount(true); }
      } else setMessage(result === 'unavailable' ? 'Plans aren’t available right now. You can continue with your journal.' : 'The purchase couldn’t be confirmed. Please try again, restore purchases, or continue with your journal.');
    } finally { lock.current = false; setBusy(false); }
  };
  const restore = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { if (await restorePurchases()) finish(); }
    finally { lock.current = false; setBusy(false); }
  };

  return <OnboardingShell step={discount ? 19 : 18} total={discount ? 20 : 19}
    onBack={!busy ? () => { if (discount) setDiscount(false); else { setStep(17); if (onBack) onBack(); else router.replace('/onboarding'); } } : undefined}
    footer={<>
      {isSubscribed ? <Button label="Open journal" onPress={finish} /> : packages.length ? <Button label={discount ? 'View this offer' : 'See subscription options'} loading={busy} onPress={() => void purchase()} /> : isLoading ? <Button label="Loading store options…" loading /> : <Button label="Open journal" onPress={finish} />}
      {!isSubscribed && (packages.length > 0 || isLoading) && <MotionPressable disabled={busy} accessibilityRole="button" onPress={decline}><Text style={ui.link}>Continue without Premium</Text></MotionPressable>}
      <SmallNote>{packages.length ? 'No charge on this screen. Review terms in the store before subscribing.' : 'You can subscribe later in Settings.'}</SmallNote>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
        <MotionPressable accessibilityRole="link" onPress={() => openLegalPage('privacy')}><Text style={[ui.link, { fontSize: 12 }]}>Privacy policy</Text></MotionPressable>
        <MotionPressable accessibilityRole="link" onPress={() => openLegalPage('terms')}><Text style={[ui.link, { fontSize: 12 }]}>Terms of use</Text></MotionPressable>
      </View>
    </>}>
    <View style={ui.pill}><Text style={ui.pillText}>{isSubscribed ? 'PREMIUM ACTIVE' : discount ? 'ANNUAL WELCOME OFFER' : 'OPTIONAL PREMIUM'}</Text></View>
    <DreamArt source={art.moon} size={235} />
    <Heading eyebrow={discount ? 'A LITTLE SOMETHING TO GET YOU STARTED' : 'DREAM AI PREMIUM'} title={isSubscribed ? 'Premium\nis active.' : discount ? 'Your annual\nwelcome offer.' : 'Transcription\nand summaries.'} description={discount ? 'The same Premium transcription, summaries and tags, with a lower annual price.' : 'AI transcription and summaries after your free previews. Text and recording remain free.'} />
    <View style={ui.card}>{[{ icon: 'mic-outline', title: 'Transcription', detail: 'Convert saved recordings to text.' }, { icon: 'sparkles-outline', title: 'Summaries', detail: 'Generate a title, summary, and tags.' }, { icon: 'book-outline', title: 'Tags', detail: 'Find entries by their suggested tags.' }].map(item => <View key={item.title} style={[ui.row, { marginBottom: 16 }]}><Ionicons name={item.icon as 'mic-outline'} size={23} color={palette.violet} /><View style={{ flex: 1 }}><Text style={ui.cardTitle}>{item.title}</Text><Text style={[ui.body, { fontSize: 13 }]}>{item.detail}</Text></View></View>)}</View>
    {!isSubscribed && packages.map(pkg => <View key={pkg.identifier} style={[ui.card, ui.row, { justifyContent: 'space-between' }]}><View style={{ flex: 1 }}><Text style={ui.cardTitle}>{pkg.product.title}</Text><Text style={ui.body}>{periodLabel(pkg.product.subscriptionPeriod)}</Text></View><Text style={[ui.cardTitle, { color: palette.violet, marginLeft: 10 }]}>{pkg.product.priceString}</Text></View>)}
    {!isSubscribed && !isLoading && !packages.length && <View style={ui.card}><Text style={ui.cardTitle}>{Platform.OS === 'web' ? 'Premium is available in the mobile app' : 'Store options aren’t available right now'}</Text><Text style={ui.body}>Continue free. Subscribe later in Settings.</Text>{Platform.OS !== 'web' && <MotionPressable accessibilityRole="button" onPress={() => void reloadOfferings()}><Text style={ui.link}>Try loading plans again</Text></MotionPressable>}</View>}
    {packages.length > 0 && <View style={[ui.card, { backgroundColor: palette.pale }]}><Text style={ui.cardTitle}>Subscription terms</Text><Text style={ui.body}>{discount ? 'Pay the annual price shown above when you subscribe. This offer renews at the same annual price every year until cancelled through your store account. No free trial.' : 'Today: review your options. Any eligible trial, its end date, and the first charge are shown on the store paywall. Subscriptions renew automatically unless cancelled through your store account.'}</Text></View>}
    {message ? <Text accessibilityLiveRegion="polite" style={[ui.body, { textAlign: 'center' }]}>{message}</Text> : null}
    {Platform.OS !== 'web' && !isSubscribed && <MotionPressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}><Text style={ui.link}>Restore purchases</Text></MotionPressable>}
  </OnboardingShell>;
}
