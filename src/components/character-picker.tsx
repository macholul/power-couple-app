import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { Press } from '@/components/press';
import { charactersFor } from '@/lib/characters';
import { PALETTES } from '@/lib/theme';
import type { Gender } from '@/lib/types/database';
import { NEUTRAL } from '@/constants/theme';

/** The characters for one gender as a row of faces, in that gender's colours. */
export function CharacterPicker({
  gender,
  value,
  onChange,
  disabled = false,
}: {
  gender: Gender;
  value: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const palette = PALETTES[gender];
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Character">
      {charactersFor(gender).map((character) => {
        const active = character.key === value;
        return (
          <Press
            key={character.key}
            onPress={() => onChange(character.key)}
            disabled={disabled}
            feel="soft"
            accessibilityLabel={character.name}
            accessibilityState={{ selected: active, disabled }}
            style={[
              styles.option,
              {
                borderColor: active ? palette.accent : NEUTRAL.cardBorder,
                backgroundColor: active ? palette.chip : NEUTRAL.inputBg,
                opacity: disabled && !active ? 0.5 : 1,
              },
            ]}
          >
            <Image source={character.images.face} style={styles.face} contentFit="cover" />
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  option: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    overflow: 'hidden',
  },
  face: { width: '100%', height: '100%' },
});
