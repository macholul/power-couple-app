import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types/database';

/**
 * Freezes today's goal schedule in day_schedules (best effort): past days are
 * then judged only against what was actually scheduled, so later schedule
 * edits can never rewrite streak history.
 */
export async function recordToday(): Promise<void> {
  // errors ignored: before migration 0006 the RPC does not exist
  await supabase.rpc('record_today_schedule');
}

/**
 * Persists the device's IANA timezone on the viewer's profile so all
 * day-boundary math follows their local calendar.
 */
export async function syncTimezone(timeZone: string): Promise<boolean> {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return false; // not a valid IANA zone; keep whatever is stored
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ timezone: timeZone })
    .eq('id', data.user.id);
  // The web called revalidatePath() here. The caller refreshes the viewer
  // instead, so it returns whether there is anything to refresh.
  return !error;
}

/** Which push notifications the viewer wants. Their own row only, by policy. */
export type NotificationPrefs = Pick<Profile, 'notify_proofs' | 'notify_notes' | 'notify_streak'>;

export async function setNotificationPrefs(
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<boolean> {
  if (Object.keys(prefs).length === 0) return true;
  const { error } = await supabase.from('profiles').update(prefs).eq('id', userId);
  return !error;
}
