import { StyleSheet, Text, View } from 'react-native';

import { Press } from '@/components/press';
import { FONT, NEUTRAL } from '@/constants/theme';

/** The white pill with a chevron that heads the profile-style screens. */
export function BackChip({
  label,
  onPress,
  color = NEUTRAL.secondary,
  shadowColor = 'rgba(92,68,56,0.12)',
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  shadowColor?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? `Back to ${label}`}
      style={[styles.chip, { shadowColor }]}
    >
      <View style={[styles.arrow, { borderColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 5,
  },
  // the web's chevron: a square with two borders, rotated 45deg
  arrow: {
    width: 8,
    height: 8,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  label: { fontFamily: FONT.semibold, fontSize: 14 },
});
