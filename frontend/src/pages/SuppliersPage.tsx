import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Search, Users } from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk, useCategories } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { REGIONS } from '@/lib/constants';
import { CATEGORY_COLORS, CategoryIcon, VerifiedBadge } from '@/components/catalog';
import { Spotlight, Stagger, StaggerItem } from '@/components/motion';
import { Badge, Breadcrumbs, EmptyState, ErrorState, Pagination, Rating, Skeleton } from '@/components/ui/display';
import { Checkbox, Input, Select } from '@/components/ui/form';

export default function SuppliersPage() {
  const t = useT();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data: categories } = useCategories();
  const query = {
    q: params.get('q') ?? undefined,
    region: params.get('region') ?? undefined,
    category: params.get('category') ?? undefined,
    verified: params.get('verified') === 'true' || undefined,
    page: Number(params.get('page')) || 1,
    pageSize: 12,
  };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.companies(query), queryFn: () => catalogApi.companies(query), placeholderData: keepPreviousData });

  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.suppliers') }]} />
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('suppliers.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('suppliers.subtitle')}</p>
      </div>

      <div className="card mb-6 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px_auto]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set('q', q.trim() || undefined);
          }}
        >
          <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('suppliers.search')} />
        </form>
        <Select value={query.category ?? ''} onChange={(e) => set('category', e.target.value || undefined)}>
          <option value="">{t('catalog.allCategories')}</option>
          {categories?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {f.text(c.name)}
            </option>
          ))}
        </Select>
        <Select value={query.region ?? ''} onChange={(e) => set('region', e.target.value || undefined)}>
          <option value="">{t('catalog.allRegions')}</option>
          {REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <div className="flex items-center px-2">
          <Checkbox label={t('catalog.onlyVerified')} checked={!!query.verified} onChange={(e) => set('verified', e.target.checked ? 'true' : undefined)} />
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="card">
          <EmptyState icon={<Building2 />} title={t('suppliers.empty')} />
        </div>
      ) : (
        <>
          <Stagger key={JSON.stringify(query)} immediate className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((c) => (
              <StaggerItem key={c.id}>
              <Spotlight as={Link} to={`/suppliers/${c.id}`} color={CATEGORY_COLORS[c.mainCategories[0]]} className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-1 hover:shadow-(--shadow-pop)">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={{ background: `color-mix(in oklab, ${CATEGORY_COLORS[c.mainCategories[0]] ?? '#64748b'} 14%, transparent)`, color: CATEGORY_COLORS[c.mainCategories[0]] ?? 'var(--fg-muted)' }}
                  >
                    {c.logo ? <img src={c.logo} alt="" className="size-full rounded-xl object-cover" /> : <CategoryIcon slug={c.mainCategories[0] ?? 'food'} className="size-7" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate font-semibold group-hover:text-primary">{c.name}</h2>
                      {c.verified && <VerifiedBadge />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-fg-subtle">
                      <MapPin className="size-3" /> {c.region}
                    </div>
                    <Rating value={c.rating} size={12} showValue count={c.reviewsCount} className="mt-1" />
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 flex-1 text-sm text-fg-muted">{c.description || t('company.noDescription')}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {c.mainCategories.slice(0, 3).map((slug) => {
                    const cat = categories?.find((x) => x.slug === slug);
                    return cat ? <Badge key={slug}>{f.text(cat.name)}</Badge> : null;
                  })}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                  <div>
                    <div className="font-bold text-fg">{c.productsCount}</div>
                    <div className="text-fg-subtle">{t('company.products')}</div>
                  </div>
                  <div>
                    <div className="font-bold text-fg">{c.responseRate}%</div>
                    <div className="text-fg-subtle">{t('company.responseRate')}</div>
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1 font-bold text-fg">
                      <Users className="size-3" />
                      {c.employees}
                    </div>
                    <div className="text-fg-subtle">{t('company.employees')}</div>
                  </div>
                </div>
              </Spotlight>
              </StaggerItem>
            ))}
          </Stagger>
          <Pagination className="mt-8" page={data.page} totalPages={data.totalPages} onChange={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}
