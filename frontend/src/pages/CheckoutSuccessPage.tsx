import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardList, CreditCard, Loader2, ShoppingBag } from 'lucide-react';
import { Confetti, SuccessCheck } from '@/components/motion';
import type { Order } from '@/types';
import { goToPayment, paymentsApi } from '@/api/endpoints';
import { useFormat, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { Card, PageLoader } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/orders';

/** After checkout: either router state (cash / transfer) or `?payment=` when returning from Payme / Click. */
export default function CheckoutSuccessPage() {
  const [params] = useSearchParams();
  const paymentId = params.get('payment');
  const stateOrders = (useLocation().state as { orders?: Order[] } | null)?.orders;
  if (paymentId) return <PaymentResult id={paymentId} />;
  if (!stateOrders?.length) return <Navigate to="/account/orders" replace />;
  return <Summary orders={stateOrders} />;
}

function PaymentResult({ id }: { id: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [startedAt] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ['payment', id],
    queryFn: () => paymentsApi.get(id),
    // the provider confirms server-to-server; poll briefly while it is in flight
    refetchInterval: (query) => (query.state.data && ['created', 'pending'].includes(query.state.data.status) && query.state.dataUpdateCount < 20 ? 2500 : false),
  });
  const retry = useMutation({
    mutationFn: () =>
      paymentsApi.create(
        q.data!.orders.map((o) => o.id),
        q.data!.provider,
      ),
    onSuccess: (p) => goToPayment(p.url, navigate),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <PageLoader />;
  if (!q.data) return <Navigate to="/account/orders" replace />;
  const p = q.data;
  if (p.status === 'paid') return <Summary orders={p.orders} paid />;

  // 'created' = the provider hasn't called us yet; give it ~50 s before showing the retry screen
  const pending = p.status === 'pending' || (p.status === 'created' && q.dataUpdatedAt - startedAt < 50_000);
  const payable = p.orders.some((o) => o.paymentStatus === 'unpaid' && o.status !== 'cancelled');
  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="p-6 text-center sm:p-10">
        <span className={`mx-auto flex size-20 items-center justify-center rounded-full ${pending ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning'}`}>
          {pending ? <Loader2 className="size-10 animate-spin" /> : <AlertTriangle className="size-10" />}
        </span>
        <h1 className="mt-5 text-2xl font-bold">{pending ? t('checkout.paymentPendingTitle') : t('checkout.paymentFailedTitle')}</h1>
        <p className="mt-2 text-fg-muted">{pending ? t('checkout.paymentPendingText') : t('checkout.paymentFailedText')}</p>
        <OrderList orders={p.orders} />
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {!pending && payable && (
            <Button leftIcon={<CreditCard />} loading={retry.isPending} onClick={() => retry.mutate()}>
              {t('checkout.retryPayment')}
            </Button>
          )}
          <ButtonLink to="/account/orders" variant="outline" leftIcon={<ClipboardList />}>
            {t('checkout.toOrders')}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

function OrderList({ orders }: { orders: Order[] }) {
  const f = useFormat();
  return (
    <ul className="mt-6 divide-y divide-border rounded-xl border border-border text-left">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-semibold">{o.number}</div>
            <div className="text-xs text-fg-muted">{o.companyName}</div>
          </div>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={o.status} />
            <PaymentStatusBadge status={o.paymentStatus} />
          </div>
          <div className="w-full text-right font-bold sm:w-auto">{f.money(o.total)}</div>
        </li>
      ))}
    </ul>
  );
}

function Summary({ orders, paid }: { orders: Order[]; paid?: boolean }) {
  const t = useT();
  const f = useFormat();
  const total = orders.reduce((s, o) => s + o.total, 0);
  return (
    <div className="container-page max-w-2xl py-12">
      <Card className="relative overflow-visible p-6 text-center sm:p-10">
        <Confetti />
        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
          <SuccessCheck className="size-12" />
        </span>
        <h1 className="mt-5 text-2xl font-bold">{paid ? t('checkout.paidTitle') : t('checkout.successTitle')}</h1>
        <p className="mt-2 text-fg-muted">{t('checkout.successText')}</p>
        <OrderList orders={orders} />
        <div className="mt-4 flex justify-between px-1 text-sm">
          <span className="text-fg-muted">{t('cart.total')}</span>
          <span className="font-bold">{f.money(total)}</span>
        </div>
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <ButtonLink to="/account/orders" leftIcon={<ClipboardList />}>
            {t('checkout.toOrders')}
          </ButtonLink>
          <ButtonLink to="/catalog" variant="outline" leftIcon={<ShoppingBag />}>
            {t('checkout.continue')}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
