import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PopIn } from '@/components/pop-in';
import { Press } from '@/components/press';
import { dismissNote } from '@/lib/actions/notes';
import { FONT } from '@/constants/theme';

/** Port of components/NoteBubble.tsx — encouragement pinned to a stage. */
export function NoteBubble({
  noteId,
  text,
  border,
  color,
  shadow,
  onDismissed,
}: {
  noteId: string;
  text: string;
  border: string;
  color: string;
  shadow: string;
  onDismissed: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true); // optimistic: pop it off immediately
    void dismissNote(noteId).then(onDismissed);
  };

  return (
    <PopIn duration={400} style={styles.anchor}>
      <Press
        onPress={dismiss}
        accessibilityLabel={`Note: ${text}`}
        accessibilityHint="Dismisses the note"
        style={[
          styles.bubble,
          {
            borderColor: border,
            shadowColor: shadow,
          },
        ]}
      >
        <Text style={[styles.text, { color }]}>{text}</Text>
      </Press>
      {/* the two shrinking circles that make the speech tail; they hang below
          the bubble, which is why the anchor cannot clip its overflow */}
      <View style={[styles.tailLarge, { borderColor: border }]} />
      <View style={[styles.tailSmall, { borderColor: border }]} />
    </PopIn>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', top: 6, left: 6, right: 6, zIndex: 2 },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 10,
    // iOS shadow: the web's `0 4px 12px <shadow>` in its four RN parts
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  text: { fontFamily: FONT.medium, fontSize: 12, textAlign: 'center' },
  tailLarge: {
    position: 'absolute',
    bottom: -7,
    left: 24,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  tailSmall: {
    position: 'absolute',
    bottom: -15,
    left: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
});
