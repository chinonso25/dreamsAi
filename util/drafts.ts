import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import { getCurrentUser } from './auth-client';
import { isDreamDate, isManagedRecordingUri, localDateKey } from '@/shared/dream-contract';

const STORAGE_KEY = 'dreamer:capture-draft:v1';
export type CaptureDraft = {
  id: string; ownerId?: string; text: string; dreamDate: string; audioUri?: string;
  audioLength?: number; temporaryAudioUri?: string;
  recordingState: 'idle' | 'recording' | 'paused' | 'interrupted' | 'ready'; updatedAt: string;
};
export type CaptureDraftChanges = Partial<Pick<CaptureDraft, 'text' | 'dreamDate' | 'audioUri' | 'audioLength' | 'temporaryAudioUri' | 'recordingState'>>;
export const localDreamDate = localDateKey;
function newDraft(ownerId?: string): CaptureDraft {
  return { id: Crypto.randomUUID(), ownerId, text: '', dreamDate: localDreamDate(), recordingState: 'idle', updatedAt: new Date().toISOString() };
}
export const useCaptureDraft = create<{ draft: CaptureDraft | null; hydrated: boolean; persistenceError: string | null }>(() => ({ draft: null, hydrated: false, persistenceError: null }));
let writes: Promise<void> = Promise.resolve();
let initialization: Promise<void> | undefined;
let retained = new Map<string, CaptureDraft>();
const ownerKey = (owner?: string) => owner || 'device';
function keep(draft: CaptureDraft) { retained.set(ownerKey(draft.ownerId), draft); }
function persist(draft: CaptureDraft) {
  keep(draft);
  const snapshot = JSON.stringify({ version: 2, drafts: [...retained.values()] });
  const next = writes.catch(() => undefined).then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot));
  writes = next;
  void next.then(() => useCaptureDraft.setState({ persistenceError: null }), () => useCaptureDraft.setState({ persistenceError: 'Your draft could not be saved on this device. Keep this screen open and try again.' }));
  return next;
}
function parseDraft(value: unknown): CaptureDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unreadable draft');
  const draft = value as CaptureDraft;
  if (typeof draft.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(draft.id) || typeof draft.text !== 'string' || !isDreamDate(draft.dreamDate) || typeof draft.updatedAt !== 'string' || !['idle', 'recording', 'paused', 'interrupted', 'ready'].includes(draft.recordingState) || (draft.ownerId !== undefined && typeof draft.ownerId !== 'string') || (draft.audioUri !== undefined && !isManagedRecordingUri(draft.audioUri, FileSystem.documentDirectory)) || (draft.temporaryAudioUri !== undefined && !safeRecordingSource(draft.temporaryAudioUri))) throw new Error('Unreadable draft');
  return { ...draft };
}
function safeRecordingSource(uri: unknown): uri is string {
  if (typeof uri !== 'string' || /%|\.\.|[?#\\]/.test(uri)) return false;
  const managed = Boolean(isManagedRecordingUri(uri, FileSystem.documentDirectory));
  if (managed) return true;
  return Boolean(FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory) && /^[A-Za-z0-9_./-]+\.m4a$/.test(uri.slice(FileSystem.cacheDirectory.length)));
}
export async function hydrateDraft() {
  if (useCaptureDraft.getState().hydrated) return;
  if (!initialization) initialization = (async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = stored ? JSON.parse(stored) : undefined;
      let drafts: CaptureDraft[] = [];
      if (parsed !== undefined) {
        if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 2) {
          if (!('drafts' in parsed) || !Array.isArray(parsed.drafts)) throw new Error('Unreadable drafts');
          drafts = parsed.drafts.map(parseDraft);
        } else drafts = [parseDraft(parsed)];
      }
      retained = new Map(drafts.map(draft => [ownerKey(draft.ownerId), draft]));
      const owner = getCurrentUser()?.id;
      const existing = retained.get(ownerKey(owner)) || retained.get('device');
      let draft = existing ? { ...existing } : newDraft(owner);
      if (!draft.ownerId && owner) { retained.delete('device'); draft.ownerId = owner; }
      if (draft.recordingState === 'recording' || draft.recordingState === 'paused') {
        draft.recordingState = 'interrupted';
        if (draft.temporaryAudioUri && !draft.audioUri) {
          try { draft.audioUri = await copyRecording(draft.id, draft.temporaryAudioUri); draft.temporaryAudioUri = undefined; }
          catch { /* Keep the recoverable source and written text until the user retries. */ }
        }
      }
      useCaptureDraft.setState({ draft, hydrated: true, persistenceError: null });
      try { await persist(draft); } catch { /* Restored content remains editable with a visible persistence error. */ }
    } catch {
      useCaptureDraft.setState({ draft: null, hydrated: false, persistenceError: 'Your saved draft could not be read. Its data has been retained. Tap Retry to restore it.' });
      throw new Error('Your saved draft could not be read. Its data has been retained. Tap Retry to restore it.');
    }
  })().finally(() => { initialization = undefined; });
  return initialization;
}
function assertCurrentOwner(draft: CaptureDraft) {
  const current = getCurrentUser()?.id;
  if (current && draft.ownerId && draft.ownerId !== 'device' && draft.ownerId !== current) throw new Error('Your account changed. Return to the draft belonging to your current account.');
}
export async function updateDraft(changes: CaptureDraftChanges, expectedId?: string) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft!;
  assertCurrentOwner(current);
  if (expectedId && expectedId !== current.id) throw new Error('This recording belongs to another draft. Your current draft was kept safe.');
  if (changes.audioUri && !isManagedRecordingUri(changes.audioUri, FileSystem.documentDirectory)) throw new Error('Only recordings saved by this app can be attached to a draft.');
  if (changes.temporaryAudioUri && !safeRecordingSource(changes.temporaryAudioUri)) throw new Error('This recording is outside the app’s recording storage.');
  const draft = { ...current, ...changes, ownerId: current.ownerId ?? getCurrentUser()?.id, id: current.id, updatedAt: new Date().toISOString() };
  useCaptureDraft.setState({ draft }); await persist(draft); return draft;
}
async function copyRecording(draftId: string, uri: string) {
  if (!FileSystem.documentDirectory || !safeRecordingSource(uri) || !/^[A-Za-z0-9_-]+$/.test(draftId)) throw new Error('Audio storage is unavailable for this recording.');
  const directory = `${FileSystem.documentDirectory}dreamer-recordings/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${draftId}-${Crypto.randomUUID()}.m4a`;
  await FileSystem.copyAsync({ from: uri, to: target });
  const file = await FileSystem.getInfoAsync(target);
  if (!file.exists || ('size' in file && file.size === 0)) throw new Error('The recording file is empty. Your written draft is still safe.');
  return target;
}
export async function retainRecording(draftId: string, uri: string, seconds: number, interrupted = false) {
  const current = useCaptureDraft.getState().draft;
  if (current?.id !== draftId) throw new Error('The recording draft changed. Please return to your draft.');
  assertCurrentOwner(current);
  const audioUri = await copyRecording(draftId, uri);
  return updateDraft({ audioUri, audioLength: seconds, temporaryAudioUri: undefined, recordingState: interrupted ? 'interrupted' : 'ready' }, draftId);
}
export async function discardDraftRecording(draftId: string) {
  const draft = useCaptureDraft.getState().draft;
  if (draft?.id !== draftId) return;
  await updateDraft({ audioUri: undefined, audioLength: undefined, temporaryAudioUri: undefined, recordingState: 'idle' }, draftId);
  if (isManagedRecordingUri(draft.audioUri, FileSystem.documentDirectory)) await FileSystem.deleteAsync(draft.audioUri, { idempotent: true });
}
export async function completeDraft(draftId: string) {
  const current = useCaptureDraft.getState().draft;
  if (current?.id !== draftId) return;
  retained.delete(ownerKey(current.ownerId));
  const draft = newDraft(getCurrentUser()?.id);
  // Saved entries now own their audio; completing capture never deletes it.
  useCaptureDraft.setState({ draft }); await persist(draft);
}
export async function flushDraft() { await hydrateDraft(); const draft = useCaptureDraft.getState().draft!; assertCurrentOwner(draft); await persist(draft); return draft; }

