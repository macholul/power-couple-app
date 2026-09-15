/**
 * Records the linked project's schema into fixtures/production-<date>.json.
 *
 *   npm run db:snapshot
 *
 * Read-only: it runs SELECTs against system catalogs through the Supabase
 * CLI's Management API connection, so no database password is involved and
 * no user data is read.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_QUERIES, normalizeCatalog, type Catalog, type CatalogName } from './catalog.ts';

function queryLinked(sql: string): Record<string, unknown>[] {
  const stdout = execFileSync('npx', ['--no-install', 'supabase', 'db', 'query', '--linked', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const json = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { rows?: Record<string, unknown>[] };
  if (!json.rows) throw new Error(`unexpected CLI output for: ${sql.slice(0, 80)}`);
  return json.rows;
}

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const catalog = {} as Catalog;
for (const name of Object.keys(CATALOG_QUERIES) as CatalogName[]) {
  catalog[name] = queryLinked(CATALOG_QUERIES[name]);
  console.log(`  ${name.padEnd(16)} ${catalog[name].length}`);
}

const path = join(import.meta.dirname, 'fixtures', `production-${date}.json`);
writeFileSync(path, JSON.stringify(normalizeCatalog(catalog), null, 2) + '\n');
console.log(`wrote ${path}`);
