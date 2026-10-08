import { env as bindings } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach,describe,it,expect,vi } from 'vitest';
import worker from '../src/index';
import { createAuth } from '../src/auth';
import { cleanAudio,claimJob,ownedDream,saveDream } from '../src/database';
import { premiumEntitlement,entitlementIsActive,processDream } from '../src/processing';
import { dreamInput,validateAudio } from '../src/validation';
import type { Env } from '../src/types';
const env=bindings as unknown as Env;
const id='4a27632a-fc7a-4b79-b532-96b724193ade';
const input={title:'Ocean',transcript:'I dreamed of swimming in the sea.',original_text:'I dreamed of swimming in the sea.',dream_date:'2026-10-08',updated_at:'2026-10-08T10:00:00.000Z'};
function insightResponse(insight:unknown){return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(insight)}]}]});}
afterEach(()=>vi.restoreAllMocks());
async function request(path:string,method='GET',body?:unknown,cookie?:string,extraHeaders:Record<string,string>={}) {
 const ctx=createExecutionContext();const response=await worker.fetch(new Request(`https://api.thedreamer.app${path}`,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extraHeaders},body:body===undefined?undefined:JSON.stringify(body)}),env,ctx);await waitOnExecutionContext(ctx);return response;
}
async function guest(){const response=await request('/api/auth/sign-in/anonymous','POST',{});expect(response.status).toBe(200);const body=await response.json() as {user:{id:string}};const cookie=response.headers.get('set-cookie')!.split(';')[0];return {cookie,id:body.user.id};}
async function seed(owner='owner') {await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,0,?,?,1)').bind(owner,'Guest',`${owner}@example.invalid`,Date.now(),Date.now()).run();return saveDream(env,id,owner,dreamInput.parse(input));}
describe('secure journal API',()=>{
 it('creates an anonymous session without requiring an account',async()=>{const user=await guest();const response=await request('/v1/dreams','GET',undefined,user.cookie);expect(response.status).toBe(200);expect(await response.json()).toEqual({dreams:[]});});
 it('requires a session and rejects unrelated origins',async()=>{expect((await request('/v1/dreams')).status).toBe(401);expect((await request('/health','GET',undefined,undefined,{Origin:'https://attacker.example'})).status).toBe(403);});
 it('keeps saves idempotent and ignores forged owner/audio/status',async()=>{const user=await guest();for(let i=0;i<2;i++){expect((await request(`/v1/dreams/${id}`,'PUT',{...input,user_id:'victim',audio_key:'victim/audio',processing_status:'complete'},user.cookie)).status).toBe(200);}const row=await ownedDream(env,id,user.id);expect(row.user_id).toBe(user.id);expect(row.audio_key).toBeNull();expect(row.processing_status).toBe('idle');expect((await env.DB.prepare('SELECT count(*) as count FROM dreams').first<{count:number}>())?.count).toBe(1);});
 it('prevents reading, overwriting, processing or deleting another journal',async()=>{const first=await guest();const second=await guest();await request(`/v1/dreams/${id}`,'PUT',input,first.cookie);for(const [method,path,body] of [['GET',`/v1/dreams/${id}`,undefined],['PUT',`/v1/dreams/${id}`,input],['POST',`/v1/dreams/${id}/process`,{}],['DELETE',`/v1/dreams/${id}`,undefined]] as const){expect((await request(path,method,body,second.cookie)).status).toBe(404);}expect((await ownedDream(env,id,first.id)).transcript).toBe(input.transcript);});
 it('rejects invalid dream dates without losing the saved entry',async()=>{const user=await guest();expect((await request(`/v1/dreams/${id}`,'PUT',{...input,dream_date:'2026-02-30'},user.cookie)).status).toBe(400);expect(dreamInput.safeParse({...input,transcript:'x'.repeat(50001)}).success).toBe(false);});
 it('does not resurrect a deleted entry on a delayed save retry',async()=>{const user=await guest();await request(`/v1/dreams/${id}`,'PUT',input,user.cookie);expect((await request(`/v1/dreams/${id}`,'DELETE',undefined,user.cookie)).status).toBe(200);expect((await request(`/v1/dreams/${id}`,'PUT',input,user.cookie)).status).toBe(409);});
 it('allows only one inference lease and can reclaim an interrupted lease',async()=>{const row=await seed();expect(await claimJob(env,row,'owner','first')).toBe(true);expect(await claimJob(env,row,'owner','second')).toBe(false);await env.DB.prepare('UPDATE dreams SET lease_until=? WHERE id=?').bind(Date.now()-1,id).run();expect(await claimJob(env,row,'owner','restart')).toBe(true);});
 it('preserves the original text and reuses completed inference results',async()=>{await seed();const run=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>insightResponse({title:'The sea',summary:'Swimming in the sea.',tags:['water'],keywords:['sea'],mood:'neutral'}));const result=await processDream(env,id,'owner');expect(result.dream.processing_status).toBe('complete');expect(result.dream.original_text).toBe(input.original_text);await processDream(env,id,'owner');expect(run).toHaveBeenCalledTimes(1);});
 it('stores a clear error and restarts without charging a second preview',async()=>{await seed();vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(new Error('unavailable')).mockImplementation(async()=>insightResponse({title:'The sea',summary:'Swimming in the sea.',tags:[],keywords:[],mood:'neutral'}));expect((await processDream(env,id,'owner')).dream.processing_status).toBe('error');expect((await processDream(env,id,'owner')).dream.processing_status).toBe('complete');expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind('owner').first<{used:number}>())?.used).toBe(1);});

 it('preserves manual edits made during inference and keeps raw original capture',async()=>{
  await seed();let resolveAI:(output:Response)=>void=()=>{};
  const run=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{resolveAI=resolve;}));
  const processing=processDream(env,id,'owner');
  while(run.mock.calls.length===0)await new Promise(resolve=>setTimeout(resolve,1));
  const edited=await saveDream(env,id,'owner',dreamInput.parse({...input,title:'My chosen title',mood:'happy',updated_at:'2026-10-08T10:01:00.000Z'}));
  expect(edited.lease_token).toBeNull();
  resolveAI(insightResponse({title:'AI replacement',summary:'Swimming in the sea.',tags:[],keywords:[],mood:'neutral'}));
  expect((await processing).dream.title).toBe('My chosen title');expect((await ownedDream(env,id,'owner')).mood).toBe('happy');
  const changed=await saveDream(env,id,'owner',dreamInput.parse({...input,transcript:'My corrected transcript',original_text:'accidentally replaced',updated_at:'2026-10-08T10:02:00.000Z'}));
  expect(changed.original_text).toBe(input.original_text);expect(changed.transcript).toBe('My corrected transcript');
 });
 it('honours iOS grace periods and rejects expired or malformed entitlements',()=>{
  const now=Date.parse('2026-10-08T12:00:00Z');
  expect(entitlementIsActive({expires_date:null},now)).toBe(true);
  expect(entitlementIsActive({expires_date:'2026-10-01T12:00:00Z',grace_period_expires_date:'2026-10-09T12:00:00Z'},now)).toBe(true);
  expect(entitlementIsActive({expires_date:'2026-10-01T12:00:00Z'},now)).toBe(false);
  expect(entitlementIsActive({expires_date:'invalid'},now)).toBe(false);
 });
 it('rejects disguised files and allows actual audio containers',()=>{expect(()=>validateAudio(new TextEncoder().encode('<html>untrusted</html>'),'audio/mp4')).toThrow();expect(validateAudio(new Uint8Array([0,0,0,20,102,116,121,112,77,52,65,32]),'audio/mp4')).toBe('audio/mp4');});

 it('keeps audio private, attaches it to one entry and retries idempotently',async()=>{
  const user=await guest();const other=await guest();await request(`/v1/dreams/${id}`,'PUT',input,user.cookie);
  const bytes=new Uint8Array([0,0,0,20,102,116,121,112,77,52,65,32]);
  async function upload(){const ctx=createExecutionContext();const result=await worker.fetch(new Request(`https://api.thedreamer.app/v1/dreams/${id}/audio`,{method:'PUT',headers:{Cookie:user.cookie,'Content-Type':'audio/mp4'},body:bytes}),env,ctx);await waitOnExecutionContext(ctx);return result;}
  expect((await upload()).status).toBe(200);const first=await ownedDream(env,id,user.id);expect(first.audio_key).toContain(`dreams/${id}/`);
  expect((await upload()).status).toBe(200);expect((await ownedDream(env,id,user.id)).revision).toBe(first.revision);
  expect((await request(`/v1/dreams/${id}/audio`,'GET',undefined,other.cookie)).status).toBe(404);
  const audio=await request(`/v1/dreams/${id}/audio`,'GET',undefined,user.cookie);expect(audio.status).toBe(200);expect(new Uint8Array(await audio.arrayBuffer())).toEqual(bytes);
  const partial=await request(`/v1/dreams/${id}/audio`,'GET',undefined,user.cookie,{Range:'bytes=0-3'});expect(partial.status).toBe(206);expect(partial.headers.get('Content-Range')).toBe('bytes 0-3/12');expect(new Uint8Array(await partial.arrayBuffer())).toEqual(bytes.slice(0,4));
  for(const [value,start,end] of [['bytes=-4',8,12],['bytes=4-',4,12],['bytes=4-999',4,12]] as const){const result=await request(`/v1/dreams/${id}/audio`,'GET',undefined,user.cookie,{Range:value});expect(result.status).toBe(206);expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes.slice(start,end));}
  for(const value of ['bytes=999-','bytes=9-3','bytes=0-2,5-8','bytes=-','bytes=-0']){const result=await request(`/v1/dreams/${id}/audio`,'GET',undefined,user.cookie,{Range:value});expect(result.status).toBe(416);expect(result.headers.get('Content-Range')).toBe('bytes */12');}
  expect((await request(`/v1/dreams/${id}/audio`,'GET',undefined,user.cookie,{Range:'bytes=0-3','If-Range':'"different-object"'})).status).toBe(200);
  await request(`/v1/dreams/${id}`,'DELETE',undefined,user.cookie);expect(await env.AUDIO.head(first.audio_key!)).toBeNull();
 });

 it('reserves durable cleanup before uploading when D1 attachment fails',async()=>{
  const user=await guest();await request(`/v1/dreams/${id}`,'PUT',input,user.cookie);
  const bytes=new Uint8Array([0,0,0,20,102,116,121,112,77,52,65,32]);
  const failingDB={prepare:(sql:string)=>{
   if(sql.startsWith('UPDATE dreams SET audio_key='))return {bind:()=>({run:async()=>{throw new Error('simulated D1 outage');}})} as unknown as D1PreparedStatement;
   return env.DB.prepare(sql);
  },batch:env.DB.batch.bind(env.DB),exec:env.DB.exec.bind(env.DB)} as unknown as D1Database;
  const ctx=createExecutionContext();const result=await worker.fetch(new Request(`https://api.thedreamer.app/v1/dreams/${id}/audio`,{method:'PUT',headers:{Cookie:user.cookie,'Content-Type':'audio/mp4'},body:bytes}),{...env,DB:failingDB},ctx);await waitOnExecutionContext(ctx);
  expect(result.status).toBe(503);expect((await ownedDream(env,id,user.id)).audio_key).toBeNull();
  const pending=await env.DB.prepare('SELECT audio_key,not_before FROM audio_cleanup').first<{audio_key:string;not_before:number}>();expect(pending).not.toBeNull();expect(pending!.not_before).toBeGreaterThan(Date.now());expect(await env.AUDIO.head(pending!.audio_key)).not.toBeNull();
  await cleanAudio(env);expect(await env.AUDIO.head(pending!.audio_key)).not.toBeNull();
  await env.DB.prepare('UPDATE audio_cleanup SET not_before=0 WHERE audio_key=?').bind(pending!.audio_key).run();await cleanAudio(env);expect(await env.AUDIO.head(pending!.audio_key)).toBeNull();
 });
 it('ignores old client retries after server insights have completed',async()=>{
  await seed();vi.spyOn(globalThis,'fetch').mockImplementation(async()=>insightResponse({title:'The sea',summary:'Swimming in the sea.',tags:['water'],keywords:['sea'],mood:'curious'}));
  await processDream(env,id,'owner');
  const result=await saveDream(env,id,'owner',dreamInput.parse(input));expect(result.title).toBe('The sea');expect(JSON.parse(result.tags)).toEqual(['water']);expect(result.processing_status).toBe('complete');
 });
 it('deletes account sessions, entries and recording objects',async()=>{
  const user=await guest();await request(`/v1/dreams/${id}`,'PUT',input,user.cookie);
  const email=(await env.DB.prepare('SELECT email FROM "user" WHERE id=?').bind(user.id).first<{email:string}>())!.email;
  await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind('pending-owner',`sign-in-otp-${email}`,'hashed-code',Date.now()+300000,Date.now(),Date.now()).run();
  await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind('pending-other','sign-in-otp-other@example.com','hashed-code',Date.now()+300000,Date.now(),Date.now()).run();
  await env.DB.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?)').bind('paid-prior-guest',user.id,Date.now()).run();
  await env.AUDIO.put(`dreams/${id}/audio`,'recording');await env.DB.prepare('UPDATE dreams SET audio_key=? WHERE id=?').bind(`dreams/${id}/audio`,id).run();
  expect((await request('/v1/account','DELETE',undefined,user.cookie)).status).toBe(200);
  expect((await request('/v1/dreams','GET',undefined,user.cookie)).status).toBe(401);
  expect(await env.AUDIO.head(`dreams/${id}/audio`)).toBeNull();expect(await env.DB.prepare('SELECT * FROM dreams WHERE id=?').bind(id).first()).toBeNull();
  expect(await env.DB.prepare('SELECT id FROM verification WHERE id=?').bind('pending-owner').first()).toBeNull();expect(await env.DB.prepare('SELECT id FROM verification WHERE id=?').bind('pending-other').first()).not.toBeNull();
  expect(await env.DB.prepare('SELECT owner_id FROM billing_identities WHERE revenuecat_id=?').bind('paid-prior-guest').first()).toBeNull();
 });

 it('enforces the recovered billing identity limit atomically without moving journal data',async()=>{
  await seed('guest-owner');await env.DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt,isAnonymous) VALUES(?,?,?,1,?,?,0)').bind('registered-owner','Reader','reader@limit.example',Date.now(),Date.now()).run();
  for(let i=0;i<20;i++)await env.DB.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?)').bind(`old-${i}`,'registered-owner',Date.now()).run();
  await expect(env.DB.batch([
   env.DB.prepare('UPDATE dreams SET user_id=? WHERE user_id=?').bind('registered-owner','guest-owner'),
   env.DB.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?)').bind('guest-owner','registered-owner',Date.now())
  ])).rejects.toThrow('billing_identity_limit');
  expect((await ownedDream(env,id,'guest-owner')).user_id).toBe('guest-owner');
 });
 it('merges guest entries and quota after passwordless account linking',async()=>{const old=await guest();await request(`/v1/dreams/${id}`,'PUT',input,old.cookie);await env.DB.prepare('INSERT INTO ai_usage(user_id,used) VALUES(?,2)').bind(old.id).run();
 await env.DB.prepare('INSERT INTO billing_identities(revenuecat_id,owner_id,created_at) VALUES(?,?,?)').bind('earlier-verified-guest',old.id,Date.now()-1).run();await claimJob(env,await ownedDream(env,id,old.id),old.id,'old-processing-lease');
 const otpEnv={...env,EMAIL:{send:vi.fn().mockResolvedValue({messageId:'local'})}};const auth=createAuth(otpEnv);const headers=new Headers({Cookie:old.cookie});await auth.api.sendVerificationOTP({body:{email:'reader@example.com',type:'sign-in'},headers});const sent=vi.mocked(otpEnv.EMAIL.send).mock.calls[0][0].text;const otp=/\b\d{6}\b/.exec(sent)![0];const signed=await auth.api.signInEmailOTP({body:{email:'reader@example.com',otp},headers});expect(signed.user.id).not.toBe(old.id);
 const alias=await env.DB.prepare('SELECT owner_id FROM billing_identities WHERE revenuecat_id=?').bind(old.id).first<{owner_id:string}>();expect(alias?.owner_id).toBe(signed.user.id);
 expect((await env.DB.prepare('SELECT owner_id FROM billing_identities WHERE revenuecat_id=?').bind('earlier-verified-guest').first<{owner_id:string}>())?.owner_id).toBe(signed.user.id);
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async (url)=>Response.json({items:String(url).includes(encodeURIComponent(old.id))?[{entitlement_id:'paid',expires_at:null}]:[],next_page:null}));
 expect(await premiumEntitlement({...env,REVENUECAT_SECRET_KEY:'test-key',REVENUECAT_PROJECT_ID:'project',REVENUECAT_ENTITLEMENT_ID:'paid'},signed.user.id)).toBe(true);fetch.mockRestore();const recovered=await ownedDream(env,id,signed.user.id);expect(recovered.user_id).toBe(signed.user.id);expect(recovered.processing_status).toBe('error');expect(recovered.lease_token).toBeNull();expect(await claimJob(env,recovered,signed.user.id,'recovered-job')).toBe(true);expect((await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind(signed.user.id).first<{used:number}>())?.used).toBe(2);});
});
