/**
 * The Markdown form of the in-app policies, shared by the export and by the
 * preflight check that the exported files are current.
 */
import {
  ATTRIBUTION,
  EFFECTIVE_DATE,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
  type LegalDocument,
} from '../src/content/legal.ts';

function toMarkdown(document: LegalDocument): string {
  const lines = [`# ${document.title}`, '', `_Last updated ${EFFECTIVE_DATE}_`, ''];
  for (const section of document.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const block of section.blocks) {
      if (block.kind === 'paragraph') {
        lines.push(block.lead ? `**${block.lead}** ${block.text}` : block.text, '');
      } else {
        lines.push(...block.items.map((item) => `- ${item}`), '');
      }
    }
  }
  lines.push('---', '', `_${ATTRIBUTION}_`, '');
  return lines.join('\n');
}

/** file name under docs/legal → contents */
export const LEGAL_FILES: Record<string, string> = {
  'privacy-policy.md': toMarkdown(PRIVACY_POLICY),
  'terms-of-service.md': toMarkdown(TERMS_OF_SERVICE),
};
