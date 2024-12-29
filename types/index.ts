export interface Journal {
  id: number;
  user_id: number;
  title?: string;
  transcript: string;
  audio_url?: string;
  created_at: string; // ISO string
  updated_at?: string; // ISO string
  tags?: string[]; // Array of tag names
  mood?: MoodEnum;
  location?: string;
  privacy?: PrivacyEnum;
  images?: string[]; // Array of image URLs
  summary?: string;
  keywords?: string[]; // Array of keyword strings
  audio_length?: number; // Duration in seconds
  is_starred?: boolean;
  deleted_at?: string | null; // ISO string or null for soft deletion
}

export interface JournalResponse {
  title: string; // Title of the dream
  transcript: string; // Formatted punctuated transcription of what was said
  tags: string[]; // Related tags in the dream
  mood: MoodEnum; // Mood of the dream
  summary: string; // Summary of the dream
  keywords: string[]; // Keywords related to the dream
}

export enum MoodEnum {
  Happy = "happy",
  Anxious = "anxious",
  Neutral = "neutral",
  Excited = "excited",
  Sad = "sad",
  Curious = "curious",
  Frustrated = "frustrated",
}

export enum PrivacyEnum {
  Public = "public",
  Private = "private",
  FriendsOnly = "friends_only",
}
