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

Create a free account at expo.dev, then log in. The browser opens to finish
signing in:

```bash
npx eas-cli@latest login
```

Claude then runs `eas init`, which links this project to your account and
writes its id into `app.json`, and commits the change. After that, give builds
the two Supabase values. They live in `.env` locally and are never uploaded
otherwise:

```bash
npx eas-cli@latest env:push --environment production --environment preview --path .env --force
```

The variables start with `EXPO_PUBLIC_`, so EAS stores them as plain text.
That is right: both values end up inside the app, so neither is a secret. The
file holds only those two.

### 2. Apple Developer Program

Start this early: Apple does not publish how long approval takes, and
everything from step 7 on waits for it. Enroll as an individual at
developer.apple.com/programs/enroll, $99 a year. You need an Apple Account with
two-factor authentication, your legal name, a phone number and a street
address (no P.O. box). Your legal name is what the App Store shows as the
seller.

### 3. Choose the app's name

The domain, the email sender, the listing and the policies all carry it, so
settle it before you buy anything. On 21 September 2026 the App Store already
had several apps called "Power Couple" or close to it. Three launched in the
past month, and one of them, "power couple: grow together" (Lifestyle), also
helps couples make time for their goals. The store's search cannot show a name
someone has reserved but not released, so the only exact check is creating
the app record in step 7.

Either keep `powercouple` and let the store name carry a suffix (for example
`powercouple: goals for two`), or pick a more distinctive name. The bundle ID
`com.baris.powercouple` can stay whatever you choose: users never see it, and
it is permanent once registered. Tell Claude the name. Renaming touches
`app.json`, the policies, the listing and the email templates.

### 4. Email service

Until custom email is set up, Supabase only emails members of your Supabase
team, at 2 emails an hour, so real users would never receive a sign-up or
reset code.

1. **Domain.** Buy one for the name from step 3, roughly $10 to $15 a year for
   a `.com`, with WHOIS privacy on so your address stays out of public
   records. Cloudflare Registrar sells at cost and includes it; Porkbun and
   Namecheap are fine too. If you keep the name, `trypowercouple.com` was
   unregistered on 21 September 2026.
2. **Resend** (resend.com). The free plan allows 3,000 emails a month and 100
   a day, on up to 3 domains. Add the subdomain `mail.<your domain>`, not the
   bare domain: Resend recommends it so email trouble cannot hurt your main
   domain's reputation. Keep the default region (North Virginia): the privacy
   policy will say the mail goes through the United States. Add the DNS
   records Resend shows at your registrar and press Verify. Then create an API
   key with "Sending access" and copy it, because it is shown only once.
3. **Supabase** (project `imhpwatxupusiiujwvdr`) → Authentication → Emails →
   SMTP Settings. Turn on custom SMTP: sender `noreply@mail.<your domain>`
   (nothing can receive replies there), sender name = the app's name, host
   `smtp.resend.com`, port `465`, username `resend`, password = the API key.

Then tell Claude, who will:

- set `OPERATOR.emailProvider` in `src/content/legal.ts` to the provider and
  its country, e.g. `Resend, Inc. (United States)`, and run
  `npm run legal:export`. Korea's privacy law asks the policy to name each
  provider and where it is;
- run `npx supabase config diff`, then `config push`, for the two email
  templates in `supabase/templates/`. Supabase refuses template changes until
  custom SMTP is on, and the app asks for the code in the email, not a link;
- set `enable_confirmations = true` under `[auth.email]` in
  `supabase/config.toml` and push. Doing this before the mail works would
  leave new users waiting for a code that never arrives. It applies to
  everyone who signs up to this Supabase project, including the old web app.

Finally, test it yourself: ask the app for a password-reset code and check
that the email arrives.

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
GitHub Pages, which is free because this repository is public. To serve them
at `https://<your domain>/privacy`, you add the DNS records Claude gives you.

### 7. App Store Connect: create the app

When Apple approves your enrollment: App Store Connect → Apps → + → New App.
Choose iOS, your name from step 3, a primary language and the bundle ID
`com.baris.powercouple`. If that bundle ID is missing from the list, register
it first at developer.apple.com → Certificates, Identifiers & Profiles →
Identifiers → + → App IDs → App, with an explicit Bundle ID and no extra
capabilities. If Apple refuses the name, you find out here: pick another and
tell Claude.

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

- **Publisher.** `OPERATOR` in `src/content/legal.ts` names the publisher and
  the minimum age; only `emailProvider` is left (step 4).
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
