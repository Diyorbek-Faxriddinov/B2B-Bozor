import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { RfqList } from '@/components/RfqList';

export default function SellerRfqsPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('seller.nav.rfqs')} description={t('rfq.sellerSubtitle')} />
      <RfqList mode="seller" />
    </>
  );
}
