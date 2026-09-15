/**
 * The privacy policy and terms of service, as data. The app renders them
 * (src/app/legal) and `npm run legal:export` writes them to Markdown for the
 * public URLs App Store Connect asks for, so both always say the same thing.
 *
 * Both follow the structure of Basecamp's open-source policies
 * (https://github.com/basecamp/policies, CC BY 4.0), rewritten for this app
 * and checked against App Store Review Guideline 5.1.1 and GDPR Articles
 * 12–22. Facts about the service come from the project itself: the database
 * region, what the migrations keep and for how long, and Supabase's log and
 * backup retention on the Free and Pro plans (1–7 days each).
 *
 * Nothing in this file may import anything: the export script runs it
 * directly under Node.
 */

/**
 * Only the publisher can fill these in. `npm run preflight` fails while any
 * value still starts with "[".
 */
export const OPERATOR = {
  /** the person or company legally responsible for the app */
  name: '[OPERATOR NAME]',
  /** receives privacy requests, reports and support email */
  email: '[CONTACT EMAIL]',
  /** where the operator is based; its law governs the terms */
  country: '[COUNTRY]',
  /** the youngest age allowed to use the app, e.g. 16 */
  minimumAge: '[MINIMUM AGE]',
  /** the company that delivers sign-up and password reset emails */
  emailProvider: '[EMAIL PROVIDER]',
};

export const EFFECTIVE_DATE = '15 September 2026';

export const ATTRIBUTION =
  'Adapted from the Basecamp open-source policies (github.com/basecamp/policies), ' +
  'available under the Creative Commons Attribution 4.0 International license (CC BY 4.0). ' +
  'Rewritten throughout to describe powercouple.';

export type LegalBlock =
  | { kind: 'paragraph'; text: string; lead?: string }
  | { kind: 'list'; items: string[] };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  sections: LegalSection[];
}

const p = (text: string, lead?: string): LegalBlock => ({ kind: 'paragraph', text, lead });
const list = (...items: string[]): LegalBlock => ({ kind: 'list', items });

