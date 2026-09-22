/**
 * The account check behind the password reset screen, made the way the
 * account-exists Edge Function makes it: as the service role.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asAnon, asService, asUser, buildDatabase, errorOf } from './db.ts';
import { signUp } from './seed.ts';

const lookUp = (db: PGlite, email: string) =>
  asService(db, async (tx) =>
    (await tx.query<{ found: boolean | null }>('select public.account_exists($1) as found', [email]))
      .rows[0].found);

describe('account lookup', () => {
  test('says whether an account uses the email, however it is typed', async () => {
    const db = await buildDatabase();
    await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    assert.equal(await lookUp(db, 'mae@test.local'), true);
    assert.equal(await lookUp(db, '  Mae@Test.Local '), true);
    assert.equal(await lookUp(db, 'nobody@test.local'), false);
  });

  test('only the service role may ask', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    const call = `select public.account_exists('mae@test.local')`;
    assert.match(await errorOf(asAnon(db, (tx) => tx.query(call))) ?? '', /permission denied/);
    assert.match(await errorOf(asUser(db, mae, (tx) => tx.query(call))) ?? '', /permission denied/);
  });

  test('answers 30 times per 15 minutes for the whole project, then null until those age out', async () => {
    const db = await buildDatabase();
    for (let i = 0; i < 30; i++) assert.equal(await lookUp(db, `n${i}@test.local`), false);
    assert.equal(await lookUp(db, 'n30@test.local'), null);
    await db.query(`update private.account_lookups set looked_at = now() - interval '15 minutes'`);
    assert.equal(await lookUp(db, 'n31@test.local'), false);
  });

  test('records only when each lookup happened, and nobody else can read the record', async () => {
    const db = await buildDatabase();
    const mae = await signUp(db, { email: 'mae@test.local', name: 'Mae', gender: 'female' });
    await lookUp(db, 'mae@test.local');
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'private' and table_name = 'account_lookups' order by ordinal_position`);
    assert.deepEqual(rows.map((row) => row.column_name), ['id', 'looked_at']);

    const read = 'select count(*) from private.account_lookups';
    assert.match(await errorOf(asAnon(db, (tx) => tx.query(read))) ?? '', /permission denied/);
    assert.match(await errorOf(asUser(db, mae, (tx) => tx.query(read))) ?? '', /permission denied/);
  });
});
