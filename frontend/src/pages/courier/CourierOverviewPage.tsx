import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPinned, PackageCheck, PackageSearch, Star, Truck, Wallet } from 'lucide-react';
import { courierApi, ordersApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { TrendChart } from '@/components/charts';
import { DeliveryCard } from '@/components/DeliveryCard';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export default function CourierOverviewPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const user = useAuth((s) => s.user)!;
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.courier('dashboard'), queryFn: courierApi.dashboard, refetchInterval: 30_000 });
  const { data: active } = useQuery({ queryKey: qk.orders({ status: 'active', pageSize: 6 }), queryFn: () => ordersApi.list({ status: 'active', pageSize: 6 }), refetchInterval: 30_000 });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('courier.hello', { name: user.fullName.split(' ')[0] })}
        description={user.courier ? `${td(`transport.${user.courier.transport}`)} · ${user.courier.region}` : undefined}
        actions={
          <ButtonLink to="/courier/available" leftIcon={<PackageSearch />}>
            {t('courier.findOrders')}
          </ButtonLink>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('courier.stats.today')} countTo={data.earningsToday} format={(n) => f.money(Math.round(n / 100) * 100)} icon={<Wallet />} tone="success" />
            <StatCard label={t('courier.stats.month')} countTo={data.earnings} format={(n) => f.money(n, { compact: true })} icon={<Wallet />} />
            <StatCard label={t('courier.stats.delivered')} countTo={data.delivered} icon={<PackageCheck />} tone="info" hint={t('courier.stats.avgKm', { n: data.avgDistanceKm })} />
            <StatCard label={t('courier.stats.rating')} countTo={data.rating} format={(n) => n.toFixed(1)} icon={<Star />} tone="warning" />
          </div>

          {data.available > 0 && (
            <Link to="/courier/available" className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-primary to-[#4338ca] p-5 text-white shadow-(--shadow-pop)">
              <span className="flex size-12 items-center justify-center rounded-xl bg-white/15">
                <MapPinned className="size-6" />
              </span>
              <div className="flex-1">
                <div className="text-lg font-bold">{t('courier.availableBanner', { n: data.available })}</div>
                <div className="text-sm text-white/75">{t('courier.availableBannerText')}</div>
              </div>
              <ArrowRight className="size-5" />
            </Link>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
            <Card>
              <CardHeader title={t('courier.earningsChart')} description={t('seller.range.30')} />
              <div className="p-4">
                <TrendChart data={data.earningsSeries} format={(v) => f.money(v)} name={t('courier.earnings')} countLabel={t('courier.stats.delivered')} color="var(--chart-3)" />
              </div>
            </Card>
            <Card>
              <CardHeader
                title={t('courier.activeDeliveries', { n: data.active })}
                action={
                  <Link to="/courier/deliveries?status=active" className="text-sm font-medium text-primary hover:underline">
                    {t('common.viewAll')}
                  </Link>
                }
              />
              <div className="space-y-3 p-4">
                {!active?.items.length ? (
                  <EmptyState icon={<Truck />} title={t('courier.noActive')} className="py-8" />
                ) : (
                  active.items.map((o) => <DeliveryCard key={o.id} order={o} to={`/courier/deliveries/${o.id}`} />)
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
