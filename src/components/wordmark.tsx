import { StyleSheet, Text, View } from 'react-native';

import { FONT } from '@/constants/theme';

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.power, { fontSize: size }]}>power</Text>
      <Text style={[styles.couple, { fontSize: size }]}>couple</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  power: { fontFamily: FONT.semibold, color: '#E5628E', letterSpacing: 0.5 },
  couple: { fontFamily: FONT.semibold, color: '#5B8AD6' },
});
