/**
 * What gets queued for whom, and what the push function is allowed to do with
 * the queue. Nothing here talks to Expo: the whole decision about whether a
 * person is worth interrupting is in SQL, and this is where it is checked.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asAnon, asService, asUser, buildDatabase, errorOf } from './db.ts';
import { addGoal, approveProof, pair, signUp, submitProof } from './seed.ts';

interface Queued {
  recipient_id: string;
  kind: string;
  title: string;
  body: string;
  dedupe: string;
  payload: Record<string, unknown>;
}

const queue = async (db: PGlite): Promise<Queued[]> =>
  (
    await db.query<Queued>(
      `select recipient_id, kind, title, body, dedupe, payload
       from private.push_outbox order by id`,
    )
  ).rows;

const register = (db: PGlite, userId: string, token: string) =>
  asUser(db, userId, (tx) =>
    tx.query(`select public.register_push_device($1, 'ios')`, [token]),
  );

/** A paired couple where both have a phone registered and want everything. */
async function seedPair(db: PGlite) {
  const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
  const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
  const coupleId = await pair(db, mae, baris);
  await register(db, mae, 'ExponentPushToken[mae-phone]');
  await register(db, baris, 'ExponentPushToken[baris-phone]');
  return { mae, baris, coupleId };
}

describe('what a couple gets notified about', () => {
  test('a proof tells the partner, once, however many times it is retaken', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');

    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    await submitProof(db, mae, goal, `${coupleId}/${goal}/b.jpg`);

    const queued = await queue(db);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].recipient_id, baris);
    assert.equal(queued[0].kind, 'proof');
    assert.equal(queued[0].title, 'Mae finished a goal');
    assert.match(queued[0].body, /gym/);
    assert.equal(queued[0].payload.kind, 'proof');
  });

  test('confirming tells whoever sent the proof', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');
    const proof = await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    await approveProof(db, baris, proof);

    const confirmations = (await queue(db)).filter((row) => row.kind === 'confirmed');
    assert.equal(confirmations.length, 1);
    assert.equal(confirmations[0].recipient_id, mae);
    assert.equal(confirmations[0].title, 'Baris confirmed your goal');
  });

  test('a note arrives with the note in it', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId } = await seedPair(db);
    await asUser(db, mae, (tx) =>
      tx.query(`insert into public.love_notes (couple_id, sender_id, text) values ($1, $2, $3)`, [
        coupleId,
        mae,
        'proud of you',
      ]),
    );

    const notes = (await queue(db)).filter((row) => row.kind === 'note');
    assert.equal(notes.length, 1);
    assert.equal(notes[0].recipient_id, baris);
    assert.equal(notes[0].title, 'Mae sent you a note');
    assert.equal(notes[0].body, 'proud of you');
  });

  test('nothing is queued for a partner with no phone registered', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    const coupleId = await pair(db, mae, baris);
    const goal = await addGoal(db, mae, coupleId, 'gym');

    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    assert.deepEqual(await queue(db), []);
  });

  test('each switch turns off only its own kind', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId } = await seedPair(db);
    await asUser(db, baris, (tx) =>
      tx.query('update public.profiles set notify_proofs = false where id = $1', [baris]),
    );

    const goal = await addGoal(db, mae, coupleId, 'gym');
    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    await asUser(db, mae, (tx) =>
      tx.query(`insert into public.love_notes (couple_id, sender_id, text) values ($1, $2, 'hi')`, [
        coupleId,
        mae,
      ]),
    );

    assert.deepEqual((await queue(db)).map((row) => row.kind), ['note']);
  });

  test('an ended couple notifies nobody', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');
    await asUser(db, mae, (tx) => tx.query('select public.end_couple()'));

    // the goal outlives the couple, so the write still happens; the partner
    // it would have told is no longer a partner
    await db.query(
      `insert into public.task_completions (task_id, submitted_by, photo_url, scheduled_date)
       values ($1, $2, 'x.jpg', current_date)`,
      [goal, mae],
    );
    assert.deepEqual(await queue(db), []);
  });
});

