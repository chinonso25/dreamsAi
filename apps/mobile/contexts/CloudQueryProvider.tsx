import { useEffect, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/util/query-client';

export function CloudQueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    onlineManager.setEventListener(setOnline => {
      let changed = false;
      const update = (state: Network.NetworkState) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      };
      const subscription = Network.addNetworkStateListener(state => { changed = true; update(state); });
      void Network.getNetworkStateAsync().then(state => { if (!changed) update(state); }).catch(() => {});
      return () => { changed = true; subscription.remove(); };
    });
    if (Platform.OS !== 'web') focusManager.setFocused(AppState.currentState === 'active');
    const subscription = Platform.OS === 'web' ? undefined : AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => {
      subscription?.remove();
      focusManager.setFocused(undefined);
      onlineManager.setEventListener(() => () => {});
    };
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
