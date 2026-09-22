import { genderOfCharacter } from '@/lib/characters';
import type { Gender, Profile } from '@/lib/types/database';

type Person = { gender?: Gender | null; avatar_character?: Profile['avatar_character'] | null };

/**
 * A person's gender. Every profile stores one; the fallback is for sources
 * that may not, such as the auth metadata of an account made in the
 * dashboard. It reads the character the way the database does.
 */
export function genderOf(person: Person): Gender {
  if (person.gender === 'female' || person.gender === 'male') return person.gender;
  return genderOfCharacter(person.avatar_character) ?? 'female';
}

export const otherGender = (gender: Gender): Gender => (gender === 'male' ? 'female' : 'male');

export function possessive(gender: Gender): 'his' | 'her' {
  return gender === 'male' ? 'his' : 'her';
}

/**
 * The couple as the home screen lays it out, left to right: the woman first.
 * Two people of the same gender can only be a couple from before that was a
 * rule; they keep the viewer on the left.
 */
export function leftToRight<T extends Person>(viewer: T, partner: T): [T, T] {
  const viewerGender = genderOf(viewer);
  if (viewerGender === genderOf(partner) || viewerGender === 'female') return [viewer, partner];
  return [partner, viewer];
}
