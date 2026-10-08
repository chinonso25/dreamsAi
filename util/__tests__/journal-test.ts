import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { apiRequest } from '../api';
import { completeDraft, updateDraft, useCaptureDraft } from '../drafts';
import { beginAccountDeletion, clearDeletedAccountJournal, saveDream, updateDream, deleteDream, refreshDreams, hydrateJournal, requestDreamProcessing, retryDream, syncJournal, useJournalStore } from '../journal';
import type { Journal } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn<() => Promise<string | null>>(), setItem: jest.fn<() => Promise<void>>() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
const mockDeleteFile = jest.fn();
jest.mock('expo-file-system', () => ({ File: class { exists = true; size = 1000; type = 'audio/mp4'; uri: string; constructor(...parts: unknown[]) { this.uri = parts.join('/'); } delete() { mockDeleteFile(this.uri); } }, Paths: { cache: 'file:///cache/' } }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn<typeof fetch>() }));
jest.mock('../auth-client', () => ({ API_URL: 'https://thedreamer.app', authenticatedHeaders: async () => ({ Authorization: 'session' }), getCurrentUser: () => ({ id: 'guest-a' }) }));
jest.mock('../api', () => ({ apiRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>() }));
const api = jest.mocked(apiRequest) as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const sample = (changes: Partial<Journal> = {}): Journal => ({ id: 'dream-a', user_id: 'guest-a', transcript: 'Flying over the water', original_text: 'Flying over the water', dream_date: '2026-10-08', created_at: '2026-10-08T01:00:00.000Z', updated_at: '2026-10-08T01:00:00.000Z', sync_status: 'synced', processing_status: 'idle', ...changes });
function resolveSave(path: unknown, options: unknown) {
  if ((options as RequestInit)?.method === 'PUT') return Promise.resolve({ dream: { ...JSON.parse((options as RequestInit).body as string), processing_status: 'idle' } });
  return Promise.resolve({ dreams: [] });
}
async function until(check: () => boolean) { for (let index = 0; index < 40; index++) { if (check()) return; await Promise.resolve(); } throw new Error('Expected async boundary was not reached'); }
beforeEach(async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null); jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  await hydrateJournal(); await syncJournal();
  jest.clearAllMocks();
  useJournalStore.setState({ entries: [], deleted: [], hydrated: true, syncing: false, error: undefined });
  api.mockImplementation(resolveSave);
  jest.mocked(expoFetch).mockResolvedValue({ ok: true, json: async () => ({ audio_key: 'audio-a' }) } as Awaited<ReturnType<typeof expoFetch>>);
});
afterEach(async () => { await syncJournal(); });
it('saves locally and returns successfully when the backend is offline', async () => {
  api.mockRejectedValue(new TypeError('Failed to fetch'));
  const entry = await saveDream({ id: 'dream-a', transcript: 'Keep this dream', dream_date: '2026-10-07' });
  expect(entry.id).toBe('dream-a');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('dreamer-journal-v1', expect.stringContaining('Keep this dream'));
  await syncJournal();
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'Keep this dream', sync_status: 'error' });
  expect(useJournalStore.getState().entries[0].last_error).toContain('saved on this device');
});
it('a failed local save keeps its capture draft and never starts sync', async () => {
  await updateDraft({ text: 'My irreplaceable dream' });
  const id = useCaptureDraft.getState().draft!.id;
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Device storage is full'));
  await expect((async () => { await saveDream({ id, transcript: 'My irreplaceable dream' }); await completeDraft(id); })()).rejects.toThrow('storage is full');
  expect(useCaptureDraft.getState().draft).toMatchObject({ id, text: 'My irreplaceable dream' });
  expect(api).not.toHaveBeenCalled();
});
it('retains local audio after an interrupted upload and retries against the same entry', async () => {
  jest.mocked(expoFetch).mockRejectedValueOnce(new TypeError('Network request failed'));
  await saveDream({ id: 'dream-a', transcript: '', local_audio_uri: 'file:///documents/dream-a.m4a' });
  await syncJournal();
  expect(useJournalStore.getState().entries[0]).toMatchObject({ id: 'dream-a', sync_status: 'error', local_audio_uri: 'file:///documents/dream-a.m4a' });
  await retryDream('dream-a');
  expect(useJournalStore.getState().entries[0]).toMatchObject({ id: 'dream-a', sync_status: 'synced', audio_key: 'audio-a', local_audio_uri: 'file:///documents/dream-a.m4a' });
  expect(jest.mocked(expoFetch).mock.calls.every(call => String(call[0]).endsWith('/v1/dreams/dream-a/audio'))).toBe(true);
});
it('queues a newer edit during in-flight sync without overwriting it', async () => {
  let resolveFirst!: (result: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as ReturnType<typeof apiRequest>);
  await saveDream({ id: 'dream-a', transcript: 'Original entry' });
  await until(() => api.mock.calls.length === 1);
  const old = JSON.parse((api.mock.calls[0][1] as RequestInit).body as string);
  await updateDream('dream-a', { transcript: 'Corrected entry', title: 'Corrected title' });
  resolveFirst({ dream: { ...old, processing_status: 'idle' } });
  await syncJournal();
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'Corrected entry', title: 'Corrected title', original_text: 'Original entry', sync_status: 'synced' });
  expect(api.mock.calls.filter(call => (call[1] as RequestInit)?.method === 'PUT')).toHaveLength(2);
});
it('deduplicates simultaneous processing requests', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let resolveProcess!: (result: unknown) => void;
  api.mockImplementation(() => new Promise(resolve => { resolveProcess = resolve; }) as ReturnType<typeof apiRequest>);
  const first = requestDreamProcessing('dream-a'); const second = requestDreamProcessing('dream-a');
  await until(() => api.mock.calls.some(call => String(call[0]).endsWith('/process')));
  expect(api.mock.calls.filter(call => String(call[0]).endsWith('/process'))).toHaveLength(1);
  resolveProcess({ dream: sample({ summary: 'A flight over water', processing_status: 'complete' }) });
  await Promise.all([first, second]);
  expect(useJournalStore.getState().entries[0].processing_status).toBe('complete');
});
it('late AI results never overwrite a newer manual edit', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let resolveProcess!: (result: unknown) => void;
  api.mockImplementation((path, options) => String(path).endsWith('/process') ? new Promise(resolve => { resolveProcess = resolve; }) as ReturnType<typeof apiRequest> : resolveSave(path, options) as ReturnType<typeof apiRequest>);
  const pending = requestDreamProcessing('dream-a');
  await until(() => api.mock.calls.some(call => String(call[0]).endsWith('/process')));
  await updateDream('dream-a', { transcript: 'My corrected account', title: 'My own title' });
  await syncJournal();
  resolveProcess({ dream: sample({ title: 'Old AI title', transcript: 'Old text', summary: 'Old result', processing_status: 'complete' }) });
  await pending;
  expect(useJournalStore.getState().entries[0]).toMatchObject({ title: 'My own title', transcript: 'My corrected account', processing_status: 'idle' });
});
it('maps the backend processing error into a clear restartable local failure', async () => {
  useJournalStore.setState({ entries: [sample()] });
  api.mockResolvedValue({ dream: { ...sample(), processing_status: 'error', error: 'No speech could be understood. Keep the recording and retry.' } });
  await expect(requestDreamProcessing('dream-a')).rejects.toThrow('No speech could be understood');
  expect(useJournalStore.getState().entries[0]).toMatchObject({ processing_status: 'error', last_error: 'No speech could be understood. Keep the recording and retry.' });
});
it('acknowledged deletion tombstones block stale GET responses from resurrecting entries', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let resolveGet!: (result: unknown) => void;
  api.mockImplementation((path, options) => (options as RequestInit)?.method === 'DELETE' ? Promise.resolve({ deleted: true }) as ReturnType<typeof apiRequest> : new Promise(resolve => { resolveGet = resolve; }) as ReturnType<typeof apiRequest>);
  const refreshing = refreshDreams();
  await until(() => api.mock.calls.some(call => call[0] === '/v1/dreams'));
  await deleteDream('dream-a'); await syncJournal();
  resolveGet({ dreams: [sample()] }); await refreshing;
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(useJournalStore.getState().deleted[0]).toMatchObject({ id: 'dream-a', synced: true });
});
it('restores interrupted sync and processing with a restart action and preserved audio', async () => {
  let isolated!: typeof import('../journal');
  jest.isolateModules(() => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage') as typeof AsyncStorage;
    jest.mocked(storage.getItem).mockResolvedValue(JSON.stringify({ entries: [sample({ sync_status: 'syncing', processing_status: 'processing', local_audio_uri: 'file:///documents/kept.m4a' })], deleted: [] }));
    isolated = jest.requireActual('../journal') as typeof import('../journal');
  });
  await isolated.hydrateJournal();
  expect(isolated.useJournalStore.getState().entries[0]).toMatchObject({ sync_status: 'local', processing_status: 'error', local_audio_uri: 'file:///documents/kept.m4a' });
  expect(isolated.useJournalStore.getState().entries[0].last_error).toContain('tap Restart');
});
it('retains unreadable saved data and allows hydration to retry', async () => {
  let isolated!: typeof import('../journal');
  let storage!: typeof AsyncStorage;
  jest.isolateModules(() => {
    storage = jest.requireMock('@react-native-async-storage/async-storage') as typeof AsyncStorage;
    jest.mocked(storage.getItem).mockResolvedValue('{broken saved journal');
    isolated = jest.requireActual('../journal') as typeof import('../journal');
  });
  await expect(isolated.hydrateJournal()).rejects.toThrow('data has been retained');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(isolated.useJournalStore.getState().hydrated).toBe(false);
  jest.mocked(storage.getItem).mockResolvedValue(JSON.stringify({ entries: [sample()], deleted: [] }));
  await isolated.hydrateJournal();
  expect(isolated.useJournalStore.getState().entries[0].transcript).toBe('Flying over the water');
});

