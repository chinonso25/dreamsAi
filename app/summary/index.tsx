import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, useColorScheme } from 'react-native';
import { saveDream } from '@/util/journal';
import { Journal } from '@/types';

/** Compatibility for old text-summary links. New capture saves directly to its durable entry. */
export default function LegacySummaryScreen() {
  const { dreamData, id } = useLocalSearchParams<{ dreamData?: string; id?: string }>();
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const recover = useCallback(async () => {
    setError(null); setBusy(true);
    try {
      if (id) { router.replace({ pathname: '/Dream/[id]', params: { id } }); return; }
      if (!dreamData) { router.replace('/AddDream'); return; }
      const input = JSON.parse(dreamData) as Partial<Journal>;
      if (!input.transcript?.trim()) throw new Error('This old preview has no text. Return to capture to keep your dream.');
      // Preserve the old preview text, never attach an unrelated global recording.
      const dream = await saveDream({ ...input, id: typeof input.id === 'string' ? input.id : undefined, transcript: input.transcript, original_text: input.transcript });
      router.replace({ pathname: '/Dream/[id]', params: { id: String(dream.id) } });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not recover this preview. Please try again.'); }
    finally { setBusy(false); }
  }, [id, dreamData, router]);
  useEffect(() => { if (!started.current) { started.current = true; void recover(); } }, [recover]);
  return <View style={{ flex: 1, backgroundColor: dark ? '#161321' : '#F5F0FA', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 20 }}>
    {busy && <ActivityIndicator color="#8E6CD0" />}<Text style={{ color: dark ? '#F8F4FF' : '#302A45', fontFamily: 'Outfit_400Regular', textAlign: 'center', lineHeight: 23 }}>{error || 'Keeping your dream on this device…'}</Text>
    {error && <><Pressable accessibilityRole="button" onPress={recover} style={{ backgroundColor: '#8E6CD0', padding: 16, borderRadius: 18 }}><Text style={{ color: '#FFF' }}>Retry saving</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.replace('/AddDream')}><Text style={{ color: '#9A80CC' }}>Return to capture</Text></Pressable></>}
  </View>;
}
