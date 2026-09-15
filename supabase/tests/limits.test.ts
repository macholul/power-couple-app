/**
 * Length and shape limits on what clients store, checked through the same
 * writes the apps make.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { asUser, buildDatabase, errorOf, migrate } from './db.ts';
import { seedCouple, signUp } from './seed.ts';

const BEFORE = '20260915000300_pairing_rules.sql';

describe('limits', () => {
  test('names: up to 30 characters, never blank', async () => {
    const db = await buildDatabase();
    const { mae } = await seedCouple(db);
    const rename = (name: string) => asUser(db, mae, (tx) =>
      tx.query('update profiles set display_name = $2 where id = $1', [mae, name]));
    await rename('M'.repeat(30));
    assert.match(await errorOf(rename('M'.repeat(31))) ?? '', /profiles_display_name_length/);
    assert.match(await errorOf(rename('   ')) ?? '', /profiles_display_name_length/);
  });

  test('a signup with a long or blank name still succeeds, shortened or defaulted', async () => {
    const db = await buildDatabase();
    const long = await signUp(db, { email: 'long@test.local', name: `  ${'x'.repeat(29)} yz  ` });
    const blank = await signUp(db, { email: 'blank@test.local', name: '   ' });
    const { rows } = await db.query<{ id: string; display_name: string }>(
      'select id, display_name from profiles where id in ($1, $2)', [long, blank]);
    const nameOf = (id: string) => rows.find((row) => row.id === id)?.display_name;
    assert.equal(nameOf(long), 'x'.repeat(29), 'cut to 30, then trimmed');
    assert.equal(nameOf(blank), 'New User');
  });

  test('goals: a title up to 60 characters, and real weekdays', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedCouple(db);
    const insert = (title: string, weekdays: number[]) => asUser(db, mae, (tx) =>
      tx.query('insert into tasks (couple_id, assigned_to, title, scheduled_weekdays) values ($1, $2, $3, $4)',
        [coupleId, mae, title, weekdays]));
    await insert('g'.repeat(60), [0, 6]);
    assert.match(await errorOf(insert('g'.repeat(61), [1])) ?? '', /tasks_title_length/);
    assert.match(await errorOf(insert(' ', [1])) ?? '', /tasks_title_length/);
    assert.match(await errorOf(insert('run', [])) ?? '', /tasks_scheduled_weekdays_valid/);
    assert.match(await errorOf(insert('run', [7])) ?? '', /tasks_scheduled_weekdays_valid/);
  });

  test('notes: up to 80 characters, never blank', async () => {
    const db = await buildDatabase();
    const { mae, coupleId } = await seedCouple(db);
    const send = (text: string) => asUser(db, mae, (tx) =>
      tx.query('insert into love_notes (couple_id, sender_id, text) values ($1, $2, $3)', [coupleId, mae, text]));
    await send('n'.repeat(80));
    assert.match(await errorOf(send('n'.repeat(81))) ?? '', /love_notes_text_length/);
    assert.match(await errorOf(send('')) ?? '', /love_notes_text_length/);
  });

  test('timezones: at most 64 characters', async () => {
    const db = await buildDatabase();
    const { mae } = await seedCouple(db);
    const error = await errorOf(asUser(db, mae, (tx) =>
      tx.query('update profiles set timezone = $2 where id = $1', [mae, 'z'.repeat(65)])));
    assert.match(error ?? '', /profiles_timezone_length/);
  });

  test('apply cleanly over data the apps already wrote', async () => {
    const db = await buildDatabase({ through: BEFORE });
    await seedCouple(db);
    await migrate(db, { after: BEFORE });
  });
});
