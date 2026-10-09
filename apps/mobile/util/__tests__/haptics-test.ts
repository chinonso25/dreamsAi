import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { haptic } from '../haptics';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn<() => Promise<void>>(), impactAsync: jest.fn<() => Promise<void>>(), notificationAsync: jest.fn<() => Promise<void>>(), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' }, NotificationFeedbackType: { Success: 'success', Error: 'error' } }));
const platform = Platform.OS;
beforeEach(() => { Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true }); jest.clearAllMocks(); jest.mocked(Haptics.selectionAsync).mockResolvedValue(undefined); jest.mocked(Haptics.impactAsync).mockResolvedValue(undefined); jest.mocked(Haptics.notificationAsync).mockResolvedValue(undefined); });
afterEach(() => { Object.defineProperty(Platform, 'OS', { value: platform, configurable: true }); });
it('distinguishes choosing an option, pressing an action, and saving an outcome', () => {
  haptic('selection'); haptic('light'); haptic('medium'); haptic('success'); haptic('error');
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Light);
  expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Medium);
  expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(1, Haptics.NotificationFeedbackType.Success);
  expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(2, Haptics.NotificationFeedbackType.Error);
});
it('skips web and actions whose outcome supplies its own feedback', () => {
  haptic('none'); Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true }); haptic('selection'); haptic('success'); haptic();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled(); expect(Haptics.impactAsync).not.toHaveBeenCalled(); expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});
it('never throws or leaves rejected feedback unhandled on unsupported hardware', async () => {
  jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => { throw new Error('unsupported'); });
  expect(() => haptic()).not.toThrow();
  jest.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('hardware unavailable'));
  expect(() => haptic('selection')).not.toThrow();
  await Promise.resolve();
});
