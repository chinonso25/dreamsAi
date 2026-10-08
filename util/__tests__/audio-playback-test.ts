import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import { createAudioPlayer, setAudioModeAsync, type AudioStatus } from 'expo-audio';
import { beginRecordingAudio, endRecordingAudio, pauseRecordingPlayback, playRecording, seekRecording, setRecordingSpeed, setRecordingPlaybackAccessGuard, stopRecordingPlayback, useRecordingPlayback } from '../audio-playback';

const track = { id: 'a', ownerId: 'guest', title: 'Private title', uri: 'file:///a.m4a' };
let emitStatus: (status: AudioStatus) => void;
const mockPlayer = {
  isLoaded: true, currentTime: 0, duration: 30, currentStatus: { isLoaded: true, playing: false, currentTime: 0, duration: 30 },
  play: jest.fn(), pause: jest.fn(), remove: jest.fn(), seekTo: jest.fn<() => Promise<void>>(),
  setActiveForLockScreen: jest.fn(), clearLockScreenControls: jest.fn(), setPlaybackRate: jest.fn(),
  addListener: jest.fn((_event: string, callback: (status: AudioStatus) => void) => { emitStatus = callback; return { remove: jest.fn() }; }),
};
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(() => mockPlayer), setAudioModeAsync: jest.fn<() => Promise<void>>() }));
beforeEach(async () => {
  await endRecordingAudio(); setRecordingPlaybackAccessGuard(undefined); stopRecordingPlayback(); jest.clearAllMocks();
  mockPlayer.pause.mockReset(); mockPlayer.clearLockScreenControls.mockReset(); mockPlayer.remove.mockReset();
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined);
  mockPlayer.seekTo.mockResolvedValue(undefined); mockPlayer.isLoaded = true; mockPlayer.currentTime = 0;
  mockPlayer.currentStatus = { isLoaded: true, playing: false, currentTime: 0, duration: 30 };
});
afterEach(async () => { await endRecordingAudio(); setRecordingPlaybackAccessGuard(undefined); stopRecordingPlayback(); jest.useRealTimers(); });
it('enables native background playback and generic lock-screen controls only after user playback', async () => {
  expect(createAudioPlayer).not.toHaveBeenCalled();
  await playRecording(track);
  expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: true, allowsRecording: false, interruptionMode: 'doNotMix' }));
  expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledWith(true, { title: 'Dream recording', artist: 'The Dreamer' }, expect.any(Object));
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});
it('keeps the same player and playback position when another screen resumes the same recording', async () => {
  await playRecording(track); mockPlayer.currentTime = 12; pauseRecordingPlayback(); await playRecording({ ...track });
  expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  expect(mockPlayer.remove).not.toHaveBeenCalled();
  expect(mockPlayer.seekTo).not.toHaveBeenCalled();
});
it('cancels late playback when stopped during an audio-session change', async () => {
  let finish!: () => void;
  jest.mocked(setAudioModeAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = playRecording(track); await Promise.resolve(); await Promise.resolve();
  stopRecordingPlayback(); finish(); await pending;
  expect(createAudioPlayer).not.toHaveBeenCalled(); expect(mockPlayer.play).not.toHaveBeenCalled();
});
it('releases the prior recording before switching and ignores its stale status', async () => {
  await playRecording(track); const oldStatus = emitStatus;
  // Each real player is a distinct native object.
  const second = { ...mockPlayer, addListener: jest.fn(() => ({ remove: jest.fn() })) };
  jest.mocked(createAudioPlayer).mockReturnValueOnce(second as unknown as ReturnType<typeof createAudioPlayer>);
  await playRecording({ ...track, id: 'b', uri: 'file:///b.m4a' });
  oldStatus({ isLoaded: true, currentTime: 29 } as AudioStatus);
  expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
  expect(useRecordingPlayback.getState().track?.id).toBe('b');
  expect(useRecordingPlayback.getState().status?.currentTime).not.toBe(29);
});
it('stops playback before recording and blocks playback until the microphone session ends', async () => {
  await playRecording(track); await beginRecordingAudio();
  expect(mockPlayer.pause).toHaveBeenCalled(); expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: true, shouldPlayInBackground: false }));
  await expect(playRecording(track)).rejects.toThrow('Finish recording');
  await endRecordingAudio(); await playRecording(track);
  expect(setAudioModeAsync).toHaveBeenLastCalledWith(expect.objectContaining({ allowsRecording: false, shouldPlayInBackground: true }));
});
it('reports native playback failures and retries with a fresh player', async () => {
  await playRecording(track); emitStatus({ error: 'native failure', isLoaded: false } as AudioStatus);
  expect(useRecordingPlayback.getState().error).toContain('Try again');
  expect(useRecordingPlayback.getState().loading).toBe(false);
  await playRecording(track, true);
  expect(createAudioPlayer).toHaveBeenCalledTimes(2); expect(useRecordingPlayback.getState().error).toBeUndefined();
});
it('bounds seeking and resets completed audio before replay', async () => {
  await playRecording(track); await seekRecording(80); expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(30);
  mockPlayer.currentTime = 30; await playRecording(track); expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
});

