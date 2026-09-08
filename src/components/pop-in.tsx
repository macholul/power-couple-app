import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * Port of the `.pop-in` class:
 *
 *   @keyframes popIn {
 *     from { opacity: 0; transform: translateY(10px) scale(0.97) }
 *     to   { opacity: 1; transform: none }
 *   }
 *   .pop-in { animation: popIn 0.5s ease both }
 *
 * `animation-delay` becomes the `delay` prop. One shared value drives all
 * three properties because they share a single timing curve, exactly as one
 * CSS animation would.
 */
export function PopIn({
  children,
  delay = 0,
  duration = 500,
  style,
}: {
  children: ReactNode;
  /** seconds, matching the web's `animationDelay` values */
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay * 1000,
      withTiming(1, { duration, easing: Easing.ease }),
    );
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: 10 * (1 - progress.value) },
      { scale: 0.97 + 0.03 * progress.value },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
