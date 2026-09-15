/**
 * The release checks code can make, run after type checking, lint and the
 * database tests (see `npm run preflight`). Everything that needs a person,
 * such as dashboard settings or App Store Connect, is listed in
 * docs/app-store/README.md instead.
 *
 * Reports every problem it finds, then exits non-zero if there were any.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OPERATOR } from '../src/content/legal.ts';
import { LEGAL_FILES } from './legal-markdown.ts';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const problems: string[] = [];
const check = (ok: unknown, problem: string) => {
  if (!ok) problems.push(problem);
};

// ------------------------------------------------------------------ legal

for (const [key, value] of Object.entries(OPERATOR)) {
  check(!value.startsWith('['), `src/content/legal.ts: OPERATOR.${key} is still a placeholder (${value})`);
}
for (const [name, contents] of Object.entries(LEGAL_FILES)) {
  const path = `docs/legal/${name}`;
  check(existsSync(join(root, path)) && read(path) === contents, `${path} is out of date: run npm run legal:export`);
}

// ------------------------------------------------------------- app config

const expo = JSON.parse(read('app.json')).expo;
check(expo.ios?.bundleIdentifier, 'app.json: ios.bundleIdentifier is missing');
check(
  typeof expo.ios?.config?.usesNonExemptEncryption === 'boolean',
  'app.json: ios.config.usesNonExemptEncryption is not set (App Store Connect would ask on every build)',
);
check(
  expo.ios?.privacyManifests?.NSPrivacyAccessedAPITypes?.length,
  'app.json: ios.privacyManifests declares no required reason APIs',
);
check(
  expo.ios?.privacyManifests?.NSPrivacyCollectedDataTypes?.length,
  'app.json: ios.privacyManifests declares no collected data types',
);
check(expo.extra?.eas?.projectId, 'app.json: no EAS project; run `eas init`');

const pickerOptions = expo.plugins?.find(
  (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
)?.[1];
check(
  pickerOptions?.microphonePermission === false,
  'app.json: expo-image-picker would add a microphone permission the app never uses',
);

const eas = JSON.parse(read('eas.json'));
check(eas.cli?.appVersionSource === 'remote', 'eas.json: cli.appVersionSource should be "remote"');
check(eas.build?.production?.autoIncrement === true, 'eas.json: production builds should autoIncrement');

// --------------------------------------------------------- auth templates

for (const template of ['confirmation', 'recovery']) {
  const path = `supabase/templates/${template}.html`;
  check(
    existsSync(join(root, path)) && read(path).includes('{{ .Token }}'),
    `${path} must contain {{ .Token }}: the app asks for the code, not a link`,
  );
}

// ------------------------------------------------------------------ report

if (problems.length > 0) {
  console.error(`preflight found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nthe steps only a person can do are in docs/app-store/README.md');
  process.exit(1);
}
console.log('preflight passed. the remaining release steps are in docs/app-store/README.md');
