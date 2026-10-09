import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch as expoFetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { Journal } from '@/types';
import { API_URL, authenticatedHeaders } from './auth-client';
import { isManagedRecordingUri } from '@thedreamer/shared/dream-contract';

const downloads = new Map<string, Promise<string | undefined>>();
const transfers = new Set<AbortController>();
export function cancelJournalAudio() { for (const controller of transfers) controller.abort(); }
export function managedRecording(uri: string) { return isManagedRecordingUri(uri, FileSystem.documentDirectory || ''); }
async function cachePrefix(entry: { id: string; user_id: string }) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${entry.user_id}\0${entry.id}`);
  return `dreamer-audio-${hash}-`;
}
async function cacheFile(entry: Journal) {
  // Hashed identities keep server-controlled strings out of native paths.
  const prefix = await cachePrefix(entry);
  const version = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, entry.audio_key || '');
  return new File(Paths.cache, `${prefix}${version}.m4a`);
}
export async function uploadJournalAudio(entry: Journal, allowed: () => boolean) {
  if (!entry.local_audio_uri || entry.audio_key) return undefined;
  if (!managedRecording(entry.local_audio_uri)) throw new Error('This recording is outside the app’s recording storage. Your written dream is safe.');
  const file = new File(entry.local_audio_uri);
  if (!file.exists) throw new Error('The recording is missing from this device. The written dream remains saved.');
  if (file.size > 25 * 1024 * 1024) throw new Error('This recording is too large to sync. Keep it on this device or record a shorter dream.');
  const headers = await authenticatedHeaders(entry.user_id);
  if (!allowed()) return undefined;
  const controller = new AbortController(); transfers.add(controller); const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await expoFetch(`${API_URL}/v1/dreams/${encodeURIComponent(entry.id)}/audio`, { method: 'PUT', body: file, headers: { ...headers, 'Content-Type': file.type || 'audio/mp4' }, credentials: Platform.OS === 'web' ? 'include' : 'omit', signal: controller.signal });
    if (!allowed()) return undefined;
    if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message || 'The audio upload was interrupted. Tap Retry to continue.'); }
    const result = await response.json() as { audio_key?: unknown };
    if (typeof result.audio_key !== 'string') throw new Error('The audio upload could not be confirmed. Retry to continue.');
    return allowed() ? result.audio_key : undefined;
  } finally { clearTimeout(timer); transfers.delete(controller); }
}
export async function journalAudioUri(entry: Journal, allowed: () => boolean) {
  if (!allowed()) return undefined;
  if (entry.local_audio_uri && managedRecording(entry.local_audio_uri) && new File(entry.local_audio_uri).exists) return entry.local_audio_uri;
  if (!entry.audio_key) return undefined;
  const destination = await cacheFile(entry);
  if (!allowed()) return undefined;
  if (destination.exists && destination.size > 0 && destination.size <= 25 * 1024 * 1024) return allowed() ? destination.uri : undefined;
  const key = `${entry.user_id}:${entry.id}:${entry.audio_key}`;
  const existing = downloads.get(key);
  if (existing) { const uri = await existing; return allowed() ? uri : undefined; }
  const pending = (async () => {
    const headers = await authenticatedHeaders(entry.user_id);
    if (!allowed()) return undefined;
    const controller = new AbortController(); transfers.add(controller);
    const timer = setTimeout(() => controller.abort(), 90000);
    // Android can leave partial downloads behind: publish only a completed file.
    const temporary = new File(Paths.cache, `${destination.name}.${Crypto.randomUUID()}.part`);
    try {
      const file = await File.downloadFileAsync(`${API_URL}/v1/dreams/${encodeURIComponent(entry.id)}/audio`, temporary, { headers, idempotent: true, signal: controller.signal });
      if (!allowed() || controller.signal.aborted) return undefined;
      if (!file.exists || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('The recording download could not be verified. Please retry.');
      await file.move(destination, { overwrite: true });
      if (!allowed()) { if (destination.exists) destination.delete(); return undefined; }
      return destination.uri;
    } finally {
      clearTimeout(timer); transfers.delete(controller);
      if (temporary.exists && temporary.uri !== destination.uri) temporary.delete();
    }
  })().finally(() => downloads.delete(key));
  downloads.set(key, pending);
  return pending;
}
export async function removeJournalAudio(entry: { id: string; user_id: string; local_audio_uri?: string }, protectedFiles = new Set<string>()) {
  if (Platform.OS === 'web') return;
  if (entry.local_audio_uri && managedRecording(entry.local_audio_uri) && !protectedFiles.has(entry.local_audio_uri)) {
    const file = new File(entry.local_audio_uri); if (file.exists) file.delete();
  }
  // Scoped generated cache names cannot point outside the cache directory.
  const prefix = await cachePrefix(entry);
  // Older caches were UUID filenames; constrain legacy deletion to those IDs.
  if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(entry.id)) {
    const old = new File(Paths.cache, `${entry.id}.m4a`); if (old.exists && !protectedFiles.has(old.uri)) old.delete();
  }
  if (typeof Paths.cache.list === 'function') for (const item of Paths.cache.list()) if (item instanceof File && item.name.startsWith(prefix) && !protectedFiles.has(item.uri)) item.delete();
}

/** Recover only bytes already on this device; an expired owner's session cannot download them. */
export async function recoverJournalAudio(entry: Journal, newId: string): Promise<{ uri?: string; missing: boolean }> {
  const hasAudio = Boolean(entry.local_audio_uri || entry.audio_key || entry.audio_url || entry.audio_length);
  if (!hasAudio) return { missing: false };
  if (entry.local_audio_uri && managedRecording(entry.local_audio_uri)) {
    const local = new File(entry.local_audio_uri);
    if (local.exists && local.size > 0 && local.size <= 25 * 1024 * 1024) return { uri: local.uri, missing: false };
  }
  let cached = entry.audio_key ? await cacheFile(entry) : undefined;
  if (!cached?.exists && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(entry.id)) cached = new File(Paths.cache, `${entry.id}.m4a`);
  if (!cached?.exists || cached.size <= 0 || cached.size > 25 * 1024 * 1024) return { missing: true };
  if (!FileSystem.documentDirectory || !/^[A-Za-z0-9_-]+$/.test(newId)) throw new Error('Recording storage is unavailable. Your original journal has been retained.');
  const directory = `${FileSystem.documentDirectory.replace(/\/?$/, '/')}dreamer-recordings/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = new File(`${directory}${newId}-recovered.m4a`);
  await cached.copy(destination, { overwrite: true });
  if (!destination.exists || destination.size <= 0) throw new Error('The recording could not be recovered. Its original cached file has been retained.');
  return { uri: destination.uri, missing: false };
}
