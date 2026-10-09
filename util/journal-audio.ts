import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch as expoFetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { Journal } from '@/types';
import { API_URL, authenticatedHeaders } from './auth-client';
import { isManagedRecordingUri } from '../shared/dream-contract';

const downloads = new Map<string, Promise<string | undefined>>();
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
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await expoFetch(`${API_URL}/v1/dreams/${encodeURIComponent(entry.id)}/audio`, { method: 'PUT', body: file, headers: { ...headers, 'Content-Type': file.type || 'audio/mp4' }, credentials: Platform.OS === 'web' ? 'include' : 'omit', signal: controller.signal });
    if (!allowed()) return undefined;
    if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message || 'The audio upload was interrupted. Tap Retry to continue.'); }
    const result = await response.json() as { audio_key?: unknown };
    if (typeof result.audio_key !== 'string') throw new Error('The audio upload could not be confirmed. Retry to continue.');
    return allowed() ? result.audio_key : undefined;
  } finally { clearTimeout(timer); }
}
export async function journalAudioUri(entry: Journal, allowed: () => boolean) {
  if (!allowed()) return undefined;
  if (entry.local_audio_uri && managedRecording(entry.local_audio_uri) && new File(entry.local_audio_uri).exists) return entry.local_audio_uri;
  if (!entry.audio_key) return undefined;
  const destination = await cacheFile(entry);
  if (!allowed()) return undefined;
  if (destination.exists) return allowed() ? destination.uri : undefined;
  const key = `${entry.user_id}:${entry.id}:${entry.audio_key}`;
  const existing = downloads.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const headers = await authenticatedHeaders(entry.user_id);
    if (!allowed()) return undefined;
    const file = await File.downloadFileAsync(`${API_URL}/v1/dreams/${encodeURIComponent(entry.id)}/audio`, destination, { headers, idempotent: true });
    if (!allowed()) { if (file.exists) file.delete(); return undefined; }
    return file.uri;
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
