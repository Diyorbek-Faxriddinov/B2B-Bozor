import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LayoutGrid, List, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import type { ProductQuery } from '@/types';
import { useCategories, useProducts } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { REGIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CATEGORY_COLORS, CategoryIcon, ProductCard, ProductCardSkeleton } from '@/components/catalog';
import { GridBackdrop, Stagger, StaggerItem } from '@/components/motion';
import { AnimatePresence, motion } from 'motion/react';
import { Breadcrumbs, EmptyState, ErrorState, Pagination, Rating } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/form';
import { Drawer } from '@/components/ui/overlay';

type SortKey = NonNullable<ProductQuery['sort']>;

function useCatalogQuery() {
  const [params, setParams] = useSearchParams();
  const query: ProductQuery = {
    q: params.get('q') ?? undefined,
    category: params.get('category') ?? undefined,
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    rating: params.get('rating') ? Number(params.get('rating')) : undefined,
    discount: params.get('discount') === 'true' || undefined,
    inStock: params.get('inStock') === 'true' || undefined,
    verified: params.get('verified') === 'true' || undefined,
    region: params.get('region') ?? undefined,
    sort: (params.get('sort') as SortKey) ?? 'popular',
    page: Number(params.get('page')) || 1,
    pageSize: 12,
  };
  const update = (patch: Partial<Record<keyof ProductQuery, string | number | boolean | undefined>>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === false) next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: false });
  };
  const clear = () => setParams(query.q ? { q: query.q } : {});
  return { query, update, clear };
}

