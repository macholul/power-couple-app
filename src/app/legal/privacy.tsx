import { LegalDocumentScreen } from '@/components/legal-document';
import { PRIVACY_POLICY } from '@/content/legal';

export default function PrivacyPolicyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}
