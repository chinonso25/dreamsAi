import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { onlineManager, QueryObserver } from '@tanstack/react-query';
import { apiRequest } from '../api';
import { getCurrentUser } from '../auth-client';
import { persistJournal } from '../journal-persistence';
import { deleteDream, hydrateJournal, invalidateJournalRequests, journalCloudQueryOptions, refreshDreams, saveDream, syncJournal, updateDream, useJournalStore } from '../journal';
import { accountQueryKey, journalQueryKey, queryClient, retryCloudRead } from '../query-client';
import type { Journal } from '@/types';

let mockOwner = 'owner-a';
jest.mock('../auth-client', () => ({ getCurrentUser: () => ({ id: mockOwner }) }));
jest.mock('../api', () => ({ apiRequest: jest.fn(), ApiError: class extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-dream' }));
jest.mock('../journal-persistence', () => ({
  readJournal: async () => ({ entries: [], deleted: [], retiredOwners: [], cursors: {} }),
  persistJournal: jest.fn(async () => {}), waitForJournalWrites: async () => {},
}));
jest.mock('../journal-audio', () => ({ uploadJournalAudio: async () => undefined, removeJournalAudio: jest.fn(), managedRecording: () => true, journalAudioUri: async () => undefined }));

const api = jest.mocked(apiRequest) as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const sample = (patch: Partial<Journal> = {}): Journal => ({
  id: 'dream-a', user_id: 'owner-a', transcript: 'Original words', dream_date: '2026-10-09',
  created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
  processing_status: 'idle', sync_status: 'synced', ...patch,
});
const page = (dreams: Journal[] = []) => ({ dreams, deleted: [], next_cursor: null, sync_cursor: '1' });
async function until(check: () => boolean) {
  for (let index = 0; index < 100; index++) { if (check()) return; await Promise.resolve(); }
  throw new Error('Expected query boundary was not reached');
}

beforeEach(async () => {
  queryClient.setQueryDefaults(['account'], { gcTime: Infinity });
  mockOwner = 'owner-a'; onlineManager.setOnline(true); queryClient.clear(); queryClient.mount();
  await hydrateJournal();
  invalidateJournalRequests(); jest.clearAllMocks();
  useJournalStore.setState({ entries: [], deleted: [], retiredOwners: [], cursors: {}, hydrated: true, syncing: false, error: undefined });
  api.mockResolvedValue(page());
  await syncJournal();
});
afterEach(() => { queryClient.clear(); queryClient.unmount(); onlineManager.setOnline(true); });

it('deduplicates cloud refreshes and stays fetching until remote reconciliation finishes', async () => {
  let resolve!: (data: unknown) => void;
  api.mockImplementation(() => new Promise(done => { resolve = done; }));
  const first = refreshDreams(); const second = refreshDreams();
  await until(() => api.mock.calls.length === 1);
  expect(queryClient.isFetching({ queryKey: journalQueryKey(mockOwner) })).toBe(1);
  expect(useJournalStore.getState().syncing).toBe(false);
  resolve(page([sample()])); await Promise.all([first, second]);
  expect(api).toHaveBeenCalledTimes(1);
  expect(useJournalStore.getState().entries[0].transcript).toBe('Original words');
  expect(queryClient.isFetching()).toBe(0);
});

it('reuses fresh reconciliation state and performs an explicit fresh read on pull-to-refresh', async () => {
  await queryClient.fetchQuery(journalCloudQueryOptions(mockOwner));
  await queryClient.fetchQuery(journalCloudQueryOptions(mockOwner));
  expect(api).toHaveBeenCalledTimes(1);
  await refreshDreams(); expect(api).toHaveBeenCalledTimes(2);
});

it('persists an offline save without cloud calls and uploads it when the paused query reconnects', async () => {
  onlineManager.setOnline(false);
  const entry = await saveDream({ transcript: 'Words saved offline' });
  expect(entry.sync_status).toBe('local'); expect(api).not.toHaveBeenCalled();
  expect(persistJournal).toHaveBeenCalled();
  api.mockImplementation(async (_path, options) => {
    const request = options as RequestInit;
    if (request.method === 'PUT') return { dream: { ...JSON.parse(request.body as string), user_id: mockOwner, processing_status: 'idle' } };
    return page();
  });
  const observer = new QueryObserver(queryClient, { ...journalCloudQueryOptions(mockOwner), retry: false });
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.refetch({ cancelRefetch: false });
  expect(observer.getCurrentResult().fetchStatus).toBe('paused'); expect(api).not.toHaveBeenCalled();
  onlineManager.setOnline(true); await pending;
  expect(api.mock.calls.filter(call => (call[1] as RequestInit)?.method === 'PUT')).toHaveLength(1);
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'Words saved offline', sync_status: 'synced' });
  unsubscribe(); observer.destroy();
});

it('keeps an offline edit when an older cloud read completes', async () => {
  useJournalStore.setState({ entries: [sample()] });
  let resolve!: (data: unknown) => void;
  api.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = refreshDreams(); await until(() => api.mock.calls.length === 1);
  onlineManager.setOnline(false);
  await updateDream('dream-a', { transcript: 'My offline correction' });
  resolve(page([sample()])); await pending;
  expect(useJournalStore.getState().entries[0]).toMatchObject({ transcript: 'My offline correction', sync_status: 'local' });
});

it('invalidates a warm cache for an offline delete and never resurrects it after reconnect', async () => {
  api.mockResolvedValue(page([sample()]));
  await queryClient.fetchQuery(journalCloudQueryOptions(mockOwner));
  onlineManager.setOnline(false); api.mockClear();
  await deleteDream('dream-a');
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(useJournalStore.getState().deleted[0].synced).not.toBe(true);
  expect(api).not.toHaveBeenCalled();
  expect(queryClient.getQueryState(journalQueryKey(mockOwner))?.isInvalidated).toBe(true);
  api.mockImplementation(async (_path, options) => (options as RequestInit).method === 'DELETE' ? { deleted: true } : page([sample()]));
  const observer = new QueryObserver(queryClient, { ...journalCloudQueryOptions(mockOwner), retry: false });
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.refetch({ cancelRefetch: false });
  expect(observer.getCurrentResult().fetchStatus).toBe('paused');
  onlineManager.setOnline(true); await pending;
  expect((api.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  expect(useJournalStore.getState().deleted[0].synced).toBe(true);
  expect(useJournalStore.getState().entries).toHaveLength(0);
  unsubscribe(); observer.destroy();
});

it('records a failed cloud read as a query error while keeping the saved journal available', async () => {
  useJournalStore.setState({ entries: [sample()] });
  api.mockRejectedValue(Object.assign(new Error('Sign in again'), { status: 401 }));
  await expect(queryClient.fetchQuery(journalCloudQueryOptions(mockOwner))).rejects.toThrow('Sign in again');
  expect(queryClient.getQueryState(journalQueryKey(mockOwner))?.status).toBe('error');
  expect(api).toHaveBeenCalledTimes(1); expect(useJournalStore.getState().entries).toHaveLength(1);
});

it('aborts an obsolete account read and discards its late response and cache', async () => {
  let resolve!: (data: unknown) => void;
  api.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = refreshDreams(); await until(() => api.mock.calls.length === 1);
  const signal = (api.mock.calls[0][1] as RequestInit).signal!;
  mockOwner = 'owner-b'; invalidateJournalRequests();
  expect(signal.aborted).toBe(true);
  resolve(page([sample()])); await pending; await Promise.resolve();
  expect(useJournalStore.getState().entries).toHaveLength(0);
  expect(queryClient.getQueriesData({ queryKey: accountQueryKey('owner-a') })).toHaveLength(0);
  expect(getCurrentUser()?.id).toBe('owner-b');
});

it('retries only transient failures and never retries account or data validation errors', () => {
  expect(retryCloudRead(0, Object.assign(new Error('Busy'), { status: 503 }))).toBe(true);
  expect(retryCloudRead(0, new TypeError('Failed to fetch'))).toBe(true);
  expect(retryCloudRead(2, new TypeError('Failed to fetch'))).toBe(false);
  expect(retryCloudRead(0, Object.assign(new Error('Sign in'), { status: 401 }))).toBe(false);
  expect(retryCloudRead(0, new Error('The response belongs to another journal.'))).toBe(false);
  onlineManager.setOnline(false);
  expect(retryCloudRead(0, new TypeError('Failed to fetch'))).toBe(false);
});
