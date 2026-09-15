/**
 * The write holes production had on 2026-09-15, shown open on the baseline and
 * closed after 20260915000100_close_write_holes, plus the flows both apps
 * depend on, which must keep working.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { asAnon, asUser, buildDatabase, errorOf } from './db.ts';
import { approveProof, generateInvite, redeemInvite, seedCouple, submitProof } from './seed.ts';

const BASELINE = '20260915000000_production_baseline.sql';
const HARDENED = '20260915000100_close_write_holes.sql';

async function couple(through?: string) {
  const db = await buildDatabase({ through });
  return { db, ...(await seedCouple(db)) };
}

const rowCount = async (promise: Promise<{ rows: unknown[] }>) => (await promise).rows.length;

describe('production baseline: the holes are real', () => {
  test('a member can approve their own proof', async () => {
    const { db, mae, baris, maeProof } = await couple(BASELINE);
    const changed = await asUser(db, mae, (tx) =>
      rowCount(tx.query(
        `update task_completions set status = 'approved', reviewed_by = $1, reviewed_at = now()
         where id = $2 returning id`, [baris, maeProof])));
    assert.equal(changed, 1);
  });

  test("a member can delete their partner's goal", async () => {
    const { db, baris, maeGoal } = await couple(BASELINE);
    assert.equal(await asUser(db, baris, (tx) =>
      rowCount(tx.query('delete from tasks where id = $1 returning id', [maeGoal]))), 1);
  });

  test('anyone with the anon key can mint an invite that strands whoever redeems it', async () => {
    const { db } = await couple(BASELINE);
    const code = await asAnon(db, async (tx) =>
      (await tx.query<{ code: string }>('select generate_invite() as code')).rows[0].code);

    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('victim@test.local', '{}') returning id");
    const victim = rows[0].id;
    await redeemInvite(db, victim, code);

    // paired with nobody, and neither invite function will let them out
    assert.equal(await errorOf(generateInvite(db, victim)), 'already paired');
  });
});

// Every later migration must keep these closed, so the suite runs twice.
for (const [label, through] of [['right after the fix', HARDENED], ['on the latest schema', undefined]] as const) {
describe(`after closing the holes, ${label}`, () => {
  test('a member cannot approve their own proof, by RPC or directly', async () => {
    const { db, mae, baris, maeProof } = await couple(through);
    assert.equal(await errorOf(approveProof(db, mae, maeProof)), 'cannot confirm your own submission');
    const changed = await asUser(db, mae, (tx) =>
      rowCount(tx.query(
        `update task_completions set status = 'approved', reviewed_by = $1 where id = $2 returning id`,
        [baris, maeProof])));
    assert.equal(changed, 0);
  });

  test('a member cannot forge a completion', async () => {
    const { db, mae, maeGoal } = await couple(through);
    const error = await errorOf(asUser(db, mae, (tx) =>
      tx.query(
        `insert into task_completions (task_id, submitted_by, photo_url, status, scheduled_date)
         values ($1, $2, 'x.jpg', 'approved', '2026-01-01')`, [maeGoal, mae])));
    assert.match(error ?? '', /row-level security/);
  });

  test("a member cannot delete their partner's proofs or goals", async () => {
    const { db, baris, maeGoal, maeProof } = await couple(through);
    await asUser(db, baris, async (tx) => {
      assert.equal(await rowCount(tx.query('delete from task_completions where id = $1 returning id', [maeProof])), 0);
      assert.equal(await rowCount(tx.query('delete from tasks where id = $1 returning id', [maeGoal])), 0);
      assert.equal(await rowCount(tx.query(`update tasks set title = 'x' where id = $1 returning id`, [maeGoal])), 0);
    });
  });

  test("a member cannot rewrite a note their partner sent", async () => {
    const { db, mae, baris, coupleId } = await couple(through);
    const noteId = await asUser(db, mae, async (tx) =>
      (await tx.query<{ id: string }>(
        `insert into love_notes (couple_id, sender_id, text) values ($1, $2, 'proud of you') returning id`,
        [coupleId, mae])).rows[0].id);
    const error = await errorOf(asUser(db, baris, (tx) =>
      tx.query(`update love_notes set text = 'forged' where id = $1`, [noteId])));
    assert.match(error ?? '', /permission denied/);
  });

  test('an owner cannot move a goal’s creation date', async () => {
    const { db, mae, maeGoal } = await couple(through);
    const error = await errorOf(asUser(db, mae, (tx) =>
      tx.query(`update tasks set created_at = '2020-01-01' where id = $1`, [maeGoal])));
    assert.match(error ?? '', /permission denied/);
  });

  test('the invite, proof and schedule functions refuse anonymous callers', async () => {
    const { db } = await couple(through);
    for (const call of ['generate_invite()', "redeem_invite('ABCDEF')", 'record_today_schedule()',
      "submit_completion(gen_random_uuid(), 'x')", 'approve_completion(gen_random_uuid())']) {
      assert.match(await errorOf(asAnon(db, (tx) => tx.query(`select ${call}`))) ?? '',
        /permission denied/, call);
    }
    const { rows } = await db.query<{ callable: boolean }>(
      `select has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as callable`);
    assert.equal(rows[0].callable, false);
  });

  describe('what both apps depend on still works', () => {
    test('submitting, retaking and partner approval', async () => {
      const { db, mae, baris, maeGoal, coupleId, maeProof } = await couple(through);
      const retake = await submitProof(db, mae, maeGoal, `${coupleId}/${maeGoal}/b.jpg`);
      assert.equal(retake, maeProof, 'a retake replaces the pending proof');
      await approveProof(db, baris, maeProof);
      const { rows } = await db.query<{ status: string; photo_url: string }>(
        'select status, photo_url from task_completions where id = $1', [maeProof]);
      assert.deepEqual(rows[0], { status: 'approved', photo_url: `${coupleId}/${maeGoal}/b.jpg` });
    });

    test('owners rename, reschedule and archive their goals', async () => {
      const { db, mae, maeGoal } = await couple(through);
      await asUser(db, mae, async (tx) => {
        assert.equal(await rowCount(tx.query(
          `update tasks set title = 'run', updated_at = now() where id = $1 returning id`, [maeGoal])), 1);
        assert.equal(await rowCount(tx.query(
          `update tasks set scheduled_weekdays = '{1,3}', updated_at = now() where id = $1 returning id`, [maeGoal])), 1);
        assert.equal(await rowCount(tx.query(
          `update tasks set archived_at = now() where id = $1 returning id`, [maeGoal])), 1);
      });
    });

    test('both partners read each other’s profile, goals and proofs', async () => {
      const { db, baris, mae } = await couple(through);
      await asUser(db, baris, async (tx) => {
        assert.equal(await rowCount(tx.query('select id from profiles where id = $1', [mae])), 1);
        assert.equal(await rowCount(tx.query('select id from tasks')), 2);
        assert.equal(await rowCount(tx.query('select id from task_completions')), 1);
      });
    });

    test('sending a note retires the sender’s older ones, and the partner dismisses', async () => {
      const { db, mae, baris, coupleId } = await couple(through);
      const send = (text: string) => asUser(db, mae, async (tx) => {
        await tx.query(`update love_notes set dismissed_at = now() where sender_id = $1 and dismissed_at is null`, [mae]);
        return (await tx.query<{ id: string }>(
          'insert into love_notes (couple_id, sender_id, text) values ($1, $2, $3) returning id',
          [coupleId, mae, text])).rows[0].id;
      });
      await send('you got this');
      const latest = await send('proud of you');
      await asUser(db, baris, async (tx) => {
        assert.equal(await rowCount(tx.query('select id from love_notes where dismissed_at is null')), 1);
        assert.equal(await rowCount(tx.query(
          'update love_notes set dismissed_at = now() where id = $1 returning id', [latest])), 1);
      });
    });

    test('recording today’s schedule and syncing a timezone', async () => {
      const { db, mae } = await couple(through);
      await asUser(db, mae, async (tx) => {
        await tx.query('select record_today_schedule()');
        assert.equal(await rowCount(tx.query(
          `update profiles set timezone = 'Asia/Tokyo' where id = $1 returning id`, [mae])), 1);
      });
    });
  });
});
}
