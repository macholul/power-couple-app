/**
 * Deletes the calling user's account and everything that belongs to it.
 *
 * Order matters. Photos are files behind the Storage API, which no database
 * cascade reaches, so they go first. The auth user goes last, and deleting it
 * cascades through every table (see migration 20260915000600). Should any
 * step fail, nothing after it runs, and calling again resumes where it
 * stopped: photos already removed are simply no longer listed.
 *
 * The app calls this with supabase.functions.invoke('delete-account').
 */
import { createClient } from '@supabase/supabase-js';

import { secretKey } from '../_shared/secret-key.ts';

const BUCKET = 'completion-photos';
/** the most paths the Storage API removes in one call */
const REMOVE_BATCH = 1000;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'method not allowed' });

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { error: 'not signed in' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Asks the Auth server, not just the token's signature: a session that was
  // signed out or a user already deleted must not get this far.
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply(401, { error: 'not signed in' });
  const userId = auth.user.id;

  const { data: paths, error: listError } = await admin.rpc('account_photo_paths', {
    p_user_id: userId,
  });
  if (listError) {
    console.error('listing photos failed', userId, listError.message);
    return reply(500, { error: 'could not delete your account' });
  }

  const allPaths = (paths ?? []) as string[];
  for (let start = 0; start < allPaths.length; start += REMOVE_BATCH) {
    const { error } = await admin.storage.from(BUCKET).remove(allPaths.slice(start, start + REMOVE_BATCH));
    if (error) {
      console.error('removing photos failed', userId, error.message);
      return reply(500, { error: 'could not delete your account' });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('deleting the user failed', userId, deleteError.message);
    return reply(500, { error: 'could not delete your account' });
  }

  return reply(200, { deleted: true, photos: allPaths.length });
});
