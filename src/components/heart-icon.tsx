import Svg, { Circle, G, Rect } from 'react-native-svg';

/**
 * The design's heart is a CSS trick: a square rotated -45deg with two circular
 * pseudo-elements forming the lobes. React Native has no ::before/::after, so
 * the same three shapes are drawn in SVG and rotated as a group.
 *
 * Geometry, in the unrotated frame (square 50x50 at the origin):
 *   square  (0,0)-(50,50)
 *   lobe A  circle centred (25, 0)  r 25   — CSS ::before, top:-50% left:0
 *   lobe B  circle centred (50, 25) r 25   — CSS ::after,  left:50% top:0
 * rotated -45deg about the square's centre (25,25), exactly as the CSS does.
 * The viewBox is the rotated bounding box, which is why it is not square.
 */
export function HeartIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size * 0.92} viewBox="-17.7 -17.7 85.4 78">
      <G rotation={-45} origin="25, 25">
        <Rect x={0} y={0} width={50} height={50} fill={color} />
        <Circle cx={25} cy={0} r={25} fill={color} />
        <Circle cx={50} cy={25} r={25} fill={color} />
      </G>
    </Svg>
  );
}
