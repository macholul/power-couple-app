/**
 * Tells the password reset screen whether an account uses an email, so it
 * can say there is none instead of promising a code that will never come.
 *
 * Supabase's sign-up already reveals this ("User already registered"), so the
 * answer is no secret. The database caps how often it is given and answers
 * null past the cap (migration 20260922000000). The email is only looked up,
 * never stored or logged.
 *
 * The app calls this with supabase.functions.invoke('account-exists') while
 * signed out, so the only credential is the project's anon key.
 */
import { createClient } from '@supabase/supabase-js';

import { secretKey } from '../_shared/secret-key.ts';

/** the longest address SMTP allows (RFC 5321) */
const MAX_EMAIL_LENGTH = 254;

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'method not allowed' });

  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return reply(400, { error: 'expected {"email": "..."}' });
  }
  if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    return reply(400, { error: 'not an email address' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('account_exists', { p_email: email });
  if (error) {
    console.error('account lookup failed', error.message);
    return reply(500, { error: 'could not check' });
  }
  return reply(200, { exists: data as boolean | null });
});
