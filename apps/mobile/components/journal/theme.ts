import { useColorScheme } from '@/hooks/useColorScheme';

export const JournalColors = {
  light: { background: '#F7F5FC', surface: '#FFFFFF', elevated: '#EDE7F8', ink: '#231A38', muted: '#625872', accent: '#6243BB', accentSoft: '#EDE6FF', border: '#DCD3EB', success: '#37664F', warning: '#8B581B', danger: '#A52C4B', hero: '#29213F', heroText: '#F5F0FF' },
  dark: { background: '#171323', surface: '#231D33', elevated: '#2C2540', ink: '#F5F0FF', muted: '#B1A5C6', accent: '#B9A4FF', accentSoft: '#352A50', border: '#3B304E', success: '#91CEB1', warning: '#E2B876', danger: '#F4A4BA', hero: '#2D2446', heroText: '#F5F0FF' },
};
export function useJournalColors() { return JournalColors[useColorScheme() ?? 'light']; }
