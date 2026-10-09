import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { storage } from './storage';

const REMINDER_ID = 'dream-ai-morning-reminder';
const LEGACY_TITLES = ['Did you have any dreams?', 'Record Your Dream'];

// Restore saved preferences without prompting. Permission is requested only when explicitly enabled.
let reminderQueue: Promise<void> = Promise.resolve();
export function InitialiseNotifications() {
  // A rapid change of time or opt-out must finish after any older scheduler work.
  const next = reminderQueue.catch(() => undefined).then(reconcileReminders);
  reminderQueue = next;
  return next;
}
async function reconcileReminders() {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of scheduled) {
    if (notification.identifier === REMINDER_ID || LEGACY_TITLES.includes(notification.content.title ?? '')) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }
  if (!storage.getBoolean('notifications') || !storage.getBoolean('dreamReminders')) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: 'A little space for your dreams', body: 'Remember a place, a person or a feeling? Keep a little of it in your journal.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.min(23, Math.max(0, storage.getNumber('reminderHour') ?? 8)), minute: Math.min(59, Math.max(0, storage.getNumber('reminderMinute') ?? 0)) },
  });
}
