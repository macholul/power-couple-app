/**
 * Builds a throwaway Postgres (PGlite, in-process) from the migration files,
 * and runs statements as the roles Supabase's servers would switch to.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';

import { CATALOG_QUERIES, type Catalog, type CatalogName } from './catalog.ts';

const TESTS = import.meta.dirname;
const MIGRATIONS = join(TESTS, '..', 'migrations');
const read = (path: string) => readFileSync(path, 'utf8');

export const migrationFiles = () =>
  readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();

/**
 * The baseline migration is production's schema as of 2026-09-15, so every
 * build starts from what users are actually running against.
 *
 * `through` stops after that migration file (inclusive), which is how a test
 * gets the database as it was before a change.
 */
export async function buildDatabase({ through }: { through?: string } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(read(join(TESTS, 'platform.sql')));
  await migrate(db, { through });
  return db;
}

/**
 * Applies the migration files after `after` (exclusive) through `through`
 * (inclusive). With both left out, that is all of them. A test builds up to
 * the file before a change, seeds data the old way, then calls this to see
 * what the change does to rows that already exist.
 */
export async function migrate(db: PGlite, { after, through }: { after?: string; through?: string } = {}) {
  for (const file of migrationFiles()) {
    if (after && file <= after) continue;
    if (through && file > through) break;
    try {
      await db.exec(read(join(MIGRATIONS, file)));
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export async function exportCatalog(db: PGlite): Promise<Catalog> {
  const catalog = {} as Catalog;
  for (const name of Object.keys(CATALOG_QUERIES) as CatalogName[]) {
    catalog[name] = (await db.query<Record<string, unknown>>(CATALOG_QUERIES[name])).rows;
  }
  return catalog;
}

export function snapshot(name: string): Catalog {
  return JSON.parse(read(join(TESTS, 'fixtures', `${name}.json`))) as Catalog;
}

// --------------------------------------------------------------- acting as

type Work<T> = (tx: Transaction) => Promise<T>;

async function asRole<T>(db: PGlite, role: string, claims: object, work: Work<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    return work(tx);
  });
}

/** A signed-in user, as PostgREST runs their requests. */
export const asUser = <T>(db: PGlite, userId: string, work: Work<T>) =>
  asRole(db, 'authenticated', { sub: userId, role: 'authenticated' }, work);

/** Someone holding only the anon key. */
export const asAnon = <T>(db: PGlite, work: Work<T>) => asRole(db, 'anon', { role: 'anon' }, work);

/** The service role, as an Edge Function holding the secret key. */
export const asService = <T>(db: PGlite, work: Work<T>) =>
  asRole(db, 'service_role', { role: 'service_role' }, work);

/**
 * The error Postgres raised, or null. Used for RPCs whose whole contract is
 * the message they raise.
 */
export async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
