import { Redirect } from 'expo-router';

// Keep existing links working with the new, resumable onboarding.
export default function LegacyOnboardingScreen() {
  return <Redirect href="/onboarding" />;
}
