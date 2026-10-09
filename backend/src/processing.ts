import { z } from 'zod';
import { APIError, type DreamRow, type Env } from './types';
import { serializeDream } from './validation';
import { claimJob, ownedDream, rateLimit } from './database';
import { analyseDream, assertOpenAIConfigured } from './openai';
import { assertTranscriptionConfigured, transcribeDream } from './transcription';
import { processingText, sourceFingerprint } from './source';
import { reportFailure } from './diagnostics';
export function entitlementIsActive(entitlement:{expires_date?:string|null;grace_period_expires_date?:string|null}|undefined,now=Date.now()) {
 if(!entitlement)return false;
 if(entitlement.expires_date===null)return true;
 const expiry=entitlement.expires_date?Date.parse(entitlement.expires_date):0;
 const grace=entitlement.grace_period_expires_date?Date.parse(entitlement.grace_period_expires_date):0;
 return expiry>now || grace>now;
}
const activeEntitlements = z.object({
 items:z.array(z.object({entitlement_id:z.string().min(1),expires_at:z.number().nullable().optional()})),
 next_page:z.string().nullable().optional()
});
function purchaseUnavailable(){return new APIError(503,'PURCHASE_CHECK_UNAVAILABLE','Your purchase could not be checked. Your dream is saved; please try again.');}
async function revenueCatRequest(url:string,key:string):Promise<Response> {
 const response=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'manual'}).catch(()=>{throw purchaseUnavailable();});
 if(response.status!==404&&!response.ok)throw purchaseUnavailable();
 return response;
}
async function premiumForIdentity(env:Env,owner:string):Promise<boolean> {
 if(!env.REVENUECAT_SECRET_KEY)return false;
 if(env.REVENUECAT_PROJECT_ID){
  if(!env.REVENUECAT_ENTITLEMENT_ID)throw purchaseUnavailable();
  const path=`/v2/projects/${encodeURIComponent(env.REVENUECAT_PROJECT_ID)}/customers/${encodeURIComponent(owner)}/active_entitlements`;
  let url=new URL(`https://api.revenuecat.com${path}?limit=100`);
  const seen=new Set<string>();
  for(let page=0;page<10;page++){
   if(seen.has(url.href))throw purchaseUnavailable();seen.add(url.href);
   const response=await revenueCatRequest(url.href,env.REVENUECAT_SECRET_KEY);
   if(response.status===404){if(page===0)return false;throw purchaseUnavailable();}
   const parsed=activeEntitlements.safeParse(await response.json().catch(()=>{throw purchaseUnavailable();}));
   if(!parsed.success)throw purchaseUnavailable();
   // This is RevenueCat's authoritative active list, including store grace-period access.
   // Do not reconstruct access from expires_at and accidentally remove a grace-period customer.
   if(parsed.data.items.some(item=>item.entitlement_id===env.REVENUECAT_ENTITLEMENT_ID))return true;
   if(!parsed.data.next_page)return false;
   let next:URL;try{next=new URL(parsed.data.next_page,'https://api.revenuecat.com');}catch{throw purchaseUnavailable();}
   // Never forward this read-only secret to a supplied host or a different customer endpoint.
   if(next.origin!=='https://api.revenuecat.com'||next.pathname!==path||next.username||next.password)throw purchaseUnavailable();
   url=next;
  }
  throw purchaseUnavailable();
 }
 const response=await revenueCatRequest(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(owner)}`,env.REVENUECAT_SECRET_KEY);
 if(response.status===404)return false;
 const body=await response.json().catch(()=>{throw purchaseUnavailable();}) as {subscriber?:{entitlements?:Record<string,{expires_date?:string|null;grace_period_expires_date?:string|null}>}};
 return entitlementIsActive(body.subscriber?.entitlements?.[env.REVENUECAT_ENTITLEMENT]);
}


export async function premiumEntitlement(env:Env,owner:string):Promise<boolean> {
 if(!env.REVENUECAT_SECRET_KEY)return false;
 // These identities are created only by a successful Better Auth anonymous-account link.
 // A request cannot supply an arbitrary RevenueCat ID or another owner's historical ID.
 const aliases=await env.DB.prepare('SELECT revenuecat_id FROM billing_identities WHERE owner_id=? ORDER BY created_at DESC LIMIT 20').bind(owner).all<{revenuecat_id:string}>();
 const ids=[owner,...aliases.results.map(alias=>alias.revenuecat_id)].filter((value,index,all)=>all.indexOf(value)===index);
 let unavailable=false;
 for(let offset=0;offset<ids.length;offset+=4){
  const results=await Promise.allSettled(ids.slice(offset,offset+4).map(identity=>premiumForIdentity(env,identity)));
  if(results.some(result=>result.status==='fulfilled' && result.value))return true;
  if(results.some(result=>result.status==='rejected'))unavailable=true;
 }
 if(unavailable)throw purchaseUnavailable();
 return false;
}

export async function processDream(env:Env,id:string,owner:string) {
 let row=await ownedDream(env,id,owner);
 if(row.processing_status==='complete' && row.processed_revision===row.revision)return {dream:serializeDream(row)};
 if(row.lease_until && row.lease_until>Date.now())return {dream:serializeDream(row)};
 if(!row.original_text.trim()&&!row.transcript.trim()&&!row.audio_key)throw new APIError(400,'EMPTY_DREAM','Add some text or a recording before processing.');
 assertOpenAIConfigured(env);
 if(!processingText(row)&&row.audio_key)assertTranscriptionConfigured(env);
 const premium=await premiumEntitlement(env,owner);
 const limit=Math.max(0,Math.min(10,Number(env.FREE_AI_LIMIT??'3')||0));
 // Retry identity follows the actual source, not a reusable entry UUID. A saved
 // transcription remains tied to its recording, so summary retries stay free.
 const sourceHash=await sourceFingerprint(row);
 const prior=await env.DB.prepare(`SELECT 1 FROM ai_reservations WHERE dream_id=? AND user_id=? AND charged=1
 AND (source_hash=? OR (source_hash='' AND legacy_source_version=?))`).bind(id,owner,sourceHash,row.source_version).first();
 if(!premium&&!prior){const usage=await env.DB.prepare('SELECT used FROM ai_usage WHERE user_id=?').bind(owner).first<{used:number}>();if((usage?.used??0)>=limit)throw new APIError(402,'PREMIUM_REQUIRED','Your free insights are used. Your journal remains available; unlock premium to add more insights.');}
 await rateLimit(env,`ai:${owner}`,10,3600);
 const token=crypto.randomUUID();if(!await claimJob(env,row,owner,token))return {dream:serializeDream(await ownedDream(env,id,owner))};
 try {
   if(prior)await env.DB.prepare(`UPDATE ai_reservations SET source_hash=?,legacy_source_version=NULL WHERE dream_id=? AND user_id=? AND source_hash='' AND legacy_source_version=?`).bind(sourceHash,id,owner,row.source_version).run();
   if(!premium&&!prior){
     await env.DB.prepare('INSERT OR IGNORE INTO ai_usage(user_id,used) VALUES(?,0)').bind(owner).run();
     // D1 serialises transactions; reserve the counter conditionally, then verify before inference.
     const reservation=await env.DB.batch([
       env.DB.prepare('INSERT OR IGNORE INTO ai_reservations(dream_id,user_id,source_hash) SELECT ?,?,? WHERE (SELECT used FROM ai_usage WHERE user_id=?)<?').bind(id,owner,sourceHash,owner,limit),
       env.DB.prepare('UPDATE ai_usage SET used=used+1 WHERE user_id=? AND EXISTS(SELECT 1 FROM ai_reservations WHERE dream_id=? AND user_id=? AND source_hash=? AND charged=0)').bind(owner,id,owner,sourceHash),
       env.DB.prepare('UPDATE ai_reservations SET charged=1 WHERE dream_id=? AND user_id=? AND source_hash=?').bind(id,owner,sourceHash)
     ]);
     if(reservation[0].meta.changes!==1)throw new APIError(402,'PREMIUM_REQUIRED','Your free insights are used. Your dream is saved.');
   }
   let transcript=processingText(row);
   if(!transcript && row.audio_key){
     const audio=await env.AUDIO.get(row.audio_key);if(!audio)throw new APIError(409,'AUDIO_MISSING','The recording has not finished uploading. Retry the upload first.');
     transcript=await transcribeDream(env,audio);
     const stored=await env.DB.prepare('UPDATE dreams SET transcript=?,original_text=CASE WHEN original_text=\'\' THEN ? ELSE original_text END,transcript_audio_key=audio_key WHERE id=? AND user_id=? AND lease_token=? AND revision=? AND deleted_at IS NULL').bind(transcript,transcript,id,owner,token,row.revision).run();
     // Ownership or source may have changed while transcription ran. Stop before
     // another billable operation when this job can no longer attach its result.
     if(stored.meta.changes===0)return {dream:serializeDream(await ownedDream(env,id,owner))};
   }
   const insight=await analyseDream(env,transcript);
   await env.DB.prepare(`UPDATE dreams SET title=?,summary=?,tags=?,keywords=?,mood=?,processing_status='complete',error=NULL,processed_revision=revision,lease_token=NULL,lease_until=NULL
   WHERE id=? AND user_id=? AND lease_token=? AND revision=? AND deleted_at IS NULL`)
   .bind(insight.title,insight.summary,JSON.stringify(insight.tags),JSON.stringify(insight.keywords),insight.mood,id,owner,token,row.revision).run();
 }catch(error){
   if(!(error instanceof APIError && error.status===402))reportFailure('dream_processing',error);
   const message=error instanceof APIError?error.message:'Processing was interrupted. Your dream is saved; restart processing.';
   await env.DB.prepare("UPDATE dreams SET processing_status='error',error=?,lease_token=NULL,lease_until=NULL WHERE id=? AND user_id=? AND lease_token=? AND deleted_at IS NULL").bind(message,id,owner,token).run();
   if(error instanceof APIError && error.status===402)throw error;
 }
 row=await ownedDream(env,id,owner);return {dream:serializeDream(row)};
}
