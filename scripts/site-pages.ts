/**
 * The public pages App Store Connect links to: support, the privacy policy
 * and the terms of service. The policies come from src/content/legal.ts, the
 * same text the app shows, so the website can never say something the app
 * doesn't.
 *
 * The pages load nothing from anywhere else: no fonts, scripts, cookies or
 * analytics. Apple devices show them in SF Rounded, close to the app's
 * Fredoka.
 */
import {
  ATTRIBUTION,
  EFFECTIVE_DATE,
  OPERATOR,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
  type LegalBlock,
  type LegalDocument,
} from '../src/content/legal.ts';

/** The Gmail account Supabase sends account emails from (see docs/app-store/README.md, step 4). */
const SENDER = 'trypowercouple@gmail.com';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Links email addresses and the bare web addresses the policies mention,
 * like www.kopico.go.kr. Runs on escaped text; a sentence's closing period
 * stays outside the link.
 */
const LINKABLE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:[a-z0-9-]+\.)+(?:com|org|kr)(?:\/[^\s<,;)]*)?)/gi;
const linkify = (html: string) =>
  html.replace(LINKABLE, (_match, email?: string, web?: string) => {
    if (email) return `<a href="mailto:${email}">${email}</a>`;
    const address = web!.replace(/\.+$/, '');
    return `<a href="https://${address}">${address}</a>${web!.slice(address.length)}`;
  });

const slug = (heading: string) =>
  heading.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function blockHtml(block: LegalBlock): string {
  if (block.kind === 'list') {
    return `<ul>${block.items.map((item) => `<li>${linkify(escape(item))}</li>`).join('')}</ul>`;
  }
  const lead = block.lead ? `<strong>${escape(block.lead)}</strong> ` : '';
  return `<p>${lead}${linkify(escape(block.text))}</p>`;
}

function legalHtml(document: LegalDocument): string {
  const parts = [`<h1>${escape(document.title)}</h1>`, `<p class="quiet">Last updated ${escape(EFFECTIVE_DATE)}</p>`];
  for (const section of document.sections) {
    parts.push(`<h2 id="${slug(section.heading)}">${escape(section.heading)}</h2>`);
    parts.push(...section.blocks.map(blockHtml));
  }
  parts.push(`<p class="attribution">${linkify(escape(ATTRIBUTION))}</p>`);
  return parts.join('\n');
}

/** Each answer matches the app's own labels and settings; update both together. */
const QUESTIONS: [question: string, answer: string][] = [
  [
    'How do we pair up?',
    'One of you opens the pairing screen and sends the other the code shown under “your code”. The other enters it under “enter your partner’s code” and taps “pair up”. A code works for 7 days, and “new code” makes a fresh one. A couple is one woman and one man, and each person can be in one couple at a time.',
  ],
  [
    'My code email didn’t arrive',
    // otp_expiry and max_frequency in supabase/config.toml
    `Sign-up and password reset codes come from ${SENDER}, so check your spam folder for that address. You can ask for a new code once a minute, and each code works for an hour.`,
  ],
  [
    'How do we end our couple?',
    'Open your profile, then account settings, and choose “end couple”. It unpairs you both straight away. Nothing is deleted: your couple’s goals, photos and notes are hidden, and come back if the two of you pair again.',
  ],
  [
    'How do I delete my account?',
    `Open your profile, then account settings, and choose “delete account”. If you aren’t paired, “account” on the pairing screen leads to the same settings. Deleting permanently removes your account and every couple you’ve been part of, with the goals, photos and notes shared in them, so your partner loses those too and is unpaired. If you can’t use the app, email ${OPERATOR.email} and we will delete your account once we have confirmed it is yours.`,
  ],
  [
    'How do I report someone?',
    `Email ${OPERATOR.email} with what happened. Ending your couple immediately stops the other person seeing your information.`,
  ],
];

