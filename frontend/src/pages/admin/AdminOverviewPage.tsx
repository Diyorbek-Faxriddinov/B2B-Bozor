import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ClipboardList, Package, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { qk, useCategories } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { BarList, TrendChart } from '@/components/charts';
import { CATEGORY_COLORS, CategoryIcon } from '@/components/catalog';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/display';
import type { Role } from '@/types';

const ROLE_COLOR: Record<Role, string> = { buyer: 'var(--chart-1)', seller: 'var(--chart-2)', courier: 'var(--chart-3)', admin: 'var(--chart-4)' };

export default function AdminOverviewPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const { data: categories } = useCategories();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.admin('dashboard'), queryFn: adminApi.dashboard });

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.overview')} description={t('admin.overviewText')} />
      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('admin.stats.gmv')} countTo={data.gmv} format={(n) => f.money(n, { compact: true })} icon={<TrendingUp />} tone="success" />
            <StatCard label={t('admin.stats.orders')} countTo={data.orders} format={(n) => f.number(n)} icon={<ClipboardList />} />
            <StatCard label={t('admin.stats.users')} countTo={data.users} format={(n) => f.number(n)} icon={<Users />} tone="info" />
            <StatCard label={t('admin.stats.products')} countTo={data.products} format={(n) => f.number(n)} icon={<Package />} tone="accent" />
          </div>

          {(data.pendingCompanies > 0 || data.pendingProducts > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.pendingCompanies > 0 && (
                <Link to="/admin/companies?verified=false" className="card flex items-center gap-3 p-4 hover:border-warning/50">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <Building2 className="size-5" />
                  </span>
                  <div className="flex-1 font-semibold">{t('admin.pendingCompanies', { n: data.pendingCompanies })}</div>
                  <ArrowRight className="size-4 text-fg-subtle" />
                </Link>
              )}
              {data.pendingProducts > 0 && (
                <Link to="/admin/products?status=pending" className="card flex items-center gap-3 p-4 hover:border-warning/50">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <ShieldAlert className="size-5" />
                  </span>
                  <div className="flex-1 font-semibold">{t('admin.pendingProducts', { n: data.pendingProducts })}</div>
                  <ArrowRight className="size-4 text-fg-subtle" />
                </Link>
              )}
            </div>
          )}

          <Card>
            <CardHeader title={t('admin.gmvChart')} description={t('seller.range.30')} />
            <div className="p-4">
              <TrendChart data={data.gmvSeries} format={(v) => f.money(v)} name={t('admin.stats.gmv')} countLabel={t('admin.stats.orders')} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('admin.categoryShare')} />
              <div className="p-5">
                <BarList
                  format={(v) => f.money(v, { compact: true })}
                  items={data.categoryShare.slice(0, 8).map((c) => ({
                    key: c.slug,
                    label: f.text(categories?.find((x) => x.slug === c.slug)?.name ?? { uz: c.slug, ru: c.slug, en: c.slug }),
                    value: c.revenue,
                    icon: <CategoryIcon slug={c.slug} className="size-4 shrink-0 text-fg-subtle" />,
                    color: CATEGORY_COLORS[c.slug],
                  }))}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('admin.usersByRole')} description={t('admin.companiesTotal', { n: data.companies })} />
              <div className="p-5">
                <BarList items={(Object.keys(data.usersByRole) as Role[]).map((r) => ({ key: r, label: td(`roles.${r}`), value: data.usersByRole[r], color: ROLE_COLOR[r] }))} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
