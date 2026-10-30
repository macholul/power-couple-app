import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { usePush } from '@/lib/push';
import { FONT, NEUTRAL } from '@/constants/theme';

/** Set once "not now" is tapped, so the card never comes back on its own. */
const DISMISSED_KEY = 'push:nudge-dismissed';

/**
 * Asks for notifications in the app before iOS asks for them in its own
 * words, which is the difference between a question with a reason and a
 * system prompt out of nowhere. It can only ever be answered once: iOS asks
 * at most once per install, so a refusal here is a refusal for good — which
 * is why "not now" does not ask iOS anything, and account settings keeps the
 * offer open.
 */
export function PushNudge({ partnerName }: { partnerName: string }) {
  const { state, enable } = usePush();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(DISMISSED_KEY)
      .then((stored) => {
        if (active) setDismissed(stored === '1');
      })
      // storage that cannot be read is not a reason to pester someone
      .catch(() => active && setDismissed(true));
    return () => {
      active = false;
    };
  }, []);

  if (state !== 'undetermined' || dismissed !== false) return null;

  const notLater = () => {
    setDismissed(true);
    void AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {});
  };

  const ask = async () => {
    setAsking(true);
    await enable();
    setAsking(false);
    // Whatever iOS said, the question is now answered: granted hides this
    // card, and denied is remembered so it does not reappear.
    notLater();
  };

  return (
    <PopIn delay={0.12} style={styles.card}>
      <Text style={styles.title}>stay in the loop?</Text>
      <Text style={styles.body}>
        we&apos;ll let you know when {partnerName} finishes a goal, confirms one of yours, or sends
        you a note — and nudge you if your own are still open at the end of the day.
      </Text>
      <View style={styles.buttons}>
        <Press onPress={() => void ask()} disabled={asking} style={[styles.yes, asking && styles.dimmed]}>
          <Text style={styles.yesLabel}>{asking ? 'asking...' : 'yes, notify me'}</Text>
        </Press>
        <Press onPress={notLater} feel="soft" style={styles.no}>
          <Text style={styles.noLabel}>not now</Text>
        </Press>
      </View>
    </PopIn>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: NEUTRAL.cardBorder,
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  title: { fontFamily: FONT.semibold, fontSize: 16, color: NEUTRAL.ink },
  body: { fontFamily: FONT.medium, fontSize: 13, color: NEUTRAL.secondary, lineHeight: 19 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  yes: {
    backgroundColor: '#E5628E',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  yesLabel: { fontFamily: FONT.semibold, fontSize: 14, color: '#FFFFFF' },
  dimmed: { opacity: 0.5 },
  no: { paddingVertical: 11, paddingHorizontal: 12 },
  noLabel: { fontFamily: FONT.medium, fontSize: 14, color: NEUTRAL.muted },
});
