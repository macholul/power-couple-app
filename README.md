# powercouple

An iPhone app for two partners: each sets goals for the days of the week,
sends photo proof when one is done, and the other confirms it. Days where
both finished everything build a shared streak.

Built with Expo (SDK 57, expo-router, React Native 0.86) on a Supabase backend
(Postgres, Auth, Storage, one Edge Function). It began as a Next.js web app;
this is the native port, sharing the same database.

## Run it

You need Node 22+, Xcode, and CocoaPods.

```bash
npm install
cp .env.example .env
```

Fill `.env` from Supabase → Project Settings → API: the project URL and the
anon (public) key.

```bash
npm run ios
```

This builds the native app (the `ios/` folder is generated from `app.json`
and never committed) and opens it in the simulator. If CocoaPods fails with
an encoding error, run `export LANG=en_US.UTF-8` first.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run ios` | Native build on the iOS simulator |
| `npm start` | Metro only, for an app that is already installed |
| `npm run typecheck` | TypeScript for the app, the database tests, and scripts |
| `npm run lint` | ESLint |
| `npm run db:test` | The database test suite, in an in-process Postgres |
| `npm run db:verify` | Checks production's schema still matches the migrations |
| `npm run legal:export` | Writes the in-app policies to `docs/legal` |
| `npm run preflight` | Everything above that runs offline, plus release checks |

In a development build, `/self-test` runs the date and streak logic on
Hermes itself.

## Layout

```
src/app/          screens; the folder structure is the routing
  (auth)/         log in, sign up, email codes, password reset
  (app)/          home and profile, for paired users
  pairing.tsx     invite codes
  account.tsx     settings, unpairing, account deletion
  legal/          privacy policy and terms
src/components/   UI pieces
src/lib/          data, actions, auth, streak math
src/content/      the policy text, shared with docs/legal
supabase/         migrations, tests, the delete-account function, email templates
docs/app-store/   release checklist, privacy labels, review notes
```

How screens decide where someone belongs (signed out, unpaired, paired) lives
in `src/lib/viewer.tsx` and `src/components/gate.tsx`.

## Database

Every schema change is a migration in `supabase/migrations`, tested in
`supabase/tests` before it reaches production. `supabase/README.md` covers
the workflow and the rules the tests enforce.

## Releasing

`docs/app-store/README.md` lists the steps that need a person: dashboard
settings, legal details, EAS, and App Store Connect.