describe('the daily streak reminder', () => {
  /** Puts everyone's reminder hour on the hour it is now, in UTC. */
  const remindNow = async (db: PGlite) => {
    await db.query(`
      update public.profiles
      set timezone = 'UTC',
          reminder_hour = extract(hour from (now() at time zone 'UTC'))::smallint`);
  };

  const sweep = (db: PGlite) =>
    asService(db, async (tx) =>
      (await tx.query<{ queued: number }>('select public.enqueue_streak_reminders() as queued'))
        .rows[0].queued,
    );

  test('goes to someone with goals left, once a day, and never twice', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    await addGoal(db, mae, coupleId, 'gym');
    await addGoal(db, mae, coupleId, 'read');
    await remindNow(db);

    assert.equal(await sweep(db), 1);
    assert.equal(await sweep(db), 0);

    const reminders = (await queue(db)).filter((row) => row.kind === 'reminder');
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].recipient_id, mae);
    assert.match(reminders[0].body, /2 goals left/);
  });

  test('stays quiet at every other hour', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    await addGoal(db, mae, coupleId, 'gym');
    await db.query(`
      update public.profiles
      set timezone = 'UTC',
          reminder_hour = (extract(hour from (now() at time zone 'UTC'))::integer + 3) % 24`);

    assert.equal(await sweep(db), 0);
  });

  test('stays quiet once the day’s goals are all submitted', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');
    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    await remindNow(db);

    assert.equal(await sweep(db), 0);
  });

  test('stays quiet for someone who turned it off', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    await addGoal(db, mae, coupleId, 'gym');
    await remindNow(db);
    await asUser(db, mae, (tx) =>
      tx.query('update public.profiles set notify_streak = false where id = $1', [mae]),
    );

    assert.equal(await sweep(db), 0);
  });
});

describe('draining the queue', () => {
  interface Claim {
    id: number;
    title: string;
    tokens: string[];
  }

  const claim = (db: PGlite, limit = 10) =>
    asService(db, async (tx) =>
      (await tx.query<Claim>('select id, title, tokens from public.claim_push_batch($1)', [limit]))
        .rows,
    );

  test('claims a notification with the recipient’s tokens, and marks it sent', async () => {
    const db = await buildDatabase();
    const { mae, baris, coupleId } = await seedPair(db);
    await register(db, baris, 'ExponentPushToken[baris-ipad]');
    const goal = await addGoal(db, mae, coupleId, 'gym');
    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);

    const claimed = await claim(db);
    assert.equal(claimed.length, 1);
    assert.deepEqual(claimed[0].tokens.sort(), [
      'ExponentPushToken[baris-ipad]',
      'ExponentPushToken[baris-phone]',
    ]);

    await asService(db, (tx) =>
      tx.query('select public.finish_push($1::bigint[])', [[claimed[0].id]]),
    );
    assert.deepEqual(await claim(db), []);
  });

  test('a token Expo rejects is deleted, so nothing is sent to it again', async () => {
    const db = await buildDatabase();
    const { baris } = await seedPair(db);
    await asService(db, (tx) =>
      tx.query(`select public.finish_push('{}'::bigint[], '{}'::bigint[], null, $1::text[])`, [
        ['ExponentPushToken[baris-phone]'],
      ]),
    );

    const { rows } = await db.query(
      'select 1 from private.push_devices where user_id = $1',
      [baris],
    );
    assert.deepEqual(rows, []);
  });

  test('gives up on a notification after five tries, and keeps why', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');
    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);

    for (let attempt = 0; attempt < 5; attempt++) {
      const [claimed] = await claim(db);
      assert.ok(claimed, `attempt ${attempt + 1} should still be claimable`);
      await asService(db, (tx) =>
        tx.query(`select public.finish_push('{}'::bigint[], $1::bigint[], 'expo said no')`, [
          [claimed.id],
        ]),
      );
    }
    assert.deepEqual(await claim(db), []);

    const { rows } = await db.query<{ last_error: string }>(
      'select last_error from private.push_outbox',
    );
    assert.equal(rows[0].last_error, 'expo said no');
  });

  test('pruning clears sent notifications and the ones given up on', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedPair(db);
    const goal = await addGoal(db, mae, coupleId, 'gym');
    await submitProof(db, mae, goal, `${coupleId}/${goal}/a.jpg`);
    await db.query(`update private.push_outbox set queued_at = now() - interval '2 days'`);

    const removed = await asService(db, async (tx) =>
      (await tx.query<{ gone: number }>('select public.prune_push_outbox() as gone')).rows[0].gone,
    );
    assert.equal(removed, 1);
    assert.deepEqual(await queue(db), []);
  });
});

