import { supabase } from '@/lib/supabase';
import { recordToday } from '@/lib/actions/profile';

export type GoalActionState = { error: string | null };

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function sanitizeWeekdays(weekdays: number[]): number[] {
  const valid = [...new Set(weekdays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  return valid.length > 0 ? valid : ALL_DAYS;
}

export async function addGoal(
  title: string,
  weekdays: number[],
): Promise<GoalActionState> {
  const trimmed = title.trim();
  if (!trimmed) return { error: 'give your goal a name' };

  // the insert needs the couple id and the owner id; fetch both at once
  const [{ data: auth }, { data: couple }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('couples').select('id').maybeSingle(),
  ]);
  if (!auth.user || !couple) return { error: 'not paired' };

  const { error } = await supabase.from('tasks').insert({
    couple_id: couple.id,
    assigned_to: auth.user.id,
    title: trimmed,
    scheduled_weekdays: sanitizeWeekdays(weekdays),
  });
  if (error) return { error: error.message.toLowerCase() };

  await recordToday();
  return { error: null };
}

// rename/setWeekdays/archive rely on RLS: the update policy only matches rows
// where assigned_to = auth.uid(), so no ownership check is needed here and no
// viewer lookup round-trip is spent.

export async function renameGoal(
  goalId: string,
  title: string,
): Promise<GoalActionState> {
  const trimmed = title.trim();
  if (!trimmed) return { error: 'give your goal a name' };

  const { error } = await supabase
    .from('tasks')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', goalId);
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

export async function setGoalWeekdays(
  goalId: string,
  weekdays: number[],
): Promise<GoalActionState> {
  // freeze any still-unrecorded past days under the OLD schedule before the
  // edit can bleed into them (as of 0007 the RPC gap-fills past days too)
  await recordToday();
  const { error } = await supabase
    .from('tasks')
    .update({
      scheduled_weekdays: sanitizeWeekdays(weekdays),
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);
  if (error) return { error: error.message.toLowerCase() };

  await recordToday();
  return { error: null };
}

export async function archiveGoal(goalId: string): Promise<GoalActionState> {
  // archive instead of delete: the goal's photo history is kept for memories
  const { error } = await supabase
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', goalId);
  if (error) return { error: error.message.toLowerCase() };

  await recordToday();
  return { error: null };
}
