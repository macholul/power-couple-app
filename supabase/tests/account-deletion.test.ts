/**
 * Deleting an account, the way the delete-account Edge Function does it: list
 * the photos, remove them through the Storage API, then delete the auth user
 * and let the foreign keys cascade.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asAnon, asService, asUser, buildDatabase, errorOf } from './db.ts';
import { generateInvite, pair, seedCouple, signUp } from './seed.ts';

const upload = (db: PGlite, userId: string, name: string) =>
  asUser(db, userId, (tx) => tx.query(
    `insert into storage.objects (bucket_id, name, owner, owner_id) values ('completion-photos', $1, $2, $3)`,
    [name, userId, userId]));

const photoPaths = (db: PGlite, userId: string) =>
  asService(db, async (tx) =>
    (await tx.query<{ path: string }>('select public.account_photo_paths($1) as path', [userId]))
      .rows.map((row) => row.path));

async function deleteAccount(db: PGlite, userId: string) {
  const paths = await photoPaths(db, userId);
  await asService(db, async (tx) => {
    await tx.query(`select set_config('storage.allow_delete_query', 'true', true)`);
    await tx.query(
      `delete from storage.objects where bucket_id = 'completion-photos' and name = any($1)`, [paths]);
  });
  await db.query('delete from auth.users where id = $1', [userId]);
}

/** Mae was with Noah, ended it, and is now with Baris. Ada and Leo are strangers. */
async function history() {
  const db = await buildDatabase();
  const { mae, baris, coupleId, maeGoal, barisGoal } = await seedCouple(db);
  const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'male' });
  const ada = await signUp(db, { email: 'ada@test.local', name: 'Ada', gender: 'female' });
  const leo = await signUp(db, { email: 'leo@test.local', name: 'Leo', gender: 'male' });

  await upload(db, mae, `${coupleId}/${maeGoal}/a.jpg`);
  await upload(db, baris, `${coupleId}/${barisGoal}/b.jpg`);
  await asUser(db, mae, (tx) => tx.query('select public.end_couple()'));

  const current = await pair(db, noah, mae);
  const { rows } = await db.query<{ id: string }>(
    `insert into tasks (couple_id, assigned_to, title, scheduled_weekdays) values ($1, $2, 'swim', '{1}') returning id`,
    [current, noah]);
  await upload(db, noah, `${current}/${rows[0].id}/n.jpg`);

  const strangers = await pair(db, ada, leo);
  await upload(db, leo, `${strangers}/00000000-0000-0000-0000-000000000000/s.jpg`);
  await generateInvite(db, baris);

  return { db, mae, baris, noah, ada, leo, coupleId, current, strangers };
}

describe('account deletion', () => {
  test("lists every photo from every couple the person was ever in, and nobody else's", async () => {
    const { db, mae, coupleId, current } = await history();
    const paths = await photoPaths(db, mae);
    assert.equal(paths.length, 3);
    assert.ok(paths.every((path) => path.startsWith(`${coupleId}/`) || path.startsWith(`${current}/`)));
  });

  test('only the service role may ask for the list', async () => {
    const { db, mae } = await history();
    const call = 'select public.account_photo_paths(gen_random_uuid())';
    assert.match(await errorOf(asUser(db, mae, (tx) => tx.query(call))) ?? '', /permission denied/);
    assert.match(await errorOf(asAnon(db, (tx) => tx.query(call))) ?? '', /permission denied/);
  });

  test('removes the person and both couples, and leaves each partner unpaired and free', async () => {
    const { db, mae, baris, noah, ada, leo, strangers } = await history();
    await deleteAccount(db, mae);

    const left = await db.query<Record<string, number>>(`
      select (select count(*) from profiles where id = $1)::int as profile,
             (select count(*) from couples where $1 in (user1_id, user2_id))::int as couples,
             (select count(*) from tasks where couple_id::text <> $2)::int as tasks,
             (select count(*) from task_completions)::int as proofs,
             (select count(*) from day_schedules where user_id = $1)::int as schedules,
             (select count(*) from storage.objects where name not like $2 || '/%')::int as photos`,
      [mae, strangers]);
    assert.deepEqual({ ...left.rows[0] }, { profile: 0, couples: 0, tasks: 0, proofs: 0, schedules: 0, photos: 0 });

    const survivors = await db.query('select id from profiles where id = any($1)', [[baris, noah, ada, leo]]);
    assert.equal(survivors.rows.length, 4);
    assert.ok(await pair(db, baris, await signUp(db, { email: 'eve@test.local', name: 'Eve', gender: 'female' })));
    const strangersLeft = await db.query('select 1 from couples where id = $1 and ended_at is null', [strangers]);
    assert.equal(strangersLeft.rows.length, 1, 'other couples are untouched');
  });
});