describe('who may touch any of this', () => {
  test('a phone keeps one row, and it moves to whoever signs in on it', async () => {
    const db = await buildDatabase();
    const { mae, baris } = await seedPair(db);
    await register(db, baris, 'ExponentPushToken[mae-phone]');

    const { rows } = await db.query<{ user_id: string; count: string }>(
      `select user_id, count(*) over () as count
       from private.push_devices where token = 'ExponentPushToken[mae-phone]'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, baris);
    assert.notEqual(rows[0].user_id, mae);
  });

  test('forgetting a phone only works on your own', async () => {
    const db = await buildDatabase();
    const { mae, baris } = await seedPair(db);

    await asUser(db, mae, (tx) =>
      tx.query(`select public.forget_push_device('ExponentPushToken[baris-phone]')`),
    );
    const { rows: survived } = await db.query(
      `select 1 from private.push_devices where token = 'ExponentPushToken[baris-phone]'`,
    );
    assert.equal(survived.length, 1);

    await asUser(db, baris, (tx) =>
      tx.query(`select public.forget_push_device('ExponentPushToken[baris-phone]')`),
    );
    const { rows: gone } = await db.query(
      `select 1 from private.push_devices where token = 'ExponentPushToken[baris-phone]'`,
    );
    assert.equal(gone.length, 0);
  });

  test('registering refuses anonymous callers and rubbish tokens', async () => {
    const db = await buildDatabase();
    const { mae } = await seedPair(db);

    assert.match(
      (await errorOf(asAnon(db, (tx) => tx.query(`select public.register_push_device('x', 'ios')`)))) ?? '',
      /permission denied/,
    );
    assert.match(
      (await errorOf(asUser(db, mae, (tx) => tx.query(`select public.register_push_device('short', 'ios')`)))) ?? '',
      /invalid token/,
    );
    assert.match(
      (await errorOf(
        asUser(db, mae, (tx) =>
          tx.query(`select public.register_push_device('ExponentPushToken[ok-length]', 'windows')`),
        ),
      )) ?? '',
      /invalid platform/,
    );
  });

  test('only the service role sends, and nobody reads the queue over the API', async () => {
    const db = await buildDatabase();
    const { mae } = await seedPair(db);

    for (const call of [
      'select public.claim_push_batch(1)',
      `select public.finish_push('{}'::bigint[])`,
      'select public.enqueue_streak_reminders()',
      'select public.prune_push_outbox()',
    ]) {
      assert.match((await errorOf(asAnon(db, (tx) => tx.query(call)))) ?? '', /permission denied/, call);
      assert.match((await errorOf(asUser(db, mae, (tx) => tx.query(call)))) ?? '', /permission denied/, call);
    }

    for (const table of ['private.push_devices', 'private.push_outbox']) {
      const read = `select count(*) from ${table}`;
      assert.match((await errorOf(asAnon(db, (tx) => tx.query(read)))) ?? '', /permission denied/, table);
      assert.match((await errorOf(asUser(db, mae, (tx) => tx.query(read)))) ?? '', /permission denied/, table);
    }
  });
});
