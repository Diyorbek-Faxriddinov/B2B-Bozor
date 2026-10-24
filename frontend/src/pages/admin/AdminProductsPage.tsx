import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, EyeOff, Package, Search, X } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { unitPriceFor } from '@/lib/pricing';
import type { ProductStatus } from '@/types';
import { ProductImage, VerifiedBadge } from '@/components/catalog';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';

const TONE: Record<ProductStatus, 'success' | 'neutral' | 'warning' | 'danger'> = { active: 'success', inactive: 'neutral', pending: 'warning', rejected: 'danger' };

export default function AdminProductsPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = { status: status === 'all' ? undefined : status, q: search || undefined, page };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.admin('products', query), queryFn: () => adminApi.products(query), placeholderData: keepPreviousData });
  const update = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: ProductStatus; reason?: string }) => adminApi.updateProduct(id, { status, reason }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(td(`product.status.${p.status}`));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title={t('admin.nav.products')} description={t('admin.products.subtitle')} />
      <form
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
          setPage(1);
        }}
      >
        <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('seller.products.search')} />
      </form>
      <Tabs
        className="mb-4"
        value={status}
        onChange={(v) => {
          setParams(v === 'all' ? {} : { status: v });
          setPage(1);
        }}
        items={['all', 'pending', 'active', 'inactive', 'rejected'].map((s) => ({ value: s, label: s === 'all' ? t('orders.tabs.all') : td(`product.status.${s}`) }))}
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-96" />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<Package />} title={t('catalog.emptyTitle')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>{t('seller.products.col.product')}</TH>
                <TH>{t('order.seller')}</TH>
                <TH className="text-right">{t('seller.products.col.price')}</TH>
                <TH>{t('orders.col.status')}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {data.items.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="flex min-w-64 items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg">
                        <ProductImage product={p} iconClassName="size-5" />
                      </div>
                      <div className="min-w-0">
                        <Link to={`/products/${p.id}`} target="_blank" className="line-clamp-1 font-medium hover:text-primary">
                          {p.name}
                        </Link>
                        <div className="text-xs text-fg-subtle">{f.date(p.createdAt)}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <span className="max-w-44 truncate">{p.company.name}</span>
                      {p.company.verified && <VerifiedBadge />}
                    </div>
                  </TD>
                  <TD className="text-right font-semibold whitespace-nowrap">{f.money(unitPriceFor(p, p.moq))}</TD>
                  <TD>
                    <Badge tone={TONE[p.status]} dot>
                      {td(`product.status.${p.status}`)}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {p.status !== 'active' && (
                        <Button size="sm" variant="ghost" className="text-success" leftIcon={<Check />} onClick={() => update.mutate({ id: p.id, status: 'active' })}>
                          {t('admin.products.approve')}
                        </Button>
                      )}
                      {p.status === 'active' && (
                        <Button size="sm" variant="ghost" leftIcon={<EyeOff />} onClick={() => update.mutate({ id: p.id, status: 'inactive' })}>
                          {t('seller.products.hide')}
                        </Button>
                      )}
                      {p.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          leftIcon={<X />}
                          onClick={async () => {
                            const res = await confirm({ title: t('admin.products.rejectConfirm'), danger: true, withReason: true, reasonPlaceholder: t('admin.products.reason'), confirmText: t('admin.products.reject') });
                            if (res) update.mutate({ id: p.id, status: 'rejected', reason: res.reason || undefined });
                          }}
                        >
                          {t('admin.products.reject')}
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="border-t border-border p-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        </Card>
      )}
    </div>
  );
}
