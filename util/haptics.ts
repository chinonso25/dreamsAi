import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticKind = 'none' | 'selection' | 'light' | 'medium' | 'success' | 'error';
/** Feedback never blocks or fails the action, including unsupported hardware. */
export function haptic(kind: HapticKind = 'light'): void {
  if (kind === 'none' || Platform.OS === 'web') return;
  try {
    const feedback = kind === 'selection' ? Haptics.selectionAsync()
      : kind === 'success' || kind === 'error' ? Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)
      : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    void feedback.catch(() => undefined);
  } catch { /* A device without haptics must still complete the interaction. */ }
}
