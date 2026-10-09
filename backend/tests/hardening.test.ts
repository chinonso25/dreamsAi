import { env as bindings } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanAudio, deleteAccount, deleteDream, ownedDream, saveDream } from '../src/database';
import { dreamInput } from '../src/validation';
import { reserveAudio, refineAudioSize } from '../src/storage';
import { processDream } from '../src/processing';
import { syncPage } from '../src/sync';
import { createAuth } from '../src/auth';
import worker from '../src/index';
import type { Env } from '../src/types';

const env=bindings as unknown as Env;
const first='4a27632a-fc7a-4b79-b532-96b724193ade';
const second='4a27632a-fc7a-4b79-b532-96b724193adf';
const third='4a27632a-fc7a-4b79-b532-96b724193ad0';
const input={title:'Ocean',transcript:'I swam in the sea.',dream_date:'2026-10-08',updated_at:'2026-10-08T12:00:00.000Z'};
const insight={title:'Sea',summary:'You swam in the sea.',tags:[],keywords:[],mood:'neutral'};
const result=()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(insight)}]}]});
afterEach(()=>vi.restoreAllMocks());
async function user(owner='owner'){
  await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,0,?,?,1)').bind(owner,'Guest',`${owner}@example.invalid`,Date.now(),Date.now()).run();
  return owner;
}
async function seed(id=first,owner='owner'){return saveDream(env,id,owner,dreamInput.parse(input));}
const query=(value:string)=>new URLSearchParams(value);
const quotas=(owner=20,global=40)=>({...env,MAX_AUDIO_BYTES_PER_OWNER:String(owner),MAX_AUDIO_BYTES_GLOBAL:String(global)});
const ownerUsage=async(owner='owner')=>(await env.DB.prepare('SELECT bytes FROM audio_usage WHERE owner_id=?').bind(owner).first<{bytes:number}>())?.bytes??0;
const globalUsage=async()=>(await env.DB.prepare('SELECT bytes FROM audio_global_usage WHERE id=1').first<{bytes:number}>())!.bytes;

