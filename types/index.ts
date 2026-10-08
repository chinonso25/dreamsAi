export enum MoodEnum { Happy = 'happy', Anxious = 'anxious', Neutral = 'neutral', Excited = 'excited', Sad = 'sad', Curious = 'curious', Frustrated = 'frustrated' }
export enum PrivacyEnum { Public = 'public', Private = 'private', FriendsOnly = 'friends_only' }
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';
export type ProcessingStatus = 'idle' | 'pending' | 'processing' | 'complete' | 'error';
export interface Journal {
  id: string; user_id: string; title?: string; transcript: string; original_text?: string;
  dream_date: string; created_at: string; updated_at?: string;
  summary?: string; tags?: string[]; keywords?: string[]; mood?: MoodEnum;
  audio_key?: string; audio_url?: string; audio_length?: number; local_audio_uri?: string;
  is_starred?: boolean; sync_status: SyncStatus; processing_status: ProcessingStatus; last_error?: string;
  location?: string; privacy?: PrivacyEnum; images?: string[]; deleted_at?: string | null;
}
export interface JournalResponse { title: string; transcript: string; tags: string[]; mood: MoodEnum; summary: string; keywords: string[] }
