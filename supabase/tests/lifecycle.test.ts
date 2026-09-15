/**
 * Couples end softly: nothing is deleted, the ended couple's data becomes
 * unreachable, and the same two people pairing again get it all back.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asAnon, asUser, buildDatabase, errorOf } from './db.ts';
import { addGoal, approveProof, generateInvite, pair, redeemInvite, seedCouple, signUp, submitProof } from './seed.ts';

const endCouple = (db: PGlite, userId: string) =>
  asUser(db, userId, (tx) => tx.query('select public.end_couple()'));

const count = (db: PGlite, userId: string, sql: string, params: unknown[] = []) =>
  asUser(db, userId, async (tx) => (await tx.query(sql, params)).rows.length);

async function ended() {
  const db = await buildDatabase();
  const seeded = await seedCouple(db);
  await endCouple(db, seeded.mae);
  return { db, ...seeded };
}

describe('ending a couple', () => {
  test('unpairs both partners, who can then pair again', async () => {
    const { db, mae, baris } = await ended();
    for (const person of [mae, baris]) {
      assert.equal(await count(db, person, 'select id from couples'), 0);
      assert.match(await generateInvite(db, person), /^[A-Z2-9]{6}$/);
    }
  });

  test('keeps every row', async () => {
    const { db } = await ended();
    const { rows } = await db.query<{ couples: number; tasks: number; proofs: number }>(`
      select (select count(*) from couples where ended_at is not null)::int as couples,
             (select count(*) from tasks)::int as tasks,
             (select count(*) from task_completions)::int as proofs`);
    assert.deepEqual(rows[0], { couples: 1, tasks: 2, proofs: 1 });
  });

  test("cuts off the other person's profile, goals, proofs, notes and schedule", async () => {
    const { db, mae, baris, coupleId } = await ended();
    await db.query(`insert into love_notes (couple_id, sender_id, text) values ($1, $2, 'hi')`, [coupleId, mae]);
    // submitting the seeded proof already froze today for Mae
    assert.equal((await db.query('select 1 from day_schedules where user_id = $1', [mae])).rows.length > 0, true);

    assert.equal(await count(db, baris, 'select id from profiles where id = $1', [mae]), 0);
    assert.equal(await count(db, baris, 'select id from profiles where id = $1', [baris]), 1, 'own profile stays');
    assert.equal(await count(db, baris, 'select id from tasks'), 0);
    assert.equal(await count(db, baris, 'select id from task_completions'), 0);
    assert.equal(await count(db, baris, 'select id from love_notes'), 0);
    assert.equal(await count(db, baris, 'select user_id from day_schedules where user_id = $1', [mae]), 0);
  });

  test('refuses proofs and approvals against the ended couple', async () => {
    const { db, mae, baris, maeGoal, maeProof, coupleId } = await ended();
    assert.equal(await errorOf(submitProof(db, mae, maeGoal, `${coupleId}/x/y.jpg`)), 'not authorized');
    assert.equal(await errorOf(approveProof(db, baris, maeProof)), 'not authorized');
  });

  test('stops recording an unpaired schedule', async () => {
    const { db, mae } = await ended();
    await db.query('delete from day_schedules');
    await asUser(db, mae, (tx) => tx.query('select record_today_schedule()'));
    const { rows } = await db.query('select 1 from day_schedules');
    assert.equal(rows.length, 0);
  });

  test('refuses anyone not in an active couple', async () => {
    const { db, mae } = await ended();
    assert.equal(await errorOf(endCouple(db, mae)), 'not paired');
    assert.match(await errorOf(asAnon(db, (tx) => tx.query('select end_couple()'))) ?? '', /permission denied/);
  });
});

describe('pairing again', () => {
  test('the same two people get their couple and history back', async () => {
    const { db, mae, baris, coupleId } = await ended();
    const again = await pair(db, baris, mae);
    assert.equal(again, coupleId, 'reactivated, not recreated');
    assert.equal(await count(db, baris, 'select id from tasks'), 2);
    assert.equal(await count(db, baris, 'select id from task_completions'), 1);
  });

  test('a new partner sees none of the previous couple', async () => {
    const { db, mae, coupleId } = await ended();
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', character: 'baris', gender: 'male' });
    const newCouple = await pair(db, mae, noah);
    assert.notEqual(newCouple, coupleId);

    // Mae's frozen days: one from the previous couple, one from this one
    await db.query('delete from day_schedules where user_id = $1', [mae]);
    await db.query(`update couples set created_at = now() - interval '2 days' where id = $1`, [newCouple]);
    await db.query(`insert into day_schedules (user_id, date_key) values ($1, current_date - 30), ($1, current_date)`, [mae]);

    assert.equal(await count(db, noah, 'select id from tasks'), 0);
    assert.equal(await count(db, noah, 'select id from task_completions'), 0);
    const visible = await asUser(db, noah, async (tx) =>
      (await tx.query<{ date_key: string }>(
        `select date_key::text from day_schedules where user_id = $1 order by 1`, [mae])).rows);
    assert.equal(visible.length, 1, 'only days since this couple began');
  });

  test('a code made before pairing cannot pair that person with someone else later', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', character: 'baris', gender: 'male' });
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', character: 'baris', gender: 'male' });

    const maesCode = await generateInvite(db, mae);
    await pair(db, baris, mae); // Mae redeems Baris's code instead
    await endCouple(db, mae);

    assert.equal(await redeemInvite(db, noah, maesCode), null, 'no couple');
    assert.equal(await count(db, noah, 'select id from couples'), 0);
  });

  test('nobody can be in two active couples, whatever writes the row', async () => {
    const db = await buildDatabase();
    const { mae } = await seedCouple(db);
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', character: 'baris', gender: 'male' });
    const error = await errorOf(db.query(
      'insert into couples (user1_id, user2_id) values ($1, $2)', [noah, mae]));
    assert.equal(error, 'already paired');
  });

  test('goals can only be added to the couple you are in now', async () => {
    const { db, mae, coupleId } = await ended();
    assert.match(await errorOf(addGoal(db, mae, coupleId)) ?? '', /row-level security/);
  });
});

describe('photos follow the active couple', () => {
  const upload = (db: PGlite, userId: string, name: string) =>
    asUser(db, userId, (tx) => tx.query(
      `insert into storage.objects (bucket_id, name, owner, owner_id) values ('completion-photos', $1, $2, $3)`,
      [name, userId, userId]));

  test('members upload into their couple folder and read each other’s photos', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId, maeGoal } = await seedCouple(db);
    await upload(db, mae, `${coupleId}/${maeGoal}/a.jpg`);
    assert.equal(await count(db, baris, 'select id from storage.objects'), 1);
  });

  test('after ending, nothing is readable or uploadable', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId, maeGoal } = await seedCouple(db);
    await upload(db, mae, `${coupleId}/${maeGoal}/a.jpg`);
    await endCouple(db, baris);
    assert.equal(await count(db, baris, 'select id from storage.objects'), 0);
    assert.equal(await count(db, mae, 'select id from storage.objects'), 0);
    assert.match(await errorOf(upload(db, mae, `${coupleId}/${maeGoal}/b.jpg`)) ?? '', /row-level security/);
  });
});