describe('source-specific previews',()=>{
  it('charges distinct source text, reuses identical-source retries, and blocks edited-entry quota bypass',async()=>{
    await user();await seed();const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>result());
    const limited={...env,FREE_AI_LIMIT:'1'};
    await processDream(limited,first,'owner');
    await saveDream(env,first,'owner',dreamInput.parse({...input,transcript:'A completely different dream.',updated_at:'2026-10-08T12:01:00.000Z'}));
    await expect(processDream(limited,first,'owner')).rejects.toMatchObject({code:'PREMIUM_REQUIRED'});
    expect(fetch).toHaveBeenCalledTimes(1);
    await saveDream(env,first,'owner',dreamInput.parse({...input,transcript:' I swam in the sea. ',updated_at:'2026-10-08T12:02:00.000Z'}));
    await processDream(limited,first,'owner');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first<{used:number}>())?.used).toBe(1);
  });
  it('charges concurrent different entries only up to the owner allowance',async()=>{
    await user();await seed();await seed(second);
    const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>result());
    const outcomes=await Promise.allSettled([processDream({...env,FREE_AI_LIMIT:'1'},first,'owner'),processDream({...env,FREE_AI_LIMIT:'1'},second,'owner')]);
    expect(outcomes.filter(item=>item.status==='fulfilled')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first<{used:number}>())?.used).toBe(1);
  });
  it('promotes migrated reservations only for their unchanged source version',async()=>{
    await user();await seed();
    await env.DB.prepare("INSERT INTO ai_reservations(dream_id,user_id,source_hash,legacy_source_version,charged) VALUES(?,?,'',1,1)").bind(first,'owner').run();
    await env.DB.prepare('INSERT INTO ai_usage(user_id,used) VALUES(?,1)').bind('owner').run();
    const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>result());
    await processDream({...env,FREE_AI_LIMIT:'1'},first,'owner');
    expect(await env.DB.prepare("SELECT 1 FROM ai_reservations WHERE source_hash='' AND dream_id=?").bind(first).first()).toBeNull();
    await saveDream(env,first,'owner',dreamInput.parse({...input,transcript:'Changed after migration.',updated_at:'2026-10-08T12:01:00.000Z'}));
    await expect(processDream({...env,FREE_AI_LIMIT:'1'},first,'owner')).rejects.toMatchObject({code:'PREMIUM_REQUIRED'});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects changed legacy sources before their reservation has been promoted',async()=>{
    await user();await seed();
    await env.DB.prepare("INSERT INTO ai_reservations(dream_id,user_id,source_hash,legacy_source_version,charged) VALUES(?,?,'',1,1)").bind(first,'owner').run();
    await env.DB.prepare('INSERT INTO ai_usage(user_id,used) VALUES(?,1)').bind('owner').run();
    await saveDream(env,first,'owner',dreamInput.parse({...input,transcript:'Changed before first migrated retry.',updated_at:'2026-10-08T12:01:00.000Z'}));
    await expect(processDream({...env,FREE_AI_LIMIT:'1'},first,'owner')).rejects.toMatchObject({code:'PREMIUM_REQUIRED'});
  });
  it('transcribes replacement audio and preserves the original capture without reusing the old transcript',async()=>{
    const auth=createAuth(env);const guest=await auth.api.signInAnonymous({asResponse:true});
    const owner=(await guest.json() as {user:{id:string}}).user.id;const cookie=guest.headers.get('set-cookie')!.split(';')[0];
    await saveDream(env,first,owner,dreamInput.parse({dream_date:'2026-10-08'}));
    const ai={run:vi.fn().mockResolvedValueOnce({text:'First voice dream.'}).mockResolvedValueOnce({text:'Second voice dream.'})};
    const processingEnv={...env,AI:ai as unknown as Ai};
    const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>result());
    async function upload(marker:number){
      const bytes=new Uint8Array([0,0,0,16,102,116,121,112,77,52,65,32,marker,0,0,0]);
      const ctx=createExecutionContext();const response=await worker.fetch(new Request(`https://api.thedreamer.app/v1/dreams/${first}/audio`,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'audio/mp4'},body:bytes}),processingEnv,ctx);await waitOnExecutionContext(ctx);expect(response.status).toBe(200);
    }
    await upload(1);await processDream(processingEnv,first,owner);
    await upload(2);const replaced=await ownedDream(env,first,owner);
    expect(replaced.original_text).toBe('First voice dream.');expect(replaced.transcript).toBe('');
    const complete=await processDream(processingEnv,first,owner);
    expect(complete.dream.original_text).toBe('First voice dream.');expect(complete.dream.transcript).toBe('Second voice dream.');
    expect(ai.run).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string).input[0].content).toContain('Second voice dream.');
    expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind(owner).first<{used:number}>())?.used).toBe(2);
  });
});

