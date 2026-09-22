import type { ImageSourcePropType } from 'react-native';

import { characterFor } from '@/lib/characters';
import { genderOf, otherGender } from '@/lib/people';
import type { Gender, Profile } from '@/lib/types/database';

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

/** A side's colours: pink for her, blue for him, whichever character each picked. */
export interface Palette {
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
}

/** One side of the couple: its colours, and its character's images. */
export interface SideTheme extends Palette {
  gender: Gender;
  // On the web these were URL strings under /chibis. Metro resolves images at
  // build time, so they are require()d module refs here instead.
  cutePoseImg: ImageSourcePropType;
  waveImg: ImageSourcePropType;
  madImg: ImageSourcePropType;
  faceImg: ImageSourcePropType;
}

export const PALETTES: Record<Gender, Palette> = {
  female: {
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
  },
  male: {
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
  },
};

/** One person's theme: their gender's colours and their character's images. */
export function sideTheme(gender: Gender, character: string | null | undefined): SideTheme {
  const { images } = characterFor(character, gender);
  return {
    ...PALETTES[gender],
    gender,
    cutePoseImg: images.cute,
    waveImg: images.wave,
    madImg: images.mad,
    faceImg: images.face,
  };
}

type Person = Pick<Profile, 'gender' | 'avatar_character'>;

/**
 * Both sides of a couple. Two people of the same gender can only be a couple
 * from before that was a rule; the partner then takes the other gender's
 * colours and default character, so the sides still look different, as they
 * did when a profile had only its character.
 */
export function coupleThemes(
  viewer: Person,
  partner: Person,
): { viewerTheme: SideTheme; partnerTheme: SideTheme } {
  const viewerGender = genderOf(viewer);
  const partnerGender = genderOf(partner);
  return {
    viewerTheme: sideTheme(viewerGender, viewer.avatar_character),
    partnerTheme:
      partnerGender === viewerGender
        ? sideTheme(otherGender(viewerGender), null)
        : sideTheme(partnerGender, partner.avatar_character),
  };
}

export { NEUTRAL, FONT } from '@/constants/theme';
