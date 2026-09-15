# Database

The schema for the linked Supabase project, as migrations, with tests that
run against a real Postgres in-process.

```
migrations/   applied in filename order; the only place schema changes go
tests/        PGlite (Postgres 18, in WASM) + Supabase platform stand-ins
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

1. Add a file: `npx supabase migration new <what_it_does>`
2. Write tests for it in `tests/` and run `npm run db:test`
3. See exactly what would run: `npx supabase db push --dry-run`
4. Apply: `npx supabase db push`
5. Re-snapshot and confirm files and production still agree:
   `npm run db:snapshot`, then point `baseline.test.ts`-style checks at it

Never edit a migration that has been applied. Write a new one.

## Rules the tests enforce

- A `SECURITY DEFINER` function in `public` is never executable by `anon`.
- Table writes that matter go through functions; policies grant only what a
  client writes directly, and column grants narrow `UPDATE` to what the apps
  actually change.