const { name, email, country, minimumAge, emailProvider } = OPERATOR;

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy policy',
  sections: [
    {
      heading: 'The short version',
      blocks: [
        p(
          'powercouple is an app for two people to set goals and keep each other going. We collect what the app needs to do that, show it to you and the partner you pair with, and nothing more. We don’t sell your information, show ads, or track you across other apps and websites.',
        ),
        p(
          `This policy explains what we collect, why, who can see it, how long we keep it, and the choices you have. “We”, “us” and “our” mean ${name}, who publishes powercouple and is responsible for your information.`,
        ),
      ],
    },
    {
      heading: 'What we collect and why',
      blocks: [
        p(
          'Your email address and password. We use them to create your account, sign you in, keep your account secure, and send account emails such as sign-up and password reset codes. Your password is stored only in hashed form, which nobody can read, including us.',
          'Account.',
        ),
        p(
          'The name you choose, whether you are a woman or a man, your character, and your phone’s time zone. Your name and character are how you and your partner appear to each other. Gender decides who can pair: a powercouple couple is one woman and one man. Your time zone makes each day start and end on your own calendar, so streaks are counted fairly.',
          'Profile.',
        ),
        p(
          'The goals you set and the days they are for, the photos you submit as proof, your partner’s confirmations, the notes you send, and a record of which goals were scheduled each day. This is the app itself: it exists so that you and your partner can see it.',
          'What you share as a couple.',
        ),
        p(
          'Only the photos you choose to submit. The camera opens only when you tap to take a proof photo. When you choose from your library, your phone’s own photo picker gives the app just the photo you pick, never the rest of your library. Photos are made smaller on your phone before they are uploaded.',
          'Photos.',
        ),
        p(
          'The invite codes you create, and a short-lived record of wrong codes entered from your account, which stops anyone from guessing their way to someone else’s code.',
          'Pairing.',
        ),
        p(
          'When the app connects to our servers, our hosting provider records technical details such as IP address, device and app information, and the time. These logs are used to run the service and keep it secure.',
          'Technical information.',
        ),
        p(
          'No analytics, no advertising identifiers, no location, and no contacts. The app contains no advertising or tracking code.',
          'What we don’t collect.',
        ),
      ],
    },
    {
      heading: 'Our reasons for using it',
      blocks: [
        p(
          'If you are in the European Economic Area or the United Kingdom, the law asks us to tell you the legal basis for each use of your information:',
        ),
        list(
          'Providing the app you signed up for, including showing your information to your partner: to perform our contract with you (GDPR Article 6(1)(b)).',
          'Keeping accounts secure, stopping abuse such as guessed invite codes, and keeping server logs: our legitimate interest in running a safe service (Article 6(1)(f)).',
          'Keeping or disclosing information when the law requires it: to meet a legal obligation (Article 6(1)(c)).',
        ),
        p(
          'Your email address, password, name and gender are needed to create an account and pair, so without them we can’t provide the app. Everything else you add is up to you.',
        ),
      ],
    },
    {
      heading: 'Who can see your information',
      blocks: [
        p(
          'While you are paired, your partner sees your name, character, goals, photo proofs, confirmations, notes and streaks, and you see theirs. When a couple ends, neither of you can see the other’s information any more.',
          'Your partner.',
        ),
        p(
          'A small number of companies help us run powercouple. They use your information only on our instructions, to provide their service to us, under agreements that require them to protect it:',
          'Our service providers.',
        ),
        list(
          'Supabase, Inc., for our database, sign-in, photo storage and server functions.',
          `${emailProvider}, for delivering account emails.`,
        ),
        p(
          'We disclose information when the law requires it, such as under a valid court order, and only what it requires. Unless the law forbids it, we will tell you first.',
          'When the law requires it.',
        ),
        p(
          'We never sell or rent your information, and never share it for advertising. If powercouple is ever taken over by another company, we will tell you before your information moves and becomes subject to a different privacy policy.',
          'Nobody else.',
        ),
      ],
    },
    {
      heading: 'Where your information is stored',
      blocks: [
        p(
          'Your information is stored in Japan, in Supabase’s Tokyo data center, so if you use powercouple from another country, it is transferred there. The European Commission and the United Kingdom recognize Japan as protecting personal data adequately. Where a provider handles information from another country, for example to give support, it does so under safeguards such as the European Commission’s Standard Contractual Clauses.',
        ),
      ],
    },
    {
      heading: 'How long we keep it',
      blocks: [
        list(
          'Your account, profile, and everything in your couples: until you delete your account.',
          'Invite codes: until they are used or replaced, and never longer than 7 days.',
          'Records of wrong invite codes: 15 minutes.',
          'Server logs: up to 7 days.',
          'Database backups, which contain account information but not photos: up to 7 days.',
          `Email delivery records: as long as ${emailProvider} keeps them under its own policy.`,
        ),
        p('We keep information longer only when the law requires it, or to deal with a legal claim.'),
      ],
    },
    {
      heading: 'Ending a couple, and deleting your account',
      blocks: [
        p(
          'Ending your couple, in account settings, unpairs you both straight away. Nothing is deleted: the couple’s goals, photos and notes are hidden from both of you, and come back if the same two of you pair again.',
          'Ending a couple.',
        ),
        p(
          'Deleting a goal takes it off your schedule, and its past proofs stay in your couple’s history. Retaking a proof photo deletes the photo it replaces.',
          'Goals and photos.',
        ),
        p(
          'Deleting your account, in account settings, permanently deletes your account, your profile, and every couple you have been part of, including the goals, photos, confirmations and notes shared in them. Because a couple belongs to both people in it, this also removes that history for your partner, and unpairs them. It happens immediately on our live systems; copies in backups are gone within 7 days.',
          'Deleting your account.',
        ),
        p(
          `If you can’t use the app, email ${email} and we will delete your account for you once we have confirmed it is yours.`,
        ),
      ],
    },
    {
      heading: 'Your rights',
      blocks: [
        p(
          'You can see and change most of your information in the app. In account settings you can change your name, change your gender while you are not paired, end your couple, and delete your account.',
        ),
        p(
          'Depending on where you live, including in the European Economic Area, the United Kingdom and California, you also have the right to:',
        ),
        list(
          'get a copy of the personal information we hold about you, in a format you can take elsewhere;',
          'have inaccurate information corrected;',
          'have your information deleted;',
          'object to, or ask us to restrict, how we use your information;',
          'complain to your local data protection authority.',
        ),
        p(
          `To make a request, email ${email}. We will confirm the request comes from you, reply within one month, and never treat you differently for using your rights. We don’t sell or share personal information as California law defines those words, and we don’t make decisions about you by automated means.`,
        ),
      ],
    },
    {
      heading: 'How we protect it',
      blocks: [
        p(
          'Information is encrypted between the app and our servers. On your phone, your sign-in is kept encrypted, with its key in the phone’s secure storage. Our database lets only you and your partner reach your couple’s information, and photos are private, opened only through links that expire. We look at your information only when you ask us for help, to keep the service secure, or when the law requires it.',
        ),
      ],
    },
    {
      heading: 'Children',
      blocks: [
        p(
          `powercouple is not for anyone under ${minimumAge}. We don’t knowingly collect information from anyone younger. If you believe someone under ${minimumAge} has an account, email ${email} and we will delete it.`,
        ),
      ],
    },
    {
      heading: 'Changes to this policy',
      blocks: [
        p(
          'When we change this policy, we update the date at the top. If a change affects how your information is used in a way that matters, we will tell you in the app or by email before it takes effect.',
        ),
      ],
    },
    {
      heading: 'Contact',
      blocks: [p(`${name}, ${country}. Email ${email} with any question about this policy or your information.`)],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of service',
  sections: [
    {
      heading: 'The agreement',
      blocks: [
        p(
          `These terms are an agreement between you and ${name} (“we”, “us”), who publishes powercouple. By creating an account or using the app, you agree to them and to our privacy policy. If you don’t agree, please don’t use powercouple.`,
        ),
      ],
    },
    {
      heading: 'Your account',
      blocks: [
        list(
          `You must be at least ${minimumAge} years old.`,
          'An account is for one real person. Automated and fake accounts are not allowed.',
          `Use an email address you can receive mail at, keep your password to yourself, and tell us at ${email} if you think someone else has used your account.`,
          'You are responsible for what happens under your account.',
        ),
      ],
    },
    {
      heading: 'How powercouple works',
      blocks: [
        p(
          'powercouple joins two accounts into a couple, so they can set goals and confirm each other’s progress. A couple is one woman and one man, and each person can be in one couple at a time. Either person can end the couple at any time in account settings.',
        ),
      ],
    },
    {
      heading: 'What’s not allowed',
      blocks: [
        p('Don’t use powercouple to:'),
        list(
          'break the law, or help anyone else break it;',
          'share anything you don’t have the right to share, or anything sexually explicit, violent, hateful, or involving a minor;',
          'harass, threaten, stalk or impersonate anyone;',
          'pair with anyone who hasn’t agreed to it, including by guessing invite codes;',
          'get around the app’s security or limits, or reach accounts or information that aren’t yours;',
          'copy, scrape, overload or interfere with the service.',
        ),
        p(
          `To report something that breaks these rules, email ${email} and we will look into it promptly. Ending your couple, in account settings, immediately stops the other person seeing your information.`,
        ),
      ],
    },
    {
      heading: 'Your content',
      blocks: [
        p(
          'What you add, including goals, photos and notes, stays yours. So that we can run the app, you give us permission to store it, process it (for example, making photos smaller), and show it to you and your partner. That permission ends when the content or your account is deleted, apart from copies in backups, which are gone within 7 days.',
        ),
        p('You are responsible for what you add. We may remove content that breaks these terms.'),
      ],
    },
    {
      heading: 'Price',
      blocks: [
        p(
          'powercouple is free. If we ever charge for anything, we will tell you first, and you will never be charged without choosing to pay.',
        ),
      ],
    },
    {
      heading: 'Ending your use of powercouple',
      blocks: [
        p(
          'You can stop using powercouple and delete your account at any time in account settings. The privacy policy explains what deleting removes.',
        ),
        p(
          'We may suspend or close an account that breaks these terms, or that puts other people or the service at risk. Unless it is urgent, we will tell you first and explain why.',
        ),
        p('If we ever stop offering powercouple, we will tell you in advance.'),
      ],
    },
    {
      heading: 'Changes to the app and these terms',
      blocks: [
        p(
          'We improve powercouple over time and may add, change or remove features. If we change these terms in a way that matters, we will tell you in the app or by email before the change takes effect. Using the app after that means you accept the new terms.',
        ),
      ],
    },
    {
      heading: 'Availability and security',
      blocks: [
        p(
          'We work to keep powercouple available and your information safe, but we can’t promise that the app will always be available, free of errors, or right for your needs. It is provided “as is” and “as available”.',
        ),
      ],
    },
    {
      heading: 'Our app',
      blocks: [
        p(
          `The app itself, including its name, design, characters and code, belongs to ${name}. These terms don’t give you any right to use them other than by using powercouple.`,
        ),
      ],
    },
    {
      heading: 'Liability',
      blocks: [
        p(
          'As far as the law allows, we are not liable for indirect or consequential losses, or for lost data, profits or goodwill, arising from your use of powercouple, and our total liability to you for any claim is limited to what you paid us for powercouple in the 12 months before the claim.',
        ),
        p(
          'Nothing in these terms limits liability that the law does not allow to be limited, or takes away rights you have as a consumer where you live.',
        ),
      ],
    },
    {
      heading: 'The App Store',
      blocks: [
        p(
          `If you downloaded powercouple from Apple’s App Store, these terms are between you and ${name}, not Apple. Apple is not responsible for powercouple or its content and has no obligation to support it. Your licence to the app itself is Apple’s Licensed Application End User License Agreement; these terms cover your use of the powercouple service, and you must also follow the App Store’s usage rules.`,
        ),
      ],
    },
    {
      heading: 'Governing law',
      blocks: [
        p(
          `These terms are governed by the laws of ${country}. If you use powercouple as a consumer, you also keep the protection of the mandatory laws of the country where you live, and can bring claims in its courts.`,
        ),
      ],
    },
    {
      heading: 'Contact',
      blocks: [p(`${name}, ${country}. Email ${email} with any question about these terms.`)],
    },
  ],
};
