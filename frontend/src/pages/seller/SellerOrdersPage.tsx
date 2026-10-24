import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { OrdersList } from '@/components/OrdersList';

export default function SellerOrdersPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('seller.nav.orders')} description={t('orders.sellerSubtitle')} />
      <OrdersList basePath="/seller/orders" variant="seller" />
    </>
  );
}
