import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { HeartIcon } from '@/components/heart-icon';

interface HeartSpec {
  left?: DimensionValue;
  right?: DimensionValue;
  top?: DimensionValue;
  bottom?: DimensionValue;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
}

const LOGIN_HEARTS: HeartSpec[] = [
  { left: '10%', top: '8%', size: 18, color: '#F7B7CD', opacity: 0.8, duration: 4, delay: 0 },
  { right: '12%', top: '12%', size: 14, color: '#C9DFFF', opacity: 0.9, duration: 5, delay: 0.6 },
  { left: '22%', top: '20%', size: 10, color: '#E5628E', opacity: 0.5, duration: 6, delay: 1.2 },
  { right: '24%', top: '26%', size: 12, color: '#5B8AD6', opacity: 0.4, duration: 5.5, delay: 0.3 },
  { left: '8%', bottom: '22%', size: 14, color: '#C9DFFF', opacity: 0.8, duration: 4.5, delay: 0.9 },
  { right: '10%', bottom: '16%', size: 20, color: '#F7B7CD', opacity: 0.7, duration: 5, delay: 1.5 },
  { left: '14%', bottom: '4%', size: 10, color: '#5B8AD6', opacity: 0.35, duration: 6, delay: 0.4 },
  { right: '32%', bottom: '30%', size: 8, color: '#E5628E', opacity: 0.3, duration: 4, delay: 2 },
  { left: '45%', top: '5%', size: 12, color: '#F7B7CD', opacity: 0.6, duration: 5.2, delay: 0.8 },
  { left: '5%', top: '32%', size: 10, color: '#C9DFFF', opacity: 0.7, duration: 4.8, delay: 1.8 },
  { right: '6%', top: '40%', size: 9, color: '#E5628E', opacity: 0.45, duration: 5.6, delay: 0.2 },
  { right: '20%', bottom: '6%', size: 14, color: '#5B8AD6', opacity: 0.5, duration: 4.3, delay: 1.1 },
  { left: '38%', bottom: '13%', size: 8, color: '#F7B7CD', opacity: 0.55, duration: 5.9, delay: 0.5 },
];

const PAIRING_HEARTS: HeartSpec[] = [
  { left: '12%', top: '7%', size: 16, color: '#F7B7CD', opacity: 0.8, duration: 4.5, delay: 0 },
  { right: '14%', top: '11%', size: 12, color: '#C9DFFF', opacity: 0.9, duration: 5, delay: 0.7 },
  { left: '6%', bottom: '20%', size: 12, color: '#5B8AD6', opacity: 0.4, duration: 5.5, delay: 1 },
  { right: '8%', bottom: '14%', size: 18, color: '#E5628E', opacity: 0.5, duration: 4, delay: 1.4 },
];

/**
 * Port of the CSS `@keyframes bob` drift. The web animated `transform` with a
 * baked-in rotate(-45deg), because its hearts were rotated squares. These
 * hearts are already heart-shaped, so only the vertical drift carries over.
 */
function Heart({ spec }: { spec: HeartSpec }) {
  const offset = useSharedValue(0);

  useEffect(() => {
    const half = (spec.duration * 1000) / 2;
    offset.value = withDelay(
      spec.delay * 1000,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: half, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: half, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [offset, spec.duration, spec.delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.heart,
        {
          left: spec.left,
          right: spec.right,
          top: spec.top,
          bottom: spec.bottom,
          opacity: spec.opacity,
        },
        animatedStyle,
      ]}
    >
      <HeartIcon size={spec.size} color={spec.color} />
    </Animated.View>
  );
}

export function FloatingHearts({ variant }: { variant: 'login' | 'pairing' }) {
  const hearts = variant === 'login' ? LOGIN_HEARTS : PAIRING_HEARTS;
  return (
    <View style={styles.layer} pointerEvents="none">
      {hearts.map((spec, index) => (
        <Heart key={index} spec={spec} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heart: { position: 'absolute' },
});
