import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BadgeCheck, ClipboardList, FileText, Package, Plus, ShieldAlert, Star, Wallet } from 'lucide-react';
import { sellerApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { ORDER_STATUS_TONE } from '@/lib/constants';
import { BarList, TrendChart } from '@/components/charts';
import { CategoryIcon } from '@/components/catalog';
import { OrderStatusBadge } from '@/components/orders';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Tabs } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';

const TONE_COLOR: Record<string, string> = {
  warning: 'var(--warning)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  primary: 'var(--primary)',
  success: 'var(--success)',
  danger: 'var(--danger)',
};

export default function SellerOverviewPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.seller('dashboard', range), queryFn: () => sellerApi.dashboard(Number(range)) });
  const { data: company } = useQuery({ queryKey: qk.seller('company'), queryFn: sellerApi.company });

  return (
    <div className="space-y-6">
      <PageHeader
        title={company ? t('seller.welcome', { company: company.name }) : t('seller.nav.overview')}
        description={t('seller.overviewText')}
        actions={
          <>
            <Tabs
              variant="pill"
              value={range}
              onChange={setRange}
              items={[
                { value: '7', label: t('seller.range.7') },
                { value: '30', label: t('seller.range.30') },
                { value: '90', label: t('seller.range.90') },
              ]}
            />
            <ButtonLink to="/seller/products/new" leftIcon={<Plus />}>
              {t('seller.addProduct')}
            </ButtonLink>
          </>
        }
      />

      {company && !company.verified && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <div className="font-semibold text-fg">{t('seller.unverifiedTitle')}</div>
            <div className="text-fg-muted">{t('seller.unverifiedText')}</div>
          </div>
        </div>
      )}

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
            <StatCard label={t('seller.stats.revenue')} countTo={data.revenue} format={(n) => f.money(n, { compact: true })} icon={<Wallet />} change={data.revenueChange} hint={t('seller.vsPrev')} />
            <StatCard label={t('seller.stats.orders')} countTo={data.orders} icon={<ClipboardList />} tone="info" change={data.ordersChange} hint={t('seller.vsPrev')} />
            <StatCard label={t('seller.stats.avgOrder')} countTo={data.avgOrder} format={(n) => f.money(n, { compact: true })} icon={<Package />} tone="accent" />
            <StatCard label={t('seller.stats.rating')} countTo={data.rating} format={(n) => n.toFixed(1)} icon={<Star />} tone="warning" hint={company?.verified ? t('company.verified') : undefined} />
          </div>

          {(data.lowStock > 0 || data.openRfqs > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.lowStock > 0 && (
                <Link to="/seller/products?status=low_stock" className="card flex items-center gap-3 p-4 hover:border-warning/50">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <AlertTriangle className="size-5" />
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold">{t('seller.lowStock', { n: data.lowStock })}</div>
                    <div className="text-sm text-fg-muted">{t('seller.lowStockText')}</div>
                  </div>
                  <ArrowRight className="size-4 text-fg-subtle" />
                </Link>
              )}
              {data.openRfqs > 0 && (
                <Link to="/seller/rfqs" className="card flex items-center gap-3 p-4 hover:border-info/50">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-info-soft text-info">
                    <FileText className="size-5" />
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold">{t('seller.openRfqs', { n: data.openRfqs })}</div>
                    <div className="text-sm text-fg-muted">{t('seller.openRfqsText')}</div>
                  </div>
                  <ArrowRight className="size-4 text-fg-subtle" />
                </Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader title={t('seller.revenueChart')} description={t('seller.revenueChartText', { total: f.money(data.revenue) })} />
              <div className="p-4">
                <TrendChart data={data.revenueSeries} format={(v) => f.money(v)} name={t('seller.stats.revenue')} countLabel={t('seller.stats.orders')} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('seller.statusBreakdown')} />
              <div className="p-5">
                {data.statusBreakdown.every((s) => !s.count) ? (
                  <p className="text-sm text-fg-muted">{t('seller.noData')}</p>
                ) : (
                  <BarList
                    items={data.statusBreakdown
                      .filter((s) => s.count > 0)
                      .map((s) => ({ key: s.status, label: td(`order.status.${s.status}`), value: s.count, color: TONE_COLOR[ORDER_STATUS_TONE[s.status]] }))}
                  />
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
            <Card>
              <CardHeader title={t('seller.topProducts')} />
              <div className="p-5">
                {!data.topProducts.length ? (
                  <p className="text-sm text-fg-muted">{t('seller.noData')}</p>
                ) : (
                  <BarList
                    format={(v) => f.money(v, { compact: true })}
                    items={data.topProducts.map((p) => ({ key: p.id, label: p.name, value: p.revenue, icon: <CategoryIcon slug={p.categorySlug} className="size-4 shrink-0 text-fg-subtle" /> }))}
                  />
                )}
              </div>
            </Card>
            <Card className="overflow-hidden">
              <CardHeader
                title={t('seller.recentOrders')}
                action={
                  <Link to="/seller/orders" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    {t('common.viewAll')} <ArrowRight className="size-4" />
                  </Link>
                }
              />
              {!data.recentOrders.length ? (
                <EmptyState icon={<ClipboardList />} title={t('orders.empty')} />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH>{t('orders.col.number')}</TH>
                      <TH>{t('order.buyer')}</TH>
                      <TH className="text-right">{t('cart.total')}</TH>
                      <TH>{t('orders.col.status')}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <TR key={o.id}>
                        <TD>
                          <Link to={`/seller/orders/${o.id}`} className="font-semibold hover:text-primary">
                            {o.number}
                          </Link>
                          <div className="text-xs text-fg-subtle">{f.relative(o.createdAt)}</div>
                        </TD>
                        <TD>
                          <div className="max-w-44 truncate">{o.buyerName}</div>
                          <div className="max-w-44 truncate text-xs text-fg-subtle">{o.buyerOrganization}</div>
                        </TD>
                        <TD className="text-right font-semibold whitespace-nowrap">{f.money(o.total)}</TD>
                        <TD>
                          <OrderStatusBadge status={o.status} />
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
          {company?.verified && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
              <BadgeCheck className="size-3.5 text-primary" /> {t('seller.verifiedNote')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
