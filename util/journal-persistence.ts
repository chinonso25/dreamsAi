import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Journal } from '@/types';

const LEGACY_KEY = 'dreamer-journal-v1';
const PREFIX = 'dreamer-journal-v2:';
const META_KEY = `${PREFIX}meta`;
export type JournalDeletion = { id: string; user_id: string; synced?: boolean; local_audio_uri?: string; cleanupPending?: boolean; sync_version?: number };
export type DurableJournal = { entries: Journal[]; deleted: JournalDeletion[]; retiredOwners: string[]; cursors?: Record<string, string> };
type Meta = { version: 2; retiredOwners: string[]; cursors: Record<string, string> };
let writes = Promise.resolve();
let committed = new Map<string, string>();
let references = new Map<string, unknown>();
const keyFor = (kind: 'entry' | 'deleted', item: { id: string; user_id: string }) => `${PREFIX}${kind}:${encodeURIComponent(item.user_id)}:${encodeURIComponent(item.id)}`;
function check(data: unknown): asserts data is DurableJournal {
  const state = data as DurableJournal;
  if (!state || !Array.isArray(state.entries) || !Array.isArray(state.deleted) || !Array.isArray(state.retiredOwners)
    || state.entries.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.user_id !== 'string' || typeof entry.transcript !== 'string' || typeof entry.dream_date !== 'string')
    || state.deleted.some(entry => !entry || typeof entry.id !== 'string' || typeof entry.user_id !== 'string')
    || state.retiredOwners.some(owner => typeof owner !== 'string')) throw new Error('Your saved journal could not be read. Its data has been retained; please retry.');
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
    if (meta.version !== 2 || !Array.isArray(meta.retiredOwners) || !meta.cursors || typeof meta.cursors !== 'object') throw new Error('Your journal metadata could not be read. Its data has been retained.');
    const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(PREFIX) && key !== META_KEY);
    const rows = await AsyncStorage.multiGet(keys);
    const entries: unknown[] = [], deleted: unknown[] = [];
    for (const [key, raw] of rows) {
      if (!raw) throw new Error('A saved journal record could not be read. Retry before editing your journal.');
      const value = parseStored(raw);
      if (key.startsWith(`${PREFIX}entry:`)) entries.push(value);
      else if (key.startsWith(`${PREFIX}deleted:`)) deleted.push(value);
      committed.set(key, raw);
    }
    const data: unknown = { entries, deleted, retiredOwners: meta.retiredOwners, cursors: meta.cursors };
    check(data); committed.set(META_KEY, rawMeta);
    const tombstones = new Set(data.deleted.map(item => `${item.user_id}:${item.id}`));
    return { ...data, entries: data.entries.filter(item => !tombstones.has(`${item.user_id}:${item.id}`)) };
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
