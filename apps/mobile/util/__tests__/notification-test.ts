import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { storage } from '../storage';
import { InitialiseNotifications } from '../notification';

jest.mock('../storage', () => ({ storage: { getBoolean: jest.fn(), getNumber: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(), scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
  jest.mocked(storage.getBoolean).mockReturnValue(true);
});
describe('optional dream reminders', () => {
  it('does not ask for permission or schedule reminders when opted out', async () => {
    jest.mocked(storage.getBoolean).mockReturnValue(false);
    await InitialiseNotifications();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('replaces only owned/legacy dream reminders, preserving unrelated notifications', async () => {
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
      { identifier: 'legacy', content: { title: 'Record Your Dream' } },
      { identifier: 'unrelated', content: { title: 'Something else' } },
    ] as Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>);
    await InitialiseNotifications();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('legacy');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'dream-ai-morning-reminder', trigger: { type: 'daily', hour: 8, minute: 0 } }));
  });
  it('respects a permission denial without scheduling', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    await InitialiseNotifications();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('serializes rapid settings changes so a final opt-out cancels the older reminder', async () => {
    let finishSchedule!: () => void;
    let startedSchedule!: () => void;
    const started = new Promise<void>(resolve => { startedSchedule = resolve; });
    jest.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(async () => {
      startedSchedule();
      await new Promise<void>(resolve => { finishSchedule = resolve; });
      return 'dream-ai-morning-reminder';
    });
    const older = InitialiseNotifications();
    await started;
    jest.mocked(storage.getBoolean).mockReturnValue(false);
    jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([
      { identifier: 'dream-ai-morning-reminder', content: { title: 'A little space for your dreams' } },
    ] as Awaited<ReturnType<typeof Notifications.getAllScheduledNotificationsAsync>>);
    const final = InitialiseNotifications();
    finishSchedule();
    await Promise.all([older, final]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith('dream-ai-morning-reminder');
  });
});
