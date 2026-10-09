import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import { apiRequest } from '../api';
import { completeDraft, updateDraft, useCaptureDraft } from '../drafts';
import { beginAccountDeletion, clearDeletedAccountJournal, saveDream, updateDream, deleteDream, refreshDreams, hydrateJournal, requestDreamProcessing, retryDream, syncJournal, useJournalStore, invalidateJournalRequests, rebindJournalOwner, recoverExpiredGuestJournal } from '../journal';
import type { Journal } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn<() => Promise<string | null>>(), setItem: jest.fn<() => Promise<void>>(), removeItem: jest.fn<() => Promise<void>>(), getAllKeys: jest.fn<() => Promise<string[]>>(), multiGet: jest.fn<() => Promise<[string, string | null][]>>() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id', CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm: string, value: string) => jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256').update(value).digest('hex') }));
let mockJournalOwner: string | undefined = 'guest-a';
const mockDeleteFile = jest.fn();
jest.mock('expo-file-system', () => ({ File: class { exists = true; size = 1000; type = 'audio/mp4'; uri: string; constructor(...parts: unknown[]) { this.uri = parts.join('/'); } delete() { mockDeleteFile(this.uri); } }, Paths: { cache: 'file:///cache/' } }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn<typeof fetch>() }));
jest.mock('../auth-client', () => ({ API_URL: 'https://thedreamer.app', authenticatedHeaders: async () => ({ Authorization: 'session' }), getCurrentUser: () => mockJournalOwner ? { id: mockJournalOwner } : null }));
jest.mock('../api', () => ({ apiRequest: jest.fn<(...args: unknown[]) => Promise<unknown>>(), ApiError: class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } } }));
const api = jest.mocked(apiRequest) as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const sample = (changes: Partial<Journal> = {}): Journal => ({ id: 'dream-a', user_id: 'guest-a', transcript: 'Flying over the water', original_text: 'Flying over the water', dream_date: '2026-10-08', created_at: '2026-10-08T01:00:00.000Z', updated_at: '2026-10-08T01:00:00.000Z', sync_status: 'synced', processing_status: 'idle', ...changes });
function resolveSave(path: unknown, options: unknown) {
  if ((options as RequestInit)?.method === 'PUT') return Promise.resolve({ dream: { ...JSON.parse((options as RequestInit).body as string), user_id: mockJournalOwner, processing_status: 'idle' } });
  return Promise.resolve({ dreams: [] });
}
async function until(check: () => boolean) { for (let index = 0; index < 40; index++) { if (check()) return; await Promise.resolve(); } throw new Error('Expected async boundary was not reached'); }
beforeEach(async () => {
  mockJournalOwner = 'guest-a';
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null); jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined); jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined); jest.mocked(AsyncStorage.getAllKeys).mockResolvedValue([]); jest.mocked(AsyncStorage.multiGet).mockResolvedValue([]);
  await hydrateJournal(); await syncJournal();
  jest.clearAllMocks();
  useJournalStore.setState({ entries: [], deleted: [], hydrated: true, syncing: false, error: undefined, cursors: {}, retiredOwners: [] });
  api.mockImplementation(resolveSave);
  jest.mocked(expoFetch).mockResolvedValue({ ok: true, json: async () => ({ audio_key: 'audio-a' }) } as Awaited<ReturnType<typeof expoFetch>>);
});
afterEach(async () => { await syncJournal(); });
it('saves locally and returns successfully when the backend is offline', async () => {
  api.mockRejectedValue(new TypeError('Failed to fetch'));
  const entry = await saveDream({ id: 'dream-a', transcript: 'Keep this dream', dream_date: '2026-10-07' });
  expect(entry.id).toBe('dream-a');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.stringContaining('dreamer-journal-v2:entry:'), expect.stringContaining('Keep this dream'));
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
  await saveDream({ id: 'dream-a', transcript: '', local_audio_uri: 'file:///documents/dreamer-recordings/dream-a.m4a' });
  await syncJournal();
  expect(useJournalStore.getState().entries[0]).toMatchObject({ id: 'dream-a', sync_status: 'error', local_audio_uri: 'file:///documents/dreamer-recordings/dream-a.m4a' });
  await retryDream('dream-a');
  expect(useJournalStore.getState().entries[0]).toMatchObject({ id: 'dream-a', sync_status: 'synced', audio_key: 'audio-a', local_audio_uri: 'file:///documents/dreamer-recordings/dream-a.m4a' });
  expect(jest.mocked(expoFetch).mock.calls.every(call => String(call[0]).endsWith('/v1/dreams/dream-a/audio'))).toBe(true);
});
it('queues a newer edit during in-flight sync without overwriting it', async () => {
  let resolveFirst!: (result: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }) as ReturnType<typeof apiRequest>);
  await saveDream({ id: 'dream-a', transcript: 'Original entry' });
  await until(() => api.mock.calls.length === 1);
  const old = JSON.parse((api.mock.calls[0][1] as RequestInit).body as string);
  await updateDream('dream-a', { transcript: 'Corrected entry', title: 'Corrected title' });
  resolveFirst({ dream: { ...old, user_id: mockJournalOwner, processing_status: 'idle' } });
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
  await until(() => api.mock.calls.some(call => String(call[0]).startsWith('/v1/dreams/sync?')));
  await deleteDream('dream-a'); await syncJournal();
  resolveGet({ dreams: [sample()] }); await refreshing;
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(useJournalStore.getState().deleted[0]).toMatchObject({ id: 'dream-a', synced: true });
});
it('restores interrupted sync and processing with a restart action and preserved audio', async () => {
  let isolated!: typeof import('../journal');
  jest.isolateModules(() => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage') as typeof AsyncStorage;
    jest.mocked(storage.getItem).mockImplementation(async key => key === 'dreamer-journal-v1' ? JSON.stringify({ entries: [sample({ sync_status: 'syncing', processing_status: 'processing', local_audio_uri: 'file:///documents/dreamer-recordings/kept.m4a' })], deleted: [] }) : null);
    isolated = jest.requireActual('../journal') as typeof import('../journal');
  });
  await isolated.hydrateJournal();
  expect(isolated.useJournalStore.getState().entries[0]).toMatchObject({ sync_status: 'local', processing_status: 'error', local_audio_uri: 'file:///documents/dreamer-recordings/kept.m4a' });
  expect(isolated.useJournalStore.getState().entries[0].last_error).toContain('tap Restart');
});
it('retains unreadable saved data and allows hydration to retry', async () => {
  let isolated!: typeof import('../journal');
  let storage!: typeof AsyncStorage;
  jest.isolateModules(() => {
    storage = jest.requireMock('@react-native-async-storage/async-storage') as typeof AsyncStorage;
    jest.mocked(storage.getItem).mockImplementation(async key => key === 'dreamer-journal-v1' ? '{broken saved journal' : null);
    isolated = jest.requireActual('../journal') as typeof import('../journal');
  });
  await expect(isolated.hydrateJournal()).rejects.toThrow('data has been retained');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(isolated.useJournalStore.getState().hydrated).toBe(false);
  jest.mocked(storage.getItem).mockImplementation(async key => key === 'dreamer-journal-v1' ? JSON.stringify({ entries: [sample()], deleted: [] }) : null);
  await isolated.hydrateJournal();
  expect(isolated.useJournalStore.getState().entries[0].transcript).toBe('Flying over the water');
});

