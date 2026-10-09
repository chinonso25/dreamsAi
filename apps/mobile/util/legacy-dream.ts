import * as Crypto from 'expo-crypto';
import { isDreamDate, validateDreamInput, type SaveDreamInput } from '@thedreamer/shared/dream-contract';
import { localDreamDate } from './drafts';

/** External preview links may import text only, never storage paths or entry identities. */
export function legacyDreamInput(encoded: string): SaveDreamInput {
  const raw: unknown = JSON.parse(encoded);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This old preview could not be read.');
  const value = raw as Record<string, unknown>;
  if (typeof value.transcript !== 'string' || !value.transcript.trim()) throw new Error('This old preview has no text. Return to capture to keep your dream.');
  const transcript = value.transcript.trim();
  const input: SaveDreamInput = { id: Crypto.randomUUID(), transcript, original_text: transcript, title: typeof value.title === 'string' ? value.title.trim() : transcript.slice(0, 80), dream_date: isDreamDate(value.dream_date) ? value.dream_date : localDreamDate() };
  validateDreamInput(input);
  return input;
}
