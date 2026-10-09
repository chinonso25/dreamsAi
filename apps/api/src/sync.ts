import { DREAM_LIMITS } from '@thedreamer/shared/dream-contract';
import { APIError, type DreamRow, type Env } from './types';
import { serializeDream } from './validation';

function sequence(value: string | null, fallback: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new APIError(400,'INVALID_SYNC_CURSOR','The journal cursor is invalid. Refresh the journal and retry.');
  return Number(value);
}

/** Rows can change after the watermark: their new sequence then moves beyond this
 * page window and is delivered by the next completed refresh. No offset paging. */
export async function syncPage(env: Env, owner: string, query: URLSearchParams, includeDeleted = true) {
  const current = (await env.DB.prepare('SELECT value FROM journal_sync_clock WHERE id=1').first<{value:number}>())?.value ?? 0;
  const since = sequence(query.get('since'),0);
  const until = sequence(query.get('until'),current);
  const cursor = sequence(query.get('cursor'),since);
  const limit = sequence(query.get('limit'),DREAM_LIMITS.journalPageSize);
  if (limit<1 || limit>DREAM_LIMITS.journalPageSize || since>until || cursor<since || cursor>until || until>current) throw new APIError(400,'INVALID_SYNC_CURSOR','The journal cursor is invalid. Refresh the journal and retry.');
  const rows = await env.DB.prepare(`SELECT * FROM dreams WHERE user_id=? AND sync_version>? AND sync_version<=? ${includeDeleted?'':'AND deleted_at IS NULL'} ORDER BY sync_version LIMIT ?`).bind(owner,cursor,until,limit+1).all<DreamRow>();
  const page = rows.results.slice(0,limit);
  const next = rows.results.length>limit ? String(page[page.length-1].sync_version) : null;
  return {
    dreams:page.filter(row=>!row.deleted_at).map(serializeDream),
    ...(includeDeleted?{deleted:page.filter(row=>row.deleted_at).map(row=>({id:row.id,user_id:row.user_id,deleted_at:row.deleted_at!,sync_version:row.sync_version}))}:{}),
    next_cursor:next,
    sync_cursor:String(until),
  };
}
