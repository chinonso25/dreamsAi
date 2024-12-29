// store/recordingStore.ts
import { create } from "zustand";

interface RecordingStore {
  currentRecordingUri: string | null;
  setRecordingUri: (uri: string) => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  currentRecordingUri: null,
  setRecordingUri: (uri) => set({ currentRecordingUri: uri }),
}));