describe('atomic cumulative media budgets',()=>{
  it('allows only one concurrent owner reservation when both cannot fit',async()=>{
    await user();
    const outcomes=await Promise.allSettled([reserveAudio(quotas(),'owner','one',12),reserveAudio(quotas(),'owner','two',12)]);
    expect(outcomes.filter(item=>item.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter(item=>item.status==='rejected')).toHaveLength(1);
    expect(await ownerUsage()).toBe(12);expect(await globalUsage()).toBe(12);
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM audio_cleanup').first<{count:number}>())?.count).toBe(1);
  });
  it('enforces a global budget across different guest owners and keeps retries idempotent',async()=>{
    await user();await user('other');
    const limited=quotas(50,20);
    const outcomes=await Promise.allSettled([reserveAudio(limited,'owner','one',12),reserveAudio(limited,'other','two',12)]);
    expect(outcomes.filter(item=>item.status==='fulfilled')).toHaveLength(1);
    const stored=(await env.DB.prepare('SELECT audio_key,owner_id FROM audio_objects').first<{audio_key:string;owner_id:string}>())!;
    await reserveAudio(limited,stored.owner_id,stored.audio_key,12);
    expect(await globalUsage()).toBe(12);
    await expect(reserveAudio(limited,stored.owner_id==='owner'?'other':'owner',stored.audio_key,12)).rejects.toMatchObject({code:'STORAGE_LIMIT'});
  });
  it('holds orphan charges until durable cleanup can confirm R2 removal',async()=>{
    await user();await reserveAudio(quotas(),'owner','orphan',12);await env.AUDIO.put('orphan','twelve-bytes');
    await cleanAudio(env);expect(await ownerUsage()).toBe(12);
    await env.DB.prepare('UPDATE audio_cleanup SET not_before=0 WHERE audio_key=?').bind('orphan').run();
    const failure={...env,AUDIO:{...env.AUDIO,delete:async()=>{throw new Error('private provider detail');}} as unknown as R2Bucket};
    const report=vi.spyOn(console,'error').mockImplementation(()=>{});
    await cleanAudio(failure);expect(await globalUsage()).toBe(12);
    expect(report).toHaveBeenCalledWith('dreamer_failure',{operation:'audio_cleanup',category:'unexpected',status:503,code:'SERVICE_UNAVAILABLE'});
    expect(JSON.stringify(report.mock.calls)).not.toContain('private provider detail');
    await cleanAudio(env);expect(await globalUsage()).toBe(0);expect(await ownerUsage()).toBe(0);
  });
  it('retains account-deleted media in the global budget until R2 cleanup completes',async()=>{
    await user();await seed();await reserveAudio(quotas(),'owner','attached',12);await env.AUDIO.put('attached','recording');
    await env.DB.prepare('UPDATE dreams SET audio_key=? WHERE id=?').bind('attached',first).run();
    await env.DB.prepare('DELETE FROM audio_cleanup WHERE audio_key=?').bind('attached').run();
    await deleteAccount(env,'owner');
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id=?').bind('owner').first()).toBeNull();
    expect((await env.DB.prepare('SELECT owner_id FROM audio_objects WHERE audio_key=?').bind('attached').first<{owner_id:string|null}>())?.owner_id).toBeNull();
    expect(await globalUsage()).toBe(12);
    await cleanAudio(env);expect(await globalUsage()).toBe(0);expect(await env.AUDIO.head('attached')).toBeNull();
  });
  it('refines conservative existing sizes using authoritative object metadata',async()=>{
    await user();await reserveAudio(quotas(50,50),'owner','legacy',40);
    await refineAudioSize(env,'legacy',12);
    expect(await ownerUsage()).toBe(12);expect(await globalUsage()).toBe(12);
    await reserveAudio(quotas(24,24),'owner','new',12);
    expect(await ownerUsage()).toBe(24);expect(await globalUsage()).toBe(24);
  });
  it('moves existing audio and deletion tombstones during verified guest recovery without dropping over-quota data',async()=>{
    const authEnv={...env,EMAIL:{send:vi.fn().mockResolvedValue({messageId:'local'})}};
    const auth=createAuth(authEnv);
    const guest=await auth.api.signInAnonymous({asResponse:true});
    const body=await guest.json() as {user:{id:string}};
    const cookie=guest.headers.get('set-cookie')!.split(';')[0];
    await user('registered');
    await env.DB.prepare('UPDATE "user" SET email=?,emailVerified=1,isAnonymous=0 WHERE id=?').bind('recovered@example.com','registered').run();
    await seed(first,body.user.id);await seed(second,body.user.id);await deleteDream(env,second,body.user.id);
    await reserveAudio(quotas(),'registered','registered-audio',12);await reserveAudio(quotas(),body.user.id,'guest-audio',12);
    await env.DB.prepare('UPDATE dreams SET audio_key=? WHERE id=?').bind('guest-audio',first).run();
    await env.DB.prepare('DELETE FROM audio_cleanup').run();
    const before=(await env.DB.prepare('SELECT value FROM journal_sync_clock WHERE id=1').first<{value:number}>())!.value;
    const headers=new Headers({Cookie:cookie});
    await auth.api.sendVerificationOTP({body:{email:'recovered@example.com',type:'sign-in'},headers});
    const otp=/\b\d{6}\b/.exec(vi.mocked(authEnv.EMAIL.send).mock.calls[0][0].text)![0];
    await auth.api.signInEmailOTP({body:{email:'recovered@example.com',otp},headers});
    expect(await ownerUsage('registered')).toBe(24);expect(await globalUsage()).toBe(24);
    expect((await ownedDream(env,first,'registered')).audio_key).toBe('guest-audio');
    const page=await syncPage(env,'registered',query(`since=${before}`));
    expect(page.dreams.map(row=>row.id)).toEqual([first]);expect(page.deleted?.map(row=>row.id)).toEqual([second]);
    await expect(reserveAudio(quotas(),'registered','too-much',1)).rejects.toMatchObject({code:'STORAGE_LIMIT'});
  });
});

describe('canonical dates and incremental sync',()=>{
  it('compares offset timestamps chronologically and refuses future device timestamps',async()=>{
    await user();await seed();
    expect((await saveDream(env,first,'owner',dreamInput.parse({...input,title:'Older',updated_at:'2026-10-08T13:00:00.000+02:00'}))).title).toBe('Ocean');
    const newer=await saveDream(env,first,'owner',dreamInput.parse({...input,title:'Newer',updated_at:'2026-10-08T14:30:00.000+02:00'}));
    expect(newer.title).toBe('Newer');expect(newer.updated_at).toBe('2026-10-08T12:30:00.000Z');
    await expect(saveDream(env,first,'owner',dreamInput.parse({...input,updated_at:new Date(Date.now()+600000).toISOString()}))).rejects.toMatchObject({code:'FUTURE_TIMESTAMP'});
    expect((await ownedDream(env,first,'owner')).title).toBe('Newer');
  });
  it('uses a fixed watermark across pages and delivers later edits and remote deletion on the next refresh',async()=>{
    await user();await user('other');await seed();await seed(second);await seed(third,'other');
    const firstPage=await syncPage(env,'owner',query('limit=1'));
    expect(firstPage.dreams.map(row=>row.id)).toEqual([first]);expect(firstPage.next_cursor).not.toBeNull();
    await saveDream(env,second,'owner',dreamInput.parse({...input,title:'Changed between pages',updated_at:'2026-10-08T12:01:00.000Z'}));
    await deleteDream(env,first,'owner');
    const lastPage=await syncPage(env,'owner',query(`limit=1&cursor=${firstPage.next_cursor}&until=${firstPage.sync_cursor}`));
    expect(lastPage.dreams).toEqual([]);expect(lastPage.deleted).toEqual([]);expect(lastPage.next_cursor).toBeNull();
    expect(lastPage.sync_cursor).toBe(firstPage.sync_cursor);
    const delta=await syncPage(env,'owner',query(`since=${lastPage.sync_cursor}`));
    expect(delta.dreams.map(row=>row.id)).toEqual([second]);expect(delta.dreams[0].title).toBe('Changed between pages');
    expect(delta.deleted?.map(row=>row.id)).toEqual([first]);
    expect(delta.dreams.every(row=>row.user_id==='owner')).toBe(true);
  });
  it('includes server AI updates even though their client timestamp does not change',async()=>{
    await user();await seed();const initial=await syncPage(env,'owner',query(''));
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>result());await processDream(env,first,'owner');
    const delta=await syncPage(env,'owner',query(`since=${initial.sync_cursor}`));
    expect(delta.dreams).toHaveLength(1);expect(delta.dreams[0].processing_status).toBe('complete');
    expect(delta.dreams[0].updated_at).toBe(input.updated_at);
    expect(await syncPage(env,'owner',query(`since=${delta.sync_cursor}`))).toMatchObject({dreams:[],deleted:[],next_cursor:null});
  });
  it('rejects invalid, oversized, and forged future cursor windows',async()=>{
    await user();
    for(const value of ['since=-1','since=abc','since=9007199254740992','until=1','limit=101','limit=0','cursor=1'])await expect(syncPage(env,'owner',query(value))).rejects.toMatchObject({code:'INVALID_SYNC_CURSOR'});
  });
  it('bounds HTTP legacy and incremental listings and keeps pages explicitly traversable',async()=>{
    const auth=createAuth(env);const guest=await auth.api.signInAnonymous({asResponse:true});
    const owner=(await guest.json() as {user:{id:string}}).user.id;const cookie=guest.headers.get('set-cookie')!.split(';')[0];
    await seed(first,owner);await seed(second,owner);
    const request=async(path:string)=>{
      const ctx=createExecutionContext();const response=await worker.fetch(new Request(`https://api.thedreamer.app${path}`,{headers:{Cookie:cookie}}),env,ctx);await waitOnExecutionContext(ctx);return response.json() as Promise<{dreams:{id:string}[];next_cursor:string|null;sync_cursor:string}>;
    };
    const page=await request('/v1/dreams?limit=1');expect(page.dreams).toHaveLength(1);expect(page.next_cursor).not.toBeNull();
    const next=await request(`/v1/dreams?limit=1&cursor=${page.next_cursor}&until=${page.sync_cursor}`);
    expect(next.dreams.map(row=>row.id)).toEqual([second]);expect(next.next_cursor).toBeNull();
    expect((await request('/v1/dreams/sync?limit=1')).dreams).toHaveLength(1);
  });
});
