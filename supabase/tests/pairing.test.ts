/**
 * Who can pair (a woman and a man), and how invite codes behave: strong
 * random codes, collisions, expiry, and throttled guessing.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asUser, buildDatabase, errorOf, migrate } from './db.ts';
import { generateInvite, pair, redeemInvite, seedCouple, signUp } from './seed.ts';

const BEFORE = '20260915000200_couple_lifecycle.sql';
const OPPOSITE_ONLY = 'you can only pair with someone of the opposite gender';

const genderOf = async (db: PGlite, id: string) =>
  (await db.query<{ gender: string; avatar_character: string }>(
    'select gender, avatar_character from profiles where id = $1', [id])).rows[0];

const setGender = (db: PGlite, userId: string, gender: string) =>
  asUser(db, userId, (tx) => tx.query('update profiles set gender = $2 where id = $1', [userId, gender]));

const endCouple = (db: PGlite, userId: string) =>
  asUser(db, userId, (tx) => tx.query('select public.end_couple()'));

describe('gender', () => {
  test('existing profiles take it from the character they picked', async () => {
    const db = await buildDatabase({ through: BEFORE });
    const pink = await signUp(db, { email: 'pink@test.local', name: 'Pink', character: 'mae' });
    const blue = await signUp(db, { email: 'blue@test.local', name: 'Blue', character: 'baris' });
    await migrate(db, { after: BEFORE });
    assert.equal((await genderOf(db, pink)).gender, 'female');
    assert.equal((await genderOf(db, blue)).gender, 'male');
  });

  test('signups store what they send, and fill in whichever is missing', async () => {
    const db = await buildDatabase();
    const cases = [
      [{ gender: 'male' }, { gender: 'male', avatar_character: 'baris' }],
      [{ gender: 'female' }, { gender: 'female', avatar_character: 'mae' }],
      [{ avatar_character: 'baris' }, { gender: 'male', avatar_character: 'baris' }], // the web app
      [{}, { gender: 'female', avatar_character: 'mae' }], // the dashboard
      [{ gender: 'they', avatar_character: 'cat' }, { gender: 'female', avatar_character: 'mae' }],
    ] as const;
    for (const [index, [metadata, expected]] of cases.entries()) {
      const { rows } = await db.query<{ id: string }>(
        'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
        [`person${index}@test.local`, JSON.stringify(metadata)]);
      assert.deepEqual({ ...(await genderOf(db, rows[0].id)) }, expected, JSON.stringify(metadata));
    }
  });

  test('only female and male are stored', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    assert.match(await errorOf(setGender(db, mae, 'nonbinary')) ?? '', /profiles_gender_check/);
  });

  test("the web app's signup upsert still works, and leaves gender alone", async () => {
    const db = await buildDatabase();
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    // what PostgREST runs for supabase.from('profiles').upsert({...}) without gender
    await asUser(db, baris, (tx) => tx.query(
      `insert into profiles (id, display_name, avatar_character, timezone)
       values ($1, 'Baris', 'baris', 'Europe/Istanbul')
       on conflict (id) do update set id = excluded.id, display_name = excluded.display_name,
         avatar_character = excluded.avatar_character, timezone = excluded.timezone`, [baris]));
    assert.equal((await genderOf(db, baris)).gender, 'male');
  });

  test('a profile healed without a gender gets one from its character', async () => {
    const db = await buildDatabase();
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    await db.query('delete from profiles where id = $1', [baris]);
    await asUser(db, baris, (tx) => tx.query(
      `insert into profiles (id, display_name, avatar_character) values ($1, 'Baris', 'baris')
       on conflict do nothing`, [baris]));
    assert.equal((await genderOf(db, baris)).gender, 'male');
  });

  test('can change while unpaired, not while paired, and again after ending', async () => {
    const db = await buildDatabase();
    const { mae } = await seedCouple(db);
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'female' });

    await setGender(db, noah, 'male');
    assert.equal((await genderOf(db, noah)).gender, 'male');

    assert.equal(await errorOf(setGender(db, mae, 'male')), 'cannot change gender while paired');
    await asUser(db, mae, (tx) => tx.query(`update profiles set display_name = 'Mae B' where id = $1`, [mae]));

    await endCouple(db, mae);
    await setGender(db, mae, 'male');
    assert.equal((await genderOf(db, mae)).gender, 'male');
  });
});

describe('opposite-gender pairing', () => {
  test('a woman and a man pair, in either direction', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    const ada = await signUp(db, { email: 'ada@test.local', name: 'Ada', gender: 'female' });
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'male' });
    assert.ok(await pair(db, mae, baris));
    assert.ok(await pair(db, noah, ada));
  });

  test('two women or two men cannot, and nothing is used up trying', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const ada = await signUp(db, { email: 'ada@test.local', name: 'Ada', gender: 'female' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'male' });

    const maesCode = await generateInvite(db, mae);
    assert.equal(await errorOf(redeemInvite(db, ada, maesCode)), OPPOSITE_ONLY);
    const barisCode = await generateInvite(db, baris);
    assert.equal(await errorOf(redeemInvite(db, noah, barisCode)), OPPOSITE_ONLY);

    // the refused attempt rolled back: Mae's code still pairs her with a man
    assert.ok(await redeemInvite(db, noah, maesCode));
  });

  test('an ended same-gender couple from before the rule cannot come back', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const ada = await signUp(db, { email: 'ada@test.local', name: 'Ada', gender: 'female' });
    await db.query(
      `insert into couples (user1_id, user2_id, ended_at) values ($1, $2, now())`, [mae, ada]);
    assert.equal(await errorOf(redeemInvite(db, ada, await generateInvite(db, mae))), OPPOSITE_ONLY);
  });

  test('changing gender cannot slip past the check', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'male' });
    await pair(db, mae, noah);
    assert.equal(await errorOf(setGender(db, noah, 'female')), 'cannot change gender while paired');
  });
});

describe('invite codes', () => {
  const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

  const unpaired = async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', gender: 'male' });
    return { db, mae, baris };
  };

  /** Makes the generator return `code` every time, to force collisions. */
  const fixCode = (db: PGlite, code: string) =>
    db.exec(`create or replace function private.random_invite_code() returns text
             language sql as $$ select '${code}' $$`);

  test('are six unambiguous characters, spread across the whole alphabet', async () => {
    const { db } = await unpaired();
    const { rows } = await db.query<{ code: string }>(
      'select private.random_invite_code() as code from generate_series(1, 2000)');
    const seen = new Set<string>();
    for (const { code } of rows) {
      assert.match(code, CODE);
      for (const char of code) seen.add(char);
    }
    assert.equal(seen.size, 31);
  });

  test('last seven days', async () => {
    const { db, mae } = await unpaired();
    await generateInvite(db, mae);
    const { rows } = await db.query<{ days: number }>(
      `select extract(epoch from expires_at - now()) / 86400 as days from couple_invites`);
    assert.ok(Math.abs(rows[0].days - 7) < 0.01);
  });

  test('a new code replaces the old one', async () => {
    const { db, mae, baris } = await unpaired();
    const first = await generateInvite(db, mae);
    const second = await generateInvite(db, mae);
    assert.equal(await redeemInvite(db, baris, first === second ? 'ZZZZZZ' : first), null);
    assert.ok(await redeemInvite(db, baris, second.toLowerCase()), 'case and spacing do not matter');
  });

  test('redeeming deletes both people’s codes', async () => {
    const { db, mae, baris } = await unpaired();
    await generateInvite(db, baris);
    await pair(db, mae, baris);
    const { rows } = await db.query('select code from couple_invites');
    assert.equal(rows.length, 0);
  });

  test('an expired code says so', async () => {
    const { db, mae, baris } = await unpaired();
    const code = await generateInvite(db, mae);
    await db.query(`update couple_invites set expires_at = now() - interval '1 minute'`);
    assert.equal(await errorOf(redeemInvite(db, baris, code)), 'invite expired');
  });

  test('a code nobody can redeem is handed out again', async () => {
    const { db, mae, baris } = await unpaired();
    await fixCode(db, 'AAAAAA');
    await generateInvite(db, mae);
    await db.query(`update couple_invites set expires_at = now() - interval '1 minute'`);

    assert.equal(await generateInvite(db, baris), 'AAAAAA');
    const { rows } = await db.query<{ created_by: string }>('select created_by from couple_invites');
    assert.deepEqual(rows.map((row) => row.created_by), [baris]);
  });

  test('a live code is never taken over', async () => {
    const { db, mae, baris } = await unpaired();
    await fixCode(db, 'AAAAAA');
    await generateInvite(db, mae);
    assert.equal(await errorOf(generateInvite(db, baris)), 'could not make a code, try again');
    assert.ok(await redeemInvite(db, baris, 'AAAAAA'), "Mae's code still works");
  });

  test('the migration drops spent codes and shortens live ones', async () => {
    const db = await buildDatabase({ through: BEFORE });
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', character: 'mae' });
    const baris = await signUp(db, { email: 'baris@test.local', name: 'Baris', character: 'baris' });
    await generateInvite(db, mae); // a year, under the old function
    await generateInvite(db, baris);
    await generateInvite(db, baris); // marks the first one used
    await migrate(db, { after: BEFORE });

    const { rows } = await db.query<{ days: number }>(
      `select extract(epoch from expires_at - now()) / 86400 as days from couple_invites order by 1`);
    assert.equal(rows.length, 2);
    for (const { days } of rows) assert.ok(days <= 7.001);
  });
});

