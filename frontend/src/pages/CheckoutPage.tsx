import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, Building, Clock, CreditCard, Crosshair, ExternalLink, Loader2, Lock, MapPin, Pencil, Plus, Route as RouteIcon, Store, Truck, Warehouse } from 'lucide-react';
import { authApi, catalogApi, goToPayment, ordersApi, paymentsApi } from '@/api/endpoints';
import { qk, useCartProducts } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useCart } from '@/stores/cart';
import { useFormat, useT, useTd } from '@/i18n';
import { courierAvailable, deliveryFee, DELIVERY, lineTotal } from '@/lib/pricing';
import { getRoute, navigationLinks } from '@/lib/geo';
import { haversineKm } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { Address, DeliveryType, PaymentMethod, RouteGeometry } from '@/types';
import { ProductImage } from '@/components/catalog';
import { AddressDialog, useAddressDetails } from '@/components/address';
import { Breadcrumbs, Card, KeyValue, PageLoader, Spinner } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { RadioCard, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { cartIssue } from './CartPage';

const PointsMap = lazy(() => import('@/components/maps').then((m) => ({ default: m.PointsMap })));

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg">{n}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function MapFallback({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-xl bg-surface-2 ${className ?? ''}`}>
      <Spinner />
    </div>
  );
}

