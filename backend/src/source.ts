import type { DreamRow } from './types';

export function processingText(row: DreamRow) {
  // Replacing a previously transcribed recording leaves original_text intact as
  // capture history, but must transcribe the replacement rather than analyse it.
  return row.transcript.trim() || (row.audio_key && row.transcript_audio_key===row.audio_key ? '' : row.original_text.trim());
}
export async function sourceFingerprint(row: DreamRow) {
  const text=processingText(row);
  const source=row.audio_key && (row.transcript_audio_key===row.audio_key || !text) ? `audio:${row.audio_key}` : `text:${text}`;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest)).map(value=>value.toString(16).padStart(2,'0')).join('');
}
