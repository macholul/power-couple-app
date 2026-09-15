/**
 * Does the linked project still match the migration files?
 *
 *   npm run db:verify
 *
 * Builds every migration into a throwaway Postgres and diffs its catalog
 * against production's. Run it after every push, and before writing a
 * migration if anyone may have changed the project from the dashboard.
 * Read-only against production; see linked.ts.
 */
import { diffCatalogs } from './catalog.ts';
import { buildDatabase, exportCatalog } from './db.ts';
import { readLinkedCatalog } from './linked.ts';

console.log('reading the linked project');
const production = readLinkedCatalog(console.log);
console.log('building every migration locally');
const local = await exportCatalog(await buildDatabase());

const problems = diffCatalogs(production, local);
if (problems.length > 0) {
  console.error(`production and the migrations differ in ${problems.length} places:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('production matches the migrations');
