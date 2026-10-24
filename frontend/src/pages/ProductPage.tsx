import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { CountUp, Reveal } from '@/components/motion';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Box,
  Clock,
  FileText,
  MapPin,
  MessageSquare,
  PackageCheck,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  TrendingDown,
  Truck,
  Zap,
} from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useCart, useRecentlyViewed } from '@/stores/cart';
import { useFormat, useT, useTd } from '@/i18n';
import { nextTier, tierPriceFor, unitPriceFor } from '@/lib/pricing';
import { DELIVERY } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import type { ProductWithCompany } from '@/types';
import { FavoriteButton, ProductCard, ProductImage, VerifiedBadge, useAddToCart } from '@/components/catalog';
import { ContactSellerDialog, RfqDialog, useRequireLogin } from '@/components/dialogs';
import { Badge, Breadcrumbs, Card, EmptyState, ErrorState, PageLoader, Pagination, QuantityInput, Rating, RatingInput, SectionTitle, Tabs } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { Avatar } from '@/components/ui/display';

function Gallery({ product }: { product: ProductWithCompany }) {
  const [active, setActive] = useState(0);
  const count = Math.max(1, product.images.length);
  return (
    <div>
      <div
        className="card group/zoom relative aspect-square overflow-hidden"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`);
          e.currentTarget.style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`);
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} className="h-full w-full" initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="h-full w-full transition-transform duration-300 ease-out [transform-origin:var(--zx,50%)_var(--zy,50%)] group-hover/zoom:scale-[1.6]">
              <ProductImage product={product} index={active} iconClassName="size-1/4 max-h-32 max-w-32" />
            </div>
          </motion.div>
        </AnimatePresence>
        {product.discount > 0 && <Badge className="absolute top-4 left-4 border-0 bg-danger px-2.5 py-1 text-sm text-white">−{product.discount}%</Badge>}
        <FavoriteButton productId={product.id} className="absolute top-4 right-4 size-10" />
      </div>
      {count > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {product.images.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className={cn('aspect-square overflow-hidden rounded-lg border-2', i === active ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}>
              <ProductImage product={product} index={i} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PriceTiers({ product, qty }: { product: ProductWithCompany; qty: number }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const unit = td(`units.${product.unit}`);
  const rows = [{ minQty: product.moq, price: product.price }, ...[...product.tiers].sort((a, b) => a.minQty - b.minQty)];
  const activeTier = tierPriceFor(product, qty);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map((r, i) => {
        const next = rows[i + 1];
        const active = r.price === activeTier && qty >= r.minQty && (!next || qty < next.minQty);
        const final = Math.round(r.price * (1 - product.discount / 100));
        return (
          <div key={r.minQty} className={cn('rounded-xl border p-3 transition-colors', active ? 'border-primary bg-primary-soft/60 ring-3 ring-primary/10' : 'border-border bg-surface')}>
            <div className="text-xs text-fg-muted">
              {next ? `${f.number(r.minQty)}–${f.number(next.minQty - 1)}` : `≥ ${f.number(r.minQty)}`} {unit}
            </div>
            <div className={cn('mt-1 text-[15px] leading-tight font-bold', active ? 'text-primary' : 'text-fg')}>{f.money(final)}</div>
            {i > 0 && <div className="text-[11px] font-medium text-success">−{Math.round((1 - r.price / product.price) * 100)}%</div>}
          </div>
        );
      })}
      <p className="sr-only">{t('product.tiers')}</p>
    </div>
  );
}

function BuyBox({ product }: { product: ProductWithCompany }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const addToCart = useAddToCart();
  const inCart = useCart((s) => s.items.find((i) => i.productId === product.id));
  const requireLogin = useRequireLogin();
  const [qty, setQty] = useState(product.moq);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  useEffect(() => {
    setQty(product.moq);
  }, [product.id, product.moq]);

  const unit = td(`units.${product.unit}`);
  const unitPrice = unitPriceFor(product, qty);
  const total = unitPrice * qty;
  const saving = product.price * qty - total;
  const next = nextTier(product, qty);
  const outOfStock = product.stock < product.moq;
  const canBuy = !user || user.role === 'buyer';

  const buyRef = useRef<HTMLDivElement>(null);
  const buyVisible = useInView(buyRef, { margin: '0px 0px -40px 0px', initial: true });

  const buyNow = () => {
    if (!requireLogin('buyer')) return;
    if (!inCart) useCart.getState().add(product.id, qty);
    else useCart.getState().setQuantity(product.id, qty);
    navigate('/checkout');
  };

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {canBuy && !outOfStock && !buyVisible && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            className="glass fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-border px-4 py-3 md:bottom-0"
          >
            <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-fg-muted">{product.name}</div>
                <div className="font-bold">
                  {f.money(total)} <span className="text-xs font-normal text-fg-subtle">· {f.number(qty)} {unit}</span>
                </div>
              </div>
              <Button variant="outline" size="icon" onClick={() => addToCart(product, qty)} aria-label={t('product.addToCart')}>
                <ShoppingCart />
              </Button>
              <Button shine onClick={buyNow} leftIcon={<Zap />}>
                {t('product.buyNow')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {product.company.verified && (
            <Badge tone="primary" icon={<BadgeCheck />}>
              {t('company.verifiedSupplier')}
            </Badge>
          )}
          {product.soldCount > 300 && (
            <Badge tone="accent" icon={<Zap />}>
              {t('product.bestseller')}
            </Badge>
          )}
          {product.status !== 'active' && <Badge tone="warning">{td(`product.status.${product.status}`)}</Badge>}
        </div>
        <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{product.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
          <a href="#reviews" className="inline-flex items-center gap-1.5 hover:text-fg">
            <Rating value={product.rating} size={14} showValue />
            <span>({t('product.reviewsN', { n: product.reviewsCount })})</span>
          </a>
          <span>{t('product.soldN', { n: f.number(product.soldCount) })}</span>
          <span>{t('product.sku', { id: product.id.toUpperCase() })}</span>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-extrabold tracking-tight text-fg">
            <CountUp to={unitPrice} from={unitPrice} duration={0.5} format={(n) => f.money(Math.round(n))} />
          </span>
          <span className="text-sm text-fg-muted">/ {unit}</span>
          {unitPrice < product.price && <span className="text-sm text-fg-subtle line-through">{f.money(product.price)}</span>}
        </div>
        <p className="mt-1 text-xs text-fg-subtle">{t('product.vatIncluded')}</p>
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <TrendingDown className="size-4 text-success" /> {t('product.tiers')}
          </div>
          <PriceTiers product={product} qty={qty} />
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div>
            <div className="mb-1.5 text-sm font-medium">
              {t('product.quantity')} <span className="font-normal text-fg-subtle">({unit})</span>
            </div>
            <QuantityInput value={qty} onChange={setQty} min={product.moq} max={Math.max(product.moq, product.stock)} step={product.moq >= 100 ? product.moq : 1} />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="text-xs text-fg-muted">{t('product.total')}</div>
            <div className="text-xl font-bold">
              <CountUp to={total} from={total} duration={0.5} format={(n) => f.money(Math.round(n))} />
            </div>
            {saving > 0 && <div className="text-xs font-medium text-success">{t('product.youSave', { amount: f.money(saving) })}</div>}
          </div>
        </div>
        {next && !outOfStock && (
          <button
            onClick={() => setQty(next.minQty)}
            className="mt-3 flex w-full items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-left text-xs font-medium text-success hover:brightness-95"
          >
            <TrendingDown className="size-4 shrink-0" />
            {t('product.nextTierHint', { n: f.number(next.minQty - qty), unit, price: f.money(Math.round(next.price * (1 - product.discount / 100))) })}
          </button>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Box className="size-3.5" /> {t('product.moqShort', { n: f.number(product.moq), unit })}
          </span>
          <span className={cn('inline-flex items-center gap-1', outOfStock ? 'text-danger' : product.stock < product.moq * 3 ? 'text-warning' : '')}>
            <PackageCheck className="size-3.5" /> {outOfStock ? t('product.outOfStock') : t('product.inStock', { n: f.number(product.stock), unit })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3.5" /> {t('product.deliveryIn', { n: product.deliveryDays })}
          </span>
        </div>

        {canBuy ? (
          <div ref={buyRef} className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button size="lg" variant="outline" leftIcon={<ShoppingCart />} disabled={outOfStock} onClick={() => addToCart(product, qty)}>
              {inCart ? t('product.addMore') : t('product.addToCart')}
            </Button>
            <Button size="lg" shine leftIcon={<Zap />} disabled={outOfStock} onClick={buyNow}>
              {t('product.buyNow')}
            </Button>
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">{t('product.sellerView')}</p>
        )}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="soft" leftIcon={<FileText />} onClick={() => requireLogin('buyer') && setRfqOpen(true)}>
            {t('product.requestQuote')}
          </Button>
          <Button variant="ghost" leftIcon={<MessageSquare />} onClick={() => requireLogin() && setContactOpen(true)} disabled={user?.companyId === product.companyId}>
            {t('product.contactSeller')}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 text-center text-xs text-fg-muted">
        <div className="rounded-xl border border-border bg-surface p-3">
          <ShieldCheck className="mx-auto mb-1 size-5 text-primary" />
          {t('product.guarantee')}
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <Truck className="mx-auto mb-1 size-5 text-primary" />
          {t('product.freeDeliveryFrom', { amount: f.money(DELIVERY.freeFrom, { compact: true }) })}
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <FileText className="mx-auto mb-1 size-5 text-primary" />
          {t('product.invoice')}
        </div>
      </div>

      <RfqDialog open={rfqOpen} onClose={() => setRfqOpen(false)} companyId={product.companyId} companyName={product.company.name} product={product} />
      <ContactSellerDialog
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        companyId={product.companyId}
        companyName={product.company.name}
        productId={product.id}
        productName={product.name}
      />
    </div>
  );
}

function SupplierCard({ product }: { product: ProductWithCompany }) {
  const t = useT();
  const c = product.company;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
          <Store className="size-6" />
        </span>
        <div className="min-w-0">
          <Link to={`/suppliers/${c.id}`} className="flex items-center gap-1.5 font-semibold hover:text-primary">
            <span className="truncate">{c.name}</span>
            {c.verified && <VerifiedBadge />}
          </Link>
          <div className="flex items-center gap-1 text-xs text-fg-subtle">
            <MapPin className="size-3" /> {c.region}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-fg-subtle">{t('company.rating')}</dt>
          <dd className="text-sm font-bold">{c.rating.toFixed(1)}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-fg-subtle">{t('company.responseRate')}</dt>
          <dd className="text-sm font-bold">{c.responseRate}%</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-fg-subtle">{t('company.responseTime')}</dt>
          <dd className="inline-flex items-center gap-0.5 text-sm font-bold">
            <Clock className="size-3" />≤{c.responseTimeHours}h
          </dd>
        </div>
      </dl>
      <ButtonLink to={`/suppliers/${c.id}`} variant="outline" className="mt-4 w-full" leftIcon={<Store />}>
        {t('company.visitStore')}
      </ButtonLink>
    </Card>
  );
}

function Reviews({ productId }: { productId: string }) {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const { data, isLoading } = useQuery({ queryKey: qk.reviews(productId, page), queryFn: () => catalogApi.reviews(productId, page) });
  const { data: can } = useQuery({ queryKey: qk.canReview(productId), queryFn: () => catalogApi.canReview(productId), enabled: user?.role === 'buyer' });
  const m = useMutation({
    mutationFn: () => catalogApi.addReview(productId, rating, comment),
    onSuccess: () => {
      toast.success(t('reviews.thanks'));
      setComment('');
      qc.invalidateQueries({ queryKey: qk.product(productId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const total = data?.distribution.reduce((s, d) => s + d.count, 0) ?? 0;
  const avg = total ? data!.distribution.reduce((s, d) => s + d.star * d.count, 0) / total : 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
      <div>
        <div className="flex items-end gap-3">
          <span className="text-5xl font-extrabold">{avg.toFixed(1)}</span>
          <div className="pb-1.5">
            <Rating value={avg} size={16} />
            <div className="text-xs text-fg-subtle">{t('product.reviewsN', { n: total })}</div>
          </div>
        </div>
        <ul className="mt-4 space-y-1.5">
          {data?.distribution.map((d) => (
            <li key={d.star} className="flex items-center gap-2 text-sm">
              <span className="w-3 text-fg-muted">{d.star}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: total ? `${(d.count / total) * 100}%` : 0 }} />
              </div>
              <span className="tabular w-6 text-right text-xs text-fg-subtle">{d.count}</span>
            </li>
          ))}
        </ul>
        {can?.canReview && (
          <form
            className="mt-6 space-y-3 rounded-xl border border-border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <div className="text-sm font-semibold">{t('reviews.write')}</div>
            <RatingInput value={rating} onChange={setRating} />
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('reviews.placeholder')} rows={3} required minLength={5} />
            <Button type="submit" size="sm" loading={m.isPending} className="w-full">
              {t('reviews.submit')}
            </Button>
          </form>
        )}
        {user?.role === 'buyer' && can && !can.canReview && <p className="mt-6 text-xs text-fg-subtle">{t('reviews.onlyBuyers')}</p>}
      </div>
      <div>
        {isLoading ? null : !data?.items.length ? (
          <EmptyState title={t('reviews.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex items-center gap-3">
                  <Avatar name={r.userName} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{r.userName}</div>
                    <div className="flex items-center gap-2 text-xs text-fg-subtle">
                      <Rating value={r.rating} size={11} /> {f.date(r.createdAt)}
                    </div>
                  </div>
                  <Badge tone="success" icon={<BadgeCheck />}>
                    {t('reviews.verifiedPurchase')}
                  </Badge>
                </div>
                <p className="mt-2.5 text-sm text-fg">{r.comment}</p>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination className="mt-4" page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}

export default function ProductPage() {
  const { id = '' } = useParams();
  const t = useT();
  const f = useFormat();
  const td = useTd();
  const pushRecent = useRecentlyViewed((s) => s.push);
  const [tab, setTab] = useState<'description' | 'specs' | 'reviews' | 'delivery'>('description');
  const { data: product, isLoading, isError, error, refetch } = useQuery({ queryKey: qk.product(id), queryFn: () => catalogApi.product(id) });
  const { data: similar } = useQuery({ queryKey: qk.similar(id), queryFn: () => catalogApi.similar(id), enabled: !!product });
  const { data: categories } = useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories, staleTime: 300_000 });

  useEffect(() => {
    if (product) {
      pushRecent(product.id);
      document.title = `${product.name} — B2B Bozor`;
    }
    return () => {
      document.title = 'B2B Bozor — ulgurji savdo platformasi';
    };
  }, [product, pushRecent]);

  if (isLoading) return <PageLoader />;
  if (isError || !product) {
    return (
      <div className="container-page py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }
  const category = categories?.find((c) => c.slug === product.categorySlug);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t('common.linkCopied'));
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="container-page py-6">
      <div className="flex items-center justify-between gap-4">
        <Breadcrumbs
          items={[
            { label: t('nav.home'), to: '/' },
            { label: t('header.catalog'), to: '/catalog' },
            ...(category ? [{ label: f.text(category.name), to: `/catalog?category=${category.slug}` }] : []),
            { label: product.name },
          ]}
        />
        <Button variant="ghost" size="sm" leftIcon={<Share2 />} onClick={share}>
          <span className="hidden sm:inline">{t('common.share')}</span>
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.15fr] xl:grid-cols-[1fr_1.1fr_300px]">
        <Gallery product={product} />
        <BuyBox product={product} />
        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <SupplierCard product={product} />
        </div>
      </div>

      <Reveal className="mt-12">
      <div id="reviews">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'description', label: t('product.tabs.description') },
            { value: 'specs', label: t('product.tabs.specs') },
            { value: 'reviews', label: t('product.tabs.reviews'), count: product.reviewsCount },
            { value: 'delivery', label: t('product.tabs.delivery') },
          ]}
        />
        <div className="card mt-5 p-5 sm:p-6">
          {tab === 'description' && (
            <div className="max-w-3xl space-y-4">
              <p className="leading-relaxed whitespace-pre-line text-fg">{product.description}</p>
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <Link key={tag} to={`/catalog?q=${encodeURIComponent(tag)}`} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-primary">
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === 'specs' && (
            <dl className="grid max-w-3xl gap-x-8 sm:grid-cols-2">
              {[...product.specs, { key: t('product.unit'), value: td(`units.${product.unit}`) }, { key: t('product.moq'), value: f.number(product.moq) }].map((s) => (
                <div key={s.key} className="flex justify-between gap-4 border-b border-border py-2.5 text-sm">
                  <dt className="text-fg-muted">{s.key}</dt>
                  <dd className="text-right font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'reviews' && <Reviews productId={product.id} />}
          {tab === 'delivery' && (
            <div className="grid max-w-3xl gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">{t('product.deliveryTitle')}</h3>
                <ul className="space-y-1.5 text-sm text-fg-muted">
                  <li>• {t('product.deliveryLine1', { base: f.money(DELIVERY.baseFee), perKm: f.money(DELIVERY.perKm) })}</li>
                  <li>• {t('product.deliveryLine2', { amount: f.money(DELIVERY.freeFrom) })}</li>
                  <li>• {t('product.deliveryLine3')}</li>
                  <li>• {t('product.deliveryIn', { n: product.deliveryDays })}</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">{t('product.paymentTitle')}</h3>
                <ul className="space-y-1.5 text-sm text-fg-muted">
                  <li>• {t('checkout.payment.card')} — Uzcard, Humo, Visa, Mastercard</li>
                  <li>• {t('checkout.payment.transfer')} — {t('checkout.payment.transferHint')}</li>
                  <li>• {t('checkout.payment.cash')}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      </Reveal>
      {!!similar?.length && (
        <section className="mt-14">
          <SectionTitle title={t('product.similar')} />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {similar.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