describe('guessing codes', () => {
  const guesser = async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const eve = await signUp(db, { email: 'eve@test.local', name: 'Eve', gender: 'male' });
    const code = await generateInvite(db, mae);
    const wrong = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    return { db, mae, eve, code, wrong };
  };

  test('a wrong code returns no couple instead of raising, and is remembered', async () => {
    const { db, eve, wrong } = await guesser();
    assert.equal(await redeemInvite(db, eve, wrong), null);
    const { rows } = await db.query('select 1 from private.invite_misses where user_id = $1', [eve]);
    assert.equal(rows.length, 1);
  });

  test('ten misses lock the account out, even with the right code', async () => {
    const { db, eve, code, wrong } = await guesser();
    for (let i = 0; i < 10; i++) assert.equal(await redeemInvite(db, eve, wrong), null);
    assert.equal(await errorOf(redeemInvite(db, eve, code)), 'too many tries, wait a few minutes and try again');
  });

  test('misses age out after fifteen minutes', async () => {
    const { db, eve, code, wrong } = await guesser();
    for (let i = 0; i < 10; i++) await redeemInvite(db, eve, wrong);
    await db.query(`update private.invite_misses set missed_at = now() - interval '15 minutes'`);
    assert.ok(await redeemInvite(db, eve, code));
    const { rows } = await db.query('select 1 from private.invite_misses');
    assert.equal(rows.length, 0, 'old misses are pruned');
  });

  test('misses are per person', async () => {
    const { db, eve, wrong, code } = await guesser();
    for (let i = 0; i < 10; i++) await redeemInvite(db, eve, wrong);
    const noah = await signUp(db, { email: 'noah@test.local', name: 'Noah', gender: 'male' });
    assert.ok(await redeemInvite(db, noah, code));
  });

  test('nobody signed in can read or write the record of misses', async () => {
    const { db, eve, wrong } = await guesser();
    await redeemInvite(db, eve, wrong);
    for (const sql of ['select * from private.invite_misses', 'delete from private.invite_misses']) {
      assert.match(await errorOf(asUser(db, eve, (tx) => tx.query(sql))) ?? '', /permission denied/, sql);
    }
  });
});
