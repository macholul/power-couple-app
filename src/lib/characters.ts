import type { ImageSourcePropType } from 'react-native';

import type { Gender } from '@/lib/types/database';

/**
 * The characters people choose from, a few per gender. The app ships the
 * images; the database lists the same keys in private.characters with the one
 * gender that may use each, and refuses anything else. docs/characters.md
 * says what a new one needs.
 */
export interface Character {
  /** stored in profiles.avatar_character, and the start of its image names */
  key: string;
  /** what the picker reads out to VoiceOver */
  name: string;
  gender: Gender;
  images: {
    /** head and shoulders, drawn as the small round avatar */
    face: ImageSourcePropType;
    /** waving: the profile screen and the character picker */
    wave: ImageSourcePropType;
    /** the home screen's panels */
    cute: ImageSourcePropType;
    /** sulking over missed confirmations */
    mad: ImageSourcePropType;
  };
}

export const CHARACTERS: readonly Character[] = [
  {
    key: 'mae',
    name: 'mae',
    gender: 'female',
    images: {
      face: require('@/assets/chibis/mae-face.webp'),
      wave: require('@/assets/chibis/mae-wave.webp'),
      cute: require('@/assets/chibis/mae-cute.webp'),
      mad: require('@/assets/chibis/mae-mad.webp'),
    },
  },
  {
    key: 'baris',
    name: 'baris',
    gender: 'male',
    images: {
      face: require('@/assets/chibis/baris-face.webp'),
      wave: require('@/assets/chibis/baris-wave.webp'),
      cute: require('@/assets/chibis/baris-cute.webp'),
      mad: require('@/assets/chibis/baris-mad.webp'),
    },
  },
];

/** What a profile falls back to; the same as is_default in private.characters. */
export const DEFAULT_CHARACTER: Record<Gender, string> = { female: 'mae', male: 'baris' };

export const charactersFor = (gender: Gender): Character[] =>
  CHARACTERS.filter((character) => character.gender === gender);

/**
 * The character to draw: the stored one when this version of the app ships
 * it and it fits the gender, else the gender's default. A partner on a newer
 * version may have picked one this version doesn't have yet.
 */
export function characterFor(key: string | null | undefined, gender: Gender): Character {
  return (
    CHARACTERS.find((character) => character.key === key && character.gender === gender) ??
    CHARACTERS.find((character) => character.key === DEFAULT_CHARACTER[gender])!
  );
}

/** The gender a character belongs to, if this app ships it. */
export const genderOfCharacter = (key: string | null | undefined): Gender | null =>
  CHARACTERS.find((character) => character.key === key)?.gender ?? null;
