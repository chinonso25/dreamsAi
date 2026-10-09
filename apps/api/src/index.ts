import { createAuth } from './auth';
import { cleanAudio, deleteAccount, deleteDream, ownedDream, rateLimit, saveDream } from './database';
import { premiumEntitlement, processDream } from './processing';
import { APIError, type Env, type DreamRow } from './types';
import { audioRange, dreamInput, readBytes, readJSON, serializeDream, UUID, validateAudio } from './validation';
import { DREAM_LIMITS } from '@thedreamer/shared/dream-contract';
import { normalizeIP } from '@better-auth/core/utils/ip';
import { syncPage } from './sync';
import { refineAudioSize, reserveAudio } from './storage';
import { reportFailure } from './diagnostics';
function json(data:unknown,status=200,headers:HeadersInit={}){return Response.json(data,{status,headers});}
function secureResponse(response:Response,origin:string|null,env:Env) {
 const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Vary','Origin');
 if(origin && allowedOrigin(origin,env)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Credentials','true');headers.set('Access-Control-Expose-Headers','set-auth-token');}
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function allowedOrigin(origin:string,env:Env){return [env.AUTH_BASE_URL,...env.ALLOWED_ORIGINS.split(',').map(v=>v.trim()),'dreamai://'].includes(origin);}
export async function handleRequest(request:Request,env:Env,ctx:ExecutionContext) {
 const url=new URL(request.url);const origin=request.headers.get('origin');
 let operation='request';
 try {
   if(origin&&!allowedOrigin(origin,env))throw new APIError(403,'ORIGIN_DENIED','This request origin is not allowed.');
   if(request.method==='OPTIONS')return secureResponse(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET,PUT,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,Range,If-Range','Access-Control-Max-Age':'600'}}),origin,env);
   if(url.pathname==='/health'&&request.method==='GET')return secureResponse(json({ok:true,service:'thedreamer-api'}),origin,env);
   const ip=normalizeIP(request.headers.get('CF-Connecting-IP')??'local');
   // Hash network identifiers before storing abuse counters; never persist raw IPs in this table.
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${ip}`));
   const network=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
   await rateLimit(env,`ip:${network}`,180);
   const auth=createAuth(env);
   if(url.pathname.startsWith('/api/auth/')){
     operation='authentication';
     const authRequest=request.method==='POST'?new Request(request,{body:(await readBytes(request,10000)).slice().buffer}):request;
     return secureResponse(await auth.handler(authRequest),origin,env);
   }
   const session=await auth.api.getSession({headers:request.headers});
   if(!session)throw new APIError(401,'SESSION_REQUIRED','Reconnect your journal to continue.');
   const owner=session.user.id;await rateLimit(env,`user:${owner}`,120);
   operation='journal';
   let response:Response;
   if(url.pathname==='/v1/account'&&request.method==='DELETE'){
     await deleteAccount(env,owner);ctx.waitUntil(cleanAudio(env));response=json({deleted:true});
   }else if(url.pathname==='/v1/entitlement'&&request.method==='GET'){
     await rateLimit(env,`entitlement:${owner}`,12);
     response=json({premium:await premiumEntitlement(env,owner)});
   }else if(url.pathname==='/v1/dreams/sync'&&request.method==='GET'){
     response=json(await syncPage(env,owner,url.searchParams));
   }else if(url.pathname==='/v1/dreams'&&request.method==='GET'){
     response=json(await syncPage(env,owner,url.searchParams,false));
   }else {
     const match=/^\/v1\/dreams\/([^/]+)(?:\/(audio|process))?$/.exec(url.pathname);
     if(!match||!UUID.safeParse(match[1]).success)throw new APIError(404,'NOT_FOUND','This endpoint could not be found.');
     const [,id,action]=match;
     if(!action&&request.method==='GET')response=json({dream:serializeDream(await ownedDream(env,id,owner))});
     else if(!action&&request.method==='PUT'){
       const parsed=dreamInput.safeParse(await readJSON(request));if(!parsed.success)throw new APIError(400,'INVALID_DREAM','Check the dream date, text, and fields, then try again.');
       response=json({dream:serializeDream(await saveDream(env,id,owner,parsed.data))});
     }else if(!action&&request.method==='DELETE'){
       await deleteDream(env,id,owner);ctx.waitUntil(cleanAudio(env));response=json({deleted:true});
     }else if(action==='process'&&request.method==='POST'){
       // An expired lease or error is restartable. Live leases are returned, so retry taps cannot duplicate inference.
       await rateLimit(env,`ai-network:${network}`,24,3600);
       response=json(await processDream(env,id,owner));
     }else if(action==='audio'&&request.method==='PUT'){
       const row=await ownedDream(env,id,owner);
       if(row.lease_until && row.lease_until>Date.now())throw new APIError(409,'PROCESSING_BUSY','Wait for processing to finish before replacing this recording.');
       await rateLimit(env,`audio:${owner}`,20,3600);
       await rateLimit(env,`audio-network:${network}`,40,3600);
       const bytes=await readBytes(request,DREAM_LIMITS.audioBytes);const type=validateAudio(bytes,(request.headers.get('content-type')??'').split(';')[0]);
       const digest=await crypto.subtle.digest('SHA-256',bytes.slice().buffer);
       const sha=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
       const key=`dreams/${id}/${sha}`;
       const prior=await env.AUDIO.head(key);
       if(prior)await refineAudioSize(env,key,prior.size);
       if(row.audio_key===key && prior?.customMetadata?.sha256===sha)return secureResponse(json({audio_key:key}),origin,env);
       if(row.audio_key && row.audio_key!==key){const previous=await env.AUDIO.head(row.audio_key);if(previous)await refineAudioSize(env,row.audio_key,previous.size);}
       // Account for bytes and reserve durable cleanup atomically before R2 writes.
       await reserveAudio(env,owner,key,bytes.length);
       await env.AUDIO.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{dream_id:id,sha256:sha}});
       const updated=await env.DB.prepare(`UPDATE dreams SET audio_key=?,revision=revision+1,source_version=source_version+1,
       transcript=CASE WHEN transcript_audio_key IS NOT NULL THEN '' ELSE transcript END,
       transcript_audio_key=CASE WHEN transcript_audio_key IS NOT NULL OR (trim(transcript)='' AND trim(original_text)='') THEN ? ELSE NULL END,
       processing_status='idle',error=NULL,lease_token=NULL,lease_until=NULL
       WHERE id=? AND user_id=? AND deleted_at IS NULL AND (lease_until IS NULL OR lease_until<?) AND revision=?`).bind(key,key,id,owner,Date.now(),row.revision).run();
       if(updated.meta.changes===0){await env.DB.prepare('INSERT OR IGNORE INTO audio_cleanup(audio_key,created_at) VALUES(?,?)').bind(key,Date.now()).run();throw new APIError(409,'UPLOAD_INTERRUPTED','The recording could not be attached. Retry the upload.');}
       await env.DB.prepare('DELETE FROM audio_cleanup WHERE audio_key=?').bind(key).run();
       if(row.audio_key && row.audio_key!==key){await env.DB.prepare('INSERT OR IGNORE INTO audio_cleanup(audio_key,created_at) VALUES(?,?)').bind(row.audio_key,Date.now()).run();ctx.waitUntil(cleanAudio(env));}
       response=json({audio_key:key});
     }else if(action==='audio'&&request.method==='GET'){
       const row=await ownedDream(env,id,owner);if(!row.audio_key)throw new APIError(404,'AUDIO_NOT_FOUND','This dream has no recording.');
       const metadata=await env.AUDIO.head(row.audio_key);if(!metadata)throw new APIError(404,'AUDIO_NOT_FOUND','This recording could not be found.');
       await refineAudioSize(env,row.audio_key,metadata.size);
       const ifRange=request.headers.get('If-Range');
       const rangeMatches=!ifRange || ifRange===metadata.httpEtag || Date.parse(ifRange)>=Math.floor(metadata.uploaded.getTime()/1000)*1000;
       const range=request.headers.has('Range')&&rangeMatches?audioRange(request.headers.get('Range')!,metadata.size):undefined;
       const audio=await env.AUDIO.get(row.audio_key,range?{range}:undefined);if(!audio)throw new APIError(404,'AUDIO_NOT_FOUND','This recording could not be found.');
       const headers=new Headers();audio.writeHttpMetadata(headers);headers.set('ETag',audio.httpEtag);headers.set('Content-Disposition','inline');headers.set('Accept-Ranges','bytes');
       if(range){headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${metadata.size}`);headers.set('Content-Length',String(range.length));}
       else headers.set('Content-Length',String(audio.size));
       response=new Response(audio.body,{headers,status:range?206:200});
     }else throw new APIError(405,'METHOD_NOT_ALLOWED','This operation is not supported.');
   }
   return secureResponse(response,origin,env);
 }catch(error){
   if(!(error instanceof APIError) || error.status>=500)reportFailure(operation,error);
   const failure=error instanceof APIError?error:new APIError(503,'SERVICE_UNAVAILABLE','Your journal service is temporarily unavailable. Your local entries are safe; try again.');
   return secureResponse(json({error:{code:failure.code,message:failure.message}},failure.status,failure.headers),origin,env);
 }
}
export default {
 fetch:handleRequest,
 async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil((async()=>{try{
   await cleanAudio(env);
   await env.DB.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(Date.now()).run();
   await env.DB.prepare('DELETE FROM verification WHERE expiresAt<?').bind(Date.now()).run();
   await env.DB.prepare("UPDATE dreams SET processing_status='error',error='Processing was interrupted. Restart processing when you are ready.',lease_token=NULL,lease_until=NULL WHERE deleted_at IS NULL AND processing_status='processing' AND lease_until<?").bind(Date.now()).run();
 }catch(error){reportFailure('maintenance',error);throw error;}})());}
} satisfies ExportedHandler<Env>;
