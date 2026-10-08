import React from 'react';
import renderer from 'react-test-renderer';
import { Text } from 'react-native';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { AudioModule, setAudioModeAsync } from 'expo-audio';
import { retainRecording, updateDraft } from '@/util/drafts';
import RecorderBottomSheet from '../RecorderBottomSheet';
import { haptic } from '@/util/haptics';

const mockDraft = { id: 'draft-a', text: '', audioUri: undefined as string | undefined, recordingState: 'idle' };
const mockRecorder = {
  uri: 'file:///capture-a.m4a', prepareToRecordAsync: jest.fn<() => Promise<void>>(), record: jest.fn(), pause: jest.fn(), stop: jest.fn<() => Promise<void>>(), getStatus: () => mockStatus,
};
const mockStatus = { isRecording: false, durationMillis: 0 };
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual<Record<string, unknown>>('react-native-reanimated/mock'), useReducedMotion: () => false, ...jest.requireActual<Record<string, unknown>>('react-native-reanimated/src/css/easing') }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));
jest.mock('@/util/haptics', () => ({ haptic: jest.fn() }));
jest.mock('expo-audio', () => ({ AudioModule: { requestRecordingPermissionsAsync: jest.fn() }, RecordingPresets: { HIGH_QUALITY: {} }, useAudioRecorder: () => mockRecorder, useAudioRecorderState: () => mockStatus, setAudioModeAsync: jest.fn() }));
jest.mock('@/util/audio-playback', () => {
  const audio = jest.requireMock<typeof import('expo-audio')>('expo-audio');
  return { beginRecordingAudio: () => audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }), endRecordingAudio: () => audio.setAudioModeAsync({ allowsRecording: false }) };
});
jest.mock('@/util/drafts', () => ({
  hydrateDraft: jest.fn<() => Promise<void>>(),
  retainRecording: jest.fn<() => Promise<void>>(),
  updateDraft: jest.fn<() => Promise<void>>(),
  discardDraftRecording: jest.fn<() => Promise<void>>(),
  useCaptureDraft: Object.assign(() => ({ draft: mockDraft }), { getState: () => ({ draft: mockDraft }) }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { BottomSheetScrollView: jest.requireActual<Record<string, unknown>>('react-native').ScrollView, BottomSheetView: View, BottomSheetModal: React.forwardRef(function MockBottomSheet(props: { children: React.ReactNode }, ref: React.Ref<unknown>) { React.useImperativeHandle(ref, () => ({ dismiss: jest.fn() })); return <View>{props.children}</View>; }) };
});
beforeEach(() => {
  jest.clearAllMocks(); mockDraft.audioUri = undefined; mockStatus.isRecording = false; mockStatus.durationMillis = 0;
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined); mockRecorder.stop.mockResolvedValue(undefined);
  jest.mocked(AudioModule.requestRecordingPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof AudioModule.requestRecordingPermissionsAsync>>);
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined);
});
async function mount() { let tree!: renderer.ReactTestRenderer; await renderer.act(async () => { tree = renderer.create(<RecorderBottomSheet />); }); return tree; }
function button(tree: renderer.ReactTestRenderer, label: string) { return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!; }
it('waits for preparation and persisted draft ownership before starting', async () => {
  let resolvePreparation!: () => void;
  mockRecorder.prepareToRecordAsync.mockReturnValue(new Promise<void>(resolve => { resolvePreparation = resolve; }));
  const tree = await mount(); let press!: Promise<void>;
  await renderer.act(async () => { press = button(tree, 'Start recording').props.onPress(); await Promise.resolve(); });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
  await renderer.act(async () => { resolvePreparation(); await press; });
  expect(updateDraft).toHaveBeenCalledWith(expect.objectContaining({ temporaryAudioUri: 'file:///capture-a.m4a', recordingState: 'recording' }), 'draft-a');
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledTimes(1); expect(haptic).toHaveBeenLastCalledWith('light');
  await renderer.act(async () => { await button(tree, 'Finish recording').props.onPress(); tree.unmount(); });
});
it('shows permission denial and keeps written capture available', async () => {
  jest.mocked(AudioModule.requestRecordingPermissionsAsync).mockResolvedValue({ granted: false } as Awaited<ReturnType<typeof AudioModule.requestRecordingPermissionsAsync>>);
  const tree = await mount(); await renderer.act(async () => button(tree, 'Start recording').props.onPress());
  expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled(); expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(haptic).toHaveBeenCalledTimes(1); expect(haptic).toHaveBeenCalledWith('error');
  expect(tree.root.findAllByType(Text).some(node => String(node.props.children).includes('Microphone access is off'))).toBe(true);
  await renderer.act(async () => tree.unmount());
});
it('finishes a paused recording only after stop and retains it against its draft id', async () => {
  const tree = await mount(); await renderer.act(async () => button(tree, 'Start recording').props.onPress());
  mockStatus.durationMillis = 4500;
  await renderer.act(async () => button(tree, 'Pause recording').props.onPress());
  let resolveStop!: () => void;
  mockRecorder.stop.mockReturnValue(new Promise<void>(resolve => { resolveStop = resolve; }));
  let press!: Promise<void>; await renderer.act(async () => { press = button(tree, 'Finish recording').props.onPress(); });
  expect(retainRecording).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalledWith('success');
  await renderer.act(async () => { resolveStop(); await press; });
  expect(haptic).toHaveBeenLastCalledWith('success');
  expect(retainRecording).toHaveBeenCalledWith('draft-a', 'file:///capture-a.m4a', 4.5, false);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
  await renderer.act(async () => tree.unmount());
});
it('does not silently replace an existing draft recording', async () => {
  mockDraft.audioUri = 'file:///durable-a.m4a';
  const tree = await mount();
  expect(button(tree, 'Start recording')).toBeUndefined();
  expect(mockRecorder.record).not.toHaveBeenCalled();
  await renderer.act(async () => tree.unmount());
});
