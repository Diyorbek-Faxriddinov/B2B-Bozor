import { useQuery } from '@tanstack/react-query';
import { CalendarClock, LayoutDashboard, PackageSearch, Truck } from 'lucide-react';
import { courierApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function CourierLayout() {
  const t = useT();
  const { data: available } = useQuery({ queryKey: qk.courier('available'), queryFn: courierApi.available, refetchInterval: 20_000 });
  return (
    <DashboardLayout
      title={t('courier.panel')}
      items={[
        { to: '/courier', label: t('courier.nav.overview'), icon: <LayoutDashboard />, end: true },
        { to: '/courier/available', label: t('courier.nav.available'), icon: <PackageSearch />, badge: available?.length },
        { to: '/courier/deliveries', label: t('courier.nav.deliveries'), icon: <Truck /> },
        { to: '/courier/schedule', label: t('courier.nav.schedule'), icon: <CalendarClock /> },
      ]}
    />
  );
}
