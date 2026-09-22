import { supabase } from '@/lib/supabase';
import { MAX_NAME_LENGTH } from '@/lib/actions/auth';
import { charactersFor, DEFAULT_CHARACTER } from '@/lib/characters';
import type { Gender } from '@/lib/types/database';

export type AccountActionState = { error: string | null };

export async function rename(userId: string, name: string): Promise<AccountActionState> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'what should we call you?' };
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { error: `names can be up to ${MAX_NAME_LENGTH} characters` };
  }
  const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId);
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

/**
 * Only while unpaired: the database refuses it during a couple, since
 * otherwise pairing first and changing afterwards would get around the
 * opposite-gender rule. Characters belong to one gender, so this switches to
 * the new gender's default; the database would do the same.
 */
export async function setGender(userId: string, gender: Gender): Promise<AccountActionState> {
  const { error } = await supabase
    .from('profiles')
    .update({ gender, avatar_character: DEFAULT_CHARACTER[gender] })
    .eq('id', userId);
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

/** One of the characters for the person's gender; the database refuses others. */
export async function setCharacter(
  userId: string,
  gender: Gender,
  character: string,
): Promise<AccountActionState> {
  if (!charactersFor(gender).some((candidate) => candidate.key === character)) {
    return { error: 'pick one of these characters' };
  }
  const { error } = await supabase.from('profiles').update({ avatar_character: character }).eq('id', userId);
  // the app offers a character its database row isn't there for yet
  if (error?.code === '23503') return { error: "that character isn't available yet" };
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

/**
 * Unpairs both partners. Nothing is deleted: the couple's history becomes
 * unreachable, and comes back if the same two people pair again.
 */
export async function endCouple(): Promise<AccountActionState> {
  const { error } = await supabase.rpc('end_couple');
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

/**
 * Deletes the account, its photos, and every couple it was part of, through
 * the delete-account Edge Function. The session is then dropped on this
 * device only: the user it belonged to no longer exists to sign out of.
 */
export async function deleteAccount(): Promise<AccountActionState> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) return { error: 'could not delete your account. try again, or contact us' };
  await supabase.auth.signOut({ scope: 'local' });
  return { error: null };
}