it('deleting offline cleans audio only after persisting a durable tombstone', async () => {
  useJournalStore.setState({ entries: [sample({ local_audio_uri: 'file:///documents/dream-a.m4a' })] });
  api.mockRejectedValue(new TypeError('Failed to fetch'));
  await deleteDream('dream-a'); await syncJournal();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('dreamer-journal-v1', expect.stringContaining('cleanupPending'));
  expect(mockDeleteFile).toHaveBeenCalledWith('file:///documents/dream-a.m4a');
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(useJournalStore.getState().deleted[0]).toMatchObject({ id: 'dream-a', cleanupPending: false });
  expect(useJournalStore.getState().deleted[0].synced).not.toBe(true);
});

it('preserves the premium-required API error so the purchase handoff can resume the job', async () => {
  const premiumError = Object.assign(new Error('Premium is required'), { status: 402 });
  useJournalStore.setState({ entries: [sample()] });
  api.mockRejectedValueOnce(premiumError);
  await expect(requestDreamProcessing('dream-a')).rejects.toBe(premiumError);
  expect(useJournalStore.getState().entries[0]).toMatchObject({ processing_status: 'error', last_error: 'Premium is required' });
});
it('account cleanup preserves every other owner, tombstone and referenced recording', async () => {
  useJournalStore.setState({ entries: [sample({ id: 'deleted-dream', user_id: 'deleted-owner', local_audio_uri: 'file:///documents/deleted.m4a' }), sample({ id: 'kept-dream', user_id: 'other-owner', local_audio_uri: 'file:///documents/kept.m4a' })], deleted: [{ id: 'deleted-old', user_id: 'deleted-owner', local_audio_uri: 'file:///documents/shared.m4a' }, { id: 'kept-old', user_id: 'other-owner', local_audio_uri: 'file:///documents/shared.m4a', synced: false }] });
  await beginAccountDeletion('deleted-owner');
  await clearDeletedAccountJournal('deleted-owner');
  expect(useJournalStore.getState().entries.map(entry => entry.id)).toEqual(['kept-dream']);
  expect(useJournalStore.getState().deleted).toEqual([{ id: 'kept-old', user_id: 'other-owner', local_audio_uri: 'file:///documents/shared.m4a', synced: false }]);
  expect(useJournalStore.getState().retiredOwners).toContain('deleted-owner');
  expect(mockDeleteFile).toHaveBeenCalledWith('file:///documents/deleted.m4a');
  expect(mockDeleteFile).not.toHaveBeenCalledWith('file:///documents/kept.m4a');
  expect(mockDeleteFile).not.toHaveBeenCalledWith('file:///documents/shared.m4a');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('dreamer-journal-v1', expect.stringContaining('retiredOwners'));
});
it('a delayed refresh cannot resurrect a server-deleted account’s journal', async () => {
  useJournalStore.setState({ entries: [sample({ id: 'retired-dream', user_id: 'retired-owner' })] });
  let resolveGet!: (result: unknown) => void;
  api.mockImplementation(() => new Promise(resolve => { resolveGet = resolve; }) as ReturnType<typeof apiRequest>);
  const refreshing = refreshDreams();
  await until(() => api.mock.calls.some(call => call[0] === '/v1/dreams'));
  await beginAccountDeletion('retired-owner');
  await clearDeletedAccountJournal('retired-owner');
  resolveGet({ dreams: [sample({ id: 'retired-dream', user_id: 'retired-owner' })] });
  await refreshing;
  expect(useJournalStore.getState().entries).toHaveLength(0);
});
