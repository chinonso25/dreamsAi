import { DREAM_LIMITS } from '../../shared/dream-contract';
import { APIError, type Env } from './types';

function configuredLimit(value: string | undefined, fallback: number) {
  if (value===undefined) return fallback;
  const limit=Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit<1) throw new APIError(503,'STORAGE_NOT_CONFIGURED','Recording storage is temporarily unavailable. Your local recording is safe.');
  return limit;
}
export async function refineAudioSize(env: Env, key: string, bytes: number) {
  await env.DB.prepare('UPDATE audio_objects SET bytes=? WHERE audio_key=? AND bytes!=?').bind(bytes,key,bytes).run();
}

/** A conditional INSERT plus accounting triggers is one D1 write: concurrent
 * uploads cannot both pass a stale usage check. R2 cleanup releases the charge. */
export async function reserveAudio(env: Env, owner: string, key: string, bytes: number) {
  const ownerLimit=configuredLimit(env.MAX_AUDIO_BYTES_PER_OWNER,DREAM_LIMITS.maxAudioBytesPerOwner);
  const globalLimit=configuredLimit(env.MAX_AUDIO_BYTES_GLOBAL,DREAM_LIMITS.maxAudioBytesGlobal);
  const cleanupAt=Date.now()+600000;
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO audio_objects(audio_key,owner_id,bytes)
      SELECT ?,?,? WHERE COALESCE((SELECT bytes FROM audio_usage WHERE owner_id=?),0)+?<=?
      AND (SELECT bytes FROM audio_global_usage WHERE id=1)+?<=?
      AND NOT EXISTS(SELECT 1 FROM audio_cleanup WHERE audio_key=? AND cleanup_until>?)`).bind(key,owner,bytes,owner,bytes,ownerLimit,bytes,globalLimit,key,now),
    env.DB.prepare(`INSERT INTO audio_cleanup(audio_key,created_at,not_before)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM audio_objects WHERE audio_key=? AND owner_id=?)
      AND NOT EXISTS(SELECT 1 FROM audio_cleanup WHERE audio_key=? AND cleanup_until>?)
      ON CONFLICT(audio_key) DO UPDATE SET not_before=excluded.not_before,cleanup_token=NULL,cleanup_until=0
      WHERE audio_cleanup.cleanup_until<=?`).bind(key,now,cleanupAt,key,owner,key,now,now),
  ]);
  if(await env.DB.prepare('SELECT 1 FROM audio_cleanup WHERE audio_key=? AND cleanup_until>?').bind(key,Date.now()).first())throw new APIError(409,'STORAGE_BUSY','Recording cleanup is finishing. Keep your local recording and retry the upload shortly.');
  const reserved=await env.DB.prepare('SELECT owner_id,bytes FROM audio_objects WHERE audio_key=?').bind(key).first<{owner_id:string|null;bytes:number}>();
  if (!reserved || reserved.owner_id!==owner || reserved.bytes!==bytes) throw new APIError(413,'STORAGE_LIMIT','Recording storage is full. Delete recordings you no longer need, or keep this recording on your device.');
}
