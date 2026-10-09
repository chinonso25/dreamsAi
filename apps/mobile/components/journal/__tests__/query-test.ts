import { describe, it, expect } from '@jest/globals';
import { Journal, MoodEnum } from '@/types';
import { filterDreams, monthCells, dreamDateKey, localDateKey, dreamSections, journalThemes, dreamPreview } from '../query';
const dream = (id: string, patch: Partial<Journal> = {}): Journal => ({ id, user_id: 'guest', title: 'Flying above the ocean', transcript: 'A blue bird led me home.', dream_date: '2026-10-07', created_at: '2026-10-08T01:00:00Z', updated_at: '2026-10-08T01:00:00Z', sync_status: 'synced', processing_status: 'complete', ...patch });
describe('journal search and calendar', () => {
  it('searches across original words, summaries and tags with every query term', () => {
    const entries = [dream('1', { original_text: 'Remembered a lighthouse', summary: 'A peaceful voyage', tags: ['sea'], keywords: ['freedom'] }), dream('2', { title: 'Something else', transcript: 'Nothing here' })];
    expect(filterDreams(entries, { query: 'LIGHTHOUSE peaceful freedom sea' }).map(entry => entry.id)).toEqual(['1']);
    expect(filterDreams(entries, { query: 'lighthouse missing' })).toEqual([]);
  });
  it('combines favorite, mood, tag and actual dream date filters', () => {
    const entries = [dream('1', { is_starred: true, mood: MoodEnum.Curious, keywords: ['sea'] }), dream('2', { is_starred: false, mood: MoodEnum.Curious, keywords: ['sea'] }), dream('3', { is_starred: true, mood: MoodEnum.Happy, keywords: ['sea'] })];
    expect(filterDreams(entries, { favorites: true, mood: 'curious', tag: 'sea', date: '2026-10-07' }).map(entry => entry.id)).toEqual(['1']);
    expect(filterDreams(entries, { date: '2026-10-08' })).toEqual([]);
  });
  it('sorts by dream occurrence before capture timestamp and leaves input intact', () => {
    const entries = [dream('old', { dream_date: '2026-09-01', created_at: '2026-10-08T05:00:00Z' }), dream('new', { dream_date: '2026-10-07' }), dream('later', { dream_date: '2026-10-07', created_at: '2026-10-08T03:00:00Z' })];
    expect(filterDreams(entries, {}).map(entry => entry.id)).toEqual(['later', 'new', 'old']);
    expect(entries[0].id).toBe('old');
  });
  it('uses local dates without shifting backdated journal entries', () => {
    expect(localDateKey(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08');
    expect(dreamDateKey(dream('1', { dream_date: '2026-09-30' }))).toBe('2026-09-30');
  });
  it('builds a Monday-first complete grid for leap-year February and cross-year months', () => {
    const february = monthCells(new Date(2024, 1, 1));
    expect(february.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(february.filter(Boolean)).toHaveLength(29);
    expect(february.length % 7).toBe(0);
    expect(monthCells(new Date(2025, 11, 1))[0]).toBe('2025-12-01');
    expect(monthCells(new Date(2026, 0, 1))).toContain('2026-01-31');
  });
});

describe('focused discovery', () => {
  it('separates themes and transcripts while Everything finds mood, place and summaries', () => {
    const entry = dream('1', { tags: ['ocean'], original_text: 'A lighthouse appeared', summary: 'A peaceful voyage', location: 'Paris', mood: MoodEnum.Curious });
    expect(filterDreams([entry], { query: 'ocean', scope: 'themes' })).toHaveLength(1);
    expect(filterDreams([entry], { query: 'lighthouse', scope: 'themes' })).toEqual([]);
    expect(filterDreams([entry], { query: 'lighthouse', scope: 'transcripts' })).toHaveLength(1);
    expect(filterDreams([entry], { query: 'peaceful', scope: 'transcripts' })).toEqual([]);
    expect(filterDreams([entry], { query: 'paris curious peaceful' })).toHaveLength(1);
  });
  it('combines case insensitive themes with inclusive time bounds and ascending order', () => {
    const entries = [dream('early', { tags: ['Ocean'], dream_date: '2026-09-30' }), dream('first', { tags: ['ocean'], dream_date: '2026-10-01' }), dream('last', { keywords: ['OCEAN'], dream_date: '2026-10-08' }), dream('future', { tags: ['ocean'], dream_date: '2026-10-09' })];
    expect(filterDreams(entries, { tag: 'oCeAn', from: '2026-10-01', to: '2026-10-08', sort: 'oldest' }).map(entry => entry.id)).toEqual(['first', 'last']);
  });
  it('handles accented words and empty whitespace searches', () => {
    expect(filterDreams([dream('1', { transcript: 'I was at a café' })], { query: 'CAFE' })).toHaveLength(1);
    expect(filterDreams([dream('1')], { query: '   ' })).toHaveLength(1);
  });
});

it('groups dreams in timeline order and deduplicates theme casing within a dream', () => {
  const entries = [dream('1', { tags: ['Ocean', ' ocean '], keywords: ['OCEAN'] }), dream('2', { dream_date: '2026-09-30', tags: ['ocean'] })];
  expect(journalThemes(entries)).toEqual([{ name: 'Ocean', count: 2 }]);
  expect(dreamSections(entries).map(section => [section.title, section.data.length])).toEqual([['October 2026', 1], ['September 2026', 1]]);
});
it('reveals a match buried in the transcript instead of an unrelated summary', () => {
  const entry = dream('1', { transcript: 'A long walk. '.repeat(40) + 'The lighthouse was shining.', summary: 'A journey at night' });
  const preview = dreamPreview(entry, 'lighthouse', 'transcripts');
  expect(preview.source).toBe('Transcript');
  expect(preview.text).toContain('lighthouse');
  expect(preview.text.startsWith('…')).toBe(true);
  expect(dreamPreview(entry, '', 'all').text).toBe('A journey at night');
});

it('reuses search fields until an immutable journal edit replaces the entry', () => {
  const original = dream('cached', { transcript: 'café lighthouse' });
  expect(filterDreams([original], { query: 'CAFE' })).toHaveLength(1);
  expect(filterDreams([original], { query: 'lighthouse' })).toHaveLength(1);
  const edited = { ...original, transcript: 'mountain' };
  expect(filterDreams([edited], { query: 'lighthouse' })).toEqual([]);
  expect(filterDreams([edited], { query: 'mountain' })).toHaveLength(1);
});
it('does not read transcript fields for an empty search', () => {
  const entry = dream('empty');
  Object.defineProperty(entry, 'transcript', { get() { throw new Error('Unneeded text normalization'); } });
  expect(filterDreams([entry], { query: '   ' }).map(item => item.id)).toEqual(['empty']);
});
