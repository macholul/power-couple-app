/**
 * Builds realistic state the way the apps do: signups go through auth.users
 * (so the signup trigger runs), and everything after that goes through the
 * same RPCs and table writes the clients use, as the user making them.
 */
import type { PGlite } from '@electric-sql/pglite';

import { asUser } from './db.ts';

export interface SignUp {
  email: string;
  name: string;
  character?: 'mae' | 'baris';
  gender?: 'female' | 'male';
  timezone?: string;
}

export async function signUp(db: PGlite, person: SignUp): Promise<string> {
  const metadata: Record<string, string> = {
    display_name: person.name,
    avatar_character: person.character ?? 'mae',
  };
  if (person.gender) metadata.gender = person.gender;

  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [person.email, JSON.stringify(metadata)],
  );
  const id = rows[0].id;

  // what both apps' signUp() does right after, as the new user
  await asUser(db, id, (tx) =>
    tx.query(
      `update public.profiles set avatar_character = $2, timezone = $3 where id = $1`,
      [id, person.character ?? 'mae', person.timezone ?? 'UTC'],
    ),
  );
  return id;
}

export async function generateInvite(db: PGlite, userId: string): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ code: string }>('select public.generate_invite() as code');
    return rows[0].code;
  });
}

export async function redeemInvite(db: PGlite, userId: string, code: string): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('select public.redeem_invite($1) as id', [code]);
    return rows[0].id;
  });
}

export async function pair(db: PGlite, inviter: string, invitee: string): Promise<string> {
  return redeemInvite(db, invitee, await generateInvite(db, inviter));
}

export async function addGoal(
  db: PGlite,
  userId: string,
  coupleId: string,
  title = 'gym',
  weekdays = [0, 1, 2, 3, 4, 5, 6],
): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.tasks (couple_id, assigned_to, title, scheduled_weekdays)
       values ($1, $2, $3, $4) returning id`,
      [coupleId, userId, title, weekdays],
    );
    return rows[0].id;
  });
}

export async function submitProof(db: PGlite, userId: string, taskId: string, path: string): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      'select public.submit_completion($1, $2) as id',
      [taskId, path],
    );
    return rows[0].id;
  });
}

export async function approveProof(db: PGlite, userId: string, completionId: string): Promise<void> {
  await asUser(db, userId, (tx) => tx.query('select public.approve_completion($1)', [completionId]));
}

/** A paired couple where Mae has one goal with a pending proof. */
export async function seedCouple(db: PGlite) {
  const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', character: 'mae', gender: 'female' });
  const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', character: 'baris', gender: 'male' });
  const coupleId = await pair(db, mae, baris);
  const maeGoal = await addGoal(db, mae, coupleId, 'gym');
  const barisGoal = await addGoal(db, baris, coupleId, 'read');
  const maeProof = await submitProof(db, mae, maeGoal, `${coupleId}/${maeGoal}/a.jpg`);
  return { mae, baris, coupleId, maeGoal, barisGoal: barisGoal, maeProof };
}
