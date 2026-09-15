import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDatabase, exportCatalog, snapshot } from './db.ts';
import { diffCatalogs } from './catalog.ts';

test('the baseline migration reproduces production as it was on 2026-09-15', async () => {
  const db = await buildDatabase({ through: '20260915000000_production_baseline.sql' });
  const differences = diffCatalogs(snapshot('production-2026-09-15'), await exportCatalog(db));
  assert.deepEqual(differences, [], differences.join('\n'));
});
