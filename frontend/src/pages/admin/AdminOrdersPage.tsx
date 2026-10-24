import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/display';
import { OrdersList } from '@/components/OrdersList';

export default function AdminOrdersPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t('admin.nav.orders')} description={t('admin.ordersText')} />
      <OrdersList basePath="/admin/orders" variant="admin" />
    </>
  );
}
