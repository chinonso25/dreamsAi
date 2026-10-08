import { useTabBarHeight } from '@/components/TabBar';
import { useWindowDimensions } from 'react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthProvider';
import { hydrateJournal, refreshDreams, useJournalStore } from '@/util/journal';
import { useRecordingPlayback } from '@/util/audio-playback';

export function useDreamJournal() {
  const { user } = useAuth();
  const allEntries = useJournalStore(state => state.entries);
  const entries = useMemo(() => allEntries.filter(entry => !entry.deleted_at && (entry.user_id === user?.id || entry.user_id === 'device')), [allEntries, user?.id]);
  const hydrated = useJournalStore(state => state.hydrated);
  const syncing = useJournalStore(state => state.syncing);
  const journalError = useJournalStore(state => state.error);
  const track = useRecordingPlayback(state => state.track);
  const insets = useSafeAreaInsets();
  const tabHeight = useTabBarHeight();
  const { fontScale } = useWindowDimensions();
  const [refreshError, setRefreshError] = useState('');
  const refresh = async () => {
    setRefreshError('');
    try { await hydrateJournal(); await refreshDreams(); }
    catch { setRefreshError('Your saved dreams are here. Pull down to try syncing again.'); }
  };
  return { entries, hydrated, syncing, error: refreshError || journalError, refresh, bottomSpace: insets.bottom + tabHeight + 36 + (track ? Math.max(90, 42 * fontScale + 32) : 0) };
}