it('deleting offline cleans audio only after persisting a durable tombstone', async () => {
  useJournalStore.setState({ entries: [sample({ local_audio_uri: 'file:///documents/dreamer-recordings/dream-a.m4a' })] });
  api.mockRejectedValue(new TypeError('Failed to fetch'));
  await deleteDream('dream-a'); await syncJournal();
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.stringContaining('dreamer-journal-v2:deleted:'), expect.stringContaining('cleanupPending'));
  expect(mockDeleteFile).toHaveBeenCalledWith('file:///documents/dreamer-recordings/dream-a.m4a');
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
  useJournalStore.setState({ entries: [sample({ id: 'deleted-dream', user_id: 'deleted-owner', local_audio_uri: 'file:///documents/dreamer-recordings/deleted.m4a' }), sample({ id: 'kept-dream', user_id: 'other-owner', local_audio_uri: 'file:///documents/dreamer-recordings/kept.m4a' })], deleted: [{ id: 'deleted-old', user_id: 'deleted-owner', local_audio_uri: 'file:///documents/dreamer-recordings/shared.m4a' }, { id: 'kept-old', user_id: 'other-owner', local_audio_uri: 'file:///documents/dreamer-recordings/shared.m4a', synced: false }] });
  await beginAccountDeletion('deleted-owner');
  await clearDeletedAccountJournal('deleted-owner');
  expect(useJournalStore.getState().entries.map(entry => entry.id)).toEqual(['kept-dream']);
  expect(useJournalStore.getState().deleted).toEqual([{ id: 'kept-old', user_id: 'other-owner', local_audio_uri: 'file:///documents/dreamer-recordings/shared.m4a', synced: false }]);
  expect(useJournalStore.getState().retiredOwners).toContain('deleted-owner');
  expect(mockDeleteFile).toHaveBeenCalledWith('file:///documents/dreamer-recordings/deleted.m4a');
  expect(mockDeleteFile).not.toHaveBeenCalledWith('file:///documents/dreamer-recordings/kept.m4a');
  expect(mockDeleteFile).not.toHaveBeenCalledWith('file:///documents/dreamer-recordings/shared.m4a');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('dreamer-journal-v2:meta', expect.stringContaining('retiredOwners'));
});
it('a delayed refresh cannot resurrect a server-deleted account’s journal', async () => {
  useJournalStore.setState({ entries: [sample({ id: 'retired-dream', user_id: 'retired-owner' })] });
  let resolveGet!: (result: unknown) => void;
  api.mockImplementation(() => new Promise(resolve => { resolveGet = resolve; }) as ReturnType<typeof apiRequest>);
  const refreshing = refreshDreams();
  await until(() => api.mock.calls.some(call => String(call[0]).startsWith('/v1/dreams/sync?')));
  await beginAccountDeletion('retired-owner');
  await clearDeletedAccountJournal('retired-owner');
  resolveGet({ dreams: [sample({ id: 'retired-dream', user_id: 'retired-owner' })] });
  await refreshing;
  expect(useJournalStore.getState().entries).toHaveLength(0);
});

