/**
 * Writes the support page, privacy policy and terms of service to site/.
 *
 *   npm run site
 *
 * GitHub Actions runs this and publishes site/ to GitHub Pages
 * (.github/workflows/pages.yml), so nothing built is committed. Run it
 * locally to preview the pages.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SITE_PAGES } from './site-pages.ts';

const out = join(import.meta.dirname, '..', 'site');
rmSync(out, { recursive: true, force: true });
for (const [path, html] of Object.entries(SITE_PAGES)) {
  const file = join(out, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`wrote site/${path}`);
}
