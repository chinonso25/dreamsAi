import { Image, StyleSheet, Text, View } from 'react-native';
import { useJournalColors } from './journal/theme';

export function Brand({ centered = false }: { centered?: boolean }) {
  const c = useJournalColors();
  return <View style={[s.brand, centered && s.centered]}>
    <Image accessible={false} source={centered ? require('@/assets/images/app-icon/adaptive-icon.png') : require('@/assets/images/app-icon/icon.png')} style={[s.logo, centered && s.largeLogo]} />
    <View><Text style={[s.name, { color: c.ink }, centered && s.largeName]}>the dreamer</Text>
      <Text style={[s.caption, { color: c.muted }, centered && { textAlign: 'center' }]}>A little closer to your dreams.</Text></View>
  </View>;
}
const s = StyleSheet.create({ brand: { flexDirection: 'row', alignItems: 'center', gap: 11 }, centered: { flexDirection: 'column', gap: 22 }, logo: { width: 42, height: 42, borderRadius: 13 }, largeLogo: { width: 180, height: 180 }, name: { fontFamily: 'Outfit_600SemiBold', fontSize: 22, letterSpacing: -.7 }, largeName: { fontSize: 32, textAlign: 'center', marginBottom: 8 }, caption: { fontFamily: 'Outfit_400Regular', fontSize: 12, lineHeight: 18 } });
