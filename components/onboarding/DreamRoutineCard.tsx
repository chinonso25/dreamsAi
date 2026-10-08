import { MotionPressable } from '@/components/motion/Motion';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useOnboarding } from '@/contexts/OnboardingProvider';
import { getDreamPlan } from '@/util/onboarding';
import { palette, ui } from './OnboardingUI';

export function DreamRoutineCard() {
  const { answers } = useOnboarding();
  if (!answers.goal) return null;
  const plan = getDreamPlan(answers);
  return <View style={[ui.card, { backgroundColor: palette.background, width: '100%', marginBottom: 24 }]}>
    <View style={[ui.row, { marginBottom: 12 }]}><Ionicons name="moon-outline" size={20} color={palette.violet} /><Text style={ui.eyebrow}>JOURNALING PLAN</Text></View>
    <Text style={ui.cardTitle}>{plan.goal}</Text>
    <Text style={ui.body}>{plan.rhythm} · {plan.capture}</Text>
    <MotionPressable accessibilityRole="button" onPress={() => router.push('/AddDream')} style={{ paddingTop: 18, minHeight: 44 }}><Text style={[ui.pillText, { fontSize: 15 }]}>Add dream →</Text></MotionPressable>
  </View>;
}
