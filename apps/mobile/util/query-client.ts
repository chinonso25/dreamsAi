import { onlineManager, QueryClient } from '@tanstack/react-query';

export const accountQueryKey = (owner: string) => ['account', owner] as const;
export const journalQueryKey = (owner: string) => [...accountQueryKey(owner), 'journal'] as const;
export const entitlementQueryKey = (owner: string) => [...accountQueryKey(owner), 'entitlement'] as const;

export function retryCloudRead(attempt: number, error: unknown) {
  if (!onlineManager.isOnline() || attempt >= 2) return false;
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500;
  return error instanceof Error && /failed to fetch|network|connection|could not reach|timed out/i.test(error.message);
}

// Entries already have a durable local store. Keep transport state in memory
// rather than persisting a second copy of dreams or premium entitlements.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: retryCloudRead,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export async function clearAccountQueries(owner: string) {
  await queryClient.cancelQueries({ queryKey: accountQueryKey(owner) });
  queryClient.removeQueries({ queryKey: accountQueryKey(owner) });
}
