# Releasing powercouple on the App Store

Everything code can do is done and checked by `npm run preflight`. What is
left needs a person: accounts, dashboards, legal details, and decisions. The
steps below are in the order they unblock each other, so work through them top
to bottom. Where a step says "Claude", it is a command-line job that you can
also run yourself.

Apple's, Resend's and Supabase's figures below were read from their own pages
on 21 September 2026. They change, so check one before you rely on it.

## Your steps, in order

### 1. Expo account and EAS project

Done. The project is `@baristurker/power-couple-app`, linked by `owner` and
`extra.eas.projectId` in `app.json`. It belongs to the personal account, which
is what Expo recommends for solo developers. To move it to another Expo
account, transfer it in the project's settings on expo.dev (Expo allows this a
limited number of times) and change `owner` in `app.json` to match.

EAS's production and preview environments hold the two Supabase values from
`.env`; on 21 September 2026 both matched the file. EAS stores them as plain
text because they start with `EXPO_PUBLIC_`. That is right: both values end up
inside the app, so neither is a secret. If either changes, update `.env` and
upload it again from the project folder while logged in to Expo
(`npx eas-cli@latest login`):

```bash
npx eas-cli@latest env:push --environment production --environment preview --path .env --force
```

### 2. Apple Developer Program

Done: you are enrolled as an individual, so the App Store shows your legal
name as the seller. The membership renews at $99 a year. If it lapses, the app
is removed from the App Store, though it keeps working for people who already
have it.

### 3. The app's name

Done: the App Store name is `powercouple: goals for two`, because Apple
refused plain `powercouple` as already in use. The name under the icon stays
`powercouple`, and so do the policies, the emails and the bundle ID;
[listing.md](listing.md) has the store name and a subtitle that doesn't repeat
"goals".

### 4. Email service

Until custom email is set up, Supabase only emails members of your Supabase
team, at 2 emails an hour, so real users would never receive a sign-up or
reset code.

For now the app sends through Gmail: free, and no domain needed. The costs
are that every email comes from a Gmail address, and that Gmail allows a
personal account about 500 emails a day and blocks sending for 1 to 24 hours
past that. If the app grows, move to your own domain (below).

Done on 21 and 22 September 2026:

- `powercouple@gmail.com`, a Gmail account only the app uses, sends through
  Supabase's [SMTP settings](https://supabase.com/dashboard/project/imhpwatxupusiiujwvdr/auth/smtp):
  host `smtp.gmail.com`, port `465`, sender name `powercouple`, and a Google
  app password. Changing that account's password revokes the app password,
  and the app's emails stop until you create a new one and enter it there.
- The two email templates in `supabase/templates/` are live. They show the
  8-digit code the app asks for, not a link.
- The privacy policy names Google as the email provider, and says that copies
  of account emails stay in the Gmail account for up to 60 days.

Still to do:

