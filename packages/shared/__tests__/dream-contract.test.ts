import { expect, it } from 'bun:test';
import { DREAM_LIMITS, MoodEnum, isManagedRecordingUri, parseDreamDTO, parseDreamSyncResponse, toSaveDreamInput, validateDreamInput } from '../dream-contract';
const dto = { id: 'dream-a', user_id: 'owner', transcript: 'A dream', dream_date: '2026-10-09', created_at: '2026-10-09T00:00:00Z', processing_status: 'idle' };
it('checks editable field boundaries without truncating text', () => {
  expect(() => validateDreamInput({ transcript: 'x'.repeat(DREAM_LIMITS.transcript), tags: Array(20).fill('a') })).not.toThrow();
  expect(() => validateDreamInput({ title: 'x'.repeat(201) })).toThrow('Title');
  expect(() => validateDreamInput({ tags: Array(21).fill('a') })).toThrow('20 themes');
  expect(() => validateDreamInput({ transcript: 'x'.repeat(50001) })).toThrow('Dream text');
  expect(() => validateDreamInput({ dream_date: '2026-02-30' })).toThrow('date');
  expect(() => validateDreamInput({ transcript: '\u0000'.repeat(50000), original_text: '\u0000'.repeat(50000) })).toThrow('too large');
});
it('validates responses and excludes unexpected internal server fields', () => {
  expect(parseDreamDTO({ ...dto, audio_key: null, error: null, lease_token: 'private', tags: null })).toEqual({ ...dto, audio_key: null, error: null });
  expect(() => parseDreamDTO({ ...dto, tags: [42] })).toThrow('themes');
  expect(() => parseDreamDTO({ ...dto, processing_status: 'unexpected' })).toThrow('unreadable');
  expect(() => parseDreamDTO({ ...dto, sync_version: -1 })).toThrow('revision');
});
it('serializes only writable public fields and makes unset mood explicit', () => {
  const entry = { ...parseDreamDTO(dto), sync_status: 'synced' as const, local_audio_uri: 'file:///private.m4a', last_error: 'offline', user_id: 'owner' };
  expect(toSaveDreamInput(entry)).toMatchObject({ transcript: 'A dream', mood: MoodEnum.Neutral });
  expect(toSaveDreamInput(entry)).not.toHaveProperty('local_audio_uri');
  expect(toSaveDreamInput(entry)).not.toHaveProperty('user_id');
  expect(toSaveDreamInput(entry)).not.toHaveProperty('sync_status');
});
it('validates ordered sync deletions and decimal cursors', () => {
  const changes = { dreams: [dto], deleted: [{ id: 'deleted', user_id: 'owner', deleted_at: '2026-10-09T01:00:00Z', sync_version: 2 }], next_cursor: null, sync_cursor: '2' };
  expect(parseDreamSyncResponse(changes).deleted[0].sync_version).toBe(2);
  expect(() => parseDreamSyncResponse({ ...changes, sync_cursor: 'oops' })).toThrow('cursor');
  expect(() => parseDreamSyncResponse({ ...changes, deleted: [{ ...changes.deleted[0], user_id: null }] })).toThrow('deletion');
});
it('rejects traversal, encoded names and arbitrary local files', () => {
  expect(isManagedRecordingUri('file:///documents/dreamer-recordings/a-b.m4a', 'file:///documents/')).toBe(true);
  for (const uri of ['file:///documents/dreamer-recordings/../database.m4a', 'file:///documents/dreamer-recordings/%2e%2e.m4a', 'file:///documents/database.m4a']) expect(isManagedRecordingUri(uri, 'file:///documents/')).toBe(false);
});
