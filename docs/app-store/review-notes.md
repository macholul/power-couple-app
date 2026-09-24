# App Review notes

## Before submitting: create the demo accounts

Reviewers need a couple that is already paired, because nothing in the app
works until two accounts are joined. On a device or simulator running the
release build:

1. Sign up as **woman**, e.g. `<you>+review-her@gmail.com`. Gmail delivers any
   `+` address to your own inbox, so the confirmation code reaches you. An
   address at your own domain has no inbox until you set one up. Confirm the
   email with the code.
2. Sign up as **man**, e.g. `<you>+review-him@gmail.com`, on a second device or
   after logging out.
3. On the first account, copy the invite code; on the second, enter it.
4. Give each a goal or two, submit a proof photo from one, and confirm it
   from the other, so every state is visible straight away.

Use mailboxes you control, since Apple may sign in again months later.
Before each submission, check that both accounts still sign in and are
still paired.

## Notes to paste into App Store Connect

> powercouple lets two partners set daily goals, send each other photo proof,
> and confirm each other's progress to keep a shared streak.
>
> **Demo accounts (already paired with each other)**
> Account 1: `<email>` / `<password>`
> Account 2: `<email>` / `<password>`
> Signing in with either shows the shared home screen. To see both sides of
> a confirmation, submit a photo proof on one account and confirm it from
> the other.
>
> **Pairing from scratch.** A couple is one woman and one man, chosen at
> sign-up. Account A copies its invite code from the pairing screen, and
> account B enters it.
>
> **Account deletion.** Profile → account settings → delete account. On an
> account that is not yet paired, the pairing screen's "account" link leads
> to the same place.
>
> **User content** is private to the two people in a couple. There are no
> public profiles, no discovery, and no messaging with strangers. Either
> partner can end the couple at any time in account settings, which
> immediately removes the other's access. Reports go to the contact email in
> the terms of service, which also forbids objectionable content.
>
> **Permissions.** The camera is requested only when the user taps to take a
> proof photo. Choosing from the library uses the system photo picker, so no
> photo library permission is requested.
>
> **Email sign-in only.** No third-party or social login is offered.
>
> **What the app is for.** Keeping a daily habit alone is easy to drop. Here
> each partner sets goals for the weekdays that suit them, photographs the
> finished goal, and the other confirms it. Days where both finish everything
> build a shared streak, so the two of them keep it going together. It is for
> adults in a relationship; our terms set a minimum age of 14. Free, with no
> ads, no in-app purchases and no tracking.
>
> **Reporting and blocking.** A couple only forms when two people share a
> private six-character invite code, so nobody can send content to a stranger.
> Either partner can end the couple in account settings, which immediately
> removes the other's access to everything shared. "Contact us" in account
> settings opens our support page with our contact address, and our terms of
> service forbid objectionable content and let us remove accounts.
>
> **Outside services.** Supabase Pte. Ltd. (Singapore) provides the database,
> email-and-password sign-in, photo storage and server functions, with the
> data stored in its Tokyo region. Google's Gmail delivers our account emails
> (the sign-up code and password reset code). Expo Application Services builds
> and uploads the app and is not part of the running app. There are no
> analytics, advertising, tracking, AI or payment services.
>
> **Regions.** The app behaves the same everywhere. It is in English only,
> free in every region, and has no region-specific features or content.
>
> **Regulated industry or third-party material.** Neither applies. The app
> is not in a regulated field, the artwork and text are our own, and every
> other piece of content is created by the app's own users.

## If App Review asks for a screen recording

Apple asks new developer accounts for a recording from a physical device
(guideline 2.1, "Information Needed"). Record it on an iPhone running the
TestFlight build, with the demo accounts and a throwaway account — never with
personal photos. Show, in one take:

1. Launching the app from the home screen.
2. Signing up a new account on a `+` address of your Gmail, and entering the
   code from the email.
3. The pairing screen with its invite code.
4. Logging out, then logging in with a demo account.
5. The home screen: today's goals, the streak and the month.
6. Tapping a goal's camera button, taking a photo, and the proof waiting.
7. Logging in as the partner and confirming that proof.
8. Account settings, showing "end couple" (blocking) and "contact us"
   (reporting).
9. Deleting the throwaway account: account settings → delete account.

Attach the file to the reply in App Store Connect, and paste the notes above
into the Notes field as well, which is where Apple asks for them.