/** Move a live linked guest draft, or copy an explicitly recovered expired guest. */
export async function rebindDraftOwner(previousId: string | undefined, nextId: string, transferPrevious = false, copyPrevious = false) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft!; keep(current);
  const previous = transferPrevious && previousId ? retained.get(ownerKey(previousId)) : undefined;
  const unowned = retained.get('device');
  const source = previous || unowned;
  const existing = retained.get(nextId);
  // Do not overwrite another retained draft when linking an account with its own capture.
  const draft = existing || (source ? { ...source, ownerId: nextId, ...(copyPrevious ? { id: Crypto.randomUUID() } : {}) } : newDraft(nextId));
  if (source && !existing && !copyPrevious) retained.delete(ownerKey(source.ownerId));
  useCaptureDraft.setState({ draft }); await persist(draft);
}

/** Clear only after server acknowledgment, retaining other owners and their recordings. */
export async function clearDeletedAccountDraft(owner: string, protectedFiles: string[] = []) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft!; keep(current);
  const removed = retained.get(owner); if (!removed) return;
  retained.delete(owner);
  const draft = current.ownerId === owner ? newDraft() : current;
  useCaptureDraft.setState({ draft }); await persist(draft);
  const preserved = [...retained.values()].flatMap(item => [item.audioUri, item.temporaryAudioUri]);
  for (const uri of new Set([removed.audioUri, removed.temporaryAudioUri])) {
    if (!safeRecordingSource(uri) || protectedFiles.includes(uri) || preserved.includes(uri)) continue;
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); }
    catch { throw new Error('Your account was deleted, but a draft recording could not be removed from this device.'); }
  }
}
