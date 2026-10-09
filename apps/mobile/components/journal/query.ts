import { Journal } from '@/types';
import { localDateKey } from '@thedreamer/shared/dream-contract';
export { localDateKey } from '@thedreamer/shared/dream-contract';

export type SearchScope = 'all' | 'themes' | 'transcripts';
export type DreamSort = 'newest' | 'oldest';
export type JournalFilters = { query?: string; scope?: SearchScope; sort?: DreamSort; mood?: string; tag?: string; favorites?: boolean; date?: string; from?: string; to?: string };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
// Journal updates replace objects, so a WeakMap expires naturally when an entry changes.
const indexes = new WeakMap<Journal, { tags?: string[]; text: Partial<Record<SearchScope, string>> }>();
function index(dream: Journal) {
  let cached = indexes.get(dream);
  if (!cached) { cached = { text: {} }; indexes.set(dream, cached); }
  return cached;
}
export function dreamDateKey(dream: Journal): string {
  return dream.dream_date?.slice(0, 10) || localDateKey(new Date(dream.created_at));
}
export function entryTags(dream: Journal): string[] {
  const cached = index(dream);
  if (cached.tags) return cached.tags;
  const tags = new Map<string, string>();
  for (const tag of [...(dream.tags || []), ...(dream.keywords || [])]) if (tag.trim()) { const key = normalized(tag.trim()); tags.set(key, tags.get(key) || tag.trim()); }
  cached.tags = [...tags.values()];
  return cached.tags;
}
function searchableText(dream: Journal, scope: SearchScope) {
  const cached = index(dream);
  if (cached.text[scope] === undefined) {
    const fields = scope === 'themes' ? entryTags(dream) : scope === 'transcripts' ? [dream.transcript, dream.original_text] : [dream.title, dream.transcript, dream.original_text, dream.summary, dream.mood, dream.location, readableDreamDate(dreamDateKey(dream)), ...entryTags(dream)];
    cached.text[scope] = normalized(fields.filter(Boolean).join(' '));
  }
  return cached.text[scope]!;
}
export function filterDreams(entries: Journal[], filters: JournalFilters): Journal[] {
  const words = normalized(filters.query || '').trim().split(/\s+/).filter(Boolean);
  const theme = filters.tag ? normalized(filters.tag) : undefined;
  return entries.filter(dream => {
    if (filters.favorites && !dream.is_starred) return false;
    if (filters.mood && dream.mood !== filters.mood) return false;
    if (theme && !entryTags(dream).some(tag => normalized(tag) === theme)) return false;
    if (filters.date && dreamDateKey(dream) !== filters.date) return false;
    if (filters.from && dreamDateKey(dream) < filters.from) return false;
    if (filters.to && dreamDateKey(dream) > filters.to) return false;
    if (!words.length) return true;
    const text = searchableText(dream, filters.scope || 'all');
    return words.every(word => text.includes(word));
  }).sort((a, b) => (filters.sort === 'oldest' ? -1 : 1) * (dreamDateKey(b).localeCompare(dreamDateKey(a)) || b.created_at.localeCompare(a.created_at) || String(b.id).localeCompare(String(a.id))));
}
export function journalThemes(entries: Journal[]): { name: string; count: number }[] {
  const themes = new Map<string, { name: string; count: number }>();
  entries.forEach(entry => entryTags(entry).forEach(name => {
    const key = normalized(name); const current = themes.get(key);
    themes.set(key, { name: current?.name || name, count: (current?.count || 0) + 1 });
  }));
  return [...themes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
export function dreamSections(entries: Journal[]) {
  const sections = new Map<string, { title: string; data: Journal[] }>();
  entries.forEach(entry => {
    const key = dreamDateKey(entry).slice(0, 7);
    if (!sections.has(key)) sections.set(key, { title: new Date(`${key}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), data: [] });
    sections.get(key)!.data.push(entry);
  });
  return [...sections.values()];
}
export function dreamPreview(dream: Journal, query = '', scope: SearchScope = 'all'): { text: string; source?: string } {
  const fallback = dream.summary || dream.transcript || dream.original_text || (dream.processing_status === 'error' ? 'Recording saved. Open to try turning it into text again.' : 'Recording saved. Open to listen.');
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length || scope === 'themes') return { text: fallback };
  const fields = [{ text: dream.transcript, source: 'Transcript' }, { text: dream.original_text, source: 'Original words' }, ...(scope === 'all' ? [{ text: dream.summary, source: 'Summary' }, { text: dream.location, source: 'Place' }] : [])];
  const field = fields.find(item => item.text && words.some(word => normalized(item.text!).includes(word)));
  if (!field?.text) return { text: fallback };
  const text = field.text;
  const firstMatch = Math.min(...words.map(word => normalized(text).indexOf(word)).filter(index => index >= 0));
  const start = Math.max(0, firstMatch - 45);
  return { text: `${start ? '…' : ''}${text.slice(start, start + 200)}${text.length > start + 200 ? '…' : ''}`, source: field.source };
}
export function monthCells(month: Date): (string | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let day = 1; day <= length; day++) cells.push(localDateKey(new Date(month.getFullYear(), month.getMonth(), day)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function readableDreamDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
