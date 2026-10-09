import { expect, it, jest } from '@jest/globals';
import { currentRecordingUri } from '../recording-files';

jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///current/Documents/', cacheDirectory: 'file:///current/Library/Caches/' }));
const old = 'file:///var/mobile/Containers/Data/Application/00000000-0000-0000-0000-000000000000/';
it('resolves durable recording files after the iOS sandbox changes', () => {
  expect(currentRecordingUri(`${old}Documents/dreamer-recordings/draft-a.m4a`)).toBe('file:///current/Documents/dreamer-recordings/draft-a.m4a');
});
it('resolves interrupted native cache recordings after an update', () => {
  expect(currentRecordingUri(`${old}Library/Caches/ExpoAudio/recording-a.m4a`)).toBe('file:///current/Library/Caches/ExpoAudio/recording-a.m4a');
});
it('leaves unrelated files, remote URLs and unsafe paths untouched', () => {
  for (const uri of [`${old}Documents/private.sqlite`, `${old}Documents/dreamer-recordings/../private.m4a`, `${old}Documents/dreamer-recordings/escaped%20name.m4a`, 'https://example.com/recording.m4a', 'file:///documents/dreamer-recordings/local.m4a']) expect(currentRecordingUri(uri)).toBe(uri);
});
