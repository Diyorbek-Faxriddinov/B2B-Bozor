import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigation, Radio, Satellite, Signal, SignalZero } from 'lucide-react';
import { courierApi, ordersApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT } from '@/i18n';
import { haversineKm, cn } from '@/lib/utils';
import { navigationLinks } from '@/lib/geo';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { CourierLocation, GeoPoint, Order } from '@/types';
import { Spinner } from './ui/display';
import { Switch } from './ui/form';

const RouteMap = lazy(() => import('./maps').then((m) => ({ default: m.RouteMap })));

function MapFallback({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-xl bg-surface-2', className)}>
      <Spinner />
    </div>
  );
}

/* ======================================================================
   Buyer / seller / admin: live tracking
   ====================================================================== */
export function TrackingPanel({ order }: { order: Order }) {
  const t = useT();
  const f = useFormat();
  const live = order.status === 'in_transit' || (order.status === 'ready' && !!order.courierId);
  const { data } = useQuery({
    queryKey: qk.tracking(order.id),
    queryFn: () => ordersApi.tracking(order.id),
    enabled: order.delivery.type === 'courier',
    refetchInterval: live ? 5000 : false,
  });

  return (
    <div className="space-y-3">
      {order.status === 'in_transit' && data?.courier && (
        <div className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-primary-soft-fg">{t('tracking.eta')}</div>
              <div className="text-2xl font-extrabold text-fg">~{data.etaMin} {t('map.minShort')}</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-fg">{t('tracking.remaining', { km: data.remainingKm ?? 0 })}</div>
              <div className="flex items-center justify-end gap-1 text-xs text-fg-muted">
                {data.courier.source === 'gps' ? <Signal className="size-3.5 text-success" /> : <Satellite className="size-3.5" />}
                {data.courier.source === 'gps' ? t('tracking.gps', { time: f.relative(data.courier.at) }) : t('tracking.simulated')}
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: `${Math.round((data.progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
      <Suspense fallback={<MapFallback className="h-72" />}>
        <RouteMap
          from={order.delivery.pickupPoint}
          to={order.delivery.address}
          route={data?.route}
          courier={order.status === 'delivered' ? undefined : data?.courier}
          className="h-72"
          toLabel={order.delivery.address?.label}
        />
      </Suspense>
    </div>
  );
}

/* ======================================================================
   Courier: GPS sharing + navigation
   ====================================================================== */
const SHARE_KEY = 'b2b-courier-share-gps';
const SEND_EVERY_MS = 10_000;
const SEND_MIN_MOVE_KM = 0.03;

export function useCourierGps(active: boolean) {
  const [sharing, setSharing] = useState(() => {
    try {
      return localStorage.getItem(SHARE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const geo = useGeolocation({ enabled: active && sharing, watch: true });
  const last = useRef<{ at: number; pos?: GeoPoint }>({ at: 0 });
  const [lastSent, setLastSent] = useState<string>();
  const send = useMutation({ mutationFn: courierApi.sendLocation, onSuccess: () => setLastSent(new Date().toISOString()) });

  useEffect(() => {
    try {
      localStorage.setItem(SHARE_KEY, sharing ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [sharing]);

  useEffect(() => {
    const p = geo.position;
    if (!p || !active || !sharing) return;
    const moved = last.current.pos ? haversineKm(last.current.pos, p) : Infinity;
    const elapsed = Date.now() - last.current.at;
    // every 10 s, or sooner (≥3 s) after a noticeable move
    if (elapsed < SEND_EVERY_MS && !(moved >= SEND_MIN_MOVE_KM * 3 && elapsed >= 3000)) return;
    last.current = { at: Date.now(), pos: p };
    send.mutate({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, heading: p.heading, speed: p.speed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position, active, sharing]);

  return { sharing, setSharing, position: geo.position as CourierLocation | undefined, error: geo.error, loading: geo.loading, lastSent };
}

export function CourierNavigator({ order, gps }: { order: Order; gps: ReturnType<typeof useCourierGps> }) {
  const t = useT();
  const f = useFormat();
  const user = useAuth((s) => s.user)!;
  const toPickup = order.status === 'ready';
  const target = toPickup ? order.delivery.pickupPoint : order.delivery.address;
  const from = gps.position ?? user.courier?.location;
  if (!target) return null;
  const links = navigationLinks(target, from);
  const distance = from ? haversineKm(from, target) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 p-3.5">
        <Switch
          checked={gps.sharing}
          onChange={gps.setSharing}
          label={
            <span className="inline-flex items-center gap-1.5">
              <Radio className={cn('size-4', gps.sharing && gps.position ? 'text-success' : 'text-fg-subtle')} /> {t('tracking.shareGps')}
            </span>
          }
          description={
            gps.error
              ? gps.error === 'denied'
                ? t('map.geoDenied')
                : t('map.geoFailed')
              : gps.sharing
                ? gps.position
                  ? t('tracking.sharing', { acc: gps.position.accuracy ?? '—', time: gps.lastSent ? f.relative(gps.lastSent) : '…' })
                  : t('tracking.waitingGps')
                : t('tracking.shareGpsText')
          }
        />
        {gps.sharing && !gps.position && !gps.error && <Spinner className="size-4" />}
        {gps.error && <SignalZero className="size-5 text-danger" />}
      </div>

      <div className="text-sm">
        <div className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{toPickup ? t('tracking.goToPickup') : t('tracking.goToClient')}</div>
        <div className="mt-0.5 text-fg">{target.text}</div>
        {distance !== undefined && <div className="text-xs text-fg-muted">{t('tracking.fromYou', { km: (distance * 1.3).toFixed(1) })}</div>}
      </div>

      <Suspense fallback={<MapFallback className="h-72" />}>
        <NavigatorMap from={from} target={target} order={order} toPickup={toPickup} />
      </Suspense>

      <div className="grid grid-cols-3 gap-2">
        <a href={links.yandexNavi} className="flex flex-col items-center gap-1 rounded-xl bg-primary px-2 py-2.5 text-center text-xs font-semibold text-primary-fg hover:bg-primary-hover">
          <Navigation className="size-4" /> {t('tracking.navigator')}
        </a>
        <a href={links.yandex} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border-strong px-2 py-2.5 text-center text-xs font-semibold hover:bg-surface-2">
          Yandex Maps
        </a>
        <a href={links.google} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border-strong px-2 py-2.5 text-center text-xs font-semibold hover:bg-surface-2">
          Google Maps
        </a>
      </div>
    </div>
  );
}

function NavigatorMap({ from, target, order, toPickup }: { from?: CourierLocation; target: GeoPoint & { text?: string }; order: Order; toPickup: boolean }) {
  const t = useT();
  // Route from the courier's position to the current target; falls back to the order route.
  // Rounded to ~100 m so the route is re-requested only after a meaningful move.
  const origin = from ? { lat: Math.round(from.lat * 1000) / 1000, lng: Math.round(from.lng * 1000) / 1000 } : order.delivery.pickupPoint;
  return (
    <RouteMap
      from={{ ...origin, text: from ? t('map.you') : order.delivery.pickupPoint.text }}
      to={target}
      courier={from}
      hideFrom={!!from}
      className="h-72"
      fromLabel={from ? t('map.you') : t('map.pickup')}
      toLabel={toPickup ? t('map.pickup') : t('map.destination')}
      toKind={toPickup ? 'warehouse' : 'destination'}
    />
  );
}
