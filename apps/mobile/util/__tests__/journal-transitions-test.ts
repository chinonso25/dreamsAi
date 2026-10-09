import { expect, it, jest } from '@jest/globals';
import { nextRevision } from '../journal-transitions';
it('recovers after correcting a clock that previously saved far-future revisions', () => {
  const now = Date.parse('2026-10-09T01:00:00.000Z'); const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try { expect(nextRevision('2036-01-01T00:00:00.000Z')).toBe(new Date(now).toISOString()); expect(nextRevision(new Date(now).toISOString())).toBe(new Date(now + 1).toISOString()); }
  finally { clock.mockRestore(); }
});
