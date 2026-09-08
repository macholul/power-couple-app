import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';

import type { StageGradient } from '@/lib/theme';

/**
 * Port of components/CharacterStage.tsx.
 *
 * The web's background was
 *   radial-gradient(circle at 50% Y%, inner 0%, outer 70%)
 * React Native has no CSS gradients, so it is drawn with an SVG
 * <RadialGradient> behind the character.
 *
 * Two details make it faithful rather than approximate:
 *
 *  - CSS `circle` with no explicit size means `farthest-corner`: the radius
 *    reaches the corner furthest from the centre. In objectBoundingBox units
 *    SVG would stretch that into an ellipse on a non-square box, so the stage
 *    measures itself and the gradient is drawn in user-space pixels.
 *  - `0%` and `70%` are colour-stop positions, not the radius. Past 70% the
 *    colour holds, which is SVG's default `pad` spread.
 */
export function CharacterStage({
  src,
  height,
  gradient,
  children,
}: {
  src: ImageSourcePropType;
  height: number;
  gradient: StageGradient;
  children?: ReactNode;
}) {
  const [width, setWidth] = useState(0);

  const centreX = width / 2;
  const centreY = height * gradient.centerY;
  // farthest corner from the centre
  const radius = Math.sqrt(
    centreX ** 2 + Math.max(centreY, height - centreY) ** 2,
  );

  return (
    <View
      style={[styles.stage, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <RadialGradient
              id="stage"
              gradientUnits="userSpaceOnUse"
              cx={centreX}
              cy={centreY}
              r={radius}
            >
              <Stop offset="0" stopColor={gradient.inner} />
              <Stop offset="0.7" stopColor={gradient.outer} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#stage)" />
        </Svg>
      )}
      <Image source={src} style={StyleSheet.absoluteFill} contentFit="contain" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { borderRadius: 20, overflow: 'hidden', position: 'relative' },
});
