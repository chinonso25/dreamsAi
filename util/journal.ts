import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import type { Journal } from '@/types';
import { apiRequest } from './api';
import { API_URL, authenticatedHeaders, getCurrentUser } from './auth-client';

const KEY = 'dreamer-journal-v1';
type Deleted = { id: string; user_id: string; synced?: boolean; local_audio_uri?: string; cleanupPending?: boolean };
type State = { entries: Journal[]; deleted: Deleted[]; retiredOwners: string[]; hydrated: boolean; syncing: boolean; error?: string };
type RemoteDream = Journal & { error?: string | null };
export const useJournalStore = create<State>(() => ({ entries: [], deleted: [], retiredOwners: [], hydrated: false, syncing: false }));
let hydration: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
let flush: Promise<void> | undefined;
let syncRequested = false;
const processing = new Map<string, Promise<void>>();
const suspendedOwners = new Set<string>();
function ownerBlocked(owner: string) { return suspendedOwners.has(owner) || useJournalStore.getState().retiredOwners.includes(owner); }
function canSyncOwner(owner: string) { return !ownerBlocked(owner) && (owner === 'device' || owner === getCurrentUser()?.id); }
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const message = (e: unknown) => {
  if (!(e instanceof Error)) return 'Could not sync. Your dream is saved on this device.';
  if (/failed to fetch|network request failed|networkerror|load failed/i.test(e.message)) return 'You’re offline or the connection was interrupted. Your dream is saved on this device; reconnect and tap Retry.';
  return e.message;
};
const interrupted = 'Processing was interrupted. Your dream is saved; tap Restart to begin again.';
function remoteDream(remote: RemoteDream): Journal {
  const { error, ...entry } = remote;
  return { ...entry, last_error: error || undefined };
}
async function persist() {
  const { entries, deleted, retiredOwners } = useJournalStore.getState();
  const snapshot = JSON.stringify({ version: 1, entries, deleted, retiredOwners });
  const next = writes.catch(() => undefined).then(() => AsyncStorage.setItem(KEY, snapshot));
  writes = next; await next;
}
export async function hydrateJournal() {
  if (!hydration) hydration = (async () => {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      let data: { entries?: Journal[]; deleted?: Deleted[]; retiredOwners?: string[] };
      try { data = JSON.parse(raw); } catch { throw new Error('Your saved journal could not be read. Its data has been retained; please retry.'); }
      if (!data || !Array.isArray(data.entries) || data.entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.transcript !== 'string' || typeof entry.dream_date !== 'string')) throw new Error('Your journal could not be opened. Its saved data has been retained.');
      const retiredOwners = Array.isArray(data.retiredOwners) ? data.retiredOwners.filter(owner => typeof owner === 'string') : [];
      useJournalStore.setState({ retiredOwners, entries: data.entries.filter(entry => !retiredOwners.includes(entry.user_id)).map(entry => {
        const wasProcessing = entry.processing_status === 'processing' || entry.processing_status === 'pending';
        return { ...entry, sync_status: entry.sync_status === 'syncing' ? 'local' : entry.sync_status, processing_status: wasProcessing ? 'error' : entry.processing_status, last_error: wasProcessing ? interrupted : entry.last_error };
      }), deleted: Array.isArray(data.deleted) ? data.deleted.filter(item => !retiredOwners.includes(item.user_id)) : [] });
    }
    useJournalStore.setState({ hydrated: true, error: undefined });
  })().catch(error => { hydration = undefined; useJournalStore.setState({ error: message(error) }); throw error; });
  return hydration;
}
function replace(entry: Journal) { useJournalStore.setState(state => ({ entries: state.entries.map(item => item.id === entry.id ? entry : item) })); }
function nextRevision(previous?: string) { return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 || 0 : 0)).toISOString(); }
export async function saveDream(input: Partial<Journal> & { transcript: string }): Promise<Journal> {
  await hydrateJournal();
  if (ownerBlocked(getCurrentUser()?.id || 'device')) throw new Error('Account deletion is in progress. Wait for it to finish before saving another dream.');
  if (!input.transcript.trim() && !input.local_audio_uri) throw new Error('Add a few words or a recording before saving.');
  const prior = useJournalStore.getState().entries.find(entry => entry.id === input.id);
  const now = new Date().toISOString();
  const entry: Journal = { ...prior, ...input, id: input.id || Crypto.randomUUID(), user_id: getCurrentUser()?.id || prior?.user_id || 'device', transcript: input.transcript.trim(), original_text: input.original_text ?? prior?.original_text ?? input.transcript.trim(), title: input.title?.trim() || (input.transcript.trim().slice(0, 60) || 'A voice dream'), dream_date: input.dream_date || localDate(), created_at: prior?.created_at || input.created_at || now, updated_at: nextRevision(prior?.updated_at), sync_status: 'local', processing_status: input.processing_status || 'idle' };
  // Persistence must succeed before capture clears its draft or navigates.
  useJournalStore.setState(state => ({ entries: [entry, ...state.entries.filter(item => item.id !== entry.id)] }));
  await persist();
  void syncJournal();
  return entry;
}
export async function updateDream(id: string, patch: Partial<Journal>) {
  await hydrateJournal();
  const entry = useJournalStore.getState().entries.find(item => item.id === id);
  if (!entry) throw new Error('This dream could not be found.');
  if (ownerBlocked(entry.user_id)) throw new Error('Account deletion is in progress. Your journal cannot be changed right now.');
  const changed = ['transcript', 'title', 'tags', 'keywords', 'mood', 'original_text'].some(key => key in patch && JSON.stringify(patch[key as keyof Journal]) !== JSON.stringify(entry[key as keyof Journal]));
  const sourceChanged = ('transcript' in patch && patch.transcript !== entry.transcript) || ('original_text' in patch && patch.original_text !== entry.original_text);
  const duringProcessing = changed && ['pending', 'processing'].includes(entry.processing_status);
  replace({ ...entry, ...patch, id: entry.id, user_id: entry.user_id, original_text: patch.original_text ?? entry.original_text ?? entry.transcript, created_at: entry.created_at, updated_at: nextRevision(entry.updated_at || entry.created_at), sync_status: 'local', summary: sourceChanged ? '' : patch.summary ?? entry.summary, processing_status: sourceChanged || duringProcessing ? 'idle' : patch.processing_status || entry.processing_status, last_error: undefined });
  await persist(); void syncJournal();
}
export async function deleteDream(id: string) {
  await hydrateJournal();
  const entry = useJournalStore.getState().entries.find(item => item.id === id);
  if (!entry) return;
  if (ownerBlocked(entry.user_id)) throw new Error('Account deletion is in progress. Your journal cannot be changed right now.');
  useJournalStore.setState(state => ({ entries: state.entries.filter(item => item.id !== id), deleted: [...state.deleted.filter(item => item.id !== id), { id, user_id: entry.user_id, local_audio_uri: entry.local_audio_uri, cleanupPending: true }] }));
  await persist(); void syncJournal();
}
async function upload(entry: Journal) {
  if (!entry.local_audio_uri || entry.audio_key) return undefined;
  const file = new File(entry.local_audio_uri);
  if (!file.exists) throw new Error('The recording is missing from this device. The written dream remains saved.');
  if (file.size > 25 * 1024 * 1024) throw new Error('This recording is too large to sync. Keep it on this device or record a shorter dream.');
  const headers = await authenticatedHeaders();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await expoFetch(`${API_URL}/v1/dreams/${entry.id}/audio`, { method: 'PUT', body: file, headers: { ...headers, 'Content-Type': file.type || 'audio/mp4' }, credentials: Platform.OS === 'web' ? 'include' : 'omit', signal: controller.signal });
    if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message || 'The audio upload was interrupted. Tap Retry to continue.'); }
    return (await response.json() as { audio_key: string }).audio_key;
  } finally { clearTimeout(timer); }
}
async function syncEntry(entry: Journal) {
  if (!canSyncOwner(entry.user_id)) return;
  const revision = entry.updated_at;
  replace({ ...entry, sync_status: 'syncing', last_error: undefined });
  try {
    const response = await apiRequest<{ dream: RemoteDream }>(`/v1/dreams/${entry.id}`, { method: 'PUT', body: JSON.stringify(entry) });
    const result = remoteDream(response.dream);
    if (!useJournalStore.getState().entries.some(item => item.id === entry.id)) return;
    const audioKey = await upload({ ...entry, audio_key: result.audio_key || entry.audio_key });
    const current = useJournalStore.getState().entries.find(item => item.id === entry.id);
    if (!current) return;
    if (current.updated_at !== revision) { if (audioKey) replace({ ...current, audio_key: audioKey }); return; }
    const localPending = current.processing_status === 'pending' || current.processing_status === 'processing';
    replace({ ...current, ...result, local_audio_uri: current.local_audio_uri, audio_key: audioKey || result.audio_key || current.audio_key, user_id: getCurrentUser()?.id || current.user_id, sync_status: 'synced', processing_status: localPending && result.processing_status === 'idle' ? current.processing_status : result.processing_status || current.processing_status, last_error: result.last_error });
  } catch (error) {
    const current = useJournalStore.getState().entries.find(item => item.id === entry.id);
    if (current && current.updated_at === revision) replace({ ...current, sync_status: 'error', last_error: message(error) });
  } finally { await persist(); }
}
export async function syncJournal() {
  if (flush) { syncRequested = true; return flush; }
  flush = (async () => {
    await hydrateJournal(); useJournalStore.setState({ syncing: true });
    let firstPass = true;
    do {
      syncRequested = false;
      for (const entry of [...useJournalStore.getState().entries]) if (canSyncOwner(entry.user_id) && (entry.sync_status === 'local' || firstPass && entry.sync_status !== 'synced')) await syncEntry(entry);
      firstPass = false;
      for (const tombstone of [...useJournalStore.getState().deleted]) {
        if (!canSyncOwner(tombstone.user_id)) continue;
        if (tombstone.cleanupPending) {
          try {
            if (tombstone.local_audio_uri) { const audio = new File(tombstone.local_audio_uri); if (audio.exists) audio.delete(); }
            const cached = new File(Paths.cache, `${tombstone.id}.m4a`); if (cached.exists) cached.delete();
            useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id ? { ...item, local_audio_uri: undefined, cleanupPending: false } : item) })); await persist();
          } catch { useJournalStore.setState({ error: 'The dream was removed. Audio cleanup on this device will retry when your journal syncs.' }); }
        }
        if (tombstone.synced) continue;
        try {
          await apiRequest(`/v1/dreams/${tombstone.id}`, { method: 'DELETE' });
          // Keep acknowledged tombstones: a GET already in flight must not resurrect deleted entries.
          useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id ? { ...item, synced: true } : item) })); await persist();
        } catch (error) {
          if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id ? { ...item, synced: true } : item) })); await persist();
          } else useJournalStore.setState({ error: message(error) });
        }
      }
    } while (syncRequested);
  })().catch(error => useJournalStore.setState({ error: message(error) })).finally(() => { useJournalStore.setState({ syncing: false }); flush = undefined; });
  return flush;
}
export async function refreshDreams() {
  await syncJournal();
  if (getCurrentUser()?.id && ownerBlocked(getCurrentUser()!.id)) return;
  try {
    const { dreams } = await apiRequest<{ dreams: RemoteDream[] }>('/v1/dreams');
    const state = useJournalStore.getState();
    const merged = new Map(state.entries.map(entry => [entry.id, entry]));
    for (const response of dreams) {
      if (ownerBlocked(response.user_id)) continue;
      if (state.deleted.some(item => item.id === response.id)) continue;
      const remote = remoteDream(response);
      const local = merged.get(remote.id);
      if (local && local.sync_status !== 'synced') continue;
      const abandonedJob = remote.processing_status === 'processing' && !processing.has(remote.id);
      merged.set(remote.id, { ...local, ...remote, sync_status: 'synced', processing_status: abandonedJob ? 'error' : remote.processing_status || 'idle', last_error: abandonedJob ? 'A previous attempt may still be finishing. Tap Restart to check its result or continue processing.' : remote.last_error, local_audio_uri: local?.local_audio_uri });
    }
    useJournalStore.setState({ entries: [...merged.values()].sort((a, b) => b.dream_date.localeCompare(a.dream_date)), error: undefined }); await persist();
  } catch (error) { useJournalStore.setState({ error: message(error) }); }
}
export async function requestDreamProcessing(id: string): Promise<void> {
  if (processing.has(id)) return processing.get(id)!;
  const job = (async () => {
    await hydrateJournal();
    let entry = useJournalStore.getState().entries.find(item => item.id === id);
    if (!entry) throw new Error('This dream could not be found.');
    if (ownerBlocked(entry.user_id)) throw new Error('Account deletion is in progress. Processing is paused.');
    let revision = entry.updated_at;
    try {
      replace({ ...entry, processing_status: 'pending', last_error: undefined }); await persist(); await syncJournal();
      entry = useJournalStore.getState().entries.find(item => item.id === id);
      if (!entry || entry.sync_status !== 'synced') throw new Error(entry?.last_error || 'Your dream is saved. Reconnect before creating its summary.');
      revision = entry.updated_at;
      replace({ ...entry, processing_status: 'processing' }); await persist();
      let response = await apiRequest<{ dream: RemoteDream }>(`/v1/dreams/${id}/process`, { method: 'POST', body: '{}' });
      // Retries can encounter an existing server lease. Observe it instead of starting duplicate inference.
      for (let attempt = 0; response.dream.processing_status === 'processing' && attempt < 45; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const current = useJournalStore.getState().entries.find(item => item.id === id);
        if (!current || current.updated_at !== revision) return;
        response = await apiRequest<{ dream: RemoteDream }>(`/v1/dreams/${id}`);
      }
      const result = remoteDream(response.dream);
      const current = useJournalStore.getState().entries.find(item => item.id === id);
      if (!current || current.updated_at !== revision) return;
      if (result.processing_status === 'processing') throw new Error('Processing is taking longer than expected. Your dream is saved; tap Restart to check again.');
      replace({ ...current, ...result, local_audio_uri: current.local_audio_uri, sync_status: 'synced' });
      if (result.processing_status === 'error') throw new Error(result.last_error || interrupted);
    } catch (error) {
      const current = useJournalStore.getState().entries.find(item => item.id === id);
      if (current && current.updated_at === revision) replace({ ...current, processing_status: 'error', last_error: message(error) });
      // Preserve API status so a 402 can open the paywall and resume the same job.
      throw error instanceof Error ? error : new Error(message(error));
    } finally { await persist(); }
  })().finally(() => processing.delete(id));
  processing.set(id, job); return job;
}
export async function retryDream(id: string) {
  const entry = useJournalStore.getState().entries.find(item => item.id === id);
  if (!entry) return;
  const retryProcessing = ['pending', 'processing', 'error'].includes(entry.processing_status);
  if (entry.sync_status !== 'synced') { replace({ ...entry, sync_status: 'local' }); await persist(); await syncJournal(); }
  if (retryProcessing) await requestDreamProcessing(id);
}
export async function getAudioUri(id: string) {
  const entry = useJournalStore.getState().entries.find(item => item.id === id);
  if (!entry || ownerBlocked(entry.user_id)) return undefined;
  if (entry.local_audio_uri && new File(entry.local_audio_uri).exists) return entry.local_audio_uri;
  if (!entry.audio_key) return undefined;
  const headers = await authenticatedHeaders();
  const file = await File.downloadFileAsync(`${API_URL}/v1/dreams/${id}/audio`, new File(Paths.cache, `${id}.m4a`), { headers, idempotent: true });
  if (ownerBlocked(entry.user_id) || !useJournalStore.getState().entries.some(item => item.id === id)) { if (file.exists) file.delete(); return undefined; }
  return file.uri;
}
export async function rebindJournalOwner(previousId: string | undefined, nextId: string) {
  await hydrateJournal();
  useJournalStore.setState(state => ({ entries: state.entries.map(entry => !ownerBlocked(entry.user_id) && (entry.user_id === previousId || entry.user_id === 'device') ? { ...entry, user_id: nextId } : entry), deleted: state.deleted.map(item => !ownerBlocked(item.user_id) && (item.user_id === previousId || item.user_id === 'device') ? { ...item, user_id: nextId } : item) }));
  await persist();
}

