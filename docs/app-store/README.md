# Releasing powercouple on the App Store

Everything code can do is done and checked by `npm run preflight`. What is
left needs a person: accounts, dashboards, legal details, and decisions. Work
through it top to bottom. Each step says why it matters.

## 1. Who publishes the app

Done, except one value. `OPERATOR` in `src/content/legal.ts` names Baris
Turker in South Korea, with minimum age 14 (Korea's privacy law needs a
parent's consent below 14, and the US's below 13).

Still open: `emailProvider`. Once you pick the email service in step 2, set it
to the company and its country, e.g. `Resend, Inc. (United States)`; Korea's
law asks for both. Then:

```bash
npm run legal:export
```

Read both policies once in full (`docs/legal/*.md` or in the app under
account settings). If anything is no longer true, change
`src/content/legal.ts`, not the Markdown.

The privacy policy states that server logs and backups are kept for up to 7
days. That holds on Supabase's Free and Pro plans; on Team or Enterprise,
update it.

## 2. Supabase dashboard: authentication

Project: `imhpwatxupusiiujwvdr`.

Done: the minimum password length is 8 in production, pushed from
`supabase/config.toml`.

Your part:

1. **Custom SMTP** (Authentication → Emails → SMTP Settings). Without it,
   Supabase only emails members of your Supabase team, at 2 emails an hour,
   so real users would never receive a sign-up or reset code. Supabase names
   Resend, AWS SES, Postmark, SendGrid, ZeptoMail and Brevo as options.

Then Claude, or you, can finish from the command line:

2. **Email templates.** Supabase refuses template changes until custom SMTP
   is on. After that, `npx supabase config diff` should show only the two
   templates (`supabase/templates/`), and `npx supabase config push` applies
   them. The app asks for the code from the email, not a link, so this has to
   happen before step 3.
3. **Confirm email:** set `enable_confirmations = true` under `[auth.email]`
   in `supabase/config.toml` and push. Doing this before steps 1 and 2 would
   leave new users waiting for mail that never arrives.
4. **Leaked password protection** (Pro plan only): refuses passwords known
   from breaches. Supabase's security advisor flags it until it is on.

## 3. Account deletion

Done: `delete-account` has been deployed since 17 September 2026. It refuses
anyone not signed in, which was checked against the live function. After
changing it, redeploy:

```bash
npx supabase functions deploy delete-account --use-api
```

It needs no secrets set by hand: Supabase provides the project URL and keys
to every function.

## 4. Build with EAS

```bash
npm install --global eas-cli
eas login
eas init
```

`eas init` links the project and writes its id into `app.json`. Then give
builds the Supabase URL and anon key, which live in `.env` locally but are
never uploaded:

```bash
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value <url from .env> --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <key from .env> --environment production --visibility plaintext
```

Repeat with `--environment preview` for internal test builds. Both values end
up inside the app, so they are not secrets, and plaintext is what Expo
recommends for `EXPO_PUBLIC_` variables.

```bash
npm run preflight
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Build numbers are managed remotely and go up on every production build.

## 5. App Store Connect

1. **Create the app** with bundle ID `com.baris.powercouple`.
2. **Host the policies.** Publish `docs/legal/privacy-policy.md` and
   `docs/legal/terms-of-service.md` at public URLs, for example with GitHub
   Pages, plus a support page with your contact email. Enter the privacy
   policy URL and the support URL.
3. **App Privacy**: answer from [privacy-labels.md](privacy-labels.md).
4. **Age rating**: answer the questionnaire honestly. Partners share photos
   and notes privately with each other; there is no public content, chat
   with strangers, or web browsing. Set `OPERATOR.minimumAge` to match or
   exceed the result.
5. **Export compliance** is already answered in the build
   (`ITSAppUsesNonExemptEncryption = false`): the app uses only standard
   encryption, HTTPS plus encrypting its sign-in on the device. You are the
   one declaring this to Apple, so confirm it is true for your situation.
6. **Demo accounts and review notes**: see [review-notes.md](review-notes.md).
   Reviewers need two accounts that are already paired.
7. **Screenshots** for the 6.9" and 6.5" iPhone sizes, a description,
   keywords, and a category (Lifestyle or Health & Fitness).

## 6. Decide about the couples rule

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

## 6b. If you sell in the EU or the UK

GDPR expects a developer based outside the EU who serves EU users to name a
representative in the EU (Article 27), and the UK has the same rule. The
exemption for occasional processing is unlikely to fit an app people use
daily. Paid services act as representatives. Alternatively, leave the EU and
UK out of the app's availability in App Store Connect at first.

## 7. Optional cleanup

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