it('reloads queued entries before uploading so editing B while A syncs cannot erase B', async () => {
  useJournalStore.setState({ entries: [sample({ id: 'dream-a', sync_status: 'local' }), sample({ id: 'dream-b', transcript: 'Old B', sync_status: 'local' })] });
  let finishA!: (result: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }));
  const pending = syncJournal();
  await until(() => api.mock.calls.length === 1);
  await updateDream('dream-b', { transcript: 'New B' });
  finishA({ dream: sample() }); await pending;
  expect(useJournalStore.getState().entries.find(entry => entry.id === 'dream-b')).toMatchObject({ transcript: 'New B', sync_status: 'synced' });
  const putB = api.mock.calls.find(call => call[0] === '/v1/dreams/dream-b');
  expect(JSON.parse((putB![1] as RequestInit).body as string).transcript).toBe('New B');
});
it('rejects a stale refresh after the newer manual edit has already synced', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let finishGet!: (result: unknown) => void;
  api.mockImplementation((path, options) => String(path).startsWith('/v1/dreams/sync?') ? new Promise(resolve => { finishGet = resolve; }) : resolveSave(path, options));
  const refreshing = refreshDreams(); await until(() => Boolean(finishGet));
  await updateDream('dream-a', { transcript: 'New synced text' }); await syncJournal();
  finishGet({ dreams: [sample()], deleted: [], next_cursor: null, sync_cursor: '1' }); await refreshing;
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'New synced text', sync_status: 'synced' });
});
it('rejects delayed requests after an account change, including returning to the same account', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let finishGet!: (result: unknown) => void;
  api.mockImplementation(() => new Promise(resolve => { finishGet = resolve; }));
  const refreshing = refreshDreams(); await until(() => Boolean(finishGet));
  mockJournalOwner = 'guest-b'; invalidateJournalRequests();
  mockJournalOwner = 'guest-a'; invalidateJournalRequests();
  finishGet({ dreams: [sample({ transcript: 'Stale session result' })], deleted: [], next_cursor: null, sync_cursor: '2' }); await refreshing;
  expect(useJournalStore.getState().entries[0].transcript).toBe('Flying over the water');
  expect(useJournalStore.getState().cursors['guest-a']).toBeUndefined();
});
it('consumes deletion pages and advances the checkpoint only after the final page', async () => {
  useJournalStore.setState({ entries: [sample()], cursors: { 'guest-a': '2' } });
  let finishPage!: (result: unknown) => void;
  api.mockResolvedValueOnce({ dreams: [], deleted: [{ id: 'dream-a', user_id: 'guest-a', deleted_at: '2026-10-09T01:00:00.000Z', sync_version: 3 }], next_cursor: '3', sync_cursor: '5' });
  api.mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }));
  const refreshing = refreshDreams(); await until(() => Boolean(finishPage));
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(useJournalStore.getState().cursors['guest-a']).toBe('2');
  expect(String(api.mock.calls[1][0])).toContain('cursor=3'); expect(String(api.mock.calls[1][0])).toContain('until=5');
  finishPage({ dreams: [sample({ id: 'dream-b', sync_version: 5 })], deleted: [], next_cursor: null, sync_cursor: '5' }); await refreshing;
  expect(useJournalStore.getState().entries.map(entry => entry.id)).toEqual(['dream-b']);
  expect(useJournalStore.getState().cursors['guest-a']).toBe('5');
});
it('falls back to an old backend without treating an incomplete list as deletion', async () => {
  useJournalStore.setState({ entries: [sample()] });
  api.mockRejectedValueOnce(Object.assign(new Error('Missing sync endpoint'), { status: 404 }));
  api.mockResolvedValueOnce({ dreams: [] });
  await refreshDreams();
  expect(api.mock.calls[1][0]).toBe('/v1/dreams');
  expect(useJournalStore.getState().entries).toHaveLength(1);
  expect(useJournalStore.getState().cursors['guest-a']).toBeUndefined();
});
it('cannot mutate another account’s entry or accept another owner’s response', async () => {
  useJournalStore.setState({ entries: [sample({ user_id: 'other-owner' })] });
  await expect(updateDream('dream-a', { transcript: 'Overwrite' })).rejects.toThrow('current journal');
  await expect(deleteDream('dream-a')).rejects.toThrow('current journal');
  api.mockResolvedValue({ dreams: [sample({ user_id: 'other-owner', transcript: 'Cloud overwrite' })], deleted: [], next_cursor: null, sync_cursor: '4' });
  await refreshDreams();
  expect(useJournalStore.getState().entries[0].transcript).toBe('Flying over the water');
  expect(useJournalStore.getState().error).toContain('another journal');
});
it('only moves device entries on ordinary session reconnect', async () => {
  useJournalStore.setState({ entries: [sample({ id: 'previous', user_id: 'old-owner' }), sample({ id: 'device', user_id: 'device' })] });
  await rebindJournalOwner('old-owner', 'guest-a');
  expect(useJournalStore.getState().entries.find(entry => entry.id === 'previous')?.user_id).toBe('old-owner');
  expect(useJournalStore.getState().entries.find(entry => entry.id === 'device')?.user_id).toBe('guest-a');
  await rebindJournalOwner('old-owner', 'guest-a', true);
  expect(useJournalStore.getState().entries.find(entry => entry.id === 'previous')?.user_id).toBe('guest-a');
});
it('sends only writable API fields instead of local URIs and sync state', async () => {
  await saveDream({ id: 'dream-a', transcript: 'My dream', local_audio_uri: 'file:///documents/dreamer-recordings/dream-a.m4a' }); await syncJournal();
  const put = api.mock.calls.find(call => (call[1] as RequestInit)?.method === 'PUT')!;
  const input = JSON.parse((put[1] as RequestInit).body as string);
  expect(input.local_audio_uri).toBeUndefined(); expect(input.user_id).toBeUndefined(); expect(input.sync_status).toBeUndefined(); expect(input.processing_status).toBeUndefined();
});

