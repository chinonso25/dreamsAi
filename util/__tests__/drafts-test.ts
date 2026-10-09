import { beforeEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { clearDeletedAccountDraft, completeDraft, flushDraft, hydrateDraft, rebindDraftOwner, retainRecording, updateDraft, useCaptureDraft } from '../drafts';

let mockDraftOwner: string | undefined;
jest.mock('../auth-client', () => ({ getCurrentUser: () => mockDraftOwner ? { id: mockDraftOwner } : null }));

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn<() => Promise<string | null>>(), setItem: jest.fn<() => Promise<void>>() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///documents/', cacheDirectory: 'file:///cache/', makeDirectoryAsync: jest.fn<() => Promise<void>>(), copyAsync: jest.fn<() => Promise<void>>(), getInfoAsync: jest.fn<() => Promise<{ exists: boolean; size: number }>>(), deleteAsync: jest.fn<() => Promise<void>>() }));
beforeEach(async () => {
  mockDraftOwner = undefined;
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null); jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined); jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 900 } as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>);
  useCaptureDraft.setState({ draft: null, hydrated: false, persistenceError: null });
  await hydrateDraft();
  useCaptureDraft.setState({ draft: { id: 'draft-a', text: '', dreamDate: '2026-10-08', updatedAt: '', recordingState: 'idle' }, persistenceError: null });
  jest.clearAllMocks();
});
it('persists written text and its actual dream date before save', async () => {
  await updateDraft({ text: 'I was flying', dreamDate: '2026-10-01' });
  const draft = await flushDraft();
  expect(draft).toMatchObject({ id: 'draft-a', text: 'I was flying', dreamDate: '2026-10-01' });
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(JSON.parse(calls[calls.length - 1][1]).drafts.find((draft: { id: string }) => draft.id === 'draft-a')).toMatchObject({ text: 'I was flying', dreamDate: '2026-10-01' });
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
  await updateDraft({ audioUri: 'file:///documents/dreamer-recordings/draft-a.m4a' });
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
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, ownerId: 'guest-a' } });
  await updateDraft({ text: 'Keep my story', audioUri: 'file:///documents/dreamer-recordings/owned.m4a' });
  await rebindDraftOwner('guest-a', 'email-a', true);
  expect(useCaptureDraft.getState().draft).toMatchObject({ id: 'draft-a', ownerId: 'email-a', text: 'Keep my story' });
  await clearDeletedAccountDraft('email-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ text: '', recordingState: 'idle' });
  expect(useCaptureDraft.getState().draft?.ownerId).toBeUndefined();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///documents/dreamer-recordings/owned.m4a', { idempotent: true });
});
it('never clears another owner’s draft or a protected shared recording', async () => {
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, ownerId: 'other-owner' } });
  await updateDraft({ text: 'Private to another owner', audioUri: 'file:///documents/dreamer-recordings/shared.m4a' });
  jest.clearAllMocks();
  await clearDeletedAccountDraft('deleted-owner');
  expect(useCaptureDraft.getState().draft).toMatchObject({ ownerId: 'other-owner', text: 'Private to another owner' });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  await clearDeletedAccountDraft('other-owner', ['file:///documents/dreamer-recordings/shared.m4a']);
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
  await expect(updateDraft({ text: 'Same draft' })).rejects.toThrow('account changed');
  expect(useCaptureDraft.getState().draft?.ownerId).toBe('guest-a');
});

it('retains corrupt draft bytes, blocks edits, and retries hydration after storage recovers', async () => {
  useCaptureDraft.setState({ draft: null, hydrated: false });
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{broken');
  jest.clearAllMocks();
  await expect(hydrateDraft()).rejects.toThrow('retained');
  expect(useCaptureDraft.getState()).toMatchObject({ draft: null, hydrated: false });
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify({ id: 'recovered', text: 'Still here', dreamDate: '2026-10-08', updatedAt: '2026-10-08T00:00:00Z', recordingState: 'idle' }));
  await hydrateDraft();
  expect(useCaptureDraft.getState().draft?.text).toBe('Still here');
});
it('does not replace a valid JSON draft whose fields are invalid', async () => {
  useCaptureDraft.setState({ draft: null, hydrated: false });
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('{"text":"valuable words"}');
  jest.clearAllMocks();
  await expect(updateDraft({ text: 'Replacement' })).rejects.toThrow('retained');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
it('does not overwrite a draft after a transient read failure', async () => {
  useCaptureDraft.setState({ draft: null, hydrated: false });
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Disk unavailable'));
  jest.clearAllMocks();
  await expect(hydrateDraft()).rejects.toThrow('retained');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  await hydrateDraft();
  expect(useCaptureDraft.getState().hydrated).toBe(true);
});
it('switches accounts without transferring their retained private drafts', async () => {
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, ownerId: 'email-a' } });
  await updateDraft({ text: 'Private A' });
  mockDraftOwner = 'email-b';
  await rebindDraftOwner('email-a', 'email-b');
  expect(useCaptureDraft.getState().draft).toMatchObject({ ownerId: 'email-b', text: '' });
  await updateDraft({ text: 'Private B' });
  mockDraftOwner = 'email-a';
  await rebindDraftOwner('email-b', 'email-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ ownerId: 'email-a', text: 'Private A' });
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(JSON.parse(calls[calls.length - 1][1]).drafts).toEqual(expect.arrayContaining([expect.objectContaining({ ownerId: 'email-b', text: 'Private B' })]));
});
it('clears an inactive deleted owner while retaining the active account draft', async () => {
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, ownerId: 'email-a' } });
  await updateDraft({ text: 'A' });
  await rebindDraftOwner('email-a', 'email-b');
  await updateDraft({ text: 'B' });
  await clearDeletedAccountDraft('email-a');
  expect(useCaptureDraft.getState().draft).toMatchObject({ ownerId: 'email-b', text: 'B' });
  await rebindDraftOwner('email-b', 'email-a');
  expect(useCaptureDraft.getState().draft?.text).toBe('');
});
it('never attaches or deletes a recording outside managed recording storage', async () => {
  await expect(updateDraft({ audioUri: 'file:///documents/private-database.sqlite' })).rejects.toThrow('Only recordings');
  await expect(retainRecording('draft-a', 'file:///outside/secret.m4a', 1)).rejects.toThrow('unavailable');
  await expect(retainRecording('draft-a', 'file:///documents/private.m4a', 1)).rejects.toThrow('unavailable');
  await expect(updateDraft({ temporaryAudioUri: 'file:///cache/private.sqlite' })).rejects.toThrow('outside');
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, audioUri: 'file:///documents/private-database.sqlite', ownerId: 'email-a' } });
  await clearDeletedAccountDraft('email-a');
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});
it('removes an interrupted cache recording only after persisting account cleanup', async () => {
  useCaptureDraft.setState({ draft: { ...useCaptureDraft.getState().draft!, ownerId: 'deleted-owner' } });
  await updateDraft({ temporaryAudioUri: 'file:///cache/Audio/recording-a.m4a', recordingState: 'interrupted' });
  jest.clearAllMocks();
  await clearDeletedAccountDraft('deleted-owner');
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/Audio/recording-a.m4a', { idempotent: true });
  const persistOrder = jest.mocked(AsyncStorage.setItem).mock.invocationCallOrder[0];
  expect(persistOrder).toBeLessThan(jest.mocked(FileSystem.deleteAsync).mock.invocationCallOrder[0]);
});
