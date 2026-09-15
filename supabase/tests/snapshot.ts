/**
 * Records the linked project's schema into fixtures/production-<date>.json.
 *
 *   npm run db:snapshot
 *
 * Read-only; see linked.ts.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { normalizeCatalog } from './catalog.ts';
import { readLinkedCatalog } from './linked.ts';

const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const catalog = readLinkedCatalog(console.log);

const path = join(import.meta.dirname, 'fixtures', `production-${date}.json`);
writeFileSync(path, JSON.stringify(normalizeCatalog(catalog), null, 2) + '\n');
console.log(`wrote ${path}`);