function supportHtml(): string {
  return [
    '<h1>powercouple support</h1>',
    '<p>powercouple is an iPhone app for two people to set goals, send each other photo proof, and keep a streak going together.</p>',
    '<h2 id="contact">Get in touch</h2>',
    `<p>${linkify(escape(`Email ${OPERATOR.email} with questions, problems, or anything to report. Privacy requests, such as asking for a copy of your information, go to the same address.`))}</p>`,
    ...QUESTIONS.flatMap(([question, answer]) => [
      `<h2 id="${slug(question)}">${escape(question)}</h2>`,
      `<p>${linkify(escape(answer))}</p>`,
    ]),
    '<h2 id="policies">The fine print</h2>',
    '<ul><li><a href="privacy/">Privacy policy</a></li><li><a href="terms/">Terms of service</a></li></ul>',
  ].join('\n');
}

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23E5628E' d='M50 88C20 66 6 50 6 33 6 19 17 9 30 9c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 17-14 33-44 55z'/%3E%3C/svg%3E";

/** The app's cream, ink, pink and blue (src/constants/theme.ts, components/wordmark.tsx). */
const STYLE = `
:root{--bg:#FFF8F1;--card:#FFFFFF;--ink:#5C4438;--quiet:#8A6A58;--border:#FFE1CE;--pink:#E5628E;--blue:#5B8AD6;--link:#B8356A;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#1C1714;--card:#26201C;--ink:#F3E7DC;--quiet:#C9B4A6;--border:#3A2F28;--pink:#F07FA5;--blue:#7FA6E6;--link:#F28FB0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
.page{max-width:44rem;margin:0 auto;padding:24px 16px 48px}
header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px 20px;margin-bottom:20px}
.wordmark{font-weight:700;font-size:1.6rem;text-decoration:none;letter-spacing:.01em}
.power{color:var(--pink)}.couple{color:var(--blue)}
nav{display:flex;gap:18px}
nav a{color:var(--quiet);font-weight:600;text-decoration:none}
nav a[aria-current=page]{color:var(--ink);text-decoration:underline;text-underline-offset:5px}
main{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:28px}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 8px}
h2{font-size:1.2rem;line-height:1.3;margin:32px 0 8px}
p,li{margin:0 0 12px}
ul{padding-left:1.25rem}
a{color:var(--link);text-underline-offset:2px;overflow-wrap:anywhere}
.quiet,footer{color:var(--quiet);font-size:.9rem}
.attribution{color:var(--quiet);font-size:.85rem;margin-top:32px;padding-top:16px;border-top:1px solid var(--border)}
footer{margin-top:20px}
footer p{margin:0 0 6px}
@media (max-width:480px){body{font-size:16px}main{padding:20px;border-radius:16px}}
`.trim();

interface Page {
  /** where it is written under site/, and how deep, for relative links */
  path: string;
  title: string;
  description: string;
  nav: 'support' | 'privacy' | 'terms';
  body: string;
}

function render({ path, title, description, nav, body }: Page): string {
  const root = '../'.repeat(path.split('/').length - 1) || './';
  const link = (key: Page['nav'], href: string, label: string) =>
    `<a href="${root === './' ? href || './' : root + href}"${key === nav ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="icon" href="${FAVICON}">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
<header>
<a class="wordmark" href="${root}"><span class="power">power</span><span class="couple">couple</span></a>
<nav aria-label="Pages">${link('support', '', 'Support')}${link('privacy', 'privacy/', 'Privacy')}${link('terms', 'terms/', 'Terms')}</nav>
</header>
<main>
${body}
</main>
<footer>
<p>© 2026 ${escape(OPERATOR.name)}</p>
<p>This site sets no cookies and runs no analytics. GitHub, which hosts it, <a href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection">logs visitors’ IP addresses for security</a>.</p>
</footer>
</div>
</body>
</html>
`;
}

/** path under site/ → the page's HTML */
export const SITE_PAGES: Record<string, string> = Object.fromEntries(
  [
    {
      path: 'index.html',
      title: 'powercouple support',
      description: 'Help with powercouple, the iPhone app for couples who set goals together.',
      nav: 'support' as const,
      body: supportHtml(),
    },
    {
      path: 'privacy/index.html',
      title: 'Privacy policy · powercouple',
      description: 'What powercouple collects, why, who can see it, and how long it is kept.',
      nav: 'privacy' as const,
      body: legalHtml(PRIVACY_POLICY),
    },
    {
      path: 'terms/index.html',
      title: 'Terms of service · powercouple',
      description: 'The agreement between you and the publisher of powercouple.',
      nav: 'terms' as const,
      body: legalHtml(TERMS_OF_SERVICE),
    },
  ].map((page) => [page.path, render(page)]),
);
