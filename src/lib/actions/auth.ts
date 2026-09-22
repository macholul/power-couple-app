import type { AuthError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { characterFor } from '@/lib/people';
import type { Gender } from '@/lib/types/database';

export type AuthActionState = { error: string | null };

/** NIST SP 800-63B's floor for passwords people choose themselves. */
export const MIN_PASSWORD_LENGTH = 8;
/** matches profiles_display_name_length in the database */
export const MAX_NAME_LENGTH = 30;

const describe = (error: AuthError) => error.message.toLowerCase();

const tooShort = (password: string): AuthActionState | null =>
  password.length < MIN_PASSWORD_LENGTH
    ? { error: `passwords need at least ${MIN_PASSWORD_LENGTH} characters` }
    : null;

/** Email codes are 6 digits by default and up to 10 if the project says so. */
function codeFrom(input: string): string | null {
  const code = input.replace(/\s/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}

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

export async function signIn(
  email: string,
  password: string,
): Promise<AuthActionState & { unconfirmed?: boolean }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error?.code === 'email_not_confirmed') {
    return { error: 'confirm your email first with the code we sent you', unconfirmed: true };
  }
  if (error) return { error: describe(error) };
  // No redirect: onAuthStateChange updates the session, the viewer reloads,
  // and the (auth) gate moves the user on by itself.
  return { error: null };
}

export async function signUp({
  name,
  email,
  password,
  gender,
}: {
  name: string;
  email: string;
  password: string;
  gender: Gender;
}): Promise<AuthActionState & { needsConfirmation?: boolean }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'what should we call you?' };
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { error: `names can be up to ${MAX_NAME_LENGTH} characters` };
  }
  const weak = tooShort(password);
  if (weak) return weak;

  const character = characterFor(gender);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // the signup trigger builds the profile from exactly these
    options: { data: { display_name: trimmed, gender, avatar_character: character } },
  });
  if (error?.code === 'user_already_exists' || error?.code === 'email_exists') {
    return { error: "there's already an account with that email. log in instead" };
  }
  if (error) return { error: describe(error) };

  // With email confirmation on there is no session until the code is entered,
  // and the profile already exists: the trigger made it from the metadata.
  if (!data.session) return { error: null, needsConfirmation: true };

  // Everything else in the profile came from the metadata; the time zone is
  // the one thing only the phone knows. Without a session (above) it is set
  // later, when the couple's data first loads.
  if (data.user) {
    await supabase.from('profiles').update({ timezone: deviceTimeZone() }).eq('id', data.user.id);
  }
  return { error: null };
}

/** Finishes a signup with the code from the confirmation email. */
export async function confirmSignUp(email: string, input: string): Promise<AuthActionState> {
  const token = codeFrom(input);
  if (!token) return { error: 'enter the code from the email' };
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { error: describe(error) };
  return { error: null };
}

export async function resendSignUpCode(email: string): Promise<AuthActionState> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return { error: describe(error) };
  return { error: null };
}

/**
 * Whether an account uses the email, from the account-exists Edge Function.
 * Null when it can't say: past its cap, or when the call itself failed.
 */
async function accountExists(email: string): Promise<boolean | null> {
  const { data, error } = await supabase.functions.invoke<{ exists: boolean | null }>('account-exists', {
    body: { email },
  });
  if (error || !data) return null;
  return data.exists;
}

/**
 * Emails a reset code, first checking that an account uses the address, so
 * the screen can say when none does (sign-up reveals that anyway; see
 * migration 20260922000000). When the check can't answer, the code is
 * requested all the same and `known` is null.
 */
export async function sendPasswordReset(
  email: string,
): Promise<AuthActionState & { known?: boolean | null }> {
  if (!email) return { error: 'enter your email' };
  const known = await accountExists(email);
  if (known === false) return { error: "there's no account with that email" };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) return { error: describe(error) };
  return { error: null, known };
}

/**
 * Spends the reset code, which signs the person in, then sets the password.
 * The password is checked first so a bad one cannot use up the code.
 */
export async function resetPassword(
  email: string,
  input: string,
  password: string,
): Promise<AuthActionState> {
  const weak = tooShort(password);
  if (weak) return weak;
  const token = codeFrom(input);
  if (!token) return { error: 'enter the code from the email' };

  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (error) return { error: describe(error) };
  return changePassword(password);
}

export async function changePassword(password: string): Promise<AuthActionState> {
  const weak = tooShort(password);
  if (weak) return weak;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: describe(error) };
  return { error: null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
