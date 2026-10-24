import { Link } from 'react-router';
import { ArrowDown, Clock, MapPin, Navigation, Package, Warehouse } from 'lucide-react';
import type { Order } from '@/types';
import { useFormat, useT } from '@/i18n';
import { Card } from './ui/display';
import { OrderStatusBadge } from './orders';
import type { ReactNode } from 'react';
import { useAddressDetails } from './address';

export function DeliveryCard({ order, action, to, fromYouKm }: { order: Order; action?: ReactNode; to: string; fromYouKm?: number }) {
  const t = useT();
  const f = useFormat();
  const details = useAddressDetails();
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={to} className="font-semibold hover:text-primary">
            {order.number}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
            <Clock className="size-3" /> {f.relative(order.updatedAt)}
            <span>·</span>
            <Package className="size-3" /> {t('order.itemsN', { n: order.items.length })}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-extrabold whitespace-nowrap text-success">{f.money(order.courierFee ?? Math.round((order.deliveryFee || 30000) * 0.8))}</div>
          <div className="text-xs text-fg-subtle">
            {order.delivery.distanceKm ?? '—'} km{order.delivery.durationMin ? ` · ~${order.delivery.durationMin} ${t('map.minShort')}` : ''}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm">
        <div className="flex gap-2.5">
          <Warehouse className="mt-0.5 size-4 shrink-0 text-[#ea580c]" />
          <div className="min-w-0">
            <div className="truncate font-medium">{order.companyName}</div>
            <div className="line-clamp-1 text-xs text-fg-muted">{order.delivery.pickupPoint.text}</div>
            {fromYouKm !== undefined && (
              <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Navigation className="size-3" /> {t('tracking.fromYou', { km: fromYouKm })}
              </div>
            )}
          </div>
        </div>
        <ArrowDown className="ml-0.5 size-3 text-fg-subtle" />
        <div className="flex gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="min-w-0">
            <div className="truncate font-medium">{order.buyerOrganization ?? order.buyerName}</div>
            <div className="line-clamp-1 text-xs text-fg-muted">{order.delivery.address?.text}</div>
            {order.delivery.address && details(order.delivery.address) && <div className="text-xs text-fg">{details(order.delivery.address)}</div>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <OrderStatusBadge status={order.status} />
        <div className="ml-auto flex gap-2">{action}</div>
      </div>
    </Card>
  );
}
