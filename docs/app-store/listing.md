# App Store listing

A draft for App Store Connect → App Information and the version page. Every
field is within Apple's length limit. Everything it claims is true of the app
as built; keep it that way when editing.

| Field | Limit | Draft |
| --- | --- | --- |
| Name | 30 | `powercouple` |
| Subtitle | 30 | `Daily goals, done together` |
| Primary category | | Lifestyle |
| Secondary category | | Productivity |
| Copyright | | `2026 Baris Turker` |
| Price | | Free, no in-app purchases |

The name must be unique on the App Store. If `powercouple` is taken, try
`powercouple: goals for two`.

## Promotional text (170)

Set goals with your partner, send a photo when you finish one, and build a streak you can only keep together.

## Description (4000)

powercouple is a small app for two. You and your partner each set goals for the days of the week: the gym on Mondays, ten pages every night, whatever keeps you going. Finish one, snap a photo as proof, and your partner confirms it. Every day you both finish everything adds to your shared streak.

- Goals on the days that suit you
- Photo proof that your partner confirms
- Your own streak, your couple streak, and the month at a glance
- Cheer your partner on with a quick note that pops up in the app
- Private by design: only your partner sees what you share

Pair up with a six-character invite code. You can end your couple or delete your account at any time in account settings.

No ads, no tracking, no in-app purchases.

## Keywords (100 bytes)

`couple,goals,habit,tracker,streak,partner,relationship,accountability,motivation,photo`

Apple already searches the name and subtitle, so the keywords don't repeat
them.

## What's New (version 1.0)

First release.

## Screenshots

Take them from the demo couple in [review-notes.md](review-notes.md) once it
has a few goals, proofs and a streak going, rather than from test data. You
need the 6.9-inch size (iPhone 17 Pro Max simulator); Apple scales it down for
smaller iPhones. Good screens to show: home with both panels, a confirmed
proof, the profile with streaks, and pairing.

## Age rating questionnaire

What the app does, to answer from:

- Partners share photos and short preset notes privately with each other.
  There is no chat, public content, discovery of other users, or web
  browsing.
- No violence, mature themes, gambling, contests, medical information or
  purchases.
- The terms set a minimum age of 14. Keep the resulting rating at or below
  that, or raise `OPERATOR.minimumAge` to match it.
