import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Download, Search } from 'lucide-react';
import { ordersApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { downloadFile, toCsv } from '@/lib/utils';
import type { OrderStatus } from '@/types';
import { Card, EmptyState, ErrorState, Pagination, Skeleton, Tabs } from './ui/display';
import { Button, ButtonLink } from './ui/button';
import { Input } from './ui/form';
import { Table, TD, TH, THead, TR } from './ui/table';
import { OrderStatusBadge, PaymentStatusBadge } from './orders';
import { ProductImage } from './catalog';

type Variant = 'buyer' | 'seller' | 'courier' | 'admin';
type TabValue = 'all' | 'active' | OrderStatus;

export function OrdersList({ basePath, variant }: { basePath: string; variant: Variant }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const tab = (params.get('status') as TabValue) || 'all';
  const page = Number(params.get('page')) || 1;
  const query = { status: tab === 'all' ? undefined : tab, q: params.get('q') ?? undefined, page, pageSize: 10 };
  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: qk.orders(query),
    queryFn: () => ordersApi.list(query),
    placeholderData: keepPreviousData,
    refetchInterval: variant === 'seller' || variant === 'courier' ? 30_000 : false,
  });

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const tabs: TabValue[] = variant === 'courier' ? ['all', 'active', 'delivered'] : ['all', 'active', 'pending', 'confirmed', 'ready', 'in_transit', 'delivered', 'cancelled'];

  const exportCsv = async () => {
    const all = await ordersApi.list({ ...query, page: 1, pageSize: 100 });
    const rows = [
      ['Number', 'Date', 'Buyer', 'Organization', 'Seller', 'Items', 'Subtotal', 'Delivery', 'Total', 'Status', 'Payment'],
      ...all.items.map((o) => [o.number, o.createdAt, o.buyerName, o.buyerOrganization ?? '', o.companyName, o.items.length, o.subtotal, o.deliveryFee, o.total, o.status, o.paymentStatus]),
    ];
    downloadFile(`orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() || undefined });
          }}
        >
          <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders.search')} />
        </form>
        {(variant === 'seller' || variant === 'admin') && (
          <Button variant="outline" leftIcon={<Download />} onClick={exportCsv}>
            {t('common.exportCsv')}
          </Button>
        )}
      </div>
      <Tabs className="mb-4" value={tab} onChange={(v) => set({ status: v === 'all' ? undefined : v })} items={tabs.map((v) => ({ value: v, label: v === 'all' ? t('orders.tabs.all') : v === 'active' ? t('orders.tabs.active') : td(`order.status.${v}`) }))} />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={<ClipboardList />}
            title={t('orders.empty')}
            description={variant === 'buyer' ? t('orders.emptyBuyer') : undefined}
            action={variant === 'buyer' ? <ButtonLink to="/catalog">{t('cart.goShopping')}</ButtonLink> : undefined}
          />
        </Card>
      ) : (
        <div className={isPlaceholderData ? 'opacity-60' : ''}>
          {/* desktop */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>{t('orders.col.number')}</TH>
                  <TH>{t('orders.col.date')}</TH>
                  <TH>{variant === 'buyer' ? t('order.seller') : t('order.buyer')}</TH>
                  {variant === 'admin' && <TH>{t('order.seller')}</TH>}
                  <TH>{t('orders.col.items')}</TH>
                  <TH className="text-right">{variant === 'courier' ? t('courier.yourFee') : t('cart.total')}</TH>
                  <TH>{t('orders.col.status')}</TH>
                  {variant !== 'courier' && <TH>{t('orders.col.payment')}</TH>}
                  <TH />
                </tr>
              </THead>
              <tbody>
                {data.items.map((o) => (
                  <TR key={o.id} className="cursor-pointer" onClick={() => navigate(`${basePath}/${o.id}`)}>
                    <TD className="font-semibold">{o.number}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{f.date(o.createdAt)}</TD>
                    <TD>
                      <div className="max-w-48 truncate font-medium">{variant === 'buyer' ? o.companyName : o.buyerName}</div>
                      {variant !== 'buyer' && o.buyerOrganization && <div className="max-w-48 truncate text-xs text-fg-subtle">{o.buyerOrganization}</div>}
                    </TD>
                    {variant === 'admin' && (
                      <TD>
                        <div className="max-w-40 truncate">{o.companyName}</div>
                      </TD>
                    )}
                    <TD>
                      <div className="flex -space-x-2">
                        {o.items.slice(0, 3).map((it) => (
                          <div key={it.productId} className="size-8 overflow-hidden rounded-md ring-2 ring-surface">
                            <ProductImage product={{ name: it.name, categorySlug: it.categorySlug, images: it.image ? [it.image] : [] }} iconClassName="size-4" />
                          </div>
                        ))}
                        {o.items.length > 3 && <span className="flex size-8 items-center justify-center rounded-md bg-surface-2 text-xs ring-2 ring-surface">+{o.items.length - 3}</span>}
                      </div>
                    </TD>
                    <TD className="text-right font-semibold whitespace-nowrap">{f.money(variant === 'courier' ? (o.courierFee ?? 0) : o.total)}</TD>
                    <TD>
                      <OrderStatusBadge status={o.status} />
                    </TD>
                    {variant !== 'courier' && (
                      <TD>
                        <PaymentStatusBadge status={o.paymentStatus} />
                      </TD>
                    )}
                    <TD>
                      <ChevronRight className="size-4 text-fg-subtle" />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
          {/* mobile */}
          <div className="space-y-3 md:hidden">
            {data.items.map((o) => (
              <Link key={o.id} to={`${basePath}/${o.id}`} className="card block p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{o.number}</span>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="mt-1 text-sm text-fg-muted">{variant === 'buyer' ? o.companyName : o.buyerName}</div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-fg-subtle">
                    {f.date(o.createdAt)} · {t('order.itemsN', { n: o.items.length })}
                  </span>
                  <span className="font-bold">{f.money(variant === 'courier' ? (o.courierFee ?? 0) : o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Pagination className="mt-6" page={data.page} totalPages={data.totalPages} onChange={(p) => set({ page: String(p) })} />
        </div>
      )}
    </div>
  );
}
