import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type { Journal } from '@/types';
import { apiRequest, ApiError } from './api';
import { getCurrentUser } from './auth-client';
import { parseDreamResponse, parseDreamListResponse, parseDreamSyncResponse, toSaveDreamInput, validateDreamInput, type DreamDTO, type DreamListResponse, type DreamDeletionDTO, type SaveDreamInput, type EditDreamPatch, localDateKey } from '../shared/dream-contract';
import { persistJournal, readJournal, waitForJournalWrites, type JournalDeletion } from './journal-persistence';
import { nextRevision, editDream, mergeRemote, normalizeDreamClock } from './journal-transitions';
import { journalAudioUri, uploadJournalAudio, removeJournalAudio, managedRecording, cancelJournalAudio, recoverJournalAudio } from './journal-audio';

type RecoveredJournal = Journal & { recovery_source?: string };
type State = { entries: Journal[]; deleted: JournalDeletion[]; retiredOwners: string[]; cursors: Record<string, string>; hydrated: boolean; syncing: boolean; error?: string };
export const useJournalStore = create<State>(() => ({ entries: [], deleted: [], retiredOwners: [], cursors: {}, hydrated: false, syncing: false }));
let hydration: Promise<void> | undefined;
let flush: Promise<void> | undefined;
let syncRequested = false;
let generation = 0;
const refreshing = new Map<string, Promise<void>>();
const processing = new Map<string, Promise<void>>();
const suspendedOwners = new Set<string>();
function ownerBlocked(owner: string) { return suspendedOwners.has(owner) || useJournalStore.getState().retiredOwners.includes(owner); }
function accessible(owner: string) { return !ownerBlocked(owner) && (owner === 'device' || owner === getCurrentUser()?.id); }
function canSyncOwner(owner: string) { return owner !== 'device' && accessible(owner); }
function validRequest(owner: string, token: number) { return generation === token && canSyncOwner(owner); }
export function invalidateJournalRequests() { generation++; syncRequested = false; refreshing.clear(); cancelJournalAudio(); }
export const localDate = localDateKey;
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
export async function saveDream(input: SaveDreamInput & { local_audio_uri?: string; processing_status?: 'idle' }): Promise<Journal> {
  await hydrateJournal();
  if (ownerBlocked(getCurrentUser()?.id || 'device')) throw new Error('Account deletion is in progress. Wait for it to finish before saving another dream.');
  if (!input.transcript.trim() && !input.local_audio_uri) throw new Error('Add a few words or a recording before saving.');
  validateDreamInput(input);
  if (input.local_audio_uri && !managedRecording(input.local_audio_uri)) throw new Error('This recording could not be attached safely. Your written draft is retained.');
  const prior = currentEntry(input.id || '');
  if (prior && !accessible(prior.user_id)) throw new Error('This dream belongs to another journal.');
  const now = new Date().toISOString();
  const entry: Journal = normalizeDreamClock({ ...prior, ...input, id: input.id || Crypto.randomUUID(), user_id: getCurrentUser()?.id || prior?.user_id || 'device', transcript: input.transcript.trim(), original_text: input.original_text ?? prior?.original_text ?? input.transcript.trim(), title: input.title?.trim() || (input.transcript.trim().slice(0, 60) || 'A voice dream'), dream_date: input.dream_date || localDate(), created_at: prior?.created_at || input.created_at || now, updated_at: nextRevision(prior?.updated_at), sync_status: 'local', processing_status: input.processing_status || 'idle' });
  validateDreamInput(toSaveDreamInput(entry));
  // Persistence must succeed before capture clears its draft or navigates.
  useJournalStore.setState(state => ({ entries: [entry, ...state.entries.filter(item => item.id !== entry.id)] }));
  await persist();
  void syncJournal();
  return entry;
}
export async function updateDream(id: string, patch: EditDreamPatch) {
  await hydrateJournal();
  const entry = requireEntry(id);
  const allowed = ['title', 'transcript', 'original_text', 'dream_date', 'summary', 'tags', 'keywords', 'mood', 'audio_length', 'is_starred', 'reflection'];
  const input = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key))) as EditDreamPatch;
  validateDreamInput(input);
  const next = editDream(entry, input);
  validateDreamInput(toSaveDreamInput(next));
  replace(next);
  await persist(); void syncJournal();
}
export async function deleteDream(id: string) {
  await hydrateJournal();
  const entry = requireEntry(id);
  useJournalStore.setState(state => ({ entries: state.entries.filter(item => item.id !== id), deleted: [...state.deleted.filter(item => item.id !== id), { id, user_id: entry.user_id, local_audio_uri: entry.local_audio_uri, recovery_source: (entry as RecoveredJournal).recovery_source, cleanupPending: true }] }));
  await persist(); void syncJournal();
}
async function syncEntry(id: string, owner: string, token: number) {
  const queued = currentEntry(id, owner);
  if (!queued || !validRequest(owner, token) || queued.sync_status === 'synced') return;
  const entry = normalizeDreamClock(queued);
  const revision = entry.updated_at;
  replace({ ...entry, sync_status: 'syncing', last_error: undefined });
  try {
    const response = parseDreamResponse(await apiRequest(`/v1/dreams/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(toSaveDreamInput(entry)), expectedOwner: owner }));
    if (!validRequest(owner, token)) return;
    if (response.dream.user_id !== owner || response.dream.id !== id) throw new Error('The response belongs to another journal. Please reconnect.');
    const result = remoteDream(response.dream);
    if (!currentEntry(id, owner)) return;
    const audioKey = await uploadJournalAudio({ ...entry, audio_key: result.audio_key || entry.audio_key }, () => validRequest(owner, token) && currentEntry(id, owner)?.local_audio_uri === entry.local_audio_uri);
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
async function cleanupTombstone(tombstone: JournalDeletion) {
  const protectedFiles = new Set([...useJournalStore.getState().entries, ...useJournalStore.getState().deleted.filter(item => item.id !== tombstone.id || item.user_id !== tombstone.user_id)].map(item => item.local_audio_uri).filter((uri): uri is string => Boolean(uri)));
  await removeJournalAudio(tombstone, protectedFiles);
  useJournalStore.setState(state => ({ deleted: state.deleted.map(item => item.id === tombstone.id && item.user_id === tombstone.user_id ? { ...item, local_audio_uri: undefined, cleanupPending: false } : item) }));
  await persist();
}
export async function syncJournal() {
  if (flush) { syncRequested = true; return flush; }
  const owner = getCurrentUser()?.id;
  const token = generation;
  flush = (async () => {
    await hydrateJournal();
    // Device-only deletion never needs a session or a network connection.
    for (const tombstone of useJournalStore.getState().deleted.filter(item => item.user_id === 'device' && item.cleanupPending)) {
      if (generation !== token) return;
      try { await cleanupTombstone(tombstone); } catch { useJournalStore.setState({ error: 'The dream was removed. Audio cleanup on this device will retry when your journal syncs.' }); }
    }
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
            await cleanupTombstone(tombstone);
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
export async function refreshDreams() {
  const owner = getCurrentUser()?.id;
  if (!owner || ownerBlocked(owner)) return;
  const existing = refreshing.get(owner); if (existing) return existing;
  const token = generation;
  const job = (async () => {
    await syncJournal();
    if (!validRequest(owner, token)) return;
    let legacy = false;
    let cursor: string | undefined;
    let watermark: string | undefined;
    const since = useJournalStore.getState().cursors[owner] || '0';
    const seen = new Set<string>();
    do {
      const params = new URLSearchParams({ limit: '100', ...(legacy ? {} : { since }), ...(cursor ? { cursor } : {}), ...(watermark ? { until: watermark } : {}) });
      let raw: unknown;
      try { raw = await apiRequest(`${legacy ? '/v1/dreams' : '/v1/dreams/sync'}?${params}`, { expectedOwner: owner }); }
      catch (error) {
        if (!legacy && error && typeof error === 'object' && 'status' in error && error.status === 404) { legacy = true; cursor = undefined; watermark = undefined; raw = await apiRequest('/v1/dreams', { expectedOwner: owner }); }
        else throw error;
      }
      if (!validRequest(owner, token)) return;
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
        if (!blocked.has(`${owner}:${deletion.id}`)) deleted.push({ ...deletion, synced: true, local_audio_uri: local?.local_audio_uri, recovery_source: (local as RecoveredJournal | undefined)?.recovery_source, cleanupPending: true });
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
      if (watermark && page.sync_cursor && page.sync_cursor !== watermark) throw new Error('The journal snapshot changed during syncing. Please retry.');
      watermark = page.sync_cursor || watermark;
      cursor = page.next_cursor || undefined;
      if (cursor && seen.has(cursor)) throw new Error('Journal pagination did not advance. Please retry.');
      if (cursor) seen.add(cursor);
      useJournalStore.setState({ entries: [...merged.values()].sort((a, b) => b.dream_date.localeCompare(a.dream_date)), deleted, error: undefined });
      await persist();
      if (!cursor && !legacy && page.deleted && watermark && validRequest(owner, token)) {
        const previousCursors = useJournalStore.getState().cursors;
        useJournalStore.setState({ cursors: { ...previousCursors, [owner]: watermark } });
        try { await persist(); } catch (error) { useJournalStore.setState({ cursors: previousCursors }); throw error; }
      }
    } while (cursor);
  })().catch(error => { if (validRequest(owner, token)) useJournalStore.setState({ error: message(error) }); }).finally(() => { if (refreshing.get(owner) === job) refreshing.delete(owner); });
  refreshing.set(owner, job); return job;
}
export async function requestDreamProcessing(id: string): Promise<void> {
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
  const transfer = (owner: string) => !ownerBlocked(owner) && owner !== nextId && (owner === 'device' || transferPrevious && owner === previousId);
  const state = useJournalStore.getState();
  if (![...state.entries, ...state.deleted].some(item => transfer(item.user_id))) return;
  invalidateJournalRequests();
  useJournalStore.setState({ entries: state.entries.map(entry => transfer(entry.user_id) ? { ...entry, user_id: nextId, sync_status: 'local' } : entry), deleted: state.deleted.map(item => transfer(item.user_id) ? { ...item, user_id: nextId } : item), cursors: { ...state.cursors, [nextId]: '0' } });
  await persist();
}

/** Called only after explicit email verification of an expired guest's locally retained journal. */
export type JournalRecoveryResult = { missingAudio: number };
export async function recoverExpiredGuestJournal(previousId: string, nextId: string): Promise<JournalRecoveryResult> {
  await hydrateJournal();
  if (!previousId || previousId === nextId || nextId !== getCurrentUser()?.id || ownerBlocked(nextId) || ownerBlocked(previousId)) throw new Error('Your account changed. Reconnect before recovering your saved dreams.');
  const state = useJournalStore.getState();
  const token = generation;
  const recovered = new Map([...state.entries, ...state.deleted].filter(item => item.user_id === nextId).map(item => [(item as RecoveredJournal).recovery_source, item]));
  let missingAudio = 0;
  const clones: RecoveredJournal[] = [];
  for (const source of state.entries.filter(entry => entry.user_id === previousId)) {
    const marker = JSON.stringify([previousId, nextId, source.id]);
    if (recovered.has(marker)) {
      const existing = recovered.get(marker)!;
      if ('transcript' in existing && (source.audio_key || source.local_audio_uri || source.audio_url || source.audio_length) && !existing.local_audio_uri && !existing.audio_key) missingAudio++;
      continue;
    }
    const newId = Crypto.randomUUID();
    const audio = await recoverJournalAudio(source, newId);
    if (generation !== token || nextId !== getCurrentUser()?.id || ownerBlocked(nextId)) throw new Error('Your account changed. The original journal has been retained.');
    if (audio.missing) missingAudio++;
    if (!audio.uri && !(source.transcript.trim() || source.original_text?.trim() || source.summary?.trim())) continue;
    const { audio_key: _audioKey, audio_url: _audioUrl, sync_version: _syncVersion, local_audio_uri: _localAudio, ...content } = source;
    const clone: RecoveredJournal = normalizeDreamClock({ ...content, id: newId, user_id: nextId, updated_at: nextRevision(), sync_status: 'local', processing_status: source.processing_status === 'complete' ? 'complete' : 'idle', last_error: undefined, deleted_at: undefined, ...(audio.uri ? { local_audio_uri: audio.uri } : {}) });
    clone.recovery_source = marker;
    validateDreamInput(toSaveDreamInput(clone));
    clones.push(clone); recovered.set(marker, clone);
  }
  // Originals remain intact, including their cloud IDs, tombstones and recording references.
  if (clones.length) {
    invalidateJournalRequests();
    const current = useJournalStore.getState();
    const alreadyRecovered = new Set([...current.entries, ...current.deleted].map(item => (item as RecoveredJournal).recovery_source));
    useJournalStore.setState({ entries: [...clones.filter(entry => !alreadyRecovered.has(entry.recovery_source)), ...current.entries], cursors: { ...current.cursors, [nextId]: '0' }, error: undefined });
  }
  // A retry after partial storage failure reuses existing source markers and persists the same IDs.
  await persist();
  return { missingAudio };
}

/** Pause writes before deleting remotely; in-flight work finishes before the account is removed. */
export async function beginAccountDeletion(owner: string) {
  await hydrateJournal();
  suspendedOwners.add(owner);
  await Promise.allSettled([...(flush ? [flush] : []), ...processing.values()]);
  await waitForJournalWrites();
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
  const protectedFiles = new Set([...kept, ...keptTombstones].map(entry => entry.local_audio_uri).filter((uri): uri is string => Boolean(uri)));
  let cleanupFailed = false;
  for (const entry of [...removed, ...removedTombstones]) { try { await removeJournalAudio(entry, protectedFiles); } catch { cleanupFailed = true; } }
  if (cleanupFailed) throw new Error('Your account and journal were deleted. Some recording files on this device could not be removed; please check device storage.');
}
