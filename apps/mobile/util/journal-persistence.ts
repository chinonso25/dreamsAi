import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Journal } from '@/types';
import { parseDreamDTO } from '@thedreamer/shared/dream-contract';

const LEGACY_KEY = 'dreamer-journal-v1';
const PREFIX = 'dreamer-journal-v2:';
const META_KEY = `${PREFIX}meta`;
export type JournalDeletion = { id: string; user_id: string; synced?: boolean; local_audio_uri?: string; cleanupPending?: boolean; sync_version?: number; recovery_source?: string };
export type DurableJournal = { entries: Journal[]; deleted: JournalDeletion[]; retiredOwners: string[]; cursors?: Record<string, string> };
type Meta = { version: 2; retiredOwners: string[]; cursors: Record<string, string> };
let writes = Promise.resolve();
let committed = new Map<string, string>();
let references = new Map<string, unknown>();
const keyFor = (kind: 'entry' | 'deleted', item: { id: string; user_id: string }) => `${PREFIX}${kind}:${encodeURIComponent(item.user_id)}:${encodeURIComponent(item.id)}`;
function parseEntry(value: unknown): Journal {
  const dto = parseDreamDTO(value);
  const raw = value as Record<string, unknown>;
  if (!['local', 'syncing', 'synced', 'error'].includes(String(raw.sync_status)) || raw.local_audio_uri !== undefined && typeof raw.local_audio_uri !== 'string' || raw.last_error !== undefined && typeof raw.last_error !== 'string' || raw.recovery_source !== undefined && (typeof raw.recovery_source !== 'string' || raw.recovery_source.length > 2048)) throw new Error('A saved journal record could not be read. Its data has been retained.');
  const { error: _error, ...entry } = dto;
  return { ...raw, ...entry, sync_status: raw.sync_status as Journal['sync_status'], local_audio_uri: raw.local_audio_uri as string | undefined, last_error: raw.last_error as string | undefined };
}
function parseDeletion(value: unknown): JournalDeletion {
  const row = value as JournalDeletion;
  if (!row || typeof row.id !== 'string' || !row.id || typeof row.user_id !== 'string' || !row.user_id
    || row.synced !== undefined && typeof row.synced !== 'boolean'
    || row.cleanupPending !== undefined && typeof row.cleanupPending !== 'boolean'
    || row.local_audio_uri !== undefined && typeof row.local_audio_uri !== 'string'
    || row.sync_version !== undefined && (!Number.isSafeInteger(row.sync_version) || row.sync_version < 0)
    || row.recovery_source !== undefined && (typeof row.recovery_source !== 'string' || row.recovery_source.length > 2048)) throw new Error('A saved journal deletion could not be read. Its data has been retained.');
  return row;
}
function check(data: unknown): asserts data is DurableJournal {
  const state = data as DurableJournal;
  if (!state || !Array.isArray(state.entries) || !Array.isArray(state.deleted) || !Array.isArray(state.retiredOwners)
    || state.retiredOwners.some(owner => typeof owner !== 'string')) throw new Error('Your saved journal could not be read. Its data has been retained; please retry.');
  state.entries = state.entries.map(parseEntry); state.deleted = state.deleted.map(parseDeletion);
}
function snapshot(state: DurableJournal) {
  const values = new Map<string, string>();
  const nextReferences = new Map<string, unknown>();
  for (const [kind, items] of [['entry', state.entries], ['deleted', state.deleted]] as const) for (const item of items) {
    const key = keyFor(kind, item);
    const cached = references.get(key) === item ? committed.get(key) : undefined;
    values.set(key, cached ?? JSON.stringify(kind === 'entry' && 'sync_status' in item && item.sync_status === 'syncing' ? { ...item, sync_status: 'local' } : item));
    nextReferences.set(key, item);
  }
  values.set(META_KEY, JSON.stringify({ version: 2, retiredOwners: state.retiredOwners, cursors: state.cursors || {} } satisfies Meta));
  return { values, nextReferences };
}
/** Only changed records cross the storage bridge. Metadata never contains the full journal. */
export function persistJournal(state: DurableJournal) {
  const captured = snapshot(state);
  const next = writes.catch(() => undefined).then(async () => {
    const changes = [...captured.values].filter(([key, value]) => committed.get(key) !== value);
    // Tombstones and retired owners are durable before entry removals, so interruption cannot resurrect data.
    const priority = (key: string) => key === META_KEY ? 2 : key.includes(':deleted:') ? 0 : 1;
    changes.sort(([a], [b]) => priority(a) - priority(b));
    for (const [key, value] of changes) await AsyncStorage.setItem(key, value);
    const removed = [...committed.keys()].filter(key => !captured.values.has(key));
    for (const key of removed) await AsyncStorage.removeItem(key);
    committed = captured.values;
    references = captured.nextReferences;
  });
  writes = next;
  return next;
}
export function waitForJournalWrites() { return writes.catch(() => undefined); }
function parseStored(raw: string): unknown {
  try { return JSON.parse(raw); } catch { throw new Error('Your saved journal could not be read. Its data has been retained; please retry.'); }
}
export async function readJournal(): Promise<DurableJournal> {
  const rawMeta = await AsyncStorage.getItem(META_KEY);
  if (rawMeta) {
    const meta = parseStored(rawMeta) as Meta;
    if (meta.version !== 2 || !Array.isArray(meta.retiredOwners) || !meta.cursors || typeof meta.cursors !== 'object' || Array.isArray(meta.cursors) || Object.values(meta.cursors).some(cursor => typeof cursor !== 'string' || !/^\d+$/.test(cursor))) throw new Error('Your journal metadata could not be read. Its data has been retained.');
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX) && key !== META_KEY);
    const rows = await AsyncStorage.multiGet(keys);
    const entries: Journal[] = [], deleted: JournalDeletion[] = [];
    for (const [key, raw] of rows) {
      if (!raw) throw new Error('A saved journal record could not be read. Retry before editing your journal.');
      const value = parseStored(raw);
      if (key.startsWith(`${PREFIX}entry:`)) {
        const entry = parseEntry(value); if (keyFor('entry', entry) !== key) throw new Error('A saved dream identity could not be read. Its data has been retained.'); entries.push(entry);
      } else if (key.startsWith(`${PREFIX}deleted:`)) {
        const item = parseDeletion(value); if (keyFor('deleted', item) !== key) throw new Error('A saved deletion identity could not be read. Its data has been retained.'); deleted.push(item);
      }
      committed.set(key, raw);
    }
    const data = { entries, deleted, retiredOwners: meta.retiredOwners, cursors: meta.cursors };
    check(data); committed.set(META_KEY, rawMeta);
    const tombstones = new Set(deleted.map(item => `${item.user_id}:${item.id}`));
    return { ...data, entries: entries.filter(item => !meta.retiredOwners.includes(item.user_id) && !tombstones.has(`${item.user_id}:${item.id}`)), deleted: deleted.filter(item => !meta.retiredOwners.includes(item.user_id)) };
  }
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!raw) return { entries: [], deleted: [], retiredOwners: [], cursors: {} };
  const legacy = parseStored(raw) as Partial<DurableJournal>;
  const data = { ...legacy, entries: legacy.entries, deleted: legacy.deleted || [], retiredOwners: legacy.retiredOwners || [], cursors: {} };
  check(data);
  // Write all records first, publishing metadata last. A failed migration leaves the legacy source untouched.
  const captured = snapshot(data);
  for (const [key, value] of captured.values) if (key !== META_KEY) await AsyncStorage.setItem(key, value);
  await AsyncStorage.setItem(META_KEY, captured.values.get(META_KEY)!);
  committed = captured.values; references = captured.nextReferences;
  await AsyncStorage.removeItem(LEGACY_KEY);
  return data;
}
