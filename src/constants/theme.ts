// Neutral (cream) tokens shared by both sides.
// Ported verbatim from the web app's lib/theme.ts. The pink/blue character
// themes land in step 3 alongside the rest of the pure logic.
export const NEUTRAL = {
  bg: '#FFF8F1',
  ink: '#5C4438',
  secondary: '#8A6A58',
  muted: '#B79B8A',
  placeholder: '#C9B4A6',
  cardBorder: '#FFE1CE',
  missed: '#F3E7DC',
  inputBg: '#FFFCF9',
  toggleTrack: '#FFF3EA',
} as const;

/**
 * React Native has no font synthesis: `fontWeight: 600` will NOT reach for a
 * semibold face the way CSS does. Every weight is its own registered family,
 * so the design's numeric weights map to family names here instead.
 */
export const FONT = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
} as const;