/** Pause writes before deleting remotely; in-flight work finishes before the account is removed. */
export async function beginAccountDeletion(owner: string) {
  await hydrateJournal();
  suspendedOwners.add(owner);
  await Promise.allSettled([...(flush ? [flush] : []), ...processing.values()]);
  await writes.catch(() => undefined);
}
export function cancelAccountDeletion(owner: string) { suspendedOwners.delete(owner); }

/** Call only after the backend acknowledges deletion. Retain other owners and their files. */
export async function clearDeletedAccountJournal(owner: string) {
  await hydrateJournal();
  suspendedOwners.add(owner);
  const before = useJournalStore.getState();
  const removed = before.entries.filter(entry => entry.user_id === owner);
  const removedTombstones = before.deleted.filter(entry => entry.user_id === owner);
  const kept = before.entries.filter(entry => entry.user_id !== owner);
  const keptTombstones = before.deleted.filter(entry => entry.user_id !== owner);
  useJournalStore.setState({ entries: kept, deleted: keptTombstones, retiredOwners: [...new Set([...before.retiredOwners, owner])], error: undefined });
  // Durable tombstones prevent delayed responses or a future session from reclaiming this data.
  await persist();
  if (Platform.OS === 'web') return;
  const protectedFiles = new Set([...kept, ...keptTombstones].map(entry => entry.local_audio_uri).filter(Boolean));
  for (const entry of [...kept, ...keptTombstones]) protectedFiles.add(new File(Paths.cache, `${entry.id}.m4a`).uri);
  const files = new Set([...removed, ...removedTombstones].map(entry => entry.local_audio_uri).filter((uri): uri is string => Boolean(uri) && !protectedFiles.has(uri)));
  for (const entry of [...removed, ...removedTombstones]) { const uri = new File(Paths.cache, `${entry.id}.m4a`).uri; if (!protectedFiles.has(uri)) files.add(uri); }
  let cleanupFailed = false;
  for (const uri of files) { try { const file = new File(uri); if (file.exists) file.delete(); } catch { cleanupFailed = true; } }
  if (cleanupFailed) throw new Error('Your account and journal were deleted. Some recording files on this device could not be removed; please check device storage.');
}
