/**
 * Reads the linked project's schema through the Supabase CLI's Management API
 * connection: SELECTs against system catalogs only, so no database password
 * is involved and no user data is read.
 */
import { execFileSync } from 'node:child_process';

import { CATALOG_QUERIES, type Catalog, type CatalogName } from './catalog.ts';

function queryLinked(sql: string): Record<string, unknown>[] {
  // --read-only: since CLI 3, a query against production that isn't marked
  // read-only stops to ask for confirmation, which a script cannot give
  const args = ['--no-install', 'supabase', 'db', 'query', '--remote', '--read-only', sql];
  const stdout = execFileSync('npx', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const json = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { rows?: Record<string, unknown>[] };
  if (!json.rows) throw new Error(`unexpected CLI output for: ${sql.slice(0, 80)}`);
  return json.rows;
}

export function readLinkedCatalog(log: (line: string) => void = () => {}): Catalog {
  const catalog = {} as Catalog;
  for (const name of Object.keys(CATALOG_QUERIES) as CatalogName[]) {
    catalog[name] = queryLinked(CATALOG_QUERIES[name]);
    log(`  ${name.padEnd(16)} ${catalog[name].length}`);
  }
  return catalog;
}
