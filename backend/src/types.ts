export interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  AI: Ai;
  OPENAI_API_KEY?: string;
  EMAIL: { send(message: {to:string;from:string;subject:string;text:string}): Promise<unknown> };
  BETTER_AUTH_SECRET: string;
  AUTH_BASE_URL: string;
  ALLOWED_ORIGINS: string;
  EMAIL_FROM: string;
  REVENUECAT_SECRET_KEY?: string;
  REVENUECAT_ENTITLEMENT: string;
  REVENUECAT_PROJECT_ID?: string;
  REVENUECAT_ENTITLEMENT_ID?: string;
  FREE_AI_LIMIT?: string;
  MAX_AUDIO_BYTES_PER_OWNER?: string;
  MAX_AUDIO_BYTES_GLOBAL?: string;
}
export interface DreamRow {
  id:string; user_id:string; title:string; transcript:string; original_text:string;
  summary:string; tags:string; keywords:string; mood:string; dream_date:string;
  created_at:string; updated_at:string; is_starred:number; audio_key:string|null;
  audio_length:number; processing_status:string; error:string|null;
  revision:number; lease_token:string|null; lease_until:number|null; processed_revision:number|null;
  deleted_at:string|null;
  source_version:number; transcript_audio_key:string|null; sync_version:number;
}
export class APIError extends Error {
  constructor(public status:number, public code:string, message:string,public headers:HeadersInit={}){super(message);}
}
