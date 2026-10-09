import { beforeEach, expect, it, jest } from '@jest/globals';
import { File } from 'expo-file-system';
import { journalAudioUri, removeJournalAudio, cancelJournalAudio, uploadJournalAudio } from '../journal-audio';
import type { Journal } from '@/types';
const mockFiles = new Map<string, number>();
const mockDownload = jest.fn<(...args: any[]) => Promise<File>>();
const mockHeaders = jest.fn<(...args: any[]) => Promise<Record<string, string>>>();
jest.mock('../auth-client', () => ({ API_URL: 'https://test.invalid', authenticatedHeaders: (...args: any[]) => mockHeaders(...args) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'temporary-id', CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm: string, value: string) => jest.requireActual<typeof import('node:crypto')>('node:crypto').createHash('sha256').update(value).digest('hex') }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = parts.map(String).join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri) || 0; }
    get name() { return this.uri.split('/').at(-1)!; }
    delete() { mockFiles.delete(this.uri); }
    async move(destination: MockFile) { const size = this.size; this.delete(); mockFiles.set(destination.uri, size); this.uri = destination.uri; }
    static downloadFileAsync(...args: any[]) { return mockDownload(...args); }
  }
  const cache = { toString: () => 'file:///cache', list: () => [...mockFiles.keys()].filter(uri => uri.startsWith('file:///cache/')).map(uri => new MockFile(uri)) };
  return { File: MockFile, Paths: { cache } };
});
const dream = (patch: Partial<Journal> = {}): Journal => ({ id: 'a', user_id: 'owner', transcript: '', dream_date: '2026-10-09', created_at: '2026-10-09T01:00:00.000Z', sync_status: 'synced', processing_status: 'idle', audio_key: 'owner/a/version1', ...patch });
beforeEach(() => { mockFiles.clear(); jest.clearAllMocks(); mockHeaders.mockResolvedValue({ Cookie: 'private' }); mockDownload.mockImplementation(async (_url, file: File) => { mockFiles.set(file.uri, 100); return file; }); });
it('downloads once, reuses complete cached audio offline, and invalidates for a new audio key', async () => {
  const first = await journalAudioUri(dream(), () => true); expect(first).toContain('dreamer-audio-'); expect(first).not.toContain('owner');
  mockHeaders.mockRejectedValue(new Error('Offline')); expect(await journalAudioUri(dream(), () => true)).toBe(first); expect(mockDownload).toHaveBeenCalledTimes(1);
  mockHeaders.mockResolvedValue({ Cookie: 'private' }); const replaced = await journalAudioUri(dream({ audio_key: 'owner/a/version2' }), () => true); expect(replaced).not.toBe(first); expect(mockDownload).toHaveBeenCalledTimes(2);
});
it('deduplicates simultaneous downloads and scopes cache paths to the account', async () => {
  const [a, b] = await Promise.all([journalAudioUri(dream(), () => true), journalAudioUri(dream(), () => true)]); expect(a).toBe(b); expect(mockDownload).toHaveBeenCalledTimes(1);
  const other = await journalAudioUri(dream({ user_id: 'other' }), () => true); expect(other).not.toBe(a); expect(mockHeaders).toHaveBeenCalledWith('other');
});
it('never publishes partial Android download files as a playable cache', async () => {
  mockDownload.mockImplementationOnce(async (_url, file: File) => { mockFiles.set(file.uri, 25); throw new Error('Connection interrupted'); });
  await expect(journalAudioUri(dream(), () => true)).rejects.toThrow('Connection interrupted'); expect(mockFiles.size).toBe(0);
  await journalAudioUri(dream(), () => true); expect(mockDownload).toHaveBeenCalledTimes(2);
});
it('aborts active downloads on account invalidation and keeps no cached recording', async () => {
  let begun!: () => void; const started = new Promise<void>(resolve => { begun = resolve; });
  mockDownload.mockImplementationOnce(async (_url, file: File, options: { signal: AbortSignal }) => { begun(); mockFiles.set(file.uri, 10); return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted')))); });
  const download = journalAudioUri(dream(), () => true); await started; cancelJournalAudio(); await expect(download).rejects.toThrow('Aborted'); expect(mockFiles.size).toBe(0);
});
it('does not return a downloaded file after its owner access is revoked', async () => {
  let allowed = true; mockDownload.mockImplementationOnce(async (_url, file: File) => { mockFiles.set(file.uri, 100); allowed = false; return file; });
  expect(await journalAudioUri(dream(), () => allowed)).toBeUndefined(); expect(mockFiles.size).toBe(0);
});
it('rejects untrusted upload paths and never deletes recordings outside the managed folder', async () => {
  const dangerous = 'file:///documents/private.m4a'; mockFiles.set(dangerous, 10);
  await expect(uploadJournalAudio(dream({ audio_key: undefined, local_audio_uri: dangerous }), () => true)).rejects.toThrow('outside');
  await removeJournalAudio({ id: '../../private', user_id: '../owner', local_audio_uri: dangerous }); expect(mockFiles.has(dangerous)).toBe(true);
});
