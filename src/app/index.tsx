import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * Boot screen. Proves the scaffold is clean, Fredoka loads, and the Supabase
 * env vars reached the bundle. Replaced by the real routing shell later.
 */
export default function BootScreen() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.wordmark}>
        <Text style={styles.power}>power</Text>
        <Text style={styles.couple}>couple</Text>
      </View>
      <Text style={styles.tagline}>reach your goals, together</Text>

      <View style={styles.card}>
        <Text style={styles.label}>supabase url</Text>
        <Text style={styles.value}>{url ?? 'MISSING'}</Text>
        <Text style={styles.label}>anon key</Text>
        {/* never render the key itself — just prove it arrived */}
        <Text style={styles.value}>{key ? `loaded (${key.length} chars)` : 'MISSING'}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NEUTRAL.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 4,
  },
  wordmark: { flexDirection: 'row', alignItems: 'baseline' },
  power: { fontFamily: FONT.semibold, fontSize: 34, color: '#E5628E', letterSpacing: 0.5 },
  couple: { fontFamily: FONT.semibold, fontSize: 34, color: '#5B8AD6' },
  tagline: { fontFamily: FONT.medium, fontSize: 15, color: NEUTRAL.muted },
  card: {
    marginTop: 28,
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 24,
    padding: 18,
    gap: 2,
  },
  label: { fontFamily: FONT.semibold, fontSize: 12, color: NEUTRAL.muted, marginTop: 8 },
  value: { fontFamily: FONT.regular, fontSize: 13, color: NEUTRAL.ink },
});
