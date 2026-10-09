import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from './api';
import { getCurrentUser } from './auth-client';
import { entitlementQueryKey } from './query-client';

export function entitlementQueryOptions(owner: string) {
  return queryOptions({
    queryKey: entitlementQueryKey(owner),
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (getCurrentUser()?.id !== owner) throw new Error('Your account changed. Please try again.');
      const result = await apiRequest<{ premium: boolean }>('/v1/entitlement', { signal, expectedOwner: owner });
      if (signal.aborted || getCurrentUser()?.id !== owner) throw new Error('Your account changed. Please try again.');
      return { ownerId: owner, premium: result.premium === true };
    },
  });
}
