import { JournalResponse, MoodEnum } from '@/types';
import { requestDreamProcessing } from '@/util/journal';

/** Offline metadata. Saving never waits for AI. */
export function saveDreamWithoutAI(transcription: string, dreamDate = new Date()): JournalResponse {
  const transcript = transcription.trim();
  const firstLine = transcript.split(/[\n.!?]/).find(line => line.trim())?.trim();
  return {
    title: firstLine ? firstLine.slice(0, 80) : `Dream · ${dreamDate.toLocaleDateString()}`,
    transcript, tags: [], mood: MoodEnum.Neutral, summary: '', keywords: [],
  };
}
/** Processing only accepts an already saved entry; credentials stay on Cloudflare. */
export async function processDreamTranscription(dreamId: string) {
  return requestDreamProcessing(dreamId);
}
