import { TERMS } from '@/content/legal';
import { useLocale } from '@/i18n';
import { LegalPage } from './LegalPage';

export default function TermsPage() {
  return <LegalPage doc={TERMS[useLocale()]} />;
}
