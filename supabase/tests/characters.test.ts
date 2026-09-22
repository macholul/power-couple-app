/**
 * The characters people pick, a few per gender: what sign-up, choosing in
 * account settings, and a gender change do with them.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { asAnon, asUser, buildDatabase, errorOf, migrate } from './db.ts';
import { seedCouple } from './seed.ts';

const BEFORE = '20260922000000_account_lookup.sql';

/** The latest schema, with a second character for each gender to choose. */
async function withChoices() {
  const db = await buildDatabase();
  await db.exec(`insert into private.characters (key, gender) values ('luna', 'female'), ('kai', 'male')`);
  return db;
}

/** A sign-up exactly as the app sends it: nothing but the auth metadata. */
async function signUpWith(db: PGlite, metadata: Record<string, string>): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [`${crypto.randomUUID()}@test.local`, JSON.stringify({ display_name: 'Someone', ...metadata })],
  );
  return rows[0].id;
}

async function profileOf(db: PGlite, id: string) {
  const { rows } = await db.query<{ gender: string; avatar_character: string }>(
    'select gender, avatar_character from profiles where id = $1',
    [id],
  );
  return { ...rows[0] };
}

const update = (db: PGlite, id: string, changes: Record<string, string>) =>
  asUser(db, id, (tx) => {
    const columns = Object.keys(changes);
    const set = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
    return tx.query(`update profiles set ${set} where id = $1`, [id, ...Object.values(changes)]);
  });

describe('characters', () => {
  test('sign-up keeps a character of the gender chosen', async () => {
    const db = await withChoices();
    const id = await signUpWith(db, { gender: 'female', avatar_character: 'luna' });
    assert.deepEqual(await profileOf(db, id), { gender: 'female', avatar_character: 'luna' });
  });

  test("sign-up gives the gender's default for another gender's character, an unknown one, or none", async () => {
    const db = await withChoices();
    const theirs = await signUpWith(db, { gender: 'male', avatar_character: 'luna' });
    const unknown = await signUpWith(db, { gender: 'female', avatar_character: 'zeta' });
    const none = await signUpWith(db, { gender: 'male' });
    assert.deepEqual(await profileOf(db, theirs), { gender: 'male', avatar_character: 'baris' });
    assert.deepEqual(await profileOf(db, unknown), { gender: 'female', avatar_character: 'mae' });
    assert.deepEqual(await profileOf(db, none), { gender: 'male', avatar_character: 'baris' });
  });

  test('without a gender, the character decides it, as the old web app signed up', async () => {
    const db = await withChoices();
    const kai = await signUpWith(db, { avatar_character: 'kai' });
    const nothing = await signUpWith(db, {});
    assert.deepEqual(await profileOf(db, kai), { gender: 'male', avatar_character: 'kai' });
    assert.deepEqual(await profileOf(db, nothing), { gender: 'female', avatar_character: 'mae' });
  });

  test('people can switch to another character of their gender, and to nothing else', async () => {
    const db = await withChoices();
    const id = await signUpWith(db, { gender: 'female' });
    await update(db, id, { avatar_character: 'luna' });
    assert.equal((await profileOf(db, id)).avatar_character, 'luna');

    assert.match(await errorOf(update(db, id, { avatar_character: 'kai' })) ?? '', /profiles_character_fits_gender/);
    assert.match(await errorOf(update(db, id, { avatar_character: 'zeta' })) ?? '', /profiles_character_fits_gender/);
    assert.equal((await profileOf(db, id)).avatar_character, 'luna', 'the refused choices changed nothing');
  });

  test("a gender change switches to the new gender's default, unless a fitting character comes with it", async () => {
    const db = await withChoices();
    const id = await signUpWith(db, { gender: 'female', avatar_character: 'luna' });
    await update(db, id, { gender: 'male' });
    assert.deepEqual(await profileOf(db, id), { gender: 'male', avatar_character: 'baris' });

    await update(db, id, { gender: 'female', avatar_character: 'luna' });
    assert.deepEqual(await profileOf(db, id), { gender: 'female', avatar_character: 'luna' });
  });

  test('a character someone uses cannot be removed, and each gender has one default', async () => {
    const db = await withChoices();
    await signUpWith(db, { gender: 'male', avatar_character: 'kai' });
    assert.match(await errorOf(db.query(`delete from private.characters where key = 'kai'`)) ?? '', /profiles_character_fits_gender/);
    assert.match(
      await errorOf(db.query(`update private.characters set is_default = true where key = 'luna'`)) ?? '',
      /characters_one_default_per_gender/,
    );
  });

  test('nobody can read or change the list through the API', async () => {
    const db = await withChoices();
    const id = await signUpWith(db, { gender: 'female' });
    const read = 'select key from private.characters';
    const write = `insert into private.characters (key, gender) values ('mine', 'female')`;
    for (const run of [(sql: string) => asAnon(db, (tx) => tx.query(sql)), (sql: string) => asUser(db, id, (tx) => tx.query(sql))]) {
      assert.match(await errorOf(run(read)) ?? '', /permission denied/);
      assert.match(await errorOf(run(write)) ?? '', /permission denied/);
    }
  });

  test('applies cleanly over the profiles that already exist', async () => {
    const db = await buildDatabase({ through: BEFORE });
    const { mae, baris } = await seedCouple(db);
    await migrate(db, { after: BEFORE });
    assert.deepEqual(await profileOf(db, mae), { gender: 'female', avatar_character: 'mae' });
    assert.deepEqual(await profileOf(db, baris), { gender: 'male', avatar_character: 'baris' });
  });
});
