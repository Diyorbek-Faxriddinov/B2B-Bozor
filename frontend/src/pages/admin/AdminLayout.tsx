import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, LayoutDashboard, Package, Users } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function AdminLayout() {
  const t = useT();
  const { data } = useQuery({ queryKey: qk.admin('dashboard'), queryFn: adminApi.dashboard, refetchInterval: 60_000 });
  return (
    <DashboardLayout
      title={t('admin.panel')}
      items={[
        { to: '/admin', label: t('admin.nav.overview'), icon: <LayoutDashboard />, end: true },
        { to: '/admin/users', label: t('admin.nav.users'), icon: <Users /> },
        { to: '/admin/companies', label: t('admin.nav.companies'), icon: <Building2 />, badge: data?.pendingCompanies },
        { to: '/admin/products', label: t('admin.nav.products'), icon: <Package />, badge: data?.pendingProducts },
        { to: '/admin/orders', label: t('admin.nav.orders'), icon: <ClipboardList /> },
      ]}
    />
  );
}
