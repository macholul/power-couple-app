import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { sendNote } from '@/lib/actions/notes';
import type { SideTheme } from '@/lib/theme';
import { FONT } from '@/constants/theme';

const NOTE_PRESETS = ['proud of you', 'you got this', 'almost there', 'date night?'];

/** Port of components/SendLove.tsx — styled in the PARTNER's theme. */
export function SendLove({
  partnerName,
  partnerPronoun,
  theme,
  onSent,
}: {
  partnerName: string;
  partnerPronoun: 'his' | 'her';
  theme: SideTheme;
  onSent: () => void;
}) {
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const send = (text: string) => {
    // optimistic: confirm immediately, roll back only if the send fails
    setSentMsg(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSentMsg(null), 2500);
    void sendNote(text).then((result) => {
      if (result.error) {
        setSentMsg(null);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
      onSent();
    });
  };

  return (
    <PopIn
      delay={0.24}
      style={[
        styles.card,
        { backgroundColor: theme.panel, borderColor: theme.panelBorder },
      ]}
    >
      <Text style={[styles.title, { color: theme.deep }]}>
        send {partnerName} some love
      </Text>
      <Text style={[styles.subtitle, { color: theme.mutedText }]}>
        a little boost lands on {partnerPronoun} home screen
      </Text>
      <View style={styles.presets}>
        {NOTE_PRESETS.map((text) => (
          <Press
            key={text}
            onPress={() => send(text)}
            style={[styles.preset, { borderColor: theme.accent }]}
          >
            <Text style={[styles.presetLabel, { color: theme.deep }]}>{text}</Text>
          </Press>
        ))}
      </View>
      {sentMsg && (
        <View style={styles.receipt}>
          <Text style={[styles.receiptLabel, { color: theme.deep }]}>
            &quot;{sentMsg}&quot; is on its way to {partnerName}
          </Text>
        </View>
      )}
    </PopIn>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 2, borderRadius: 24, padding: 16 },
  title: { fontFamily: FONT.semibold, fontSize: 16 },
  subtitle: { fontFamily: FONT.medium, fontSize: 12, marginTop: 2 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  preset: {
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  presetLabel: { fontFamily: FONT.semibold, fontSize: 13 },
  receipt: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  receiptLabel: { fontFamily: FONT.medium, fontSize: 13, textAlign: 'center' },
});
