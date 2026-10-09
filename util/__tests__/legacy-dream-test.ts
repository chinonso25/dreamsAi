import { expect, it, jest } from '@jest/globals';
import { legacyDreamInput } from '../legacy-dream';
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fresh-id' }));
jest.mock('../drafts', () => ({ localDreamDate: () => '2026-10-09' }));
it('imports only legacy text, title and date with a fresh identity', () => {
  const value = legacyDreamInput(JSON.stringify({ id: 'existing-entry', user_id: 'other-account', transcript: '  Remember this  ', title: 'Old preview', dream_date: '2026-10-01', local_audio_uri: 'file:///private.db', audio_key: 'someone-else', summary: 'Injected result', processing_status: 'complete', sync_status: 'synced' }));
  expect(value).toEqual({ id: 'fresh-id', transcript: 'Remember this', original_text: 'Remember this', title: 'Old preview', dream_date: '2026-10-01' });
});
it('preserves source text and rejects malformed imports or unsyncable fields', () => {
  expect(legacyDreamInput('{"transcript":"hello","dream_date":"bad"}').dream_date).toBe('2026-10-09');
  expect(() => legacyDreamInput('{"transcript":42}')).toThrow('no text');
  expect(() => legacyDreamInput(JSON.stringify({ transcript: 'x'.repeat(50001) }))).toThrow('Dream text');
});
