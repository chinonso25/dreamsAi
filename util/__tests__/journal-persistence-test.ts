import { beforeEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Journal } from '@/types';
import type * as Persistence from '../journal-persistence';
const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockDisk.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockDisk.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockDisk.delete(key); }),
  getAllKeys: jest.fn(async () => [...mockDisk.keys()]),
  multiGet: jest.fn(async (keys: string[]) => keys.map(key => [key, mockDisk.get(key) ?? null])),
}));
const entry = (id = 'a'): Journal => ({ id, user_id: 'owner', transcript: 'Keep my words', dream_date: '2026-10-09', created_at: '2026-10-09T01:00:00.000Z', updated_at: '2026-10-09T01:00:00.000Z', sync_status: 'local', processing_status: 'idle' });
function fresh(): typeof Persistence { let module!: typeof Persistence; jest.isolateModules(() => { module = jest.requireActual('../journal-persistence'); }); return module; }
beforeEach(() => { mockDisk.clear(); jest.clearAllMocks(); jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { mockDisk.set(key, value); }); jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => { mockDisk.delete(key); }); });
it('migrates legacy data before publishing the v2 marker or removing the source', async () => {
  mockDisk.set('dreamer-journal-v1', JSON.stringify({ entries: [entry()], deleted: [], retiredOwners: [] }));
  const data = await fresh().readJournal();
  expect(data.entries[0].transcript).toBe('Keep my words');
  expect(mockDisk.has('dreamer-journal-v1')).toBe(false);
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(calls[calls.length - 1][0]).toBe('dreamer-journal-v2:meta');
  expect((await fresh().readJournal()).entries[0]).toMatchObject({ ...entry() });
});
it('retains the legacy source on partial migration failure and retries without losing records', async () => {
  const raw = JSON.stringify({ entries: [entry('a'), entry('b')], deleted: [] }); mockDisk.set('dreamer-journal-v1', raw);
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, value) => { mockDisk.set(key, value); }).mockRejectedValueOnce(new Error('Disk full'));
  await expect(fresh().readJournal()).rejects.toThrow('Disk full');
  expect(mockDisk.get('dreamer-journal-v1')).toBe(raw); expect(mockDisk.has('dreamer-journal-v2:meta')).toBe(false);
  const restored = await fresh().readJournal(); expect(restored.entries.map(row => row.id)).toEqual(['a', 'b']);
  expect((await fresh().readJournal()).entries).toHaveLength(2);
});
it('writes one changed entry rather than rewriting a thousand-record journal', async () => {
  const persistence = fresh(); const entries = Array.from({ length: 1000 }, (_, index) => entry(String(index)));
  await persistence.persistJournal({ entries, deleted: [], retiredOwners: [] }); jest.mocked(AsyncStorage.setItem).mockClear();
  await persistence.persistJournal({ entries: entries.map(row => row.id === '42' ? { ...row, transcript: 'Changed' } : row), deleted: [], retiredOwners: [] });
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1); expect(jest.mocked(AsyncStorage.setItem).mock.calls[0][0]).toBe('dreamer-journal-v2:entry:owner:42');
});
it('coalesces transient syncing status without a redundant durable write', async () => {
  const persistence = fresh(); const row = entry(); await persistence.persistJournal({ entries: [row], deleted: [], retiredOwners: [] }); jest.mocked(AsyncStorage.setItem).mockClear();
  await persistence.persistJournal({ entries: [{ ...row, sync_status: 'syncing' }], deleted: [], retiredOwners: [] }); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
it('an interrupted entry removal remains deleted on restart and retries cleanup', async () => {
  const persistence = fresh(); await persistence.persistJournal({ entries: [entry()], deleted: [], retiredOwners: [] });
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Removal interrupted'));
  const removed = { entries: [], deleted: [{ id: 'a', user_id: 'owner', synced: true, cleanupPending: true }], retiredOwners: [] };
  await expect(persistence.persistJournal(removed)).rejects.toThrow('Removal interrupted');
  const restarted = fresh(); const restored = await restarted.readJournal(); expect(restored.entries).toHaveLength(0); expect(restored.deleted[0]).toMatchObject({ id: 'a', cleanupPending: true });
  await restarted.persistJournal(restored); expect(mockDisk.has('dreamer-journal-v2:entry:owner:a')).toBe(false);
});
it('account retirement remains effective when native storage removal is interrupted', async () => {
  const persistence = fresh(); await persistence.persistJournal({ entries: [entry()], deleted: [], retiredOwners: [] });
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Removal interrupted'));
  await expect(persistence.persistJournal({ entries: [], deleted: [], retiredOwners: ['owner'] })).rejects.toThrow('Removal interrupted');
  const restored = await fresh().readJournal(); expect(restored.entries).toHaveLength(0); expect(restored.retiredOwners).toEqual(['owner']);
});
it('does not overwrite unreadable v2 data during hydration', async () => {
  mockDisk.set('dreamer-journal-v2:meta', JSON.stringify({ version: 2, retiredOwners: [], cursors: {} })); mockDisk.set('dreamer-journal-v2:entry:owner:a', '{broken');
  await expect(fresh().readJournal()).rejects.toThrow('data has been retained'); expect(AsyncStorage.setItem).not.toHaveBeenCalled(); expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});
