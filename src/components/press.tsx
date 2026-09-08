import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Port of globals.css's `.press` / `.press-soft` / `.press-hard`, which were
 * `:active { transform: scale(...) }` rules.
 *
 * React Native has no `:active`, but Pressable's style callback receives
 * `pressed`, which is the same signal. Doing it with a plain transform (rather
 * than an animation) keeps the web's instant, un-eased feel.
 */
const SCALES = { normal: 0.95, soft: 0.97, hard: 0.92 } as const;

export function Press({
  children,
  onPress,
  disabled,
  style,
  feel = 'normal',
  accessibilityLabel,
  hitSlop,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  feel?: keyof typeof SCALES;
  accessibilityLabel?: string;
  hitSlop?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        style,
        pressed && !disabled ? { transform: [{ scale: SCALES[feel] }] } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
