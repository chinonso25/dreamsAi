import { Redirect, Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';
import { useOnboarding } from '@/contexts/OnboardingProvider';
import { useJournalColors } from '@/components/journal/theme';
export default function TabLayout() {
  const { isOnboardingComplete } = useOnboarding();
  const colors = useJournalColors();
  if (!isOnboardingComplete) return <Redirect href="/onboarding" />;
  return <Tabs backBehavior="history" screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: colors.background }, tabBarStyle: { display: 'none' } }} tabBar={() => <TabBar />}><Tabs.Screen name="index" options={{ title: 'Home' }} /><Tabs.Screen name="journal" options={{ title: 'Journal' }} /><Tabs.Screen name="search" options={{ title: 'Search' }} /><Tabs.Screen name="settings" options={{ href: null }} /></Tabs>;
}