1. **Rate limit** (you). In
   [Rate Limits](https://supabase.com/dashboard/project/imhpwatxupusiiujwvdr/auth/rate-limits),
   set the limit for sending emails to 20 an hour, which keeps a whole day
   under Gmail's limit. `config push` doesn't manage this value, so
   `supabase/config.toml` only records it.
2. **Cleanup** (you). Gmail keeps a copy of every email it sends, and those
   contain users' addresses. [gmail-cleanup.gs](gmail-cleanup.gs) trashes
   everything older than 29 days, every day, which keeps the policy's 60-day
   promise. Signed in as `powercouple@gmail.com`, open script.google.com and
   make a new project, paste the file over the code there, and save. Choose
   `setUp` in the function menu and press Run. Google warns that it hasn't
   verified the app, as it does for any script you write yourself: choose
   Advanced, go to the project, and allow access.
3. **Test** (you). Ask the app for a password-reset code for your own address,
   and check that the email arrives from `powercouple@gmail.com` with an
   8-digit code.
4. **Email confirmation** (Claude, once the test email has arrived). Set
   `enable_confirmations = true` under `[auth.email]` in
   `supabase/config.toml` and push. Doing this before the mail works would
   leave new users waiting for a code that never arrives. It applies to
   everyone who signs up to this Supabase project, including the old web app.

**Later, your own domain.** If Gmail's limit starts to pinch, buy a domain
(`trypowercouple.com` was free on 21 September 2026; `powercouple.com` and
`powercouple.app` are taken), verify `mail.<domain>` in Resend (free for 3,000
emails a month), and replace the SMTP settings: host `smtp.resend.com`, port
`465`, username `resend`, password a Resend API key, sender
`noreply@mail.<domain>`. Claude then updates the policy and the rate limit.

### 5. Read both policies once

They are compiled into the app (account settings), and `docs/legal/*.md` has
the same text. Read them in full before they go public and before the first
build. If anything is no longer true, change `src/content/legal.ts`, not the
Markdown, then run `npm run legal:export`.

`OPERATOR` already names Baris Turker in South Korea, with a minimum age of 14
(Korea's privacy law needs a parent's consent below 14, and the US's below
13). The privacy policy states that server logs and backups are kept for up to
7 days. That holds on Supabase's Free and Pro plans; on Team or Enterprise,
update it.

### 6. Host the policies and a support page

App Store Connect needs public URLs for the privacy policy and for support, and
the support page has to show a way to contact you. Tell Claude to go ahead,
and it builds the pages from `src/content/legal.ts` and publishes them with
GitHub Pages, which is free because this repository is public. They live
under `https://macholul.github.io/power-couple-app/` until you add a domain.

### 7. App Store Connect: create the app

Done on 21 September 2026: the record exists as `powercouple: goals for two`,
with bundle ID `com.baris.powercouple`. Apple does not publish how long it holds a name with no build uploaded, so
upload the first build (step 8) within a few months.

### 8. First build

Claude runs `npm run preflight` first, and it must print no problems. Then:

```bash
npx eas-cli@latest build --platform ios --profile production
```

It asks you to sign in with your Apple ID, including the two-factor code. EAS
uses that to create the signing certificate and provisioning profile, which is
why it has to be you, in your own terminal. Build numbers are managed remotely
and go up on every production build.

### 9. TestFlight on your own iPhone, and the demo accounts

```bash
npx eas-cli@latest submit --platform ios --profile production --latest
```

It may ask for your Apple ID again. The build appears in TestFlight after
Apple processes it, usually 10 to 15 minutes. Install the TestFlight app on
your iPhone, sign in with the same Apple Account and install the build.

The simulator has no camera, so proof photos can only be tested on a real
phone. Create the two paired demo accounts here and run every flow with them
([review-notes.md](review-notes.md)) before Apple does.

### 10. Screenshots

Sign in to the simulator with a demo account (you type the password) and give
the couple a few goals, proofs and a streak; Claude can take the screenshots
from there. Apple needs only the 6.9-inch size, the iPhone 17 Pro Max
simulator at 1320 × 2868: it asks for 6.5-inch only when there are no 6.9-inch
shots, and the app is iPhone-only (`supportsTablet: false`), so there are no
iPad shots. PNG or JPEG, no transparency, 1 to 10 images. Good screens: home
with both panels, a confirmed proof, the profile with streaks, and pairing.

### 11. Supabase plan

Free projects pause after a week of inactivity, and a paused project cannot
sign anyone in, so a reviewer who opens the app after a quiet week would find
it broken. Free also has no automatic backups. Pro costs $25 a month and adds
daily backups (kept 7 days) and leaked password protection, which refuses
passwords known from breaches and which Supabase's security advisor flags
until it is on. Either upgrade before you submit, or keep the project in use
through review and accept the risk.

### 12. Fill in App Store Connect and submit

1. **URLs** from step 6, and **App Privacy** from
   [privacy-labels.md](privacy-labels.md).
2. **Listing** from [listing.md](listing.md), with the screenshots from step 10.
3. **Age rating:** answer the questionnaire honestly. Partners share photos and
   notes privately with each other; there is no public content, chat with
   strangers, or web browsing. Set `OPERATOR.minimumAge` to match or exceed the
   result.
4. **Trader status** (EU Digital Services Act). Apple asks every developer
   whether they are a "trader". If you say yes, your address, phone number and
   email are published on the product page in the EU. If you say no, EU users
   are told consumer-protection rights do not apply to their contract with
   you. Whether a free app you run alone counts as trade is your call, and a
   lawyer's if you are unsure.
5. **Availability:** see "If you sell in the EU or the UK" below.
6. **Price:** Free.
7. **Export compliance** is already answered in the build
   (`ITSAppUsesNonExemptEncryption = false`): the app uses only standard
   encryption, HTTPS plus encrypting its sign-in on the device. You are the
   one declaring this to Apple, so confirm it is true for your situation.
8. **App Review information:** paste the notes and demo accounts from
   [review-notes.md](review-notes.md).
9. Choose the build from step 9 and submit for review.

## Already done

- **Publisher.** `OPERATOR` in `src/content/legal.ts` names the publisher,
  the minimum age and the email provider, and `npm run preflight` passes.
- **Database and auth settings.** The migrations and `supabase/config.toml`
  mirror production, and `npm run db:verify` checks that they still do. The
  minimum password length is 8.
- **Account deletion.** `delete-account` has been deployed since 17 September
  2026. It refuses anyone not signed in, which was checked against the live
  function. It needs no secrets set by hand: Supabase provides the project URL
  and keys to every function. After changing it, redeploy:

```bash
npx supabase functions deploy delete-account --use-api
```

## Know before launch

### The couples rule

Pairing requires one woman and one man, as you asked; the database enforces
it and the terms and review notes state it. Know the risks before launch:

- **Discrimination law.** In some places, a service that serves the public
  may not turn people away over sexual orientation. eHarmony settled lawsuits
  in New Jersey (2008) and California (2010) over offering only
  opposite-sex matching, and agreed to open a same-sex service. powercouple
  is not a matchmaking service, but the argument is similar. If this matters
  where you will sell the app, ask a lawyer there.
- **App Review.** No guideline forbids it, but a reviewer could read it as
  discriminatory (guideline 1.1.1). Stating it plainly in the review notes,
  as they already do, avoids surprises.

Changing it later is one migration: drop the gender check from
`redeem_invite()`.

### If you sell in the EU or the UK

GDPR expects a developer based outside the EU who serves EU users to name a
representative in the EU (Article 27), and the UK has the same rule. The
exemption for occasional processing is unlikely to fit an app people use
daily. Paid services act as representatives. Alternatively, leave the EU and
UK out of the app's availability in App Store Connect at first.

## Optional cleanup

Production holds 8 photos from before retakes cleaned up after themselves.
They are invisible to users and cost almost nothing. To remove them, list them
in the SQL editor:

```sql
select o.name
from storage.objects o
where o.bucket_id = 'completion-photos'
  and not exists (select 1 from public.task_completions c where c.photo_url = o.name);
```

then delete those files from Storage → `completion-photos` in the dashboard.
Deleting rows with SQL would leave the files behind.
