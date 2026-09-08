import { supabase } from '@/lib/supabase';

export type NoteActionState = { error: string | null };

export async function sendNote(text: string): Promise<NoteActionState> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return { error: 'invalid note' };

  const [{ data: auth }, { data: couple }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('couples').select('id').maybeSingle(),
  ]);
  if (!auth.user || !couple) return { error: 'not paired' };

  // a new note replaces any older undismissed ones from the same sender, so
  // stale notes never resurface after a dismissal
  await supabase
    .from('love_notes')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('sender_id', auth.user.id)
    .is('dismissed_at', null);

  const { error } = await supabase.from('love_notes').insert({
    couple_id: couple.id,
    sender_id: auth.user.id,
    text: trimmed,
  });
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

export async function dismissNote(noteId: string): Promise<NoteActionState> {
  // the "dismiss couple notes" RLS policy scopes this to the viewer's couple
  const { error } = await supabase
    .from('love_notes')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}
