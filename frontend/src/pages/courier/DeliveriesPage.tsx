import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { OrdersList } from '@/components/OrdersList';

export default function DeliveriesPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('courier.nav.deliveries')} description={t('courier.deliveriesText')} />
      <OrdersList basePath="/courier/deliveries" variant="courier" />
    </>
  );
}
