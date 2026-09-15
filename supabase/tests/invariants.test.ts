/**
 * Rules every future migration must keep, checked against the catalog rather
 * than case by case. Each query is first shown to find the problems
 * Supabase's own advisors reported on the production baseline, so a passing
 * run on the latest schema means "none left", not "the query is broken".
 */
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';

import { buildDatabase } from './db.ts';

const BASELINE = '20260915000000_production_baseline.sql';

const RULES = {
  /** advisor 0028: callable over the API without signing in */
  definerFunctionsAnonCanRun: `
    select p.oid::regprocedure::text as found
    from pg_proc p
    where p.pronamespace in (select oid from pg_namespace where nspname in ('public', 'private'))
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
    order by 1`,

  /** advisor 0011: a definer function that resolves names through the caller's path */
  definerFunctionsWithoutSearchPath: `
    select p.oid::regprocedure::text as found
    from pg_proc p
    where p.pronamespace in (select oid from pg_namespace where nspname in ('public', 'private'))
      and p.prosecdef
      and not exists (select 1 from unnest(p.proconfig) setting where setting like 'search_path=%')
    order by 1`,

  /** advisor 0001 */
  foreignKeysWithoutIndex: `
    select c.conrelid::regclass::text || '.' || c.conname as found
    from pg_constraint c
    where c.contype = 'f'
      and c.connamespace in (select oid from pg_namespace where nspname in ('public', 'private'))
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
      )
    order by 1`,

  /** anon and authenticated hold every table privilege, so RLS is the only guard */
  tablesWithoutRls: `
    select c.oid::regclass::text as found
    from pg_class c
    where c.relnamespace in (select oid from pg_namespace where nspname in ('public', 'private'))
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by 1`,

  /** anon never needs to evaluate a policy: every app table is signed-in only */
  policiesNotForAuthenticated: `
    select schemaname || '.' || tablename || ': ' || policyname as found
    from pg_policies
    where (schemaname = 'public'
       or (schemaname = 'storage' and coalesce(qual, with_check) like '%completion-photos%'))
      and roles <> '{authenticated}'
    order by 1`,
} as const;

async function findings(db: PGlite, sql: string): Promise<string[]> {
  return (await db.query<{ found: string }>(sql)).rows.map((row) => row.found);
}

describe('each rule finds what the advisors found on the baseline', () => {
  let db: PGlite;
  before(async () => {
    db = await buildDatabase({ through: BASELINE });
  });

  test('definer functions anon can run', async () => {
    assert.deepEqual(await findings(db, RULES.definerFunctionsAnonCanRun), [
      'approve_completion(uuid)', 'generate_invite()', 'handle_new_user()', 'my_couple_id()',
      'record_today_schedule()', 'redeem_invite(text)', 'submit_completion(uuid,text)',
    ]);
  });

  test('definer functions without a search_path', async () => {
    assert.deepEqual(await findings(db, RULES.definerFunctionsWithoutSearchPath), ['handle_new_user()']);
  });

  test('foreign keys without an index', async () => {
    assert.deepEqual(await findings(db, RULES.foreignKeysWithoutIndex), [
      'couple_invites.couple_invites_created_by_fkey',
      'couples.couples_user2_id_fkey',
      'love_notes.love_notes_couple_id_fkey',
      'love_notes.love_notes_sender_id_fkey',
      'task_completions.task_completions_reviewed_by_fkey',
      'task_completions.task_completions_submitted_by_fkey',
      'task_completions.task_completions_task_id_fkey',
      'tasks.tasks_assigned_to_fkey',
      'tasks.tasks_couple_id_fkey',
    ]);
  });

  test('policies not limited to signed-in users', async () => {
    assert.ok((await findings(db, RULES.policiesNotForAuthenticated)).length > 0);
  });
});

describe('the latest schema breaks none of the rules', () => {
  let db: PGlite;
  before(async () => {
    db = await buildDatabase();
  });

  for (const [rule, sql] of Object.entries(RULES)) {
    test(rule, async () => {
      assert.deepEqual(await findings(db, sql), []);
    });
  }

  test('in the private schema, signed-in users can run only the two policy helpers', async () => {
    const { rows } = await db.query<{ name: string }>(`
      select p.oid::regprocedure::text as name
      from pg_proc p
      where p.pronamespace = 'private'::regnamespace
        and has_function_privilege('authenticated', p.oid, 'execute')
      order by 1`);
    assert.deepEqual(rows.map((row) => row.name), [
      'private.current_couple_id()', 'private.current_partner_id()',
    ]);
  });
});
