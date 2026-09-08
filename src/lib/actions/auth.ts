import { supabase } from '@/lib/supabase';
import type { AvatarCharacter } from '@/lib/types/database';

export type AuthActionState = { error: string | null };

/** The device's IANA zone, or UTC if it reports something unusable. */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

export async function signIn(email: string, password: string): Promise<AuthActionState> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message.toLowerCase() };
  // No redirect: onAuthStateChange updates the session, the viewer reloads,
  // and the (auth) gate moves the user on by itself.
  return { error: null };
}

export async function signUp({
  name,
  email,
  password,
  character,
}: {
  name: string;
  email: string;
  password: string;
  character: AvatarCharacter;
}): Promise<AuthActionState> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'what should we call you?' };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: trimmed, avatar_character: character } },
  });
  if (error) return { error: error.message.toLowerCase() };

  if (data.user) {
    // The profile row is also healed on first load from this same metadata,
    // so a failure here is recoverable rather than fatal.
    await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: trimmed,
      avatar_character: character,
      timezone: deviceTimeZone(),
    });
  }

  return { error: null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