function Filters({ query, update }: ReturnType<typeof useCatalogQuery>) {
  const t = useT();
  const f = useFormat();
  const { data: categories } = useCategories();
  const [min, setMin] = useState(query.minPrice?.toString() ?? '');
  const [max, setMax] = useState(query.maxPrice?.toString() ?? '');
  useEffect(() => {
    setMin(query.minPrice?.toString() ?? '');
    setMax(query.maxPrice?.toString() ?? '');
  }, [query.minPrice, query.maxPrice]);

  const section = 'border-b border-border pb-5 mb-5 last:border-0 last:mb-0 last:pb-0';
  const title = 'mb-3 text-sm font-semibold text-fg';
  return (
    <div>
      <div className={section}>
        <h3 className={title}>{t('catalog.categories')}</h3>
        <ul className="space-y-0.5">
          <li>
            <button
              onClick={() => update({ category: undefined })}
              className={cn('w-full rounded-lg px-2.5 py-1.5 text-left text-sm', !query.category ? 'bg-primary-soft font-medium text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-2')}
            >
              {t('catalog.allCategories')}
            </button>
          </li>
          {categories?.map((c) => (
            <li key={c.slug}>
              <button
                onClick={() => update({ category: c.slug })}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm',
                  query.category === c.slug ? 'bg-primary-soft font-medium text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <CategoryIcon slug={c.slug} className="size-4 shrink-0" />
                <span className="flex-1 truncate">{f.text(c.name)}</span>
                <span className="text-xs text-fg-subtle">{c.productsCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={section}>
        <h3 className={title}>{t('catalog.price')}</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ minPrice: min ? Number(min) : undefined, maxPrice: max ? Number(max) : undefined });
          }}
        >
          <Input inputSize="sm" type="number" min={0} placeholder={t('catalog.from')} value={min} onChange={(e) => setMin(e.target.value)} aria-label={t('catalog.from')} />
          <span className="text-fg-subtle">—</span>
          <Input inputSize="sm" type="number" min={0} placeholder={t('catalog.to')} value={max} onChange={(e) => setMax(e.target.value)} aria-label={t('catalog.to')} />
          <Button type="submit" size="sm" variant="secondary">
            OK
          </Button>
        </form>
        <p className="mt-2 text-xs text-fg-subtle">{t('catalog.priceHint')}</p>
      </div>

      <div className={section}>
        <h3 className={title}>{t('catalog.rating')}</h3>
        <div className="space-y-1">
          {[4.5, 4, 3].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
              <input type="radio" name="rating" className="accent-primary" checked={query.rating === r} onChange={() => update({ rating: r })} />
              <Rating value={r} size={13} />
              <span className="text-fg-muted">{t('catalog.andUp', { n: r })}</span>
            </label>
          ))}
          {query.rating && (
            <button className="px-1 text-xs text-primary hover:underline" onClick={() => update({ rating: undefined })}>
              {t('common.reset')}
            </button>
          )}
        </div>
      </div>

      <div className={cn(section, 'space-y-2.5')}>
        <h3 className={title}>{t('catalog.other')}</h3>
        <Checkbox label={t('catalog.onlyDiscount')} checked={!!query.discount} onChange={(e) => update({ discount: e.target.checked })} />
        <Checkbox label={t('catalog.onlyInStock')} checked={!!query.inStock} onChange={(e) => update({ inStock: e.target.checked })} />
        <Checkbox label={t('catalog.onlyVerified')} checked={!!query.verified} onChange={(e) => update({ verified: e.target.checked })} />
      </div>

      <div className={section}>
        <h3 className={title}>{t('catalog.region')}</h3>
        <Select selectSize="sm" value={query.region ?? ''} onChange={(e) => update({ region: e.target.value || undefined })}>
          <option value="">{t('catalog.allRegions')}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const t = useT();
  const f = useFormat();
  const ctx = useCatalogQuery();
  const { query, update, clear } = ctx;
  const { data: categories } = useCategories();
  const { data, isLoading, isError, refetch, isPlaceholderData } = useProducts(query);
  const [layout, setLayout] = useState<'grid' | 'list'>(() => (localStorage.getItem('b2b-catalog-layout') as 'grid' | 'list') || 'grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem('b2b-catalog-layout', layout);
  }, [layout]);

  const category = categories?.find((c) => c.slug === query.category);
  const heading = query.q ? t('catalog.resultsFor', { q: query.q }) : category ? f.text(category.name) : t('catalog.title');

  const chips = useMemo(() => {
    const out: { key: keyof ProductQuery; label: string }[] = [];
    if (category) out.push({ key: 'category', label: f.text(category.name) });
    if (query.minPrice || query.maxPrice) out.push({ key: 'minPrice', label: `${query.minPrice ? f.uzs(query.minPrice) : '0'} — ${query.maxPrice ? f.uzs(query.maxPrice) : '∞'}` });
    if (query.rating) out.push({ key: 'rating', label: `★ ${query.rating}+` });
    if (query.discount) out.push({ key: 'discount', label: t('catalog.onlyDiscount') });
    if (query.inStock) out.push({ key: 'inStock', label: t('catalog.onlyInStock') });
    if (query.verified) out.push({ key: 'verified', label: t('catalog.onlyVerified') });
    if (query.region) out.push({ key: 'region', label: query.region });
    return out;
  }, [query, category, f, t]);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'popular', label: t('catalog.sort.popular') },
    { value: 'newest', label: t('catalog.sort.newest') },
    { value: 'price_asc', label: t('catalog.sort.price_asc') },
    { value: 'price_desc', label: t('catalog.sort.price_desc') },
    { value: 'rating', label: t('catalog.sort.rating') },
  ];

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('header.catalog'), to: category || query.q ? '/catalog' : undefined }, ...(category ? [{ label: f.text(category.name) }] : [])]} />
      <motion.div
        key={category?.slug ?? query.q ?? 'all'}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative mt-3 mb-5 overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{
          background: `linear-gradient(120deg, color-mix(in oklab, ${category ? CATEGORY_COLORS[category.slug] : 'var(--primary)'} 14%, var(--surface)) 0%, var(--surface) 70%)`,
        }}
      >
        <GridBackdrop dots className="opacity-40" />
        {category && (
          <motion.span
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}
            className="absolute top-1/2 right-6 hidden -translate-y-1/2 sm:block"
            style={{ color: CATEGORY_COLORS[category.slug] }}
          >
            <CategoryIcon slug={category.slug} className="size-24 opacity-80" />
          </motion.span>
        )}
        <div className="relative">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-fg-muted">{data ? t('catalog.found', { n: data.total }) : ' '}</p>
        </div>
      </motion.div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {chips.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <AnimatePresence initial={false}>
            {chips.map((c) => (
              <motion.button
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                key={c.key}
                onClick={() => update(c.key === 'minPrice' ? { minPrice: undefined, maxPrice: undefined } : { [c.key]: undefined })}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-sm text-primary-soft-fg hover:border-primary"
              >
                {c.label}
                <X className="size-3.5" />
              </motion.button>
            ))}
            </AnimatePresence>
            <button onClick={clear} className="text-sm font-medium text-fg-muted hover:text-fg">
              {t('catalog.clearAll')}
            </button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" leftIcon={<SlidersHorizontal />} onClick={() => setFiltersOpen(true)}>
            {t('catalog.filters')}
            {chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-fg">{chips.length}</span>}
          </Button>
          <div className="w-48">
            <Select value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label={t('catalog.sortBy')}>
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="hidden rounded-lg border border-border-strong p-0.5 sm:flex">
            {(['grid', 'list'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                aria-label={l}
                aria-pressed={layout === l}
                className={cn('flex size-8 items-center justify-center rounded-md', layout === l ? 'bg-surface-2 text-fg' : 'text-fg-subtle hover:text-fg')}
              >
                {l === 'grid' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="card hidden self-start p-4 lg:sticky lg:top-40 lg:block">
          <Filters {...ctx} />
        </aside>

        <div className={cn('min-w-0 transition-opacity', isPlaceholderData && 'opacity-60')}>
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">{Array.from({ length: 9 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
          ) : !data?.items.length ? (
            <div className="card">
              <EmptyState
                icon={<PackageSearch />}
                title={t('catalog.emptyTitle')}
                description={t('catalog.emptyText')}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={clear}>
                      {t('catalog.clearAll')}
                    </Button>
                  </div>
                }
              />
            </div>
          ) : (
            <>
              <Stagger
                key={`${layout}-${data.page}-${JSON.stringify({ ...query, page: undefined })}`}
                immediate
                stagger={0.04}
                className={layout === 'grid' ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3' : 'space-y-3'}
              >
                {data.items.map((p) => (
                  <StaggerItem key={p.id}>
                    <ProductCard product={p} layout={layout} />
                  </StaggerItem>
                ))}
              </Stagger>
              <Pagination
                className="mt-8"
                page={data.page}
                totalPages={data.totalPages}
                onChange={(p) => {
                  update({ page: p }, false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('catalog.filters')} side="left">
        <div className="p-4">
          <Filters {...ctx} />
        </div>
        <div className="sticky bottom-0 border-t border-border bg-surface p-3">
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>
            {t('catalog.showResults', { n: data?.total ?? 0 })}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
