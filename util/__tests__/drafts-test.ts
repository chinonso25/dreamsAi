import { beforeEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { clearDeletedAccountDraft, completeDraft, flushDraft, hydrateDraft, rebindDraftOwner, retainRecording, updateDraft, useCaptureDraft } from '../drafts';

let mockDraftOwner: string | undefined;
jest.mock('../auth-client', () => ({ getCurrentUser: () => mockDraftOwner ? { id: mockDraftOwner } : null }));

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn<() => Promise<string | null>>(), setItem: jest.fn<() => Promise<void>>() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/', makeDirectoryAsync: jest.fn<() => Promise<void>>(), copyAsync: jest.fn<() => Promise<void>>(), getInfoAsync: jest.fn<() => Promise<{ exists: boolean; size: number }>>(), deleteAsync: jest.fn<() => Promise<void>>() }));
beforeEach(async () => {
  mockDraftOwner = undefined;
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null); jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined); jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 900 } as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>);
  await hydrateDraft();
  useCaptureDraft.setState({ draft: { id: 'draft-a', text: '', dreamDate: '2026-10-08', updatedAt: '', recordingState: 'idle' }, persistenceError: null });
  jest.clearAllMocks();
});
it('persists written text and its actual dream date before save', async () => {
  await updateDraft({ text: 'I was flying', dreamDate: '2026-10-01' });
  const draft = await flushDraft();
  expect(draft).toMatchObject({ id: 'draft-a', text: 'I was flying', dreamDate: '2026-10-01' });
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(JSON.parse(calls[calls.length - 1][1])).toMatchObject({ text: 'I was flying', dreamDate: '2026-10-01' });
});
it('copies completed audio into durable storage before attaching it', async () => {
  let finishCopy!: () => void;
  jest.mocked(FileSystem.copyAsync).mockReturnValue(new Promise<void>(resolve => { finishCopy = resolve; }));
  const pending = retainRecording('draft-a', 'file:///cache/audio.m4a', 12, true);
  await Promise.resolve(); expect(useCaptureDraft.getState().draft?.audioUri).toBeUndefined();
  finishCopy(); await pending;
  expect(useCaptureDraft.getState().draft).toMatchObject({ audioUri: 'file:///documents/dreamer-recordings/draft-a-new-id.m4a', audioLength: 12, recordingState: 'interrupted' });
});
it('refuses to attach an old recording to another draft', async () => {
  await expect(retainRecording('draft-b', 'file:///cache/old.m4a', 12)).rejects.toThrow('draft changed');
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  expect(useCaptureDraft.getState().draft?.audioUri).toBeUndefined();
});
it('starts a fresh draft after save without deleting the saved audio', async () => {
  await updateDraft({ audioUri: 'file:///documents/draft-a.m4a' });
  await completeDraft('draft-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ id: 'new-id', text: '', recordingState: 'idle' });
  expect(useCaptureDraft.getState().draft?.audioUri).toBeUndefined(); expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});
it('keeps text available and surfaces persistence failures for retry', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));
  await expect(updateDraft({ text: 'Do not lose this dream' })).rejects.toThrow('Disk full');
  expect(useCaptureDraft.getState().draft?.text).toBe('Do not lose this dream');
  expect(useCaptureDraft.getState().persistenceError).toContain('could not be saved');
  await flushDraft();
  expect(useCaptureDraft.getState().persistenceError).toBeNull();
});
it('retains a draft through guest-to-email linking and clears only its deleted owner', async () => {
  await updateDraft({ ownerId: 'guest-a', text: 'Keep my story', audioUri: 'file:///documents/owned.m4a' });
  await rebindDraftOwner('guest-a', 'email-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ id: 'draft-a', ownerId: 'email-a', text: 'Keep my story' });
  await clearDeletedAccountDraft('email-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ text: '', recordingState: 'idle' });
  expect(useCaptureDraft.getState().draft?.ownerId).toBeUndefined();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///documents/owned.m4a', { idempotent: true });
});
it('never clears another owner’s draft or a protected shared recording', async () => {
  await updateDraft({ ownerId: 'other-owner', text: 'Private to another owner', audioUri: 'file:///documents/shared.m4a' });
  jest.clearAllMocks();
  await clearDeletedAccountDraft('deleted-owner');
  expect(useCaptureDraft.getState().draft).toMatchObject({ ownerId: 'other-owner', text: 'Private to another owner' });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  await clearDeletedAccountDraft('other-owner', ['file:///documents/shared.m4a']);
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});

it('binds the next draft to the current account immediately after saving', async () => {
  mockDraftOwner = 'email-a';
  await completeDraft('draft-a');
  expect(useCaptureDraft.getState().draft?.ownerId).toBe('email-a');
  await updateDraft({ text: 'Next dream' });
  await clearDeletedAccountDraft('email-a');
  expect(useCaptureDraft.getState().draft?.text).toBe('');
  expect(useCaptureDraft.getState().draft?.ownerId).toBeUndefined();
});
it('binds an edited unowned draft without replacing a different owner', async () => {
  mockDraftOwner = 'guest-a';
  await updateDraft({ text: 'My dream' });
  expect(useCaptureDraft.getState().draft?.ownerId).toBe('guest-a');
  mockDraftOwner = 'guest-b';
  await updateDraft({ text: 'Same draft' });
  expect(useCaptureDraft.getState().draft?.ownerId).toBe('guest-a');
});
