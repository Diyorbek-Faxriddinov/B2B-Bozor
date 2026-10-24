import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, ShieldCheck, ShoppingCart, Store, Trash2, TrendingDown, Truck } from 'lucide-react';
import { useCartProducts } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { lineTotal, nextTier, unitPriceFor, DELIVERY } from '@/lib/pricing';
import { ProductImage, VerifiedBadge } from '@/components/catalog';
import { Breadcrumbs, Card, EmptyState, KeyValue, PageLoader, QuantityInput } from '@/components/ui/display';
import { Button, ButtonLink } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/overlay';
import type { ProductWithCompany } from '@/types';
import { AnimatePresence, motion } from 'motion/react';

export function cartIssue(product: ProductWithCompany, qty: number): 'inactive' | 'stock' | 'moq' | null {
  if (product.status !== 'active') return 'inactive';
  if (qty > product.stock) return 'stock';
  if (qty < product.moq) return 'moq';
  return null;
}

export default function CartPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuth((s) => s.user);
  const { rows, isLoading, data } = useCartProducts();
  const { items, excluded, setQuantity, remove, toggleExcluded, clear, removeMany } = useCart();

  // Drop cart entries whose products no longer exist.
  useEffect(() => {
    if (!data) return;
    const missing = items.filter((i) => !data.some((p) => p.id === i.productId)).map((i) => i.productId);
    if (missing.length) removeMany(missing);
  }, [data, items, removeMany]);

  const groups = useMemo(() => {
    const map = new Map<string, { company: ProductWithCompany['company']; rows: typeof rows }>();
    for (const r of rows) {
      const g = map.get(r.product.companyId) ?? { company: r.product.company, rows: [] };
      g.rows.push(r);
      map.set(r.product.companyId, g);
    }
    return [...map.values()];
  }, [rows]);

  const selected = rows.filter((r) => !excluded.includes(r.productId));
  const subtotal = selected.reduce((s, r) => s + lineTotal(r.product, r.quantity), 0);
  const baseTotal = selected.reduce((s, r) => s + r.product.price * r.quantity, 0);
  const savings = baseTotal - subtotal;
  const hasIssues = selected.some((r) => cartIssue(r.product, r.quantity));
  const suppliers = new Set(selected.map((r) => r.product.companyId)).size;

  if (isLoading) return <PageLoader />;

  if (!items.length) {
    return (
      <div className="container-page py-10">
        <Card>
          <EmptyState
            icon={<ShoppingCart />}
            title={t('cart.emptyTitle')}
            description={t('cart.emptyText')}
            action={
              <ButtonLink to="/catalog" rightIcon={<ArrowRight />}>
                {t('cart.goShopping')}
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const checkout = () => {
    if (!user) return navigate('/login?next=/checkout');
    navigate('/checkout');
  };

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.cart') }]} />
      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('cart.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('cart.summaryLine', { items: rows.length, suppliers: groups.length })}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Trash2 />}
          onClick={async () => {
            if (await confirm({ title: t('cart.clearConfirm'), danger: true, confirmText: t('cart.clear') })) clear();
          }}
        >
          {t('cart.clear')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.company.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-4 py-3">
                <Link to={`/suppliers/${g.company.id}`} className="flex min-w-0 items-center gap-2 font-semibold hover:text-primary">
                  <Store className="size-4 shrink-0 text-fg-subtle" />
                  <span className="truncate">{g.company.name}</span>
                  {g.company.verified && <VerifiedBadge />}
                </Link>
                <span className="shrink-0 text-xs text-fg-subtle">{g.company.region}</span>
              </div>
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                {g.rows.map(({ product, quantity, productId }) => {
                  const unit = td(`units.${product.unit}`);
                  const issue = cartIssue(product, quantity);
                  const isExcluded = excluded.includes(productId);
                  const tier = nextTier(product, quantity);
                  return (
                    <motion.li
                      key={productId}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: isExcluded ? 0.55 : 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, x: 40 }}
                      transition={{ duration: 0.25 }}
                      className="flex gap-3 overflow-hidden p-4 sm:gap-4"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 cursor-pointer accent-primary"
                        checked={!isExcluded}
                        onChange={() => toggleExcluded(productId)}
                        aria-label={t('cart.include')}
                      />
                      <Link to={`/products/${productId}`} className="size-20 shrink-0 overflow-hidden rounded-lg sm:size-24">
                        <ProductImage product={product} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <Link to={`/products/${productId}`} className="line-clamp-2 text-sm font-semibold hover:text-primary sm:text-base">
                            {product.name}
                          </Link>
                          <button onClick={() => remove(productId)} className="shrink-0 rounded-md p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger" aria-label={t('common.remove')}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="mt-0.5 text-xs text-fg-muted">
                          {f.money(unitPriceFor(product, quantity))} / {unit} · {t('product.moqShort', { n: f.number(product.moq), unit })}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <QuantityInput
                            size="sm"
                            value={quantity}
                            onChange={(v) => setQuantity(productId, v)}
                            min={product.moq}
                            max={Math.max(product.moq, product.stock)}
                            step={product.moq >= 100 ? product.moq : 1}
                          />
                          <div className="text-right">
                            <div className="font-bold">{f.money(lineTotal(product, quantity))}</div>
                            {unitPriceFor(product, quantity) < product.price && <div className="text-xs text-fg-subtle line-through">{f.money(product.price * quantity)}</div>}
                          </div>
                        </div>
                        {issue && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger">
                            <AlertTriangle className="size-3.5" />
                            {issue === 'stock'
                              ? t('cart.issue.stock', { n: f.number(product.stock), unit })
                              : issue === 'moq'
                                ? t('cart.issue.moq', { n: f.number(product.moq), unit })
                                : t('cart.issue.inactive')}
                          </p>
                        )}
                        {!issue && tier && (
                          <button onClick={() => setQuantity(productId, tier.minQty)} className="mt-2 flex items-center gap-1.5 text-left text-xs font-medium text-success hover:underline">
                            <TrendingDown className="size-3.5 shrink-0" />
                            {t('product.nextTierHint', { n: f.number(tier.minQty - quantity), unit, price: f.money(Math.round(tier.price * (1 - product.discount / 100))) })}
                          </button>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
                </AnimatePresence>
              </ul>
            </Card>
          ))}
        </div>

        <aside className="lg:sticky lg:top-40 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-2 font-semibold">{t('cart.orderSummary')}</h2>
            <KeyValue label={t('cart.selectedItems')}>{selected.length}</KeyValue>
            <KeyValue label={t('cart.subtotalBase')}>{f.money(baseTotal)}</KeyValue>
            {savings > 0 && (
              <KeyValue label={t('cart.wholesaleSavings')}>
                <span className="text-success">−{f.money(savings)}</span>
              </KeyValue>
            )}
            <KeyValue label={t('cart.delivery')}>
              <span className="text-fg-muted">{t('cart.deliveryAtCheckout')}</span>
            </KeyValue>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-semibold">{t('cart.total')}</span>
              <span className="text-2xl font-extrabold">{f.money(subtotal)}</span>
            </div>
            {suppliers > 1 && <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">{t('cart.splitNotice', { n: suppliers })}</p>}
            {subtotal > 0 && subtotal < DELIVERY.freeFrom && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
                <Truck className="size-3.5" /> {t('cart.freeDeliveryHint', { amount: f.money(DELIVERY.freeFrom - subtotal) })}
              </p>
            )}
            <Button size="lg" className="mt-4 w-full" disabled={!selected.length || hasIssues || (!!user && user.role !== 'buyer')} onClick={checkout} rightIcon={<ArrowRight />}>
              {t('cart.checkout')}
            </Button>
            {hasIssues && <p className="mt-2 text-center text-xs text-danger">{t('cart.fixIssues')}</p>}
            {!user && <p className="mt-2 text-center text-xs text-fg-subtle">{t('cart.loginToCheckout')}</p>}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
              <ShieldCheck className="size-3.5" /> {t('cart.secure')}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
