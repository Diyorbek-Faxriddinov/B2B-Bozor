import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, FileText, Globe, Mail, MapPin, MessageSquare, Phone, ShieldCheck, Star, Users, Warehouse } from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk, useCategories, useProducts } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { CategoryIcon, ProductCard, ProductCardSkeleton, VerifiedBadge } from '@/components/catalog';
import { ContactSellerDialog, RfqDialog, useRequireLogin } from '@/components/dialogs';
import { Badge, Breadcrumbs, Card, EmptyState, ErrorState, PageLoader, Pagination, Rating } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { useAuth } from '@/stores/auth';
import type { ProductQuery } from '@/types';
import { motion } from 'motion/react';
import { Aurora } from '@/components/motion';

export default function SupplierPage() {
  const { id = '' } = useParams();
  const t = useT();
  const f = useFormat();
  const user = useAuth((s) => s.user);
  const requireLogin = useRequireLogin();
  const { data: categories } = useCategories();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductQuery['sort']>('popular');
  const [page, setPage] = useState(1);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const { data: company, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.company(id), queryFn: () => catalogApi.company(id) });
  const products = useProducts({ company: company?.id, q: search || undefined, sort, page, pageSize: 8 }, !!company);

  if (isLoading) return <PageLoader />;
  if (isError || !company) {
    return (
      <div className="container-page py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }
  const isOwner = user?.companyId === company.id;

  return (
    <div>
      <div className="relative border-b border-border bg-surface">
        <div className="relative h-36 overflow-hidden bg-gradient-to-r from-primary via-[#4338ca] to-[#7c3aed] sm:h-48">
          <Aurora className="opacity-60! mix-blend-screen" />
          <div className="bg-dots absolute inset-0 opacity-20" />
        </div>
        <div className="container-page">
          <div className="-mt-12 flex flex-col gap-4 pb-6 sm:-mt-14 sm:flex-row sm:items-end">
            <motion.span
              initial={{ scale: 0.7, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="relative z-10 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface bg-surface-2 text-fg-muted shadow-(--shadow-pop) sm:size-28"
            >
              {company.logo ? <img src={company.logo} alt="" className="size-full object-cover" /> : <CategoryIcon slug={company.mainCategories[0] ?? 'food'} className="size-11" />}
            </motion.span>
            <div className="min-w-0 flex-1">
              <Breadcrumbs className="mb-1" items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.suppliers'), to: '/suppliers' }, { label: company.name }]} />
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{company.name}</h1>
                {company.verified ? (
                  <Badge tone="primary" icon={<ShieldCheck />}>
                    {t('company.verifiedSupplier')}
                  </Badge>
                ) : (
                  <Badge tone="warning">{t('company.unverified')}</Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4" /> {company.region}
                </span>
                <Rating value={company.rating} size={13} showValue count={company.reviewsCount} />
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-4" /> {t('company.since', { year: company.foundedYear })}
                </span>
              </div>
            </div>
            {!isOwner && (
              <div className="flex gap-2">
                <Button variant="outline" leftIcon={<MessageSquare />} onClick={() => requireLogin() && setContactOpen(true)}>
                  {t('product.contactSeller')}
                </Button>
                <Button leftIcon={<FileText />} onClick={() => requireLogin('buyer') && setRfqOpen(true)}>
                  {t('product.requestQuote')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container-page grid gap-6 py-8 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t('company.about')}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{company.description || t('company.noDescription')}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              {[
                { icon: <Star />, label: t('company.rating'), value: company.rating.toFixed(1) },
                { icon: <Clock />, label: t('company.responseTime'), value: `≤ ${company.responseTimeHours} h` },
                { icon: <Users />, label: t('company.employees'), value: company.employees },
                { icon: <FileText />, label: t('company.orders'), value: f.number(company.ordersCount) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-surface-2 p-2.5">
                  <dt className="flex items-center gap-1 text-[11px] text-fg-subtle [&_svg]:size-3">
                    {s.icon}
                    {s.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-bold">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="space-y-3 p-5 text-sm">
            <h2 className="font-semibold">{t('company.contacts')}</h2>
            <div className="flex items-start gap-2 text-fg-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {company.address}
            </div>
            <div className="flex items-start gap-2 text-fg-muted">
              <Warehouse className="mt-0.5 size-4 shrink-0" /> {company.pickupPoint.text}
            </div>
            <a href={`tel:${company.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-fg-muted hover:text-fg">
              <Phone className="size-4" /> {company.phone}
            </a>
            <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-fg-muted hover:text-fg">
              <Mail className="size-4" /> {company.email}
            </a>
            {company.website && (
              <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-fg-muted hover:text-fg">
                <Globe className="size-4" /> {company.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <div className="flex items-center gap-2 text-fg-muted">
              <VerifiedBadge /> {t('company.tin')}: {company.tin}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{t('company.categories')}</h2>
            <div className="flex flex-wrap gap-2">
              {company.mainCategories.map((slug) => {
                const c = categories?.find((x) => x.slug === slug);
                return c ? (
                  <Badge key={slug} icon={<CategoryIcon slug={slug} />}>
                    {f.text(c.name)}
                  </Badge>
                ) : null;
              })}
            </div>
          </Card>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {t('company.products')} <span className="text-fg-subtle">({products.data?.total ?? company.productsCount})</span>
            </h2>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <form
                className="min-w-0 flex-1 sm:flex-none"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(q.trim());
                  setPage(1);
                }}
              >
                <Input inputSize="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('company.searchProducts')} className="sm:w-52" />
              </form>
              <div className="w-40 sm:w-44">
                <Select selectSize="sm" value={sort} onChange={(e) => setSort(e.target.value as ProductQuery['sort'])}>
                  <option value="popular">{t('catalog.sort.popular')}</option>
                  <option value="newest">{t('catalog.sort.newest')}</option>
                  <option value="price_asc">{t('catalog.sort.price_asc')}</option>
                  <option value="price_desc">{t('catalog.sort.price_desc')}</option>
                </Select>
              </div>
            </div>
          </div>
          {products.isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : !products.data?.items.length ? (
            <div className="card">
              <EmptyState title={t('catalog.emptyTitle')} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {products.data.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <Pagination className="mt-6" page={products.data.page} totalPages={products.data.totalPages} onChange={setPage} />
            </>
          )}
        </section>
      </div>

      <RfqDialog open={rfqOpen} onClose={() => setRfqOpen(false)} companyId={company.id} companyName={company.name} />
      <ContactSellerDialog open={contactOpen} onClose={() => setContactOpen(false)} companyId={company.id} companyName={company.name} />
    </div>
  );
}
