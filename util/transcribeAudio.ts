import { requestDreamProcessing } from '@/util/journal';

/** Compatibility entry point. Audio must be saved against an entry before processing. */
export async function transcribeAudio(dreamId: string): Promise<void> {
  if (dreamId.startsWith('file:')) throw new Error('Save this recording first, then retry transcription from its dream entry.');
  await requestDreamProcessing(dreamId);
}