it('cancels a pending play request without leaving the loading spinner stuck', async () => {
  let finish!: () => void;
  jest.mocked(setAudioModeAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = playRecording(track); await Promise.resolve(); await Promise.resolve();
  pauseRecordingPlayback();
  expect(useRecordingPlayback.getState().loading).toBe(false);
  finish(); await pending;
  expect(createAudioPlayer).not.toHaveBeenCalled();
  await playRecording(track); expect(createAudioPlayer).toHaveBeenCalledTimes(1);
});
it('does not restart audio when a completed-track replay was paused during seeking', async () => {
  await playRecording(track); mockPlayer.currentTime = 30;
  let finishSeek!: () => void;
  mockPlayer.seekTo.mockImplementationOnce(() => new Promise(resolve => { finishSeek = resolve; }));
  const replay = playRecording(track); for (let i = 0; i < 5; i++) await Promise.resolve();
  pauseRecordingPlayback(); finishSeek(); await replay;
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});
it('cleans lock controls and native resources even when pause throws', async () => {
  await playRecording(track);
  mockPlayer.pause.mockImplementation(() => { throw new Error('Media services reset'); });
  expect(() => stopRecordingPlayback()).not.toThrow();
  expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled(); expect(mockPlayer.remove).toHaveBeenCalled();
  expect(useRecordingPlayback.getState().track).toBeUndefined();
});
it('presents native failures as stopped with a retry, even if the failing status says playing', async () => {
  await playRecording(track); emitStatus({ error: 'Decode error', playing: true, isLoaded: false } as AudioStatus);
  expect(useRecordingPlayback.getState().status?.playing).toBe(false);
  expect(useRecordingPlayback.getState().error).toContain('Try again');
});
it('checks entry and owner access again after asynchronous audio setup', async () => {
  let allowed = true; setRecordingPlaybackAccessGuard(() => allowed);
  let finish!: () => void;
  jest.mocked(setAudioModeAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = playRecording(track); await Promise.resolve(); await Promise.resolve();
  allowed = false; finish(); await pending;
  expect(createAudioPlayer).not.toHaveBeenCalled(); expect(useRecordingPlayback.getState().track).toBeUndefined();
  await expect(playRecording(track)).rejects.toThrow('no longer available');
});
it('does not reuse another owner’s player even when an entry id and URI match', async () => {
  await playRecording(track);
  await playRecording({ ...track, ownerId: 'another-owner' });
  expect(createAudioPlayer).toHaveBeenCalledTimes(2); expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
});
it('allows cancelling native loading without a later timeout error', async () => {
  jest.useFakeTimers(); mockPlayer.isLoaded = false;
  await playRecording(track); expect(useRecordingPlayback.getState().loading).toBe(true);
  pauseRecordingPlayback();
  emitStatus({ isLoaded: false, playing: false } as AudioStatus);
  await jest.advanceTimersByTimeAsync(12001);
  expect(useRecordingPlayback.getState().loading).toBe(false); expect(useRecordingPlayback.getState().error).toBeUndefined();
});
it('times out native loading with a retryable error', async () => {
  jest.useFakeTimers(); mockPlayer.isLoaded = false;
  await playRecording(track); await jest.advanceTimersByTimeAsync(12001);
  expect(useRecordingPlayback.getState().error).toContain('could not load');
  expect(useRecordingPlayback.getState().loading).toBe(false); expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
});
it('changes speed only for loaded audio and rejects invalid native values', async () => {
  mockPlayer.isLoaded = false; await playRecording(track); setRecordingSpeed(0.75);
  expect(mockPlayer.setPlaybackRate).not.toHaveBeenCalled(); expect(useRecordingPlayback.getState().rate).toBe(1);
  mockPlayer.isLoaded = true; setRecordingSpeed(1.5);
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(1.5);
  expect(() => setRecordingSpeed(Number.NaN)).toThrow('playback speed');
  expect(useRecordingPlayback.getState().rate).toBe(1.5);
});

it('does not start a player whose initial native status already reports failure', async () => {
  mockPlayer.currentStatus = { ...mockPlayer.currentStatus, error: 'Could not decode' } as typeof mockPlayer.currentStatus;
  await expect(playRecording(track)).rejects.toThrow('could not open');
  expect(mockPlayer.play).not.toHaveBeenCalled(); expect(useRecordingPlayback.getState().loading).toBe(false);
  expect(useRecordingPlayback.getState().error).toContain('Try again');
});
