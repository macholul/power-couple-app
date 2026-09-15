/**
 * Proof photos: the bucket's limits, where a proof may point, one proof per
 * goal per day, and cleaning up photos no proof uses.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asUser, buildDatabase, errorOf } from './db.ts';
import { approveProof, seedCouple, submitProof } from './seed.ts';

const upload = (db: PGlite, userId: string, name: string) =>
  asUser(db, userId, (tx) => tx.query(
    `insert into storage.objects (bucket_id, name, owner, owner_id) values ('completion-photos', $1, $2, $3)`,
    [name, userId, userId]));

/** What the Storage API runs for remove(): a delete it permits for itself. */
const remove = (db: PGlite, userId: string, name: string) =>
  asUser(db, userId, async (tx) => {
    await tx.query(`select set_config('storage.allow_delete_query', 'true', true)`);
    const { rows } = await tx.query(
      `delete from storage.objects where bucket_id = 'completion-photos' and name = $1 returning name`, [name]);
    return rows.length;
  });

describe('the bucket', () => {
  test('takes JPEGs of up to 2 MB', async () => {
    const db = await buildDatabase();
    const { rows } = await db.query<{ file_size_limit: string; allowed_mime_types: string[] }>(
      `select file_size_limit::text, allowed_mime_types from storage.buckets where id = 'completion-photos'`);
    assert.deepEqual(rows[0], { file_size_limit: String(2 * 1024 * 1024), allowed_mime_types: ['image/jpeg'] });
  });
});

describe('a proof', () => {
  test("must point into its own goal's folder", async () => {
    const db = await buildDatabase();
    const { mae, coupleId, maeGoal, barisGoal } = await seedCouple(db);
    for (const path of [
      `00000000-0000-0000-0000-000000000000/${maeGoal}/a.jpg`, // another couple
      `${coupleId}/${barisGoal}/a.jpg`, // another goal
      `${coupleId}/${maeGoal}/deeper/a.jpg`,
      `${coupleId}/${maeGoal}/`,
      `${coupleId}/${maeGoal}`,
    ]) {
      assert.equal(await errorOf(submitProof(db, mae, maeGoal, path)), 'invalid photo path', path);
    }
    assert.ok(await submitProof(db, mae, maeGoal, `${coupleId}/${maeGoal}/c.jpg`));
  });

  test('is one per goal per day: retakes replace it until it is confirmed', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId, maeGoal, maeProof } = await seedCouple(db);
    assert.equal(await submitProof(db, mae, maeGoal, `${coupleId}/${maeGoal}/b.jpg`), maeProof);
    await approveProof(db, baris, maeProof);
    assert.equal(
      await errorOf(submitProof(db, mae, maeGoal, `${coupleId}/${maeGoal}/c.jpg`)),
      'already confirmed for this date');

    const duplicate = await errorOf(db.query(
      `insert into task_completions (task_id, submitted_by, photo_url, status, scheduled_date)
       select task_id, submitted_by, photo_url, 'submitted', scheduled_date from task_completions where id = $1`,
      [maeProof]));
    assert.match(duplicate ?? '', /task_completions_task_id_scheduled_date_key/);
  });
});

describe('cleaning up photos', () => {
  test('the uploader deletes a photo once a retake leaves it unused', async () => {
    const db = await buildDatabase();
    const { mae, coupleId, maeGoal } = await seedCouple(db);
    const first = `${coupleId}/${maeGoal}/a.jpg`; // what the seeded proof points at
    const retake = `${coupleId}/${maeGoal}/b.jpg`;
    await upload(db, mae, first);
    await upload(db, mae, retake);

    assert.equal(await remove(db, mae, first), 0, 'still the proof');
    await submitProof(db, mae, maeGoal, retake);
    assert.equal(await remove(db, mae, retake), 0, 'now the proof');
    assert.equal(await remove(db, mae, first), 1, 'unused since the retake');
  });

  test('a failed submit leaves an upload its uploader can delete', async () => {
    const db = await buildDatabase();
    const { mae, coupleId, maeGoal } = await seedCouple(db);
    const stray = `${coupleId}/${maeGoal}/never-submitted.jpg`;
    await upload(db, mae, stray);
    assert.equal(await remove(db, mae, stray), 1);
  });

  test("nobody deletes someone else's photo, or anything from an ended couple", async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId, maeGoal } = await seedCouple(db);
    const stray = `${coupleId}/${maeGoal}/stray.jpg`;
    await upload(db, mae, stray);
    assert.equal(await remove(db, baris, stray), 0, 'the partner');

    await asUser(db, baris, (tx) => tx.query('select public.end_couple()'));
    assert.equal(await remove(db, mae, stray), 0, 'after ending');
  });

  test('deleting rows without the Storage API is still refused', async () => {
    const db = await buildDatabase();
    const { mae, coupleId, maeGoal } = await seedCouple(db);
    await upload(db, mae, `${coupleId}/${maeGoal}/stray.jpg`);
    const error = await errorOf(asUser(db, mae, (tx) => tx.query('delete from storage.objects')));
    assert.match(error ?? '', /Use the Storage API/);
  });
});
