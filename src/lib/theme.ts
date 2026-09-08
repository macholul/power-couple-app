import type { ImageSourcePropType } from 'react-native';

export type CharacterKey = 'mae' | 'baris';

/**
 * The web used CSS `radial-gradient(circle at 50% Y%, inner 0%, outer 70%)`
 * on the character stages. React Native has no CSS gradients, so the shape is
 * kept as data and drawn with react-native-svg's <RadialGradient> in step 7.
 * cx is always 50%, and the outer stop is always 70%.
 */
export interface StageGradient {
  inner: string;
  outer: string;
  /** vertical centre of the circle, as a fraction of the stage height */
  centerY: number;
}

export interface SideTheme {
  key: CharacterKey;
  panel: string;
  panelBorder: string;
  accent: string;
  deep: string;
  soft: string;
  chip: string;
  tintBg: string;
  mutedText: string;
  dashedBorder: string;
  stageGradient: StageGradient;
  profileStageGradient: StageGradient;
  shadowSoft: string;
  shadowBadge: string;
  // On the web these were URL strings under /chibis. Metro resolves images at
  // build time, so they are require()d module refs here instead.
  cutePoseImg: ImageSourcePropType;
  waveImg: ImageSourcePropType;
  madImg: ImageSourcePropType;
  faceImg: ImageSourcePropType;
}

export const THEMES: Record<CharacterKey, SideTheme> = {
  mae: {
    key: 'mae',
    panel: '#FFE3EE',
    panelBorder: '#FFC9DE',
    accent: '#E5628E',
    deep: '#C94A76',
    soft: '#F7B7CD',
    chip: '#FFD1E3',
    tintBg: '#FFF3F8',
    mutedText: '#D18AA5',
    dashedBorder: '#F0A9C4',
    stageGradient: { inner: '#FFD1E3', outer: '#FFE3EE', centerY: 0.8 },
    profileStageGradient: { inner: '#FFD1E3', outer: '#FFE3EE', centerY: 0.85 },
    shadowSoft: 'rgba(201,74,118,0.08)',
    shadowBadge: 'rgba(201,74,118,0.15)',
    cutePoseImg: require('@/assets/chibis/mae-cute.webp'),
    waveImg: require('@/assets/chibis/mae-wave.webp'),
    madImg: require('@/assets/chibis/mae-mad.webp'),
    faceImg: require('@/assets/chibis/mae-face.webp'),
  },
  baris: {
    key: 'baris',
    panel: '#E3EFFF',
    panelBorder: '#C9DFFF',
    accent: '#5B8AD6',
    deep: '#4A79C9',
    soft: '#A9C6F0',
    chip: '#C9DFFF',
    tintBg: '#F3F8FF',
    mutedText: '#8BA3C9',
    dashedBorder: '#A9C6F0',
    stageGradient: { inner: '#C9DFFF', outer: '#E3EFFF', centerY: 0.8 },
    profileStageGradient: { inner: '#C9DFFF', outer: '#E3EFFF', centerY: 0.85 },
    shadowSoft: 'rgba(74,121,201,0.08)',
    shadowBadge: 'rgba(74,121,201,0.15)',
    cutePoseImg: require('@/assets/chibis/baris-cute.webp'),
    waveImg: require('@/assets/chibis/baris-wave.webp'),
    madImg: require('@/assets/chibis/baris-mad.webp'),
    faceImg: require('@/assets/chibis/baris-face.webp'),
  },
};

export function themeFor(character: string | null | undefined): SideTheme {
  return character === 'baris' ? THEMES.baris : THEMES.mae;
}

export function otherCharacter(character: CharacterKey): CharacterKey {
  return character === 'mae' ? 'baris' : 'mae';
}

export { NEUTRAL, FONT } from '@/constants/theme';
