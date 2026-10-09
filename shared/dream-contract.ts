/** API and local-storage boundaries shared by the app and worker. No platform imports. */
export const DREAM_LIMITS = {
  title: 200, transcript: 50_000, summary: 10_000, listItems: 20, listItem: 80,
  audioSeconds: 1200, audioBytes: 25 * 1024 * 1024, requestBytes: 400_000,
  journalPageSize: 100, maxDreamsPerOwner: 10_000,
  maxAudioBytesPerOwner: 1024 * 1024 * 1024, maxAudioBytesGlobal: 100 * 1024 * 1024 * 1024,
} as const;
export enum MoodEnum { Happy = 'happy', Anxious = 'anxious', Neutral = 'neutral', Excited = 'excited', Sad = 'sad', Curious = 'curious', Frustrated = 'frustrated' }
export const moods = ['happy', 'anxious', 'neutral', 'excited', 'sad', 'curious', 'frustrated'] as const;
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';
export type ProcessingStatus = 'idle' | 'pending' | 'processing' | 'complete' | 'error';
export interface DreamDTO {
  id: string; user_id: string; title?: string; transcript: string; original_text?: string;
  dream_date: string; created_at: string; updated_at?: string; summary?: string;
  tags?: string[]; keywords?: string[]; mood?: MoodEnum; reflection?: string; audio_key?: string | null;
  audio_length?: number; is_starred?: boolean; processing_status: ProcessingStatus;
  error?: string | null; sync_version?: number;
}
export interface LocalDream extends Omit<DreamDTO, 'error'> {
  local_audio_uri?: string; sync_status: SyncStatus; last_error?: string;
  // Read-only compatibility fields for existing device journals; never sent to the API.
  audio_url?: string; location?: string; privacy?: string; images?: string[]; deleted_at?: string | null;
}
export type SaveDreamInput = Pick<Partial<DreamDTO>, 'id' | 'title' | 'original_text' | 'dream_date' | 'created_at' | 'updated_at' | 'summary' | 'tags' | 'keywords' | 'mood' | 'audio_length' | 'is_starred' | 'reflection'> & { transcript: string };
export type EditDreamPatch = Partial<Omit<SaveDreamInput, 'id' | 'created_at' | 'updated_at'>>;
export type DreamDeletionDTO = { id: string; user_id: string; deleted_at: string; sync_version: number };
export type DreamListResponse = { dreams: DreamDTO[]; next_cursor?: string | null; sync_cursor?: string };
export type DreamSyncResponse = { dreams: DreamDTO[]; deleted: DreamDeletionDTO[]; next_cursor: string | null; sync_cursor: string };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The journal response could not be read. Please retry.');
  return value as Record<string, unknown>;
};
export function isDreamDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function text(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must contain at most ${max.toLocaleString()} characters.`);
}
export function validateDreamInput(input: SaveDreamInput | EditDreamPatch): void {
  const value = record(input);
  for (const [key, max, label] of [['title', DREAM_LIMITS.title, 'Title'], ['transcript', DREAM_LIMITS.transcript, 'Dream text'], ['original_text', DREAM_LIMITS.transcript, 'Original words'], ['summary', DREAM_LIMITS.summary, 'Summary'], ['reflection', DREAM_LIMITS.summary, 'Reflection']] as const) {
    if (value[key] !== undefined) text(value[key], max, label);
  }
  for (const key of ['tags', 'keywords'] as const) if (value[key] !== undefined) {
    const list = value[key];
    if (!Array.isArray(list) || list.length > DREAM_LIMITS.listItems || list.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > DREAM_LIMITS.listItem)) throw new Error(`Use at most ${DREAM_LIMITS.listItems} themes, each containing 1–${DREAM_LIMITS.listItem} characters.`);
  }
  if (value.dream_date !== undefined && !isDreamDate(value.dream_date)) throw new Error('Choose a valid dream date.');
  if (value.mood !== undefined && !moods.includes(value.mood as typeof moods[number])) throw new Error('Choose a valid mood.');
  if (value.is_starred !== undefined && typeof value.is_starred !== 'boolean') throw new Error('Choose a valid favorite setting.');
  if (value.audio_length !== undefined && (typeof value.audio_length !== 'number' || !Number.isFinite(value.audio_length) || value.audio_length < 0 || value.audio_length > DREAM_LIMITS.audioSeconds)) throw new Error('Recordings must be no longer than 20 minutes.');
  for (const key of ['created_at', 'updated_at'] as const) if (value[key] !== undefined && (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])))) throw new Error('The entry timestamp could not be read.');
  // JSON escaping can exceed the body cap even when individual text fields fit.
  let bytes = 0;
  for (const character of JSON.stringify(input)) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > DREAM_LIMITS.requestBytes) throw new Error('This entry is too large to sync. Keep its text in shorter entries before syncing.');
  }
}
export function toSaveDreamInput(entry: LocalDream): SaveDreamInput {
  return { id: entry.id, title: entry.title, transcript: entry.transcript, original_text: entry.original_text, dream_date: entry.dream_date, created_at: entry.created_at, updated_at: entry.updated_at, summary: entry.summary, tags: entry.tags, keywords: entry.keywords, mood: entry.mood ?? MoodEnum.Neutral, audio_length: entry.audio_length, is_starred: entry.is_starred, reflection: entry.reflection };
}
export function parseDreamDTO(value: unknown): DreamDTO {
  const raw = record(value);
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.user_id !== 'string' || !raw.user_id || typeof raw.transcript !== 'string' || !isDreamDate(raw.dream_date) || typeof raw.created_at !== 'string' || !Number.isFinite(Date.parse(raw.created_at)) || !['idle', 'pending', 'processing', 'complete', 'error'].includes(String(raw.processing_status))) throw new Error('The journal response contains an unreadable dream. Please retry.');
  const input: SaveDreamInput = { transcript: raw.transcript };
  for (const key of ['title', 'original_text', 'summary', 'tags', 'keywords', 'mood', 'updated_at', 'audio_length', 'is_starred', 'reflection'] as const) if (raw[key] !== undefined && raw[key] !== null) Object.assign(input, { [key]: raw[key] });
  validateDreamInput(input);
  if (raw.audio_key !== undefined && raw.audio_key !== null && typeof raw.audio_key !== 'string') throw new Error('The recording response could not be read.');
  if (raw.error !== undefined && raw.error !== null && typeof raw.error !== 'string') throw new Error('The processing response could not be read.');
  if (raw.sync_version !== undefined && (!Number.isSafeInteger(raw.sync_version) || Number(raw.sync_version) < 0)) throw new Error('The journal revision could not be read.');
  return { ...input, id: raw.id, user_id: raw.user_id, dream_date: raw.dream_date, created_at: raw.created_at, processing_status: raw.processing_status as ProcessingStatus, ...(raw.audio_key !== undefined ? { audio_key: raw.audio_key as string | null } : {}), ...(raw.error !== undefined ? { error: raw.error as string | null } : {}), ...(raw.sync_version !== undefined ? { sync_version: raw.sync_version as number } : {}) };
}
export function parseDreamResponse(value: unknown): { dream: DreamDTO } { return { dream: parseDreamDTO(record(value).dream) }; }
function cursor(value: unknown): string { if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('The journal cursor could not be read.'); return value; }
export function parseDreamListResponse(value: unknown): DreamListResponse {
  const raw = record(value);
  if (!Array.isArray(raw.dreams)) throw new Error('The journal list could not be read.');
  return { dreams: raw.dreams.map(parseDreamDTO), ...(raw.next_cursor !== undefined ? { next_cursor: raw.next_cursor === null ? null : cursor(raw.next_cursor) } : {}), ...(raw.sync_cursor !== undefined ? { sync_cursor: cursor(raw.sync_cursor) } : {}) };
}
export function parseDreamSyncResponse(value: unknown): DreamSyncResponse {
  const raw = record(value); const list = parseDreamListResponse(value);
  if (!Array.isArray(raw.deleted) || raw.next_cursor === undefined) throw new Error('The journal changes could not be read.');
  const deleted = raw.deleted.map(value => {
    const item = record(value);
    if (typeof item.id !== 'string' || !item.id || typeof item.user_id !== 'string' || !item.user_id || typeof item.deleted_at !== 'string' || !Number.isFinite(Date.parse(item.deleted_at)) || !Number.isSafeInteger(item.sync_version) || Number(item.sync_version) < 0) throw new Error('A journal deletion could not be read.');
    return item as DreamDeletionDTO;
  });
  return { dreams: list.dreams, deleted, next_cursor: list.next_cursor ?? null, sync_cursor: cursor(raw.sync_cursor) };
}
/** Only durable recordings created under our managed directory may be uploaded/deleted. */
export function isManagedRecordingUri(uri: unknown, documentDirectory: string | null | undefined): uri is string {
  if (typeof uri !== 'string' || !documentDirectory) return false;
  const root = `${documentDirectory.replace(/\/?$/, '/')}dreamer-recordings/`;
  if (!uri.startsWith(root)) return false;
  const name = uri.slice(root.length);
  return /^[A-Za-z0-9_-]+\.m4a$/.test(name);
}
