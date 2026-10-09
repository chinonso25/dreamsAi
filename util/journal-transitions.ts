import type { Journal } from '@/types';

export function nextRevision(previous?: string) {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 || 0 : 0)).toISOString();
}
export function editDream(entry: Journal, patch: Partial<Journal>): Journal {
  const changed = ['transcript', 'title', 'tags', 'keywords', 'mood', 'original_text'].some(key => key in patch && JSON.stringify(patch[key as keyof Journal]) !== JSON.stringify(entry[key as keyof Journal]));
  const sourceChanged = ('transcript' in patch && patch.transcript !== entry.transcript) || ('original_text' in patch && patch.original_text !== entry.original_text);
  const duringProcessing = changed && ['pending', 'processing'].includes(entry.processing_status);
  return { ...entry, ...patch, id: entry.id, user_id: entry.user_id, original_text: patch.original_text ?? entry.original_text ?? entry.transcript, created_at: entry.created_at, updated_at: nextRevision(entry.updated_at || entry.created_at), sync_status: 'local', summary: sourceChanged ? '' : patch.summary ?? entry.summary, processing_status: sourceChanged || duringProcessing ? 'idle' : patch.processing_status || entry.processing_status, last_error: undefined };
}
export function isOlderRemote(local: Journal, remote: Journal) {
  if (local.updated_at && remote.updated_at && Date.parse(remote.updated_at) < Date.parse(local.updated_at)) return true;
  const oldVersion = (local as Journal & { sync_version?: number }).sync_version;
  const newVersion = (remote as Journal & { sync_version?: number }).sync_version;
  return oldVersion !== undefined && newVersion !== undefined && newVersion < oldVersion;
}
export function mergeRemote(local: Journal | undefined, remote: Journal, preservePending = false): Journal | undefined {
  if (local && (local.user_id !== remote.user_id || isOlderRemote(local, remote))) return local;
  return { ...local, ...remote, local_audio_uri: local?.local_audio_uri, sync_status: 'synced', processing_status: preservePending && local && ['pending', 'processing'].includes(local.processing_status) && remote.processing_status === 'idle' ? local.processing_status : remote.processing_status, last_error: remote.last_error };
}
