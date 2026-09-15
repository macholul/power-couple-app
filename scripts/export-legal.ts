/**
 * Writes the privacy policy and terms of service to docs/legal as Markdown,
 * for the public URLs App Store Connect asks for.
 *
 *   npm run legal:export
 *
 * The app shows the same text from src/content/legal.ts, so edit that file
 * and export again; never edit the Markdown by hand.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LEGAL_FILES } from './legal-markdown.ts';

const out = join(import.meta.dirname, '..', 'docs', 'legal');
mkdirSync(out, { recursive: true });
for (const [name, contents] of Object.entries(LEGAL_FILES)) {
  writeFileSync(join(out, name), contents);
  console.log(`wrote docs/legal/${name}`);
}
