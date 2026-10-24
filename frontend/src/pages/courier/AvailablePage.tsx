import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crosshair, LayoutGrid, Loader2, Map as MapIcon, PackageSearch, RefreshCw, Truck } from 'lucide-react';
import { courierApi, ordersApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { cn, haversineKm } from '@/lib/utils';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { Order } from '@/types';
import { DeliveryCard } from '@/components/DeliveryCard';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, Spinner } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Select } from '@/components/ui/form';

const PointsMap = lazy(() => import('@/components/maps').then((m) => ({ default: m.PointsMap })));

type Sort = 'nearest' | 'fee' | 'distance' | 'newest';

export default function AvailablePage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user)!;
  const [sort, setSort] = useState<Sort>('fee');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState<string>();
  const [locate, setLocate] = useState(false);
  const geo = useGeolocation({ enabled: locate });
  const me = geo.position ?? user.courier?.location;
  const { data, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: qk.courier('available'), queryFn: courierApi.available, refetchInterval: 15_000 });

  useEffect(() => {
    if (geo.position) setSort('nearest');
    if (geo.error) toast.error(geo.error === 'denied' ? t('map.geoDenied') : t('map.geoFailed'));
  }, [geo.position, geo.error, t]);

  const accept = useMutation({
    mutationFn: ordersApi.assign,
    onSuccess: (o) => {
      toast.success(t('courier.accepted'), { description: o.number });
      qc.invalidateQueries({ queryKey: ['courier'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/courier/deliveries/${o.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refetch();
    },
  });

  const fee = (o: Order) => o.courierFee ?? Math.round((o.deliveryFee || 30000) * 0.8);
  const toPickup = (o: Order) => (me ? Math.round(haversineKm(me, o.delivery.pickupPoint) * 1.3 * 10) / 10 : undefined);
  const list = [...(data ?? [])].sort((a, b) => {
    if (sort === 'nearest' && me) return (toPickup(a) ?? 0) - (toPickup(b) ?? 0);
    if (sort === 'fee') return fee(b) - fee(a);
    if (sort === 'distance') return (a.delivery.distanceKm ?? 0) - (b.delivery.distanceKm ?? 0);
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const card = (o: Order) => (
    <div key={o.id} className={cn('rounded-xl transition-shadow', selected === o.id && 'ring-3 ring-primary/40')} onMouseEnter={() => setSelected(o.id)}>
      <DeliveryCard
        order={o}
        to={`/courier/deliveries/${o.id}`}
        fromYouKm={toPickup(o)}
        action={
          <>
            <ButtonLink to={`/courier/deliveries/${o.id}`} size="sm" variant="ghost">
              {t('common.details')}
            </ButtonLink>
            <Button size="sm" leftIcon={<Truck />} loading={accept.isPending && accept.variables === o.id} onClick={() => accept.mutate(o.id)}>
              {t('courier.accept')}
            </Button>
          </>
        }
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('courier.nav.available')}
        description={t('courier.availableText')}
        actions={
          <>
            <Button variant="outline" leftIcon={geo.loading ? <Loader2 className="animate-spin" /> : <Crosshair />} onClick={() => (locate ? geo.refresh() : setLocate(true))}>
              {t('courier.myLocation')}
            </Button>
            <div className="w-48">
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('catalog.sortBy')}>
                {me && <option value="nearest">{t('courier.sort.nearest')}</option>}
                <option value="fee">{t('courier.sort.fee')}</option>
                <option value="distance">{t('courier.sort.distance')}</option>
                <option value="newest">{t('courier.sort.newest')}</option>
              </Select>
            </div>
            <div className="flex rounded-lg border border-border-strong p-0.5">
              {(['list', 'map'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  aria-label={v === 'map' ? t('courier.mapView') : t('courier.listView')}
                  className={cn('flex size-8 items-center justify-center rounded-md', view === v ? 'bg-surface-2 text-fg' : 'text-fg-subtle hover:text-fg')}
                >
                  {v === 'map' ? <MapIcon className="size-4" /> : <LayoutGrid className="size-4" />}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label={t('common.refresh')}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={<PackageSearch />}
            title={t('courier.noAvailable')}
            description={t('courier.noAvailableText')}
            action={
              <ButtonLink to="/courier/deliveries" variant="outline">
                {t('courier.nav.deliveries')}
              </ButtonLink>
            }
          />
        </Card>
      ) : view === 'map' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
          <Suspense
            fallback={
              <div className="flex h-[560px] items-center justify-center rounded-xl bg-surface-2">
                <Spinner />
              </div>
            }
          >
            <PointsMap
              className="h-[420px] lg:h-[calc(100vh-14rem)] lg:min-h-[520px]"
              me={me}
              selectedId={selected}
              onSelect={setSelected}
              points={list.map((o) => ({
                id: o.id,
                kind: 'warehouse',
                title: `${o.number} · ${o.companyName}`,
                subtitle: o.delivery.pickupPoint.text,
                ...o.delivery.pickupPoint,
              }))}
            />
          </Suspense>
          <div className="space-y-3 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1">{list.map(card)}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map(card)}</div>
      )}
    </div>
  );
}
