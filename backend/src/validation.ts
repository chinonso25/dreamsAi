import { z } from 'zod';
import { DREAM_LIMITS, moods } from '../../shared/dream-contract';
import { APIError, type DreamRow } from './types';
export const UUID = z.uuid();
export { moods };
const shortList = z.array(z.string().trim().min(1).max(DREAM_LIMITS.listItem)).max(DREAM_LIMITS.listItems);
const timestamp=z.iso.datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value))).transform(value=>new Date(value).toISOString());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
});
export const dreamInput = z.object({
  id:UUID.optional(), title:z.string().trim().max(DREAM_LIMITS.title).default('Untitled dream'),
  transcript:z.string().max(DREAM_LIMITS.transcript).default(''), original_text:z.string().max(DREAM_LIMITS.transcript).optional(),
  summary:z.string().max(DREAM_LIMITS.summary).default(''), tags:shortList.default([]), keywords:shortList.default([]),
  mood:z.enum(moods).default('neutral'), dream_date:date,
  created_at:timestamp.optional(), updated_at:timestamp.optional(),
  is_starred:z.boolean().default(false), audio_length:z.number().finite().min(0).max(DREAM_LIMITS.audioSeconds).default(0),
  reflection:z.string().max(DREAM_LIMITS.summary).optional()
});
export const analysisOutput = z.object({
  title:z.string().trim().min(1).max(DREAM_LIMITS.title), summary:z.string().trim().min(1).max(DREAM_LIMITS.summary),
  tags:shortList, keywords:shortList, mood:z.enum(moods)
});
export function serializeDream(row:DreamRow) {
  const {lease_token:_token,lease_until:_until,revision:_revision,processed_revision:_processed,deleted_at:_deleted,source_version:_source,transcript_audio_key:_transcribed,...publicRow}=row;
  return {...publicRow,tags:JSON.parse(row.tags) as string[],keywords:JSON.parse(row.keywords) as string[],is_starred:Boolean(row.is_starred)};
}
export async function readBytes(request:Request,limit:number):Promise<Uint8Array> {
  const length=request.headers.get('content-length');
  if(length && (!/^\d+$/.test(length)||Number(length)>limit)) throw new APIError(413,'PAYLOAD_TOO_LARGE','This upload is too large.');
  if(!request.body) throw new APIError(400,'EMPTY_BODY','A request body is required.');
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[];let size=0;
  try { for(;;){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>limit){await reader.cancel();throw new APIError(413,'PAYLOAD_TOO_LARGE','This upload is too large.');}chunks.push(result.value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function readJSON(request:Request,limit=DREAM_LIMITS.requestBytes):Promise<unknown> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new APIError(415,'JSON_REQUIRED','Send JSON data.');
  try{return JSON.parse(new TextDecoder().decode(await readBytes(request,limit)));}catch(error){if(error instanceof APIError)throw error;throw new APIError(400,'INVALID_JSON','The request could not be read.');}
}
export function validateAudio(bytes:Uint8Array,contentType:string) {
  const header=new TextDecoder().decode(bytes.slice(0,12));
  const m4a=['audio/mp4','audio/m4a','audio/x-m4a'].includes(contentType)&&header.slice(4,8)==='ftyp';
  const wav=['audio/wav','audio/x-wav','audio/wave'].includes(contentType)&&header.startsWith('RIFF')&&header.slice(8,12)==='WAVE';
  const webm=contentType==='audio/webm'&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
  if(bytes.length<12 || !(m4a||wav||webm))throw new APIError(415,'INVALID_AUDIO','Upload an M4A, WAV, or WebM recording.');
  return m4a?'audio/mp4':wav?'audio/wav':'audio/webm';
}

export function audioRange(value:string,size:number):{offset:number;length:number} {
 const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
 const invalid=()=>new APIError(416,'INVALID_AUDIO_RANGE','This recording range cannot be read.',{'Content-Range':`bytes */${size}`});
 if(!match || (!match[1]&&!match[2]) || size<=0)throw invalid();
 const first=match[1]?Number(match[1]):null;const last=match[2]?Number(match[2]):null;
 if((first!==null&&!Number.isSafeInteger(first))||(last!==null&&!Number.isSafeInteger(last)))throw invalid();
 if(first===null){if(last===null||last<=0)throw invalid();const length=Math.min(last,size);return {offset:size-length,length};}
 if(first>=size || (last!==null&&last<first))throw invalid();
 const end=last===null?size-1:Math.min(last,size-1);return {offset:first,length:end-first+1};
}
