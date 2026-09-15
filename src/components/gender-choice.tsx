import { StyleSheet, Text, View } from 'react-native';

import { HeartIcon } from '@/components/heart-icon';
import { Press } from '@/components/press';
import type { Gender } from '@/lib/types/database';
import { FONT, NEUTRAL } from '@/constants/theme';

const OPTIONS: { value: Gender; label: string; color: string; chip: string }[] = [
  { value: 'female', label: 'woman', color: '#E5628E', chip: '#FFD1E3' },
  { value: 'male', label: 'man', color: '#5B8AD6', chip: '#C9DFFF' },
];

/** "i'm a woman / i'm a man", in the pink and blue of the two characters. */
export function GenderChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: Gender | null;
  onChange: (next: Gender) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="I am a">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <Press
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            feel="soft"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            style={[
              styles.option,
              {
                borderColor: active ? option.color : NEUTRAL.cardBorder,
                backgroundColor: active ? option.chip : NEUTRAL.inputBg,
                opacity: disabled && !active ? 0.5 : 1,
              },
            ]}
          >
            <HeartIcon size={14} color={active ? option.color : '#E8D5C4'} />
            <Text style={[styles.label, { color: active ? option.color : NEUTRAL.muted }]}>
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 10,
  },
  label: { fontFamily: FONT.semibold, fontSize: 14 },
});
