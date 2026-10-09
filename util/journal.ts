import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type { Journal } from '@/types';
import { apiRequest, ApiError } from './api';
import { getCurrentUser } from './auth-client';
import { parseDreamResponse, parseDreamListResponse, parseDreamSyncResponse, toSaveDreamInput, validateDreamInput, type DreamDTO, type DreamListResponse, type DreamDeletionDTO } from '../shared/dream-contract';
import { persistJournal, readJournal, waitForJournalWrites, type JournalDeletion } from './journal-persistence';
import { nextRevision, editDream, mergeRemote } from './journal-transitions';
import { journalAudioUri, uploadJournalAudio, removeJournalAudio, managedRecording } from './journal-audio';
import { onlineManager, queryOptions } from '@tanstack/react-query';
import { clearAccountQueries, journalQueryKey, queryClient } from './query-client';

type State = { entries: Journal[]; deleted: JournalDeletion[]; retiredOwners: string[]; cursors: Record<string, string>; hydrated: boolean; syncing: boolean; error?: string };
export const useJournalStore = create<State>(() => ({ entries: [], deleted: [], retiredOwners: [], cursors: {}, hydrated: false, syncing: false }));
let hydration: Promise<void> | undefined;
let flush: Promise<void> | undefined;
let syncRequested = false;
let generation = 0;
const processing = new Map<string, Promise<void>>();
const suspendedOwners = new Set<string>();
function ownerBlocked(owner: string) { return suspendedOwners.has(owner) || useJournalStore.getState().retiredOwners.includes(owner); }
function accessible(owner: string) { return !ownerBlocked(owner) && (owner === 'device' || owner === getCurrentUser()?.id); }
function canSyncOwner(owner: string) { return owner !== 'device' && accessible(owner); }
function validRequest(owner: string, token: number) { return generation === token && canSyncOwner(owner); }
export function invalidateJournalRequests() {
  generation++; syncRequested = false;
  void queryClient.cancelQueries({ queryKey: ['account'] });
  void queryClient.invalidateQueries({ queryKey: ['account'], refetchType: 'none' });
  const owner = getCurrentUser()?.id;
  queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'account' && query.queryKey[1] !== owner });
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const message = (e: unknown) => {
  if (!(e instanceof Error)) return 'Could not sync. Your dream is saved on this device.';
  if (/failed to fetch|network request failed|networkerror|load failed/i.test(e.message)) return 'You’re offline or the connection was interrupted. Your dream is saved on this device; reconnect and tap Retry.';
  return e.message;
};
const interrupted = 'Processing was interrupted. Your dream is saved; tap Restart to begin again.';
function remoteDream(remote: DreamDTO): Journal {
  const { error, ...entry } = remote;
  return { ...entry, sync_status: 'synced', last_error: error || undefined };
}
function persist() { return persistJournal(useJournalStore.getState()); }
function markCloudJournalStale(owner: string) {
  if (owner !== 'device') void queryClient.invalidateQueries({ queryKey: journalQueryKey(owner), refetchType: 'none' });
}
export async function hydrateJournal() {
  if (!hydration) hydration = (async () => {
    const data = await readJournal();
    useJournalStore.setState({ ...data, cursors: data.cursors || {}, entries: data.entries.filter(entry => !data.retiredOwners.includes(entry.user_id)).map(entry => {
      const wasProcessing = entry.processing_status === 'processing' || entry.processing_status === 'pending';
      return { ...entry, sync_status: entry.sync_status === 'syncing' ? 'local' : entry.sync_status, processing_status: wasProcessing ? 'error' : entry.processing_status, last_error: wasProcessing ? interrupted : entry.last_error };
    }), deleted: data.deleted.filter(item => !data.retiredOwners.includes(item.user_id)), hydrated: true, error: undefined });
  })().catch(error => { hydration = undefined; useJournalStore.setState({ error: message(error) }); throw error; });
  return hydration;
}
function replace(entry: Journal) { useJournalStore.setState(state => ({ entries: state.entries.map(item => item.id === entry.id && item.user_id === entry.user_id ? entry : item) })); }
function currentEntry(id: string, owner?: string) { return useJournalStore.getState().entries.find(item => item.id === id && (!owner || item.user_id === owner)); }
function requireEntry(id: string) {
  const entry = currentEntry(id);
  if (!entry || !accessible(entry.user_id)) throw new Error('This dream is not available in your current journal.');
  return entry;
}
export async function saveDream(input: Partial<Journal> & { transcript: string }): Promise<Journal> {
  await hydrateJournal();
  if (ownerBlocked(getCurrentUser()?.id || 'device')) throw new Error('Account deletion is in progress. Wait for it to finish before saving another dream.');
  if (!input.transcript.trim() && !input.local_audio_uri) throw new Error('Add a few words or a recording before saving.');
  validateDreamInput(input);
  if (input.local_audio_uri && !managedRecording(input.local_audio_uri)) throw new Error('This recording could not be attached safely. Your written draft is retained.');
  const prior = currentEntry(input.id || '');
  if (prior && !accessible(prior.user_id)) throw new Error('This dream belongs to another journal.');
  const now = new Date().toISOString();
  const entry: Journal = { ...prior, ...input, id: input.id || Crypto.randomUUID(), user_id: getCurrentUser()?.id || prior?.user_id || 'device', transcript: input.transcript.trim(), original_text: input.original_text ?? prior?.original_text ?? input.transcript.trim(), title: input.title?.trim() || (input.transcript.trim().slice(0, 60) || 'A voice dream'), dream_date: input.dream_date || localDate(), created_at: prior?.created_at || input.created_at || now, updated_at: nextRevision(prior?.updated_at), sync_status: 'local', processing_status: input.processing_status || 'idle' };
  // Persistence must succeed before capture clears its draft or navigates.
  useJournalStore.setState(state => ({ entries: [entry, ...state.entries.filter(item => item.id !== entry.id)] }));
  await persist();
  markCloudJournalStale(entry.user_id);
  void syncJournal();
  return entry;
}
export async function updateDream(id: string, patch: Partial<Journal>) {
  await hydrateJournal();
  const entry = requireEntry(id);
  validateDreamInput(patch);
  replace(editDream(entry, patch));
  await persist(); markCloudJournalStale(entry.user_id); void syncJournal();
}
export async function deleteDream(id: string) {
  await hydrateJournal();
  const entry = requireEntry(id);
  useJournalStore.setState(state => ({ entries: state.entries.filter(item => item.id !== id), deleted: [...state.deleted.filter(item => item.id !== id), { id, user_id: entry.user_id, local_audio_uri: entry.local_audio_uri, cleanupPending: true }] }));
  await persist(); markCloudJournalStale(entry.user_id); void syncJournal();
}
async function syncEntry(id: string, owner: string, token: number) {
  const entry = currentEntry(id, owner);
  if (!entry || !validRequest(owner, token) || entry.sync_status === 'synced') return;
  const revision = entry.updated_at;
  replace({ ...entry, sync_status: 'syncing', last_error: undefined });
  try {
    const response = parseDreamResponse(await apiRequest(`/v1/dreams/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(toSaveDreamInput(entry)), expectedOwner: owner }));
    if (!validRequest(owner, token) || response.dream.user_id !== owner || response.dream.id !== id) return;
    const result = remoteDream(response.dream);
    if (!currentEntry(id, owner)) return;
    const audioKey = await uploadJournalAudio({ ...entry, audio_key: result.audio_key || entry.audio_key }, () => validRequest(owner, token) && Boolean(currentEntry(id, owner)));
    const current = currentEntry(id, owner);
    if (!current || !validRequest(owner, token)) return;
    if (current.updated_at !== revision) { if (audioKey) replace({ ...current, audio_key: audioKey }); return; }
    const merged = mergeRemote(current, { ...result, audio_key: audioKey || result.audio_key || current.audio_key }, true);
    if (merged) replace(merged);
  } catch (error) {
    const current = currentEntry(id, owner);
    if (current && validRequest(owner, token) && current.updated_at === revision) replace({ ...current, sync_status: 'error', last_error: message(error) });
  } finally {
    const current = currentEntry(id, owner);
    if (!validRequest(owner, token) && current?.sync_status === 'syncing') replace({ ...current, sync_status: 'local' });
    await persist();
  }
}
export async function syncJournal() {
  if (!onlineManager.isOnline()) return;
  if (flush) { syncRequested = true; return flush; }
  const owner = getCurrentUser()?.id;
  const token = generation;
  flush = (async () => {
    await hydrateJournal();
    if (!owner || !validRequest(owner, token)) return;
    useJournalStore.setState({ syncing: true });
    let firstPass = true;
    do {
      syncRequested = false;
      const ids = useJournalStore.getState().entries.filter(entry => entry.user_id === owner && (entry.sync_status === 'local' || firstPass && entry.sync_status !== 'synced')).map(entry => entry.id);
      for (const id of ids) { if (!validRequest(owner, token)) return; await syncEntry(id, owner, token); }
      firstPass = false;
      for (const tombstone of [...useJournalStore.getState().deleted]) {
        if (tombstone.user_id !== owner || !validRequest(owner, token)) continue;
        if (tombstone.cleanupPending) {
          try {
            await removeJournalAudio(tombstone);
            useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id && item.user_id === owner ? { ...item, local_audio_uri: undefined, cleanupPending: false } : item) })); await persist();
          } catch { useJournalStore.setState({ error: 'The dream was removed. Audio cleanup on this device will retry when your journal syncs.' }); }
        }
        if (tombstone.synced) continue;
        try { await apiRequest(`/v1/dreams/${encodeURIComponent(tombstone.id)}`, { method: 'DELETE', expectedOwner: owner }); }
        catch (error) { if (!(error instanceof ApiError && error.status === 404 || error && typeof error === 'object' && 'status' in error && error.status === 404)) { if (validRequest(owner, token)) useJournalStore.setState({ error: message(error) }); continue; } }
        if (!validRequest(owner, token)) return;
        useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id && item.user_id === owner ? { ...item, synced: true } : item) })); await persist();
      }
    } while (syncRequested && validRequest(owner, token));
  })().catch(error => { if (generation === token) useJournalStore.setState({ error: message(error) }); }).finally(() => { useJournalStore.setState({ syncing: false }); flush = undefined; });
  return flush;
}
export function journalCloudQueryOptions(owner: string) {
  return queryOptions({
    queryKey: journalQueryKey(owner),
    queryFn: ({ signal }) => pullDreams(owner, signal),
  });
}

export async function refreshDreams() {
  const owner = getCurrentUser()?.id;
  if (!owner || ownerBlocked(owner) || !onlineManager.isOnline()) return;
  // Explicit refresh bypasses staleTime but shares an already-running request.
  await queryClient.fetchQuery({ ...journalCloudQueryOptions(owner), staleTime: 0 }).catch(() => {});
}

async function pullDreams(owner: string, signal: AbortSignal) {
  const token = generation;
  const allowed = () => !signal.aborted && validRequest(owner, token);
  try {
    await syncJournal();
    if (!allowed()) throw new Error('Journal refresh was cancelled.');
    let legacy = false;
    let cursor: string | undefined;
    let watermark: string | undefined;
    const since = useJournalStore.getState().cursors[owner] || '0';
    const seen = new Set<string>();
    do {
      const params = new URLSearchParams({ limit: '100', ...(legacy ? {} : { since }), ...(cursor ? { cursor } : {}), ...(watermark ? { until: watermark } : {}) });
      let raw: unknown;
      try { raw = await apiRequest(`${legacy ? '/v1/dreams' : '/v1/dreams/sync'}?${params}`, { expectedOwner: owner, signal }); }
      catch (error) {
        if (!legacy && error && typeof error === 'object' && 'status' in error && error.status === 404) { legacy = true; cursor = undefined; watermark = undefined; raw = await apiRequest('/v1/dreams', { expectedOwner: owner, signal }); }
        else throw error;
      }
      if (!allowed()) throw new Error('Journal refresh was cancelled.');
      // Old backends return only dreams: retain missing local rows; absence is never a deletion.
      const page: DreamListResponse & { deleted?: DreamDeletionDTO[] } = legacy || raw && typeof raw === 'object' && !('deleted' in raw) ? parseDreamListResponse(raw) : parseDreamSyncResponse(raw);
      const deletions = page.deleted || [];
      if (page.dreams.some(entry => entry.user_id !== owner) || deletions.some(entry => entry.user_id !== owner)) throw new Error('The response belongs to another journal. Please reconnect.');
      const state = useJournalStore.getState();
      const merged = new Map(state.entries.map(entry => [entry.id, entry]));
      const deleted = [...state.deleted];
      const blocked = new Set(deleted.map(item => `${item.user_id}:${item.id}`));
      for (const deletion of deletions) {
        const local = merged.get(deletion.id);
        if (local && local.user_id !== owner) continue;
        if (local?.sync_version !== undefined && local.sync_version > deletion.sync_version) continue;
        if (local) merged.delete(deletion.id);
        if (!blocked.has(`${owner}:${deletion.id}`)) deleted.push({ ...deletion, synced: true, local_audio_uri: local?.local_audio_uri, cleanupPending: true });
        blocked.add(`${owner}:${deletion.id}`);
      }
      for (const response of page.dreams) {
        if (blocked.has(`${owner}:${response.id}`)) continue;
        const remote = remoteDream(response);
        const local = merged.get(remote.id);
        if (local && (local.user_id !== owner || local.sync_status !== 'synced')) continue;
        const accepted = mergeRemote(local, remote);
        if (!accepted || accepted === local) continue;
        const abandoned = accepted.processing_status === 'processing' && !processing.has(`${owner}:${remote.id}`);
        merged.set(remote.id, { ...accepted, processing_status: abandoned ? 'error' : accepted.processing_status, last_error: abandoned ? 'A previous attempt may still be finishing. Tap Restart to check its result or continue processing.' : accepted.last_error });
      }
      watermark = page.sync_cursor || watermark;
      cursor = page.next_cursor || undefined;
      if (cursor && seen.has(cursor)) throw new Error('Journal pagination did not advance. Please retry.');
      if (cursor) seen.add(cursor);
      useJournalStore.setState({ entries: [...merged.values()].sort((a, b) => b.dream_date.localeCompare(a.dream_date)), deleted, error: undefined, ...(!cursor && !legacy && page.deleted && watermark ? { cursors: { ...state.cursors, [owner]: watermark } } : {}) });
      await persist();
    } while (cursor);
    // Only reconciliation metadata is cached: screens use the durable local
    // entries, so cached server results can never overwrite queued offline edits.
    return { owner, cursor: useJournalStore.getState().cursors[owner] || null };
  } catch (error) {
    if (allowed()) useJournalStore.setState({ error: message(error) });
    throw error;
  }
}
export async function requestDreamProcessing(id: string): Promise<void> {
  if (!onlineManager.isOnline()) throw new Error('You’re offline. Your dream is saved; reconnect before creating its summary.');
  await hydrateJournal();
  const initial = requireEntry(id);
  const owner = initial.user_id;
  const token = generation;
  if (!canSyncOwner(owner)) throw new Error('Reconnect before creating its summary. Your dream is saved on this device.');
  const key = `${owner}:${id}`;
  if (processing.has(key)) return processing.get(key)!;
  const job = (async () => {
    let revision = initial.updated_at;
    try {
      replace({ ...initial, processing_status: 'pending', last_error: undefined }); await persist(); await syncJournal();
      const entry = currentEntry(id, owner);
      if (!validRequest(owner, token)) return;
      if (!entry || entry.sync_status !== 'synced') throw new Error(entry?.last_error || 'Your dream is saved. Reconnect before creating its summary.');
      revision = entry.updated_at;
      replace({ ...entry, processing_status: 'processing' });
      // Pending is already durable; persisting a second transient status adds no recovery information.
      let response = parseDreamResponse(await apiRequest(`/v1/dreams/${encodeURIComponent(id)}/process`, { method: 'POST', body: '{}', expectedOwner: owner }));
      for (let attempt = 0; response.dream.processing_status === 'processing' && attempt < 45; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const current = currentEntry(id, owner);
        if (!validRequest(owner, token) || !current || current.updated_at !== revision) return;
        response = parseDreamResponse(await apiRequest(`/v1/dreams/${encodeURIComponent(id)}`, { expectedOwner: owner }));
      }
      const current = currentEntry(id, owner);
      if (!validRequest(owner, token) || !current || current.updated_at !== revision) return;
      if (response.dream.id !== id || response.dream.user_id !== owner) throw new Error('The processing response belongs to another journal.');
      const result = remoteDream(response.dream);
      if (result.processing_status === 'processing') throw new Error('Processing is taking longer than expected. Your dream is saved; tap Restart to check again.');
      const merged = mergeRemote(current, result); if (merged) replace(merged);
      if (result.processing_status === 'error') throw new Error(result.last_error || interrupted);
    } catch (error) {
      const current = currentEntry(id, owner);
      if (validRequest(owner, token) && current && current.updated_at === revision) replace({ ...current, processing_status: 'error', last_error: message(error) });
      throw error instanceof Error ? error : new Error(message(error));
    } finally { await persist(); }
  })().finally(() => processing.delete(key));
  processing.set(key, job); return job;
}
export async function retryDream(id: string) {
  const entry = requireEntry(id);
  const retryProcessing = ['pending', 'processing', 'error'].includes(entry.processing_status);
  if (entry.sync_status !== 'synced') { replace({ ...entry, sync_status: 'local' }); await persist(); await syncJournal(); }
  if (retryProcessing) await requestDreamProcessing(id);
}
export async function getAudioUri(id: string) {
  const entry = currentEntry(id);
  if (!entry || !accessible(entry.user_id)) return undefined;
  const token = generation;
  return journalAudioUri(entry, () => generation === token && accessible(entry.user_id) && currentEntry(id, entry.user_id)?.audio_key === entry.audio_key);
}
export async function rebindJournalOwner(previousId: string | undefined, nextId: string, transferPrevious = false) {
  await hydrateJournal();
  if (nextId !== getCurrentUser()?.id || ownerBlocked(nextId)) throw new Error('Your account changed. Reconnect before moving your journal.');
  invalidateJournalRequests();
  const transfer = (owner: string) => !ownerBlocked(owner) && (owner === 'device' || transferPrevious && owner === previousId);
  useJournalStore.setState(state => ({ entries: state.entries.map(entry => transfer(entry.user_id) ? { ...entry, user_id: nextId, sync_status: 'local' } : entry), deleted: state.deleted.map(item => transfer(item.user_id) ? { ...item, user_id: nextId } : item), cursors: { ...state.cursors, [nextId]: '0' } }));
  await persist();
}

/** Pause writes before deleting remotely; in-flight work finishes before the account is removed. */
export async function beginAccountDeletion(owner: string) {
  await hydrateJournal();
  suspendedOwners.add(owner);
  await clearAccountQueries(owner);
  await Promise.allSettled([...(flush ? [flush] : []), ...processing.values()]);
  await waitForJournalWrites();
}
export function cancelAccountDeletion(owner: string) { suspendedOwners.delete(owner); }

/** Call only after the backend acknowledges deletion. Retain other owners and their files. */
export async function clearDeletedAccountJournal(owner: string) {
  await hydrateJournal();
  suspendedOwners.add(owner);
  await clearAccountQueries(owner);
  const before = useJournalStore.getState();
  const removed = before.entries.filter(entry => entry.user_id === owner);
  const removedTombstones = before.deleted.filter(entry => entry.user_id === owner);
  const kept = before.entries.filter(entry => entry.user_id !== owner);
  const keptTombstones = before.deleted.filter(entry => entry.user_id !== owner);
  useJournalStore.setState({ entries: kept, deleted: keptTombstones, retiredOwners: [...new Set([...before.retiredOwners, owner])], error: undefined });
  // Durable tombstones prevent delayed responses or a future session from reclaiming this data.
  await persist();
  const protectedFiles = new Set([...kept, ...keptTombstones].map(entry => entry.local_audio_uri).filter((uri): uri is string => Boolean(uri)));
  let cleanupFailed = false;
  for (const entry of [...removed, ...removedTombstones]) { try { await removeJournalAudio(entry, protectedFiles); } catch { cleanupFailed = true; } }
  if (cleanupFailed) throw new Error('Your account and journal were deleted. Some recording files on this device could not be removed; please check device storage.');
}
