import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { OrdersList } from '@/components/OrdersList';

export default function OrdersPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('account.nav.orders')} description={t('orders.buyerSubtitle')} />
      <OrdersList basePath="/account/orders" variant="buyer" />
    </>
  );
}
