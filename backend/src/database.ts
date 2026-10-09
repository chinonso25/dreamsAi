import { APIError, type DreamRow, type Env } from './types';
import { dreamInput } from './validation';
import type { z } from 'zod';
import { DREAM_LIMITS } from '../../shared/dream-contract';
import { reportFailure } from './diagnostics';
export async function ownedDream(env:Env,id:string,owner:string,includeDeleted=false):Promise<DreamRow> {
 const row=await env.DB.prepare(`SELECT * FROM dreams WHERE id=? AND user_id=? ${includeDeleted?'':'AND deleted_at IS NULL'}`).bind(id,owner).first<DreamRow>();
 if(!row)throw new APIError(404,'DREAM_NOT_FOUND','This dream could not be found.');return row;
}
export async function saveDream(env:Env,id:string,owner:string,input:z.infer<typeof dreamInput>) {
 if(input.id && input.id!==id)throw new APIError(400,'ID_MISMATCH','The entry identifier does not match.');
 const previous=await env.DB.prepare('SELECT * FROM dreams WHERE id=?').bind(id).first<DreamRow>();
 if(previous && previous.user_id!==owner)throw new APIError(404,'DREAM_NOT_FOUND','This dream could not be found.');
 if(previous?.deleted_at)throw new APIError(409,'DREAM_DELETED','This dream was deleted. Save a new entry instead.');
 const now=new Date().toISOString(); const modified=input.updated_at?new Date(input.updated_at).toISOString():now;
 const created=input.created_at?new Date(input.created_at).toISOString():now;
 if(Date.parse(modified)>Date.now()+300000 || (!previous && Date.parse(created)>Date.now()+300000))throw new APIError(400,'FUTURE_TIMESTAMP','Your device clock is ahead. Correct its date and time, then retry saving.');
 if(previous && modified<=previous.updated_at)return previous;
 const original=previous?.original_text.trim()?previous.original_text:(input.original_text??input.transcript);
 const sourceChanged=previous && (previous.original_text!==original || previous.transcript!==input.transcript);
 const sourceSQL='dreams.original_text!=excluded.original_text OR dreams.transcript!=excluded.transcript';
 const analysisSQL=`${sourceSQL} OR dreams.title!=excluded.title OR dreams.summary!=excluded.summary OR dreams.tags!=excluded.tags OR dreams.keywords!=excluded.keywords OR dreams.mood!=excluded.mood`;
 // The conflict update deliberately never changes owner, audio pointer, or server processing fields.
 await env.DB.prepare(`INSERT INTO dreams(id,user_id,title,transcript,original_text,summary,tags,keywords,mood,dream_date,created_at,updated_at,is_starred,audio_length,reflection)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
 WHERE EXISTS(SELECT 1 FROM dreams WHERE id=?) OR (SELECT COUNT(*) FROM dreams WHERE user_id=? AND deleted_at IS NULL)<?
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,transcript=excluded.transcript,original_text=excluded.original_text,
 summary=excluded.summary,tags=excluded.tags,keywords=excluded.keywords,mood=excluded.mood,dream_date=excluded.dream_date,
 updated_at=excluded.updated_at,is_starred=excluded.is_starred,audio_length=excluded.audio_length,reflection=excluded.reflection,
 revision=CASE WHEN ${analysisSQL} THEN dreams.revision+1 ELSE dreams.revision END,
 source_version=CASE WHEN ${sourceSQL} THEN dreams.source_version+1 ELSE dreams.source_version END,
 transcript_audio_key=CASE WHEN trim(dreams.transcript)!=trim(excluded.transcript) THEN NULL ELSE dreams.transcript_audio_key END,
 processed_revision=CASE WHEN NOT(${sourceSQL}) AND (${analysisSQL}) AND dreams.processing_status='complete' THEN dreams.revision+1 ELSE dreams.processed_revision END,
 processing_status=CASE WHEN (${sourceSQL}) OR ((${analysisSQL}) AND dreams.processing_status='processing') THEN 'idle' ELSE dreams.processing_status END,
 lease_token=CASE WHEN ${analysisSQL} THEN NULL ELSE dreams.lease_token END,
 lease_until=CASE WHEN ${analysisSQL} THEN NULL ELSE dreams.lease_until END,
 error=CASE WHEN (${sourceSQL}) OR ((${analysisSQL}) AND dreams.processing_status='processing') THEN NULL ELSE dreams.error END
 WHERE dreams.user_id=excluded.user_id AND dreams.deleted_at IS NULL AND excluded.updated_at>dreams.updated_at`)
 .bind(id,owner,input.title,input.transcript,original,
 sourceChanged?'':(input.summary||previous?.summary||''),JSON.stringify(input.tags),JSON.stringify(input.keywords),input.mood,input.dream_date,
 previous?.created_at??created,modified,Number(input.is_starred),input.audio_length,input.reflection??'',id,owner,DREAM_LIMITS.maxDreamsPerOwner).run();
 if(!previous && !await env.DB.prepare('SELECT 1 FROM dreams WHERE id=?').bind(id).first())throw new APIError(413,'JOURNAL_LIMIT','This journal has reached its entry limit. Export and remove entries you no longer need.');
 return ownedDream(env,id,owner);
}
export async function rateLimit(env:Env,key:string,max:number,seconds=60) {
 const now=Date.now();const window=Math.floor(now/(seconds*1000));
 const result=await env.DB.prepare(`INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(`${key}:${window}`,(window+1)*seconds*1000).first<{count:number}>();
 if(!result || result.count>max)throw new APIError(429,'RATE_LIMITED','Please wait a moment and try again.');
}
export async function claimJob(env:Env,row:DreamRow,owner:string,token:string) {
 const result=await env.DB.prepare(`UPDATE dreams SET processing_status='processing',error=NULL,lease_token=?,lease_until=?
 WHERE id=? AND user_id=? AND deleted_at IS NULL AND revision=? AND (lease_until IS NULL OR lease_until<?)
 AND NOT(processing_status='complete' AND processed_revision=revision)`)
 .bind(token,Date.now()+180000,row.id,owner,row.revision,Date.now()).run();
 // D1 counts sync-clock trigger writes too; zero still means no row was claimed.
 return result.meta.changes>0;
}
export async function cleanAudio(env:Env) {
 const entries=await env.DB.prepare('SELECT audio_key FROM audio_cleanup WHERE not_before<=? LIMIT 100').bind(Date.now()).all<{audio_key:string}>();
 for(const entry of entries.results){try{
 const active=await env.DB.prepare('SELECT 1 FROM dreams WHERE audio_key=? AND deleted_at IS NULL').bind(entry.audio_key).first();
 if(active){await env.DB.prepare('DELETE FROM audio_cleanup WHERE audio_key=?').bind(entry.audio_key).run();continue;}
 await env.AUDIO.delete(entry.audio_key);await env.DB.batch([
 env.DB.prepare('DELETE FROM audio_objects WHERE audio_key=?').bind(entry.audio_key),
 env.DB.prepare('DELETE FROM audio_cleanup WHERE audio_key=?').bind(entry.audio_key)
 ]);}catch(error){reportFailure('audio_cleanup',error);/* Keep the charge and cleanup record until removal succeeds. */}}
}
export async function deleteDream(env:Env,id:string,owner:string) {
 const row=await ownedDream(env,id,owner,true);if(row.deleted_at)return;
 await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO audio_cleanup(audio_key,created_at) SELECT audio_key,? FROM dreams WHERE id=? AND user_id=? AND audio_key IS NOT NULL').bind(Date.now(),id,owner),
 env.DB.prepare("UPDATE dreams SET deleted_at=?,title='',transcript='',original_text='',summary='',tags='[]',keywords='[]',reflection='',audio_key=NULL,processing_status='idle',lease_token=NULL,lease_until=NULL,error=NULL WHERE id=? AND user_id=?").bind(new Date().toISOString(),id,owner)
 ]);
}
export async function deleteAccount(env:Env,owner:string) {
 await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO audio_cleanup(audio_key,created_at) SELECT audio_key,? FROM dreams WHERE user_id=? AND audio_key IS NOT NULL').bind(Date.now(),owner),
 env.DB.prepare(`DELETE FROM verification WHERE identifier IN (SELECT 'sign-in-otp-'||email FROM "user" WHERE id=?)`).bind(owner),
 env.DB.prepare('DELETE FROM "user" WHERE id=?').bind(owner)
 ]);
}
