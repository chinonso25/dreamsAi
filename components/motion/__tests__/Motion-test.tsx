import React from 'react';
import renderer from 'react-test-renderer';
import { AccessibilityInfo, AppState, StyleSheet, Text, type AppStateStatus } from 'react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { MotionAmbient, MotionPressable, MotionProvider } from '../Motion';
import { haptic } from '@/util/haptics';

let mockFocused = true;
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual<Record<string, unknown>>('react-native-reanimated/mock'), useReducedMotion: () => false, ...jest.requireActual<Record<string, unknown>>('react-native-reanimated/src/css/easing') }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/util/haptics', () => ({ haptic: jest.fn() }));
let reduceMotion!: (reduced: boolean) => void;
let appState!: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.clearAllMocks(); mockFocused = true;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_: string, listener: (value: boolean) => void) => { reduceMotion = listener; return { remove: jest.fn() }; }) as unknown as typeof AccessibilityInfo.addEventListener);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { appState = listener; return { remove: jest.fn() }; });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});
afterEach(() => { jest.restoreAllMocks(); });
const nativeButton = (tree: renderer.ReactTestRenderer) => tree.root.findAll(node => node.props.accessibilityLabel === 'Action' && typeof node.props.onPress === 'function').at(-1)!;
const event = {} as Parameters<NonNullable<React.ComponentProps<typeof MotionPressable>['onPress']>>[0];
it('only provides feedback when a press commits, and preserves async callback results', async () => {
  const promise = Promise.resolve('saved'); const action = jest.fn(() => promise);
  let tree!: renderer.ReactTestRenderer;
  renderer.act(() => { tree = renderer.create(<MotionPressable accessibilityLabel="Action" haptic="selection" onPress={action}><Text>Action</Text></MotionPressable>); });
  renderer.act(() => nativeButton(tree).props.onPressIn(event));
  renderer.act(() => nativeButton(tree).props.onPressOut(event));
  expect(haptic).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled();
  let result: unknown; renderer.act(() => { result = nativeButton(tree).props.onPress(event); });
  expect(result).toBe(promise); expect(haptic).toHaveBeenCalledTimes(1); expect(haptic).toHaveBeenCalledWith('selection'); expect(action).toHaveBeenCalledTimes(1);
  renderer.act(() => tree.update(<MotionPressable accessibilityLabel="Action" disabled onPress={action} />));
  renderer.act(() => nativeButton(tree).props.onPress(event));
  expect(action).toHaveBeenCalledTimes(1); expect(haptic).toHaveBeenCalledTimes(1);
  renderer.act(() => tree.unmount());
});
it('responds to Reduce Motion while the app is running', () => {
  let tree!: renderer.ReactTestRenderer;
  renderer.act(() => { tree = renderer.create(<MotionProvider><MotionPressable accessibilityLabel="Action" onPress={() => undefined} /></MotionProvider>); });
  renderer.act(() => nativeButton(tree).props.onPressIn(event));
  expect(StyleSheet.flatten(nativeButton(tree).props.style).transform).toEqual([{ scale: .97 }]);
  renderer.act(() => reduceMotion(true));
  const style = StyleSheet.flatten(nativeButton(tree).props.style);
  expect(style.transform).toEqual([{ scale: 1 }]); expect(style.transitionDuration).toBe(0);
  renderer.act(() => tree.unmount());
});
it('stops ambient loops off screen, in the background, and under Reduce Motion', () => {
  const scene = () => <MotionProvider><MotionAmbient testID="ambient"><Text>Moon</Text></MotionAmbient></MotionProvider>;
  let tree!: renderer.ReactTestRenderer; renderer.act(() => { tree = renderer.create(scene()); });
  const animation = () => tree.root.findAll(node => node.props.pointerEvents === 'none').at(-1)!.props.style[1].animationName;
  expect(animation()).not.toBe('none');
  renderer.act(() => appState('background')); expect(animation()).toBe('none');
  renderer.act(() => appState('active')); expect(animation()).not.toBe('none');
  mockFocused = false; renderer.act(() => tree.update(scene())); expect(animation()).toBe('none');
  mockFocused = true; renderer.act(() => tree.update(scene())); expect(animation()).not.toBe('none');
  renderer.act(() => reduceMotion(true)); expect(animation()).toBe('none');
  renderer.act(() => tree.unmount());
});
