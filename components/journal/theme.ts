import { useColorScheme } from '@/hooks/useColorScheme';

export const JournalColors = {
  light: { background: '#FAF8FF', surface: '#FFFFFF', elevated: '#F0EAFC', ink: '#2A2243', muted: '#756D88', accent: '#6950C5', accentSoft: '#EDE6FF', border: '#E9E3F3', success: '#447963', warning: '#986222', danger: '#B44461', hero: '#29213F', heroText: '#F5F0FF' },
  dark: { background: '#171323', surface: '#231D33', elevated: '#2C2540', ink: '#F5F0FF', muted: '#B1A5C6', accent: '#B9A4FF', accentSoft: '#352A50', border: '#3B304E', success: '#91CEB1', warning: '#E2B876', danger: '#F4A4BA', hero: '#2D2446', heroText: '#F5F0FF' },
};
export function useJournalColors() { return JournalColors[useColorScheme() ?? 'light']; }
