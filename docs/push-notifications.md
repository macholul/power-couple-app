# Push notifications

Four notifications, all of them about the other person:

| When | Who hears about it | What it says |
| --- | --- | --- |
| A proof photo is submitted | the partner, who confirms it | "Mae finished a goal" / "“gym” is waiting for you to confirm" |
| A proof is confirmed | whoever sent it | "Baris confirmed your goal" / "“gym” counts for today" |
| A note is sent | the partner | "Mae sent you a note" / the note itself |
| The end of the day, with goals still open | the person whose goals they are | "keep the streak going" / "2 goals left today — you’ve got this" |

Each one can be turned off on its own in account settings, and iOS's own
permission is asked for in the app first, with a reason, rather than at launch.

## How it works

Postgres decides, the Edge Function sends.

1. **The decision is a row.** Triggers on `task_completions` and `love_notes`
   write into `private.push_outbox` (migration
   `20261030000000_push_notifications.sql`). Everything goes through
   `private.enqueue_push()`, which drops a notification unless the recipient
   wants that kind, has a phone registered, and has not been sent this exact
   notification already. That last rule is why a retaken proof, a repeated
   cron tick or a redelivery cannot arrive twice.
2. **The phone registers itself.** `src/lib/push.tsx` asks iOS, gets an Expo
   push token, and calls `register_push_device()`. The token is the primary
   key of `private.push_devices`, so a phone has exactly one row and signing
   in as someone else moves it to them. Signing out calls
   `forget_push_device()` first, while the session still works.
3. **The function sends.** `supabase/functions/push` claims a batch with
   `claim_push_batch()`, posts to Expo's push service, and records the outcome
   with `finish_push()`. A token Expo reports as `DeviceNotRegistered` is
   deleted there and then, which is the only way a stale token ever leaves the
   table.
4. **Two things call the function.** The app calls it (`flushPush()`) right
   after submitting a proof, confirming one, or sending a note, so the
   partner's phone buzzes in seconds. The schedule calls it every 15 minutes
   with `{"task":"reminders"}`, which queues the daily reminders, prunes the
   queue, and drains anything the app failed to flush.

Nothing in a user's request waits on Apple, and no notification is lost
because the app was killed a moment after the write.

The reminder is per person, on their own clock: `profiles.reminder_hour`
(default 20) in `profiles.timezone`. The sweep runs every 15 minutes and only
queues for people whose local hour matches, so whole-hour, half-hour and
quarter-hour timezones all work. The local date is the dedupe key, so nobody
gets two in a day however often the sweep runs.

What it deliberately does not do: set a badge number (so it never asks for
badge permission), keep an in-app list of past notifications, offer quiet
hours, or let the reminder hour be changed in the app. The column is there
when that last one is wanted.

## Steps only you can do

### 1. An Apple push key

Expo delivers through Apple, and Apple needs a key for this team. EAS creates
and keeps it:

```bash
npx eas-cli@latest credentials --platform ios
```

Choose the production profile, then **Push Notifications: Manage your Apple
Push Notifications Key** → set up a new key. Apple allows two push keys per
account, and one key works for every app on the team. The next production
build then carries the push entitlement; builds made before this do not, and
`getExpoPushTokenAsync()` simply fails on them, which the app treats as "no
notifications" rather than an error.

### 2. Deploy the function and the schema

Claude runs these, or you can:

```bash
npx supabase db push
npx supabase functions deploy push --use-api
npm run db:verify
```

### 3. Schedule the sweep

In the dashboard, **Integrations → Cron → Create job**:

- name: `push-reminders`
- schedule: `*/15 * * * *`
- type: Supabase Edge Function, `push`, method `POST`
- body: `{"task":"reminders"}`
- timeout: 20000 ms

The job must authenticate as the service role: the function refuses the
reminder sweep from anything but the secret key, so nobody's phone can trigger
other people's reminders. The dashboard fills the header in for you. The same
thing in SQL, with `pg_cron` and `pg_net` enabled under **Database →
Extensions**, is below — run it in the SQL editor and never commit it, because
it contains the key:

```sql
-- paste your own project's secret key; this is not for the repository
select vault.create_secret('<secret key>', 'push_function_key');

select cron.schedule('push-reminders', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://imhpwatxupusiiujwvdr.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'push_function_key'
      )
    ),
    body := '{"task":"reminders"}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
```

96 runs a day is about 2,900 function calls a month, against 500,000 included
in Supabase's free plan.

### 4. A new build, and App Store Connect

Notifications need native code, so they arrive with a build:

```bash
npm run preflight
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Two things change in App Store Connect, both already written down:

- **App Privacy** gains **Identifiers → Device ID**
  ([privacy-labels.md](app-store/privacy-labels.md)), because the push token
  is stored against the account.
- **App Review information**: the notes already describe Expo and Apple as the
  services that carry notifications
  ([review-notes.md](app-store/review-notes.md)).

The privacy policy was updated with the feature (effective 30 October 2026):
it names Expo and Apple, says what they receive, and says how long a token is
kept. A build carries the policy text it was made with, so the build for this
feature is the one that must carry the new text.

Guideline 4.5.4 asks that push notifications are not required for the app to
work and that they can be turned off. Both hold: everything works with them
off, iOS's permission is asked for in the app, and each kind has its own
switch in account settings.

### 5. Optional: lock down who may send

By default anyone with the project's push tokens could send notifications
through Expo. Turning on **Enhanced Security for Push Notifications** in the
EAS dashboard makes Expo require an access token instead. Create one under
your Expo account's access tokens, then:

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=<token>
npx supabase functions deploy push --use-api
```

The function sends the header whenever that secret is set, and leaves it out
when it is not, so the order of those two steps does not matter.

## Trying it out

Notifications only reach a real phone, from a build made after step 1. With
two phones, or one phone and the simulator, submit a proof on one side and
watch the other. One phone alone can still see the reminder: in the SQL
editor, set your own reminder hour to the hour it is now in your timezone and
wait for the next quarter hour.

```sql
update public.profiles
set reminder_hour = extract(hour from (now() at time zone timezone))::smallint
where id = '<your user id>';
```

To check the machinery without waiting, send yourself one by hand. This is
also how to see what a notification looks like:

```sql
select private.enqueue_push(
  '<your user id>', 'note', 'test-' || now()::text,
  'powercouple', 'this is what one looks like'
);
```

Then drain it:

```bash
curl -s -X POST 'https://imhpwatxupusiiujwvdr.supabase.co/functions/v1/push' \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H 'content-type: application/json' -d '{"task":"drain"}'
```

It answers with how many were sent, how many failed, and how many dead tokens
it forgot. When something does not arrive, the reason is in the queue:

```sql
select kind, title, queued_at, sent_at, attempts, last_error
from private.push_outbox order by id desc limit 20;
```

An empty queue after an action means `enqueue_push()` said no: no device
registered, or the switch is off. `select * from private.push_devices` shows
which phones are known.
