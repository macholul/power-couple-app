# Database

The schema for the linked Supabase project, as migrations, with tests that
run against a real Postgres in-process.

```
migrations/   applied in filename order; the only place schema changes go
tests/        PGlite (Postgres 18, in WASM) + Supabase platform stand-ins
functions/    the Edge Functions (see below)
templates/    the sign-up and password reset emails
history/      the eight migrations the web app ran by hand, kept for reading
```

## How this came to be

The project was built by hand in the SQL editor, then changed by eight
migration files that were also pasted in by hand. Nothing recorded which had
run, and the files could not rebuild the database: `0000` was written after
the fact and misses columns `0001` needs, and production had policies,
constraints and a trigger that no file mentions.

So the first migration here is a **baseline**: production's schema on
2026-09-15, generated from its system catalogs. It is marked as applied on the
linked project and never runs there. `tests/baseline.test.ts` diffs a build of
it against a snapshot of production and must report zero differences.

The old files live in `history/` and are **never to be moved back into
`migrations/`**. `0003` truncates every table and deletes users.

## Changing the schema

1. Confirm nobody changed production from the dashboard: `npm run db:verify`
2. Add a file: `npx supabase migration new <what_it_does>`
3. Write tests for it in `tests/` and run `npm run db:test`
4. See exactly what would run: `npx supabase db push --remote --dry-run`
5. Apply: `npx supabase db push --remote`
6. Confirm production matches the files again: `npm run db:verify`

Never edit a migration that has been applied. Write a new one. Since Supabase
CLI 3, `db push` without `--remote` targets a local database instead of the
linked project.

`db:verify` builds every migration into a throwaway Postgres and diffs its
catalog (tables, constraints, indexes, functions, grants, policies, triggers)
against the linked project's. It reads only system catalogs, never user data,
through the CLI's read-only role. It compares the `public` schema, the storage
policies and the signup trigger; the tables in `private` are outside it.

## Rules the tests enforce

`tests/invariants.test.ts` checks these against the catalog, after first
showing each check finds what Supabase's advisors reported on production:

- No `SECURITY DEFINER` function is executable by `anon`, and every one pins
  its `search_path`.
- Every table has row level security and a primary key, and every foreign
  key has an index.
- Every policy is for `authenticated` only.
- In `private`, signed-in users can run the two policy helpers and nothing
  else.

Beyond those: table writes that matter go through functions, policies grant
only what a client writes directly, and column grants narrow `UPDATE` to
what the apps actually change.

## Edge Functions

| Function | Called by | Credential | What it does |
| --- | --- | --- | --- |
| `delete-account` | the app | the user's session | deletes their photos, then their account |
| `account-exists` | the reset screen, signed out | the anon key | says whether an email has an account |
| `push` | the app, and the cron job | a session, or the secret key | sends queued notifications; the secret key also runs the reminder sweep |

`push` has `verify_jwt = false` in `config.toml` because the cron job sends
the project's secret key in an `apiKey` header rather than as a JWT in
`Authorization`, which the platform's check requires; the function checks
credentials itself. The other two leave the check to the platform. All three
read the secret key through `functions/_shared/secret-key.ts`, so changing
that file means redeploying all three:

```bash
npx supabase functions deploy <name> --use-api
```

A `pg_cron` job, `push-reminders`, calls `push` every 15 minutes. It was made
in the dashboard (Integrations → Cron) because it holds the secret key, so it
is not in a migration; `docs/push-notifications.md` has its settings.

## Advisor findings left on purpose

- *Authenticated can execute SECURITY DEFINER function* (8): the app's RPCs.
  They must write rows row level security keeps clients from writing, and
  each checks the caller itself.
- *RLS enabled, no policy* on `private.invite_misses`,
  `private.account_lookups`, `private.push_devices` and
  `private.push_outbox`: only their functions touch them.
- *Leaked password protection*: a dashboard setting (Pro plan), not schema.
