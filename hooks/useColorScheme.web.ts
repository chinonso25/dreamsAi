import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** The SSR snapshot stays light until React completes client hydration. */
export function useColorScheme(): 'light' | 'dark' {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const colorScheme = useRNColorScheme();
  return hydrated && colorScheme === 'dark' ? 'dark' : 'light';
}