it('cleans device-only recordings after durable deletion without creating a cloud session', async () => {
  mockJournalOwner = undefined;
  useJournalStore.setState({ entries: [sample({ user_id: 'device', local_audio_uri: 'file:///documents/dreamer-recordings/local-only.m4a' })] });
  await deleteDream('dream-a'); await syncJournal();
  expect(mockDeleteFile).toHaveBeenCalledWith('file:///documents/dreamer-recordings/local-only.m4a');
  expect(useJournalStore.getState().deleted[0]).toMatchObject({ user_id: 'device', cleanupPending: false });
  expect(api).not.toHaveBeenCalled();
});
it('rejects overlarge UTF8 payloads before saving and preserves the current entry on invalid edit', async () => {
  const text = '\u0001'.repeat(50_000);
  await expect(saveDream({ transcript: text, original_text: text, summary: '你'.repeat(10_000), reflection: '你'.repeat(10_000), tags: Array(20).fill('你'.repeat(80)), keywords: Array(20).fill('你'.repeat(80)) })).rejects.toThrow('too large');
  expect(useJournalStore.getState().entries).toHaveLength(0); expect(api).not.toHaveBeenCalled();
  useJournalStore.setState({ entries: [sample()] }); await expect(updateDream('dream-a', { transcript: 'x'.repeat(50_001) })).rejects.toThrow('50,000');
  expect(useJournalStore.getState().entries[0].transcript).toBe('Flying over the water');
});
it('never advances a changes checkpoint when persisting its records fails', async () => {
  api.mockResolvedValue({ dreams: [sample({ id: 'cloud-a' })], deleted: [], next_cursor: null, sync_cursor: '8' });
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage interrupted'));
  await refreshDreams(); expect(useJournalStore.getState().cursors['guest-a']).toBeUndefined();
  expect(useJournalStore.getState().error).toBe('Storage interrupted');
  await refreshDreams(); expect(useJournalStore.getState().cursors['guest-a']).toBe('8'); expect(useJournalStore.getState().entries[0].id).toBe('cloud-a');
});
it('recovers unsynced future capture timestamps after the device clock is corrected', async () => {
  useJournalStore.setState({ entries: [sample({ created_at: '2036-01-01T00:00:00.000Z', updated_at: '2036-01-01T00:00:00.000Z', sync_status: 'local' })] });
  const started = Date.now(); await syncJournal();
  const uploaded = JSON.parse((api.mock.calls[0][1] as RequestInit).body as string);
  expect(Date.parse(uploaded.created_at)).toBeGreaterThanOrEqual(started); expect(Date.parse(uploaded.created_at)).toBeLessThanOrEqual(Date.now());
  expect(Date.parse(uploaded.updated_at)).toBeLessThanOrEqual(Date.now());
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'Flying over the water', sync_status: 'synced', dream_date: '2026-10-08' });
});
it('recovers expired guest content using fresh identities without mutating the guest journal', async () => {
  const original = sample({ id: 'guest-cloud-id', user_id: 'expired-guest', audio_key: 'expired-guest/private-object', audio_url: 'https://old.example/private', sync_version: 7, local_audio_uri: 'file:///documents/dreamer-recordings/guest.m4a', summary: 'Original summary', processing_status: 'error', last_error: 'Expired' });
  const oldTombstone = { id: 'deleted-guest-dream', user_id: 'expired-guest', synced: true };
  useJournalStore.setState({ entries: [original], deleted: [oldTombstone] });
  await recoverExpiredGuestJournal('expired-guest', 'guest-a');
  const clone = useJournalStore.getState().entries.find(entry => entry.user_id === 'guest-a')!;
  expect(clone.id).toBe('new-id'); expect(clone.id).not.toBe(original.id);
  expect(clone).toMatchObject({ transcript: original.transcript, summary: 'Original summary', dream_date: original.dream_date, local_audio_uri: original.local_audio_uri, sync_status: 'local', processing_status: 'idle' });
  expect(clone.audio_key).toBeUndefined(); expect(clone.audio_url).toBeUndefined(); expect(clone.sync_version).toBeUndefined(); expect(clone.last_error).toBeUndefined();
  expect(useJournalStore.getState().entries.find(entry => entry.user_id === 'expired-guest')).toBe(original); expect(useJournalStore.getState().deleted).toEqual([oldTombstone]);
  expect(api).not.toHaveBeenCalled(); expect(mockDeleteFile).not.toHaveBeenCalled();
  await recoverExpiredGuestJournal('expired-guest', 'guest-a'); expect(useJournalStore.getState().entries.filter(entry => entry.user_id === 'guest-a')).toHaveLength(1);
});
it('recovery refuses a destination that is not the currently verified owner', async () => {
  const original = sample({ user_id: 'expired-guest' }); useJournalStore.setState({ entries: [original] });
  await expect(recoverExpiredGuestJournal('expired-guest', 'someone-else')).rejects.toThrow('account changed'); expect(useJournalStore.getState().entries).toEqual([original]); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
it('a failed recovery preserves originals and retries the same clone instead of duplicating it', async () => {
  const original = sample({ user_id: 'expired-guest', local_audio_uri: 'file:///documents/private.m4a', audio_key: 'old-object' }); useJournalStore.setState({ entries: [original] });
  const audio = jest.spyOn(jest.requireActual<typeof import('../journal-audio')>('../journal-audio'), 'recoverJournalAudio').mockResolvedValue({ missing: true });
  try {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Recovery storage interrupted'));
    await expect(recoverExpiredGuestJournal('expired-guest', 'guest-a')).rejects.toThrow('Recovery storage interrupted');
    expect(useJournalStore.getState().entries.find(entry => entry.user_id === 'expired-guest')).toBe(original);
    expect(await recoverExpiredGuestJournal('expired-guest', 'guest-a')).toEqual({ missingAudio: 1 });
    const clones = useJournalStore.getState().entries.filter(entry => entry.user_id === 'guest-a'); expect(clones).toHaveLength(1); expect(clones[0].local_audio_uri).toBeUndefined(); expect(clones[0].audio_key).toBeUndefined(); expect(mockDeleteFile).not.toHaveBeenCalled();
  } finally { audio.mockRestore(); }
});
it('deleting a recovered dream preserves shared original audio and prevents repeated recovery', async () => {
  const original = sample({ user_id: 'expired-guest', local_audio_uri: 'file:///documents/dreamer-recordings/shared-guest.m4a' }); useJournalStore.setState({ entries: [original] });
  await recoverExpiredGuestJournal('expired-guest', 'guest-a'); const clone = useJournalStore.getState().entries.find(entry => entry.user_id === 'guest-a')!;
  await deleteDream(clone.id); await syncJournal(); expect(mockDeleteFile).not.toHaveBeenCalledWith(original.local_audio_uri);
  await recoverExpiredGuestJournal('expired-guest', 'guest-a'); expect(useJournalStore.getState().entries.filter(entry => entry.user_id === 'guest-a')).toHaveLength(0); expect(useJournalStore.getState().entries[0]).toBe(original);
});

it('counts missing old recordings and preserves voice-only sources without creating blank recovered entries', async () => {
  const voice = sample({ id: 'voice-only', user_id: 'expired-guest', transcript: '', original_text: '', summary: undefined, audio_key: 'expired-guest/voice' });
  const written = sample({ id: 'written-recording', user_id: 'expired-guest', audio_key: 'expired-guest/recording' });
  useJournalStore.setState({ entries: [voice, written] });
  // The basic File fixture has an existing cache; make its zero size represent an unavailable recording.
  const audio = jest.spyOn(jest.requireActual<typeof import('../journal-audio')>('../journal-audio'), 'recoverJournalAudio').mockResolvedValue({ missing: true });
  try {
    expect(await recoverExpiredGuestJournal('expired-guest', 'guest-a')).toEqual({ missingAudio: 2 });
    const clones = useJournalStore.getState().entries.filter(entry => entry.user_id === 'guest-a'); expect(clones).toHaveLength(1); expect(clones[0].transcript).toBe(written.transcript); expect(clones[0].audio_key).toBeUndefined();
    expect(useJournalStore.getState().entries.find(entry => entry.id === 'voice-only')).toBe(voice); expect(useJournalStore.getState().entries.find(entry => entry.id === 'written-recording')).toBe(written);
  } finally { audio.mockRestore(); }
});
