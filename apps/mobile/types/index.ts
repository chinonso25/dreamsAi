import type { LocalDream, MoodEnum } from '@thedreamer/shared/dream-contract';
export { MoodEnum } from '@thedreamer/shared/dream-contract';
export type { DreamDTO, LocalDream, SaveDreamInput, EditDreamPatch, SyncStatus, ProcessingStatus } from '@thedreamer/shared/dream-contract';
export enum PrivacyEnum { Public = 'public', Private = 'private', FriendsOnly = 'friends_only' }
/** Compatibility name used by journal UI. */
export type Journal = LocalDream;
export interface JournalResponse { title: string; transcript: string; tags: string[]; mood: MoodEnum; summary: string; keywords: string[] }
