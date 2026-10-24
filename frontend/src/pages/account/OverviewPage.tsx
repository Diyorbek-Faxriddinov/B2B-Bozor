import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, FileText, Heart, Search, Wallet } from 'lucide-react';
import { ordersApi, rfqApi } from '@/api/endpoints';
import { qk, useFavoriteIds, useProducts } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT } from '@/i18n';
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { OrderStatusBadge } from '@/components/orders';
import { ProductCard } from '@/components/catalog';

export default function OverviewPage() {
  const t = useT();
  const f = useFormat();
  const user = useAuth((s) => s.user)!;
  const { data: orders } = useQuery({ queryKey: qk.orders({ pageSize: 100 }), queryFn: () => ordersApi.list({ pageSize: 100 }) });
  const { data: rfqs } = useQuery({ queryKey: qk.rfqs({ status: 'answered' }), queryFn: () => rfqApi.list({ status: 'answered' }) });
  const { data: favIds } = useFavoriteIds();
  const { data: recommended } = useProducts({ sort: 'rating', pageSize: 4 });

  const list = orders?.items ?? [];
  const active = list.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const spent = list.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('account.greet.morning') : hour < 18 ? t('account.greet.day') : t('account.greet.evening');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greet}, ${user.fullName.split(' ')[0]}!`}
        description={t('account.overviewText')}
        actions={
          <ButtonLink to="/catalog" leftIcon={<Search />}>
            {t('account.findProducts')}
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('account.stats.active')} countTo={active.length} icon={<ClipboardList />} />
        <StatCard label={t('account.stats.spent')} countTo={spent} format={(n) => f.money(n, { compact: true })} icon={<Wallet />} tone="success" />
        <StatCard label={t('account.stats.offers')} countTo={rfqs?.total ?? 0} icon={<FileText />} tone="info" hint={t('account.stats.offersHint')} />
        <StatCard label={t('account.nav.favorites')} countTo={favIds?.length ?? 0} icon={<Heart />} tone="danger" />
      </div>

      <Card>
        <CardHeader
          title={t('account.recentOrders')}
          action={
            <Link to="/account/orders" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              {t('common.viewAll')} <ArrowRight className="size-4" />
            </Link>
          }
        />
        {!list.length ? (
          <EmptyState icon={<ClipboardList />} title={t('orders.empty')} description={t('orders.emptyBuyer')} action={<ButtonLink to="/catalog">{t('cart.goShopping')}</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-border">
            {list.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link to={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-surface-2/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{o.number}</div>
                    <div className="truncate text-sm text-fg-muted">
                      {o.companyName} · {f.date(o.createdAt)}
                    </div>
                  </div>
                  <OrderStatusBadge status={o.status} />
                  <div className="w-32 text-right font-semibold">{f.money(o.total)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!!recommended?.items.length && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">{t('account.recommended')}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {recommended.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