export default function CheckoutPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const details = useAddressDetails();
  const excluded = useCart((s) => s.excluded);
  const removeMany = useCart((s) => s.removeMany);
  const { rows: allRows, isLoading } = useCartProducts();
  const rows = allRows.filter((r) => !excluded.includes(r.productId));

  const [deliveryType, setDeliveryType] = useState<DeliveryType>('courier');
  const [address, setAddress] = useState<Address | undefined>(user.addresses[0]);
  const [dialog, setDialog] = useState<{ open: boolean; index?: number }>({ open: false });
  const [payment, setPayment] = useState<PaymentMethod>('card');
  const [provider, setProvider] = useState<'payme' | 'click'>('payme');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [locateMe, setLocateMe] = useState(false);
  const me = useGeolocation({ enabled: locateMe });

  const companyIds = useMemo(() => [...new Set(rows.map((r) => r.product.companyId))], [rows]);
  const companies = useQueries({ queries: companyIds.map((id) => ({ queryKey: qk.company(id), queryFn: () => catalogApi.company(id), staleTime: 300_000 })) });
  const companyById = (id: string) => companies.find((c) => c.data?.id === id)?.data;

  // Real road routes: each seller warehouse → delivery address
  const routes = useQueries({
    queries: companyIds.map((id) => {
      const from = companyById(id)?.pickupPoint;
      return {
        queryKey: ['route', from?.lat, from?.lng, address?.lat, address?.lng],
        queryFn: () => getRoute(from!, address!),
        enabled: deliveryType === 'courier' && !!from && !!address,
        staleTime: Infinity,
      };
    }),
  });

  const groups = companyIds.map((id, i) => {
    const company = companyById(id);
    const lines = rows.filter((r) => r.product.companyId === id);
    const subtotal = lines.reduce((s, r) => s + lineTotal(r.product, r.quantity), 0);
    const route = routes[i]?.data as RouteGeometry | undefined;
    const routing = deliveryType === 'courier' && !!address && (routes[i]?.isLoading ?? true);
    const outOfRange = deliveryType === 'courier' && !!route && !courierAvailable(route.distanceKm);
    const fee = deliveryType === 'courier' && route && !outOfRange ? deliveryFee(subtotal, route.distanceKm) : 0;
    const pickupKm = me.position && company ? Math.round(haversineKm(me.position, company.pickupPoint) * 1.3 * 10) / 10 : undefined;
    return { id, company, name: lines[0]?.product.company.name ?? '', lines, subtotal, route, routing, outOfRange, fee, pickupKm };
  });
  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const fees = groups.reduce((s, g) => s + g.fee, 0);
  const total = subtotal + fees;
  const anyRouting = groups.some((g) => g.routing);
  const anyOutOfRange = groups.some((g) => g.outOfRange);

  useEffect(() => {
    if (!address && user.addresses[0]) setAddress(user.addresses[0]);
  }, [user.addresses, address]);

  const saveAddresses = useMutation({
    mutationFn: (addresses: Address[]) => authApi.updateMe({ addresses }),
    onSuccess: (u) => setUser(u),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const onAddressSaved = (a: Address) => {
    const list = [...user.addresses];
    if (dialog.index !== undefined) list[dialog.index] = a;
    else list.unshift(a);
    saveAddresses.mutate(list.slice(0, 5));
    setAddress(a);
    setDialog({ open: false });
  };

  const m = useMutation({
    mutationFn: () =>
      ordersApi.checkout({
        items: rows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
        deliveryType,
        address: deliveryType === 'courier' ? address : undefined,
        paymentMethod: payment,
        note: note.trim() || undefined,
      }),
    onSuccess: async (orders) => {
      setPlaced(true);
      removeMany(rows.map((r) => r.productId));
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: qk.notifications });
      authApi.me().then(setUser).catch(() => undefined);
      if (payment === 'card') {
        // Orders exist now; the card is charged on the Payme / Click page and confirmed server-to-server.
        setPaying(true);
        try {
          const p = await paymentsApi.create(
            orders.map((o) => o.id),
            provider,
          );
          goToPayment(p.url, (to) => navigate(to, { replace: true }));
        } catch (err) {
          setPaying(false);
          toast.error(errorMessage(err));
          navigate('/account/orders', { replace: true });
        }
        return;
      }
      navigate('/checkout/success', { replace: true, state: { orders } });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <PageLoader />;
  if (!rows.length && !placed) return <Navigate to="/cart" replace />;

  const hasIssues = rows.some((r) => cartIssue(r.product, r.quantity));
  const canPlace = !hasIssues && !m.isPending && (deliveryType === 'pickup' || (!!address && !anyRouting && !anyOutOfRange));
  const isSelected = (a: Address) => !!address && a.lat === address.lat && a.lng === address.lng && a.text === address.text;

  const courierPoints = [
    ...groups.filter((g) => g.company).map((g) => ({ id: g.id, kind: 'warehouse' as const, title: g.name, subtitle: g.company!.pickupPoint.text, ...g.company!.pickupPoint })),
    ...(address ? [{ id: 'dest', kind: 'destination' as const, title: address.label || t('map.destination'), subtitle: address.text, lat: address.lat, lng: address.lng }] : []),
  ];

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: t('nav.cart'), to: '/cart' }, { label: t('checkout.title') }]} />
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">{t('checkout.title')}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <StepCard n={1} title={t('checkout.deliveryMethod')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
              <RadioCard checked={deliveryType === 'courier'} onSelect={() => setDeliveryType('courier')} icon={<Truck />} title={t('checkout.courier')} description={t('checkout.courierText')} />
              <RadioCard checked={deliveryType === 'pickup'} onSelect={() => setDeliveryType('pickup')} icon={<Warehouse />} title={t('checkout.pickup')} description={t('checkout.pickupText')} />
            </div>

            {deliveryType === 'courier' ? (
              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">{t('checkout.deliveryAddress')}</div>
                <div className="grid gap-2">
                  {user.addresses.map((a, i) => (
                    <div key={`${a.lat},${a.lng},${i}`} className="relative">
                      <RadioCard
                        checked={isSelected(a)}
                        onSelect={() => setAddress(a)}
                        icon={<MapPin />}
                        title={a.label || t('checkout.address')}
                        description={
                          <>
                            {a.text}
                            {details(a) && <span className="mt-0.5 block font-medium text-fg">{details(a)}</span>}
                          </>
                        }
                        className="pr-20"
                      />
                      <Button size="xs" variant="ghost" className="absolute top-3 right-10" leftIcon={<Pencil />} onClick={() => setDialog({ open: true, index: i })}>
                        <span className="sr-only">{t('common.edit')}</span>
                      </Button>
                    </div>
                  ))}
                  <button
                    onClick={() => setDialog({ open: true })}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-3.5 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="size-4" /> {t('checkout.addAddressOnMap')}
                  </button>
                </div>

                {address && (
                  <div className="mt-4 space-y-3">
                    <Suspense fallback={<MapFallback className="h-72" />}>
                      <PointsMap points={courierPoints} routes={groups.map((g) => g.route).filter((r): r is RouteGeometry => !!r)} className="h-72" />
                    </Suspense>
                    <ul className="space-y-1.5">
                      {groups.map((g) => (
                        <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Warehouse className="size-4 shrink-0 text-[#ea580c]" />
                            <span className="truncate font-medium">{g.name}</span>
                          </span>
                          {g.routing ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                              <Loader2 className="size-3.5 animate-spin" /> {t('map.routing')}
                            </span>
                          ) : g.route ? (
                            <span className={`inline-flex items-center gap-3 text-xs ${g.outOfRange ? 'text-danger' : 'text-fg-muted'}`}>
                              <span className="inline-flex items-center gap-1">
                                <RouteIcon className="size-3.5" /> {g.route.distanceKm} km
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="size-3.5" /> ~{g.route.durationMin} {t('map.minShort')}
                              </span>
                              {g.route.source === 'estimate' && <span className="text-warning">{t('map.estimate')}</span>}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {anyOutOfRange && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>{t('checkout.outOfRange', { km: DELIVERY.maxKm })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">{t('checkout.pickupPoints')}</div>
                  <Button size="sm" variant="ghost" leftIcon={me.loading ? <Loader2 className="animate-spin" /> : <Crosshair />} onClick={() => (locateMe ? me.refresh() : setLocateMe(true))}>
                    {t('checkout.distanceFromMe')}
                  </Button>
                </div>
                <Suspense fallback={<MapFallback className="h-64" />}>
                  <PointsMap
                    points={groups.filter((g) => g.company).map((g) => ({ id: g.id, kind: 'warehouse' as const, title: g.name, subtitle: g.company!.pickupPoint.text, ...g.company!.pickupPoint }))}
                    me={me.position}
                    className="h-64"
                  />
                </Suspense>
                {groups.map((g) => {
                  const links = g.company ? navigationLinks(g.company.pickupPoint, me.position) : undefined;
                  return (
                    <div key={g.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/50 p-3.5 text-sm">
                      <Store className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{g.name}</div>
                        <div className="text-fg-muted">{g.company?.pickupPoint.text ?? '…'}</div>
                        <div className="mt-0.5 text-xs text-fg-subtle">
                          {t('checkout.pickupHours')}
                          {g.pickupKm !== undefined && ` · ≈ ${g.pickupKm} km`}
                        </div>
                      </div>
                      {links && (
                        <div className="flex shrink-0 flex-col gap-1 text-xs">
                          <a href={links.yandex} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            Yandex <ExternalLink className="size-3" />
                          </a>
                          <a href={links.google} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            Google <ExternalLink className="size-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
                {me.error && <p className="text-xs text-danger">{me.error === 'denied' ? t('map.geoDenied') : t('map.geoFailed')}</p>}
              </div>
            )}
          </StepCard>

          <StepCard n={2} title={t('checkout.paymentMethod')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
              <RadioCard checked={payment === 'card'} onSelect={() => setPayment('card')} icon={<CreditCard />} title={t('checkout.payment.card')} description={t('checkout.payment.cardHint')} />
              <RadioCard checked={payment === 'transfer'} onSelect={() => setPayment('transfer')} icon={<Building />} title={t('checkout.payment.transfer')} description={t('checkout.payment.transferHint')} />
              <RadioCard checked={payment === 'cash'} onSelect={() => setPayment('cash')} icon={<Banknote />} title={t('checkout.payment.cash')} description={t('checkout.payment.cashHint')} />
            </div>
            {payment === 'card' && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">{t('checkout.provider')}</div>
                <div className="flex flex-wrap gap-2">
                  {(['payme', 'click'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${provider === p ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border-strong hover:border-fg-subtle'}`}
                    >
                      {p === 'payme' ? 'Payme' : 'Click'}
                    </button>
                  ))}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
                  <Lock className="size-3.5" /> {t('checkout.providerNote')}
                </p>
              </div>
            )}
            {payment === 'transfer' && <div className="mt-4 rounded-xl bg-info-soft p-4 text-sm text-info">{t('checkout.transferNote', { org: user.organization ?? user.fullName })}</div>}
          </StepCard>

          <StepCard n={3} title={t('checkout.comment')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder={t('checkout.commentPlaceholder')} />
          </StepCard>
        </div>

        <aside className="lg:sticky lg:top-40 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t('checkout.yourOrder')}</h2>
            <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.id}>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-fg-muted">
                    <span className="truncate">{g.name}</span>
                    {deliveryType === 'courier' && g.route && <span className="shrink-0">{g.route.distanceKm} km</span>}
                  </div>
                  <ul className="space-y-2">
                    {g.lines.map((r) => (
                      <li key={r.productId} className="flex items-center gap-3">
                        <div className="size-11 shrink-0 overflow-hidden rounded-md">
                          <ProductImage product={r.product} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-sm">{r.product.name}</div>
                          <div className="text-xs text-fg-subtle">
                            {f.number(r.quantity)} {td(`units.${r.product.unit}`)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold whitespace-nowrap">{f.money(lineTotal(r.product, r.quantity))}</div>
                      </li>
                    ))}
                  </ul>
                  {deliveryType === 'courier' && (
                    <div className="mt-1.5 flex justify-between text-xs text-fg-muted">
                      <span>{t('cart.delivery')}</span>
                      <span>
                        {!address ? (
                          '—'
                        ) : g.routing ? (
                          <Loader2 className="inline size-3 animate-spin" />
                        ) : g.outOfRange ? (
                          <span className="font-semibold text-danger">{t('checkout.unavailable')}</span>
                        ) : g.fee === 0 ? (
                          <span className="font-semibold text-success">{t('checkout.free')}</span>
                        ) : (
                          f.money(g.fee)
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <KeyValue label={t('checkout.goods')}>{f.money(subtotal)}</KeyValue>
              <KeyValue label={t('cart.delivery')}>
                {deliveryType === 'pickup' ? t('checkout.free') : !address ? '—' : anyRouting ? <Loader2 className="inline size-3.5 animate-spin" /> : fees ? f.money(fees) : t('checkout.free')}
              </KeyValue>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-semibold">{t('cart.total')}</span>
                <span className="text-2xl font-extrabold">{f.money(total)}</span>
              </div>
              {f.currency !== 'UZS' && <p className="mt-1 text-right text-xs text-fg-subtle">{f.uzs(total)}</p>}
            </div>
            {groups.length > 1 && <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">{t('cart.splitNotice', { n: groups.length })}</p>}
            <Button size="lg" className="mt-4 w-full" disabled={!canPlace} loading={m.isPending} onClick={() => m.mutate()}>
              {payment === 'card' ? t('checkout.payAndPlace', { amount: f.money(total) }) : t('checkout.place')}
            </Button>
            {deliveryType === 'courier' && !address && <p className="mt-2 text-center text-xs text-danger">{t('checkout.selectAddress')}</p>}
            {deliveryType === 'courier' && anyOutOfRange && <p className="mt-2 text-center text-xs text-danger">{t('checkout.choosePickup')}</p>}
            <p className="mt-3 text-center text-xs text-fg-subtle">
              {t('checkout.agree')}{' '}
              <Link to="/terms" className="text-primary hover:underline">
                {t('footer.terms')}
              </Link>
            </p>
          </Card>
        </aside>
      </div>

      <AddressDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        onSave={onAddressSaved}
        initial={dialog.index !== undefined ? user.addresses[dialog.index] : undefined}
        near={address}
        saving={saveAddresses.isPending}
        title={dialog.index !== undefined ? t('address.editTitle') : t('address.title')}
      />

      <Modal open={paying} onClose={() => undefined} size="sm">
        <div className="flex flex-col items-center py-6 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <div className="mt-4 font-semibold">{t('checkout.redirecting')}</div>
          <div className="mt-1 text-sm text-fg-muted">{provider === 'payme' ? 'Payme' : 'Click'} · Uzcard / Humo / Visa</div>
        </div>
      </Modal>
    </div>
  );
}
