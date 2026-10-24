import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, FileText, LayoutDashboard, Package } from 'lucide-react';
import { ordersApi, rfqApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function SellerLayout() {
  const t = useT();
  const { data: pending } = useQuery({ queryKey: qk.orders({ status: 'pending', pageSize: 1 }), queryFn: () => ordersApi.list({ status: 'pending', pageSize: 1 }), refetchInterval: 30_000 });
  const { data: rfqs } = useQuery({ queryKey: qk.rfqs({ status: 'open', pageSize: 1 }), queryFn: () => rfqApi.list({ status: 'open', pageSize: 1 }), refetchInterval: 60_000 });
  return (
    <DashboardLayout
      title={t('seller.panel')}
      items={[
        { to: '/seller', label: t('seller.nav.overview'), icon: <LayoutDashboard />, end: true },
        { to: '/seller/products', label: t('seller.nav.products'), icon: <Package /> },
        { to: '/seller/orders', label: t('seller.nav.orders'), icon: <ClipboardList />, badge: pending?.total },
        { to: '/seller/rfqs', label: t('seller.nav.rfqs'), icon: <FileText />, badge: rfqs?.total },
        { to: '/seller/company', label: t('seller.nav.company'), icon: <Building2 /> },
      ]}
    />
  );
}
