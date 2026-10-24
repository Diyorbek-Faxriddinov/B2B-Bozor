import { PRIVACY } from '@/content/legal';
import { useLocale } from '@/i18n';
import { LegalPage } from './LegalPage';

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY[useLocale()]} />;
}
