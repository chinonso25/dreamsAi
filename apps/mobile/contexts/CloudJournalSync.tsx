import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { journalCloudQueryOptions, useJournalStore } from '@/util/journal';

// Keep one observer alive across navigation, including capture and dream detail.
// The query reconciles changes into the local journal; it never replaces drafts.
export function CloudJournalSync() {
  const { user, loading } = useAuth();
  const hydrated = useJournalStore(state => state.hydrated);
  const retired = useJournalStore(state => state.retiredOwners);
  useQuery({
    ...journalCloudQueryOptions(user?.id || ''),
    enabled: Boolean(user?.id && hydrated && !loading && !retired.includes(user.id)),
  });
  return null;
}
