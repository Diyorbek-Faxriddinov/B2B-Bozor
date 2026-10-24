import { Check, Clock, PackageCheck, Truck, X, type LucideIcon, CheckCircle2, Boxes } from 'lucide-react';
import type { Order, OrderStatus, PaymentStatus, RfqStatus } from '@/types';
import { ORDER_FLOW, ORDER_STATUS_TONE, RFQ_STATUS_TONE } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useFormat, useTd } from '@/i18n';
import { Badge } from './ui/display';
import { ProductImage } from './catalog';
import { Link } from 'react-router';

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  pending: Clock,
  confirmed: CheckCircle2,
  ready: Boxes,
  in_transit: Truck,
  delivered: PackageCheck,
  cancelled: X,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const td = useTd();
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={ORDER_STATUS_TONE[status]} icon={<Icon />}>
      {td(`order.status.${status}`)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const td = useTd();
  const tone = status === 'paid' ? 'success' : status === 'refunded' ? 'neutral' : 'warning';
  return (
    <Badge tone={tone} dot>
      {td(`order.payment.${status}`)}
    </Badge>
  );
}

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  const td = useTd();
  return (
    <Badge tone={RFQ_STATUS_TONE[status]} dot>
      {td(`rfq.status.${status}`)}
    </Badge>
  );
}

/** Horizontal progress stepper for an order. */
export function OrderProgress({ order }: { order: Order }) {
  const td = useTd();
  const flow = order.delivery.type === 'pickup' ? ORDER_FLOW.filter((s) => s !== 'in_transit') : ORDER_FLOW;
  if (order.status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
        <X className="size-5 shrink-0" />
        <div>
          <div className="font-semibold">{td('order.status.cancelled')}</div>
          {order.cancelReason && <div className="text-danger/80">{order.cancelReason}</div>}
        </div>
      </div>
    );
  }
  const current = flow.indexOf(order.status);
  return (
    <ol className="flex items-start">
      {flow.map((s, i) => {
        const done = i <= current;
        const Icon = STATUS_ICON[s];
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cn('absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2', i <= current ? 'bg-primary' : 'bg-surface-3')} />}
            <span
              className={cn(
                'relative z-10 flex size-8 items-center justify-center rounded-full border-2 transition-colors',
                done ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface text-fg-subtle',
                i === current && 'ring-4 ring-primary/15',
              )}
            >
              {done && i < current ? <Check className="size-4" /> : <Icon className="size-4" />}
            </span>
            <span className={cn('mt-2 px-1 text-[11px] leading-tight font-medium sm:text-xs', done ? 'text-fg' : 'text-fg-subtle')}>{td(`order.status.${s}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  const f = useFormat();
  const td = useTd();
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {[...order.timeline].reverse().map((e, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute top-1 -left-[26px] size-3 rounded-full ring-4 ring-surface', i === 0 ? 'bg-primary' : 'bg-border-strong')} />
          <div className="text-sm font-medium text-fg">{e.note && e.status === 'ready' && i === 0 ? e.note : td(`order.status.${e.status}`)}</div>
          <div className="text-xs text-fg-subtle">
            {f.dateTime(e.at)}
            {e.by && ` · ${e.by}`}
          </div>
          {e.note && !(e.status === 'ready' && i === 0) && <div className="mt-0.5 text-xs text-fg-muted">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}

export function OrderItems({ order, linkProducts = true }: { order: Order; linkProducts?: boolean }) {
  const f = useFormat();
  const td = useTd();
  return (
    <ul className="divide-y divide-border">
      {order.items.map((it) => {
        const content = (
          <>
            <div className="size-14 shrink-0 overflow-hidden rounded-lg">
              <ProductImage product={{ name: it.name, categorySlug: it.categorySlug, images: it.image ? [it.image] : [] }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-medium text-fg">{it.name}</div>
              <div className="mt-0.5 text-xs text-fg-muted">
                {f.number(it.quantity)} {td(`units.${it.unit}`)} × {f.money(it.unitPrice)}
              </div>
            </div>
            <div className="text-right text-sm font-semibold whitespace-nowrap text-fg">{f.money(it.total)}</div>
          </>
        );
        return (
          <li key={it.productId}>
            {linkProducts ? (
              <Link to={`/products/${it.productId}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
