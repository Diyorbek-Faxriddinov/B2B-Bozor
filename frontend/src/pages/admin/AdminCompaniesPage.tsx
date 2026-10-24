import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Building2, ExternalLink, Search, ShieldOff } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { CategoryIcon } from '@/components/catalog';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Rating, Skeleton, Tabs } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';

export default function AdminCompaniesPage() {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const verified = (params.get('verified') as 'true' | 'false' | null) ?? 'all';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = { verified: verified === 'all' ? undefined : verified, q: search || undefined, page };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.admin('companies', query), queryFn: () => adminApi.companies(query), placeholderData: keepPreviousData });
  const update = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => adminApi.updateCompany(id, { verified }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
      toast.success(c.verified ? t('admin.companies.verified') : t('admin.companies.unverified'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title={t('admin.nav.companies')} description={data ? t('admin.companiesTotal', { n: data.total }) : undefined} />
      <form
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
          setPage(1);
        }}
      >
        <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.companies.search')} />
      </form>
      <Tabs
        className="mb-4"
        value={verified}
        onChange={(v) => {
          setParams(v === 'all' ? {} : { verified: v });
          setPage(1);
        }}
        items={[
          { value: 'all', label: t('orders.tabs.all') },
          { value: 'false', label: t('admin.companies.pending') },
          { value: 'true', label: t('company.verified') },
        ]}
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-96" />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<Building2 />} title={t('suppliers.empty')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>{t('admin.companies.col.company')}</TH>
                <TH>{t('company.tin')}</TH>
                <TH>{t('auth.region')}</TH>
                <TH className="text-right">{t('company.products')}</TH>
                <TH>{t('company.rating')}</TH>
                <TH>{t('orders.col.status')}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {data.items.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <div className="flex min-w-56 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-fg-muted">
                        {c.logo ? <img src={c.logo} alt="" className="size-full object-cover" /> : <CategoryIcon slug={c.mainCategories[0] ?? 'food'} className="size-5" />}
                      </span>
                      <div className="min-w-0">
                        <Link to={`/suppliers/${c.id}`} target="_blank" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                          <span className="truncate">{c.name}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </Link>
                        <div className="text-xs text-fg-subtle">{f.date(c.createdAt)}</div>
                      </div>
                    </div>
                  </TD>
                  <TD className="tabular text-fg-muted">{c.tin}</TD>
                  <TD className="whitespace-nowrap text-fg-muted">{c.region}</TD>
                  <TD className="text-right">{c.productsCount}</TD>
                  <TD>
                    <Rating value={c.rating} size={12} showValue />
                  </TD>
                  <TD>
                    {c.verified ? (
                      <Badge tone="primary" icon={<BadgeCheck />}>
                        {t('company.verified')}
                      </Badge>
                    ) : (
                      <Badge tone="warning">{t('admin.companies.pending')}</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {c.verified ? (
                      <Button size="sm" variant="ghost" leftIcon={<ShieldOff />} onClick={() => update.mutate({ id: c.id, verified: false })}>
                        {t('admin.companies.revoke')}
                      </Button>
                    ) : (
                      <Button size="sm" leftIcon={<BadgeCheck />} loading={update.isPending && update.variables?.id === c.id} onClick={() => update.mutate({ id: c.id, verified: true })}>
                        {t('admin.companies.verify')}
                      </Button>
                    )}
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
