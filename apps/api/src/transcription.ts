import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { APIError, type Env } from './types';

export const TRANSCRIPTION_MODEL = '@cf/openai/whisper-large-v3-turbo';
const transcriptSchema = z.object({ text: z.string().trim().min(1).max(50000) });

export function assertTranscriptionConfigured(env: Env) {
  if (!env.AI) throw new APIError(503, 'AI_NOT_CONFIGURED', 'Dream processing is temporarily unavailable. Your dream is saved; try again later.');
}

export async function transcribeDream(env: Env, audio: R2ObjectBody) {
  assertTranscriptionConfigured(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 75000);
  try {
    // Encode the original private recording; no public R2 URL or provider key is needed.
    const encoded = Buffer.from(await audio.arrayBuffer()).toString('base64');
    const result = await env.AI.run(TRANSCRIPTION_MODEL, { audio: encoded, task: 'transcribe' }, { signal: controller.signal });
    const parsed = transcriptSchema.safeParse(result);
    if (!parsed.success) throw new APIError(422, 'TRANSCRIPTION_EMPTY', 'No speech could be understood. Keep the recording and add or retry the transcript.');
    return parsed.data.text;
  } catch (error) {
    if (controller.signal.aborted) throw new APIError(504, 'PROCESSING_TIMEOUT', 'Processing was interrupted. Your dream is saved; restart processing.');
    if (error instanceof APIError) throw error;
    // Provider error messages may include private content. Expose only our own safe error.
    throw new APIError(503, 'AI_UNAVAILABLE', 'Dream processing was interrupted. Your dream is saved; retry processing.');
  } finally {
    clearTimeout(timer);
  }
}
