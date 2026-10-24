import { lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Banknote,
  Boxes,
  CheckCircle2,
  CreditCard,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  Printer,
  RotateCcw,
  Store,
  Truck,
  User as UserIcon,
  Warehouse,
  XCircle,
} from 'lucide-react';
import { goToPayment, messagesApi, ordersApi, paymentsApi, type PaymentProvider } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useCart } from '@/stores/cart';
import { useFormat, useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { printInvoice } from '@/lib/invoice';
import type { Order, OrderStatus } from '@/types';
import { Card, CardHeader, ErrorState, KeyValue, PageLoader, Spinner } from './ui/display';
import { Button } from './ui/button';
import { useConfirm } from './ui/overlay';
import { OrderItems, OrderProgress, OrderStatusBadge, OrderTimeline, PaymentStatusBadge } from './orders';
import { AddressBlock } from './address';
import { CourierNavigator, TrackingPanel, useCourierGps } from './DeliveryTracking';
import { haversineKm } from '@/lib/utils';

/** Card orders that are still unpaid can be paid again from the order page. */
function PayButtons({ orderId }: { orderId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const pay = useMutation({
    mutationFn: (provider: PaymentProvider) => paymentsApi.create([orderId], provider),
    onSuccess: (p) => goToPayment(p.url, navigate),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <Button leftIcon={<CreditCard />} loading={pay.isPending && pay.variables === 'payme'} disabled={pay.isPending} onClick={() => pay.mutate('payme')}>
        {t('order.payNow')} · Payme
      </Button>
      <Button variant="outline" loading={pay.isPending && pay.variables === 'click'} disabled={pay.isPending} onClick={() => pay.mutate('click')}>
        Click
      </Button>
    </>
  );
}

const RouteMap = lazy(() => import('./maps').then((m) => ({ default: m.RouteMap })));

export function useOrderActions(order: Order | undefined) {
  const qc = useQueryClient();
  const t = useT();
  const td = useTd();
  const invalidate = (o: Order) => {
    qc.setQueryData(qk.order(o.id), o);
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['seller'] });
    qc.invalidateQueries({ queryKey: ['courier'] });
  };
  const status = useMutation({
    mutationFn: ({ status, note }: { status: OrderStatus; note?: string }) => ordersApi.setStatus(order!.id, status, note),
    onSuccess: (o) => {
      invalidate(o);
      toast.success(t('order.statusChanged', { status: td(`order.status.${o.status}`) }));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (reason?: string) => ordersApi.cancel(order!.id, reason),
    onSuccess: (o) => {
      invalidate(o);
      toast.success(t('order.cancelled'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const assign = useMutation({
    mutationFn: () => ordersApi.assign(order!.id),
    onSuccess: (o) => {
      invalidate(o);
      toast.success(t('courier.accepted'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const markPaid = useMutation({
    mutationFn: () => ordersApi.markPaid(order!.id),
    onSuccess: (o) => {
      invalidate(o);
      toast.success(t('order.markedPaid'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return { status, cancel, assign, markPaid };
}

export function OrderDetailView({ id, backTo }: { id: string; backTo: string }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuth((s) => s.user)!;
  const addToCart = useCart((s) => s.add);
  const { data: order, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.order(id), queryFn: () => ordersApi.get(id) });
  const { status, cancel, assign, markPaid } = useOrderActions(order);
  const courierActive = user.role === 'courier' && !!order && order.courierId === user.id && ['ready', 'in_transit'].includes(order.status);
  const gps = useCourierGps(courierActive);

  const contact = useMutation({
    mutationFn: (recipient: { companyId?: string; recipientId?: string }) => messagesApi.start(recipient),
    onSuccess: (c) => navigate(`/messages/${c.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <PageLoader />;
  if (isError || !order) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  const role = user.role;
  const isBuyer = order.buyerId === user.id;
  const isSeller = role === 'seller' && user.companyId === order.companyId;
  const isCourier = role === 'courier';
  const busy = status.isPending || cancel.isPending || assign.isPending;
  const liveTracking = !courierActive && order.delivery.type === 'courier' && order.status === 'in_transit';

  const askCancel = async () => {
    const res = await confirm({
      title: t('order.cancelTitle', { number: order.number }),
      description: t('order.cancelText'),
      danger: true,
      withReason: true,
      reasonPlaceholder: t('order.cancelReason'),
      confirmText: t('order.cancel'),
    });
    if (res) cancel.mutate(res.reason || undefined);
  };

  const confirmDelivered = async () => {
    const dest = order.delivery.address;
    const pos = gps.position;
    if (dest && pos) {
      const km = haversineKm(pos, dest);
      if (km > 0.5 && !(await confirm({ title: t('tracking.farTitle', { km: km.toFixed(1) }), description: t('tracking.farText'), confirmText: t('order.actions.delivered') }))) return;
    }
    status.mutate({ status: 'delivered' });
  };

  const awaitingCard = order.paymentMethod === 'card' && order.paymentStatus === 'unpaid' && order.status === 'pending';

  const reorder = () => {
    order.items.forEach((it) => addToCart(it.productId, it.quantity));
    toast.success(t('order.reordered'), { action: { label: t('cart.view'), onClick: () => navigate('/cart') } });
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {isBuyer && awaitingCard && <PayButtons orderId={order.id} />}
      {isSeller && order.status === 'pending' && !awaitingCard && (
        <Button leftIcon={<CheckCircle2 />} loading={status.isPending} onClick={() => status.mutate({ status: 'confirmed' })}>
          {t('order.actions.confirm')}
        </Button>
      )}
      {isSeller && order.status === 'confirmed' && (
        <Button leftIcon={<Boxes />} loading={status.isPending} onClick={() => status.mutate({ status: 'ready' })}>
          {t('order.actions.ready')}
        </Button>
      )}
      {isSeller && order.status === 'ready' && order.delivery.type === 'pickup' && (
        <Button leftIcon={<PackageCheck />} loading={status.isPending} onClick={() => status.mutate({ status: 'delivered' })}>
          {t('order.actions.handover')}
        </Button>
      )}
      {isSeller && order.paymentStatus === 'unpaid' && order.status !== 'cancelled' && order.paymentMethod === 'transfer' && (
        <Button variant="outline" leftIcon={<Banknote />} loading={markPaid.isPending} onClick={() => markPaid.mutate()}>
          {t('order.actions.markPaid')}
        </Button>
      )}
      {isCourier && !order.courierId && order.status === 'ready' && (
        <Button leftIcon={<Truck />} loading={assign.isPending} onClick={() => assign.mutate()}>
          {t('courier.accept')}
        </Button>
      )}
      {isCourier && order.courierId === user.id && order.status === 'ready' && (
        <Button leftIcon={<Truck />} loading={status.isPending} onClick={() => status.mutate({ status: 'in_transit' })}>
          {t('order.actions.pickedUp')}
        </Button>
      )}
      {isCourier && order.courierId === user.id && order.status === 'in_transit' && (
        <Button variant="success" leftIcon={<PackageCheck />} loading={status.isPending} onClick={confirmDelivered}>
          {t('order.actions.delivered')}
        </Button>
      )}
      {((isBuyer && order.status === 'pending') || (isSeller && ['pending', 'confirmed', 'ready'].includes(order.status))) && (
        <Button variant="outline" className="text-danger" leftIcon={<XCircle />} disabled={busy} onClick={askCancel}>
          {t('order.cancel')}
        </Button>
      )}
      {isBuyer && ['delivered', 'cancelled'].includes(order.status) && (
        <Button variant="outline" leftIcon={<RotateCcw />} onClick={reorder}>
          {t('order.reorder')}
        </Button>
      )}
      {(isBuyer || isSeller || role === 'admin') && (
        <Button variant="ghost" leftIcon={<Printer />} onClick={() => printInvoice(order, f.locale) || toast.error(t('errors.popupBlocked'))}>
          {t('order.invoice')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link to={backTo} className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> {t('common.back')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{order.number}</h1>
              <OrderStatusBadge status={order.status} />
              <PaymentStatusBadge status={order.paymentStatus} />
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {f.dateTime(order.createdAt)} · {t('order.itemsN', { n: order.items.length })}
            </p>
            {awaitingCard && <p className="mt-2 rounded-lg bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning">{t('order.awaitingPayment')}</p>}
          </div>
          {actions}
        </div>
      </div>

      <Card className="p-5">
        <OrderProgress order={order} />
      </Card>

      {(courierActive || liveTracking) && (
        <Card>
          <CardHeader title={courierActive ? t('tracking.navTitle') : t('tracking.liveTitle')} description={courierActive ? undefined : t('tracking.liveText')} />
          <div className="p-5">{courierActive ? <CourierNavigator order={order} gps={gps} /> : <TrackingPanel order={order} />}</div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t('order.items')} />
            <div className="px-5">
              <OrderItems order={order} linkProducts={!isCourier} />
            </div>
            <div className="border-t border-border px-5 py-4">
              <KeyValue label={t('checkout.goods')}>{f.money(order.subtotal)}</KeyValue>
              <KeyValue label={t('cart.delivery')}>{order.deliveryFee ? f.money(order.deliveryFee) : t('checkout.free')}</KeyValue>
              {isCourier && order.courierFee !== undefined && (
                <KeyValue label={t('courier.yourFee')}>
                  <span className="text-success">{f.money(order.courierFee)}</span>
                </KeyValue>
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3">
                <span className="font-semibold">{t('cart.total')}</span>
                <span className="text-xl font-extrabold">{f.money(order.total)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('order.delivery')} description={td(`order.deliveryType.${order.delivery.type}`)} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#ea580c]/12 text-[#ea580c]">
                  <Warehouse className="size-4.5" />
                </span>
                <div className="text-sm">
                  <div className="font-medium">{t('map.pickup')}</div>
                  <div className="text-fg-muted">{order.delivery.pickupPoint.text}</div>
                </div>
              </div>
              {order.delivery.address && (
                <div className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                    <MapPin className="size-4.5" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">{order.delivery.address.label ?? t('map.destination')}</div>
                    <AddressBlock address={order.delivery.address} showContact={!isBuyer} />
                    {order.delivery.distanceKm !== undefined && (
                      <div className="mt-0.5 text-xs text-fg-subtle">
                        {order.delivery.routeSource === 'osrm' ? '' : '≈ '}
                        {order.delivery.distanceKm} km{order.delivery.durationMin ? ` · ~${order.delivery.durationMin} ${t('map.minShort')}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5">
              {courierActive || liveTracking ? null : order.delivery.type === 'courier' ? (
                <TrackingPanel order={order} />
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-64 items-center justify-center rounded-xl bg-surface-2">
                      <Spinner />
                    </div>
                  }
                >
                  <RouteMap from={order.delivery.pickupPoint} className="h-64" />
                </Suspense>
              )}
            </div>
          </Card>

          {order.note && (
            <Card className="p-5">
              <div className="mb-1 text-sm font-semibold">{t('checkout.comment')}</div>
              <p className="text-sm text-fg-muted">{order.note}</p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {!isBuyer && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <UserIcon className="size-4 text-fg-subtle" /> {t('order.buyer')}
              </div>
              <div className="font-medium">{order.buyerName}</div>
              {order.buyerOrganization && <div className="text-sm text-fg-muted">{order.buyerOrganization}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`tel:${order.buyerPhone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm hover:bg-surface-2">
                  <Phone className="size-4" /> {order.buyerPhone}
                </a>
                {isSeller && (
                  <Button size="sm" variant="ghost" leftIcon={<MessageSquare />} loading={contact.isPending} onClick={() => contact.mutate({ recipientId: order.buyerId })}>
                    {t('order.message')}
                  </Button>
                )}
              </div>
            </Card>
          )}
          {!isSeller && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Store className="size-4 text-fg-subtle" /> {t('order.seller')}
              </div>
              <Link to={`/suppliers/${order.companyId}`} className="font-medium hover:text-primary">
                {order.companyName}
              </Link>
              {isBuyer && (
                <Button size="sm" variant="outline" className="mt-3 w-full" leftIcon={<MessageSquare />} loading={contact.isPending} onClick={() => contact.mutate({ companyId: order.companyId })}>
                  {t('order.messageSeller')}
                </Button>
              )}
            </Card>
          )}
          {order.delivery.type === 'courier' && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Truck className="size-4 text-fg-subtle" /> {t('order.courier')}
              </div>
              {order.courierName ? (
                <>
                  <div className="font-medium">{order.courierName}</div>
                  {order.courierPhone && (
                    <a href={`tel:${order.courierPhone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <Phone className="size-4" /> {order.courierPhone}
                    </a>
                  )}
                </>
              ) : (
                <p className="text-sm text-fg-muted">{t('order.courierNotAssigned')}</p>
              )}
            </Card>
          )}
          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold">{t('order.payment.title')}</div>
            <KeyValue label={t('order.payment.method')}>{td(`checkout.payment.${order.paymentMethod}`)}</KeyValue>
            <KeyValue label={t('order.payment.status')}>
              <PaymentStatusBadge status={order.paymentStatus} />
            </KeyValue>
          </Card>
          <Card className="p-5">
            <div className="mb-4 text-sm font-semibold">{t('order.history')}</div>
            <OrderTimeline order={order} />
          </Card>
        </div>
      </div>
    </div>
  );
}
