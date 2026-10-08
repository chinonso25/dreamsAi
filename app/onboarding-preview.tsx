import { useState } from 'react';
import { Redirect } from 'expo-router';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';
import OnboardingOffer from '@/components/onboarding/OnboardingOffer';
import { Button, Heading, OnboardingShell, SmallNote } from '@/components/onboarding/OnboardingUI';
import { useOnboarding } from '@/contexts/OnboardingProvider';

// Local design review without authentication, notifications, or billing initialization.
export default function OnboardingPreview() {
  const [screen, setScreen] = useState<'flow' | 'offer' | 'done'>('flow');
  const { resetOnboarding } = useOnboarding();
  if (!__DEV__) return <Redirect href="/onboarding" />;
  if (screen === 'done') return <OnboardingShell footer={<Button label="Preview again" onPress={() => { resetOnboarding(); setScreen('flow'); }} />}><Heading eyebrow="LOCAL PREVIEW COMPLETE" title="Preview complete" /><SmallNote>No account or purchase was created during this preview.</SmallNote></OnboardingShell>;
  return screen === 'offer'
    ? <OnboardingOffer onBack={() => setScreen('flow')} onFinish={() => setScreen('done')} />
    : <OnboardingFlow onOffer={() => setScreen('offer')} onFinish={() => setScreen('done')} />;
}
