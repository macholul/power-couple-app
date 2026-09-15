import { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runSelfTests } from '@/lib/self-test';
import { FONT, NEUTRAL } from '@/constants/theme';

/**
 * Runs the ported pure logic on Hermes and reports every assertion.
 *
 * Kept as a real route (/self-test) rather than deleted: it is the fastest
 * way to find out whether an Expo SDK upgrade has changed Hermes' Intl
 * behaviour under the streak math. Development builds only.
 */
export default function SelfTestScreen() {
  // a development tool: release builds send anyone who finds the URL home
  if (!__DEV__) return <Redirect href="/" />;
  return <SelfTests />;
}

function SelfTests() {
  const results = useMemo(() => runSelfTests(), []);
  const failures = results.filter((r) => !r.pass);
  const groups = [...new Set(results.map((r) => r.group))];

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.wordmark}>
          <Text style={styles.power}>power</Text>
          <Text style={styles.couple}>couple</Text>
        </View>
        <Text style={styles.tagline}>pure logic on hermes</Text>

        <View style={[styles.card, failures.length === 0 ? styles.okCard : styles.badCard]}>
          <Text style={failures.length === 0 ? styles.bigPass : styles.bigFail}>
            {failures.length === 0
              ? `all ${results.length} assertions pass`
              : `${failures.length} of ${results.length} failed`}
          </Text>
        </View>

        {groups.map((group) => (
          <View key={group} style={styles.card}>
            <Text style={styles.groupLabel}>{group}</Text>
            {results
              .filter((r) => r.group === group)
              .map((r) => (
                <View key={r.name}>
                  <View style={styles.row}>
                    <Text style={styles.testName}>{r.name}</Text>
                    <Text style={r.pass ? styles.pass : styles.fail}>{r.pass ? '✓' : '✕'}</Text>
                  </View>
                  {!r.pass && (
                    <Text style={styles.diff}>
                      expected {r.expected} · got {r.actual}
                    </Text>
                  )}
                </View>
              ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NEUTRAL.bg },
  content: { padding: 16, gap: 10 },
  wordmark: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 4 },
  power: { fontFamily: FONT.semibold, fontSize: 26, color: '#E5628E', letterSpacing: 0.5 },
  couple: { fontFamily: FONT.semibold, fontSize: 26, color: '#5B8AD6' },
  tagline: {
    fontFamily: FONT.medium,
    fontSize: 13,
    color: NEUTRAL.muted,
    textAlign: 'center',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 20,
    padding: 14,
    gap: 4,
  },
  okCard: { borderColor: '#C9DFFF', backgroundColor: '#F3F8FF' },
  badCard: { borderColor: '#FFC9DE', backgroundColor: '#FFF3F8' },
  bigPass: { fontFamily: FONT.bold, fontSize: 16, color: '#4A79C9', textAlign: 'center' },
  bigFail: { fontFamily: FONT.bold, fontSize: 16, color: '#C94A76', textAlign: 'center' },
  groupLabel: { fontFamily: FONT.semibold, fontSize: 12, color: NEUTRAL.muted, marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  testName: { fontFamily: FONT.regular, fontSize: 13, color: NEUTRAL.ink, flex: 1, lineHeight: 19 },
  pass: { fontFamily: FONT.bold, fontSize: 14, color: '#5B8AD6' },
  fail: { fontFamily: FONT.bold, fontSize: 14, color: '#E5628E' },
  diff: { fontFamily: FONT.regular, fontSize: 11, color: '#C94A76', marginBottom: 4 },
});
