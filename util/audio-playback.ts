import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { create } from 'zustand';

export type RecordingTrack = { id: string; ownerId: string; uri: string; title: string; draft?: boolean };
type Playback = { track?: RecordingTrack; status?: AudioStatus; loading: boolean; error?: string; rate: number };
export const useRecordingPlayback = create<Playback>(() => ({ loading: false, rate: 1 }));
let player: AudioPlayer | undefined;
let listener: { remove: () => void } | undefined;
let generation = 0;
let recording = false;
let playRequested = false;
let accessGuard: ((track: RecordingTrack) => boolean) | undefined;
const sameTrack = (left: RecordingTrack | undefined, right: RecordingTrack) => left?.id === right.id && left.ownerId === right.ownerId && left.uri === right.uri && Boolean(left.draft) === Boolean(right.draft);
export function setRecordingPlaybackAccessGuard(guard?: (track: RecordingTrack) => boolean) { accessGuard = guard; validateRecordingPlaybackAccess(); }
export function validateRecordingPlaybackAccess() {
  const track = useRecordingPlayback.getState().track;
  if (track && accessGuard && !accessGuard(track)) { stopRecordingPlayback(); return false; }
  return true;
}
let audioMode = Promise.resolve();
let loadTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimer() { if (loadTimer) clearTimeout(loadTimer); loadTimer = undefined; }
function mode(options: Parameters<typeof setAudioModeAsync>[0]) {
  const next = audioMode.catch(() => undefined).then(() => setAudioModeAsync(options));
  audioMode = next;
  return next;
}
function release() {
  clearTimer();
  const oldListener = listener; listener = undefined;
  const old = player; player = undefined;
  try { oldListener?.remove(); } catch { /* A released native listener is already inactive. */ }
  if (old) {
    try { old.pause(); } catch { /* Always attempt the remaining cleanup. */ }
    try { old.clearLockScreenControls(); } catch { /* Native controls may already be removed. */ }
    try { old.remove(); } catch { /* Media services may have invalidated this object. */ }
  }
}
export function stopRecordingPlayback() {
  generation++;
  playRequested = false;
  try { release(); } finally { useRecordingPlayback.setState({ track: undefined, status: undefined, loading: false, error: undefined, rate: 1 }); }
}
function fail(message: string) {
  clearTimer();
  playRequested = false;
  try { player?.pause(); } catch { /* Error remains visible with a retry. */ }
  try { player?.clearLockScreenControls(); } catch { /* Retry recreates native controls. */ }
  const status = useRecordingPlayback.getState().status;
  useRecordingPlayback.setState({ status: status ? { ...status, playing: false } : undefined, loading: false, error: message });
}

/** The native player is owned by the app, never by an individual screen. */
export async function playRecording(track: RecordingTrack, reload = false) {
  if (recording) throw new Error('Finish recording before playing audio.');
  if (accessGuard && !accessGuard(track)) { stopRecordingPlayback(); throw new Error('This recording is no longer available in your journal.'); }
  const state = useRecordingPlayback.getState();
  if (state.loading && sameTrack(state.track, track) && !reload) return;
  const token = ++generation;
  const same = !reload && player && sameTrack(state.track, track);
  try {
    if (!same) {
      release();
      useRecordingPlayback.setState({ track, status: undefined, loading: true, error: undefined, rate: 1 });
    }
    playRequested = true;
    await mode({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix', shouldRouteThroughEarpiece: false });
    if (token !== generation || recording || !validateRecordingPlaybackAccess()) return;
    if (!same) {
      const currentPlayer = createAudioPlayer(track.uri, { updateInterval: 250 });
      player = currentPlayer;
      listener = currentPlayer.addListener('playbackStatusUpdate', status => {
        if (player !== currentPlayer || !validateRecordingPlaybackAccess()) return;
        useRecordingPlayback.setState({ status, loading: playRequested && !status.isLoaded && !status.error && !useRecordingPlayback.getState().error });
        if (status.error) fail('Could not play this recording. Try again.');
        if (status.isLoaded) clearTimer();
        if (status.didJustFinish) { playRequested = false; try { currentPlayer.clearLockScreenControls(); } catch { /* A completed track can still be replayed. */ } }
      });
      useRecordingPlayback.setState({ status: currentPlayer.currentStatus, loading: !currentPlayer.isLoaded });

    }
    const active = player!;
    if (active.currentStatus.error || useRecordingPlayback.getState().error) throw new Error('Recording could not open.');
    if (same && active.isLoaded && (active.currentStatus.didJustFinish || active.duration > 0 && active.currentTime >= active.duration)) await active.seekTo(0);
    if (token !== generation || player !== active || recording || !validateRecordingPlaybackAccess()) return;
    // Generic metadata keeps private dream titles off the lock screen.
    active.setActiveForLockScreen(true, { title: 'Dream recording', artist: 'The Dreamer' }, { showSeekBackward: true, showSeekForward: true });
    if (!playRequested || token !== generation || player !== active) return;
    active.play();
    clearTimer();
    if (!active.isLoaded) loadTimer = setTimeout(() => {
      if (player === active && playRequested && !active.isLoaded) fail('Recording could not load. Try again.');
    }, 12000);
    useRecordingPlayback.setState({ loading: !active.isLoaded, error: undefined });
  } catch (cause) {
    if (token === generation) fail('Could not play this recording. Try again.');
    throw cause;
  }
}
export function pauseRecordingPlayback() {
  generation++;
  clearTimer();
  playRequested = false;
  const status = useRecordingPlayback.getState().status;
  try { player?.pause(); } catch { fail('Could not pause this recording. Try again.'); }
  useRecordingPlayback.setState({ loading: false, status: status ? { ...status, playing: false } : undefined });
}
export async function toggleRecordingPlayback() {
  const state = useRecordingPlayback.getState();
  if (state.loading || state.status?.playing) pauseRecordingPlayback();
  else if (state.track) await playRecording(state.track, Boolean(state.error));
}
export async function seekRecording(time: number) {
  if (!player?.isLoaded || !validateRecordingPlaybackAccess()) return;
  if (!Number.isFinite(time)) throw new Error('Choose a valid playback position.');
  const active = player;
  if (!Number.isFinite(active.duration) || active.duration <= 0) return;
  await active.seekTo(Math.max(0, Math.min(active.duration, time)));
}
export function setRecordingSpeed(rate: number) {
  if (!player?.isLoaded || !validateRecordingPlaybackAccess()) return;
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 2) throw new Error('Choose a playback speed between 0.25 and 2 times.');
  player.setPlaybackRate(rate);
  useRecordingPlayback.setState({ rate });
}
export async function beginRecordingAudio() {
  recording = true;
  stopRecordingPlayback();
  try { await mode({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false }); }
  catch (cause) { recording = false; throw cause; }
}
export async function endRecordingAudio() {
  if (!recording) return;
  try { await mode({ allowsRecording: false, shouldPlayInBackground: false }); }
  finally { recording = false; }
}
