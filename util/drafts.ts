import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import { getCurrentUser } from './auth-client';

const STORAGE_KEY = 'dreamer:capture-draft:v1';
export type CaptureDraft = {
  id: string;
  ownerId?: string;
  text: string;
  dreamDate: string;
  audioUri?: string;
  audioLength?: number;
  temporaryAudioUri?: string;
  recordingState: 'idle' | 'recording' | 'paused' | 'interrupted' | 'ready';
  updatedAt: string;
};
export function localDreamDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function newDraft(ownerId?: string): CaptureDraft {
  return { id: Crypto.randomUUID(), ownerId, text: '', dreamDate: localDreamDate(), recordingState: 'idle', updatedAt: new Date().toISOString() };
}
export const useCaptureDraft = create<{ draft: CaptureDraft | null; hydrated: boolean; persistenceError: string | null }>(() => ({ draft: null, hydrated: false, persistenceError: null }));
let writes = Promise.resolve();
let initialization: Promise<void> | undefined;
function persist(draft: CaptureDraft) {
  const next = writes.catch(() => undefined).then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draft)));
  writes = next;
  void next.then(() => useCaptureDraft.setState({ persistenceError: null }), () => useCaptureDraft.setState({ persistenceError: 'Your draft could not be saved on this device. Keep this screen open and try again.' }));
  return next;
}
export async function hydrateDraft() {
  if (!initialization) initialization = (async () => {
    let draft: CaptureDraft;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as CaptureDraft : undefined;
      draft = parsed && typeof parsed.id === 'string' && typeof parsed.text === 'string' ? parsed : newDraft(getCurrentUser()?.id);
      if (draft.recordingState === 'recording' || draft.recordingState === 'paused') {
        draft.recordingState = 'interrupted';
        if (draft.temporaryAudioUri && !draft.audioUri) {
          try {
            const copied = await copyRecording(draft.id, draft.temporaryAudioUri);
            draft.audioUri = copied;
            draft.temporaryAudioUri = undefined;
          } catch { /* The interrupted file may not have finalized; preserve the written text. */ }
        }
      }
      useCaptureDraft.setState({ draft, hydrated: true });
      try { await persist(draft); } catch { /* retain restored content and show persistenceError */ }
    } catch {
      useCaptureDraft.setState({ draft: newDraft(getCurrentUser()?.id), hydrated: true, persistenceError: 'We could not restore your draft. Please check available device storage.' });
    }
  })();
  return initialization;
}
export async function updateDraft(changes: Partial<CaptureDraft>, expectedId?: string) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft!;
  if (expectedId && expectedId !== current.id) throw new Error('This recording belongs to another draft. Your current draft was kept safe.');
  const draft = { ...current, ...changes, ownerId: changes.ownerId ?? current.ownerId ?? getCurrentUser()?.id, id: current.id, updatedAt: new Date().toISOString() };
  useCaptureDraft.setState({ draft });
  await persist(draft);
  return draft;
}
async function copyRecording(draftId: string, uri: string) {
  if (!FileSystem.documentDirectory) throw new Error('Audio storage is unavailable on this device.');
  const directory = `${FileSystem.documentDirectory}dreamer-recordings/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${draftId}-${Crypto.randomUUID()}.m4a`;
  if (uri !== target) await FileSystem.copyAsync({ from: uri, to: target });
  const file = await FileSystem.getInfoAsync(target);
  if (!file.exists || ('size' in file && file.size === 0)) throw new Error('The recording file is empty. Your written draft is still safe.');
  return target;
}
export async function retainRecording(draftId: string, uri: string, seconds: number, interrupted = false) {
  const current = useCaptureDraft.getState().draft;
  if (current?.id !== draftId) throw new Error('The recording draft changed. Please return to your draft.');
  const audioUri = await copyRecording(draftId, uri);
  return updateDraft({ audioUri, audioLength: seconds, temporaryAudioUri: undefined, recordingState: interrupted ? 'interrupted' : 'ready' }, draftId);
}
export async function discardDraftRecording(draftId: string) {
  const draft = useCaptureDraft.getState().draft;
  if (draft?.id !== draftId) return;
  // Clear the durable reference first, then remove its file. Saved entries own their files separately.
  await updateDraft({ audioUri: undefined, audioLength: undefined, temporaryAudioUri: undefined, recordingState: 'idle' }, draftId);
  if (draft.audioUri) await FileSystem.deleteAsync(draft.audioUri, { idempotent: true });
}
export async function completeDraft(draftId: string) {
  const current = useCaptureDraft.getState().draft;
  if (current?.id !== draftId) return;
  const draft = newDraft(getCurrentUser()?.id);
  // Do not delete audio: the successfully saved journal entry now owns it.
  useCaptureDraft.setState({ draft });
  await persist(draft);
}
export async function flushDraft() {
  await hydrateDraft();
  const draft = useCaptureDraft.getState().draft!;
  await persist(draft);
  return draft;
}

export async function rebindDraftOwner(previousId: string | undefined, nextId: string) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft;
  if (current && (!current.ownerId || current.ownerId === previousId)) await updateDraft({ ownerId: nextId }, current.id);
}

/** The server must acknowledge account deletion before its active draft is cleared. */
export async function clearDeletedAccountDraft(owner: string, protectedFiles: string[] = []) {
  await hydrateDraft();
  const current = useCaptureDraft.getState().draft;
  if (!current || current.ownerId !== owner) return;
  const next = newDraft();
  useCaptureDraft.setState({ draft: next });
  await persist(next);
  for (const uri of new Set([current.audioUri, current.temporaryAudioUri].filter((uri): uri is string => Boolean(uri) && !protectedFiles.includes(uri!)))) {
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); }
    catch { throw new Error('Your account was deleted, but a draft recording could not be removed from this device.'); }
  }
}
