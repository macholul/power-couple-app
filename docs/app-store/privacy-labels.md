# App Privacy answers

What to enter under App Store Connect → App Privacy. It matches the privacy
manifest in `app.json` (`ios.privacyManifests`) and the privacy policy. If
the app starts collecting something new, update all three together.

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking.** No data is used for tracking. The app contains no advertising,
analytics or attribution SDKs.

For every data type below, answer:

- **Purpose:** App Functionality only
- **Linked to the user's identity:** Yes (it belongs to their account)
- **Used for tracking:** No

| App Store category | Data type | What it is in powercouple |
| --- | --- | --- |
| Contact Info | Email Address | Sign-in and account emails |
| Contact Info | Name | The display name partners see |
| Identifiers | User ID | The account's id |
| User Content | Photos or Videos | Proof photos the user chooses to submit |
| User Content | Other User Content | Goals, their schedules, notes to a partner |
| Other Data | Other Data Types | Gender (used to pair), time zone, and the IP addresses in server logs |

## Not collected

Location, Contacts, Health & Fitness, Financial Info, Browsing History, Search
History, Purchases, Usage Data, Diagnostics, Sensitive Info.

Two judgement calls:

- **Time zone** is read from the phone's settings to count days on the user's
  calendar. It is not location in Apple's sense (it comes from no location
  service), so it is listed under Other Data rather than Coarse Location.
- **Gender** is not one of Apple's Sensitive Info examples, and the app never
  asks about sexual orientation, so it is also under Other Data. If you'd
  rather be conservative, declaring Sensitive Info as well does no harm.

## Server logs

Apple counts data as collected when it is kept longer than it takes to answer
the request. Supabase keeps IP addresses and request details in its logs for
up to 7 days to run and secure the service, so they count. Security is one of
the purposes Apple lists under App Functionality, and the logs never leave
Supabase, so they fit under Other Data Types with the same answers as the
rest. The privacy policy discloses them too.
