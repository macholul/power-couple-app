import { supabase } from '@/lib/supabase';

export type InviteActionState = { error: string | null; code?: string };

/**
 * Asks the database for a fresh 6-character code. generate_invite is
 * SECURITY DEFINER: it refuses if the caller is already paired, and
 * invalidates any of their earlier unused codes, so only the newest works.
 */
export async function createInvite(): Promise<InviteActionState> {
  const { data, error } = await supabase.rpc('generate_invite');
  if (error) return { error: error.message.toLowerCase() };
  return { error: null, code: data as string };
}

/**
 * The viewer's outstanding invite, if they generated one earlier and it has
 * not been used. The web read this server-side while rendering the page.
 */
export async function existingInvite(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('couple_invites')
    .select('code')
    .eq('created_by', userId)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.code ?? null;
}

/**
 * redeem_invite does all the real checking in Postgres — unknown code,
 * expired, your own invite, inviter already paired — and creates the couple
 * row. Its messages are surfaced as-is, matching the web.
 */
export async function redeemInvite(code: string): Promise<InviteActionState> {
  const trimmed = code.trim();
  if (trimmed.length !== 6) return { error: 'codes are 6 characters' };

  const { error } = await supabase.rpc('redeem_invite', { p_code: trimmed });
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}
