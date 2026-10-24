import { memo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Apple,
  Armchair,
  BadgeCheck,
  Check,
  BrickWall,
  Car,
  Cpu,
  Factory,
  FlaskConical,
  Heart,
  NotebookPen,
  Package,
  Shirt,
  ShoppingCart,
  SprayCan,
  Sprout,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { Product, ProductWithCompany } from '@/types';
import { cn } from '@/lib/utils';
import { lowestUnitPrice, unitPriceFor } from '@/lib/pricing';
import { useCart } from '@/stores/cart';
import { useFavoriteIds, useToggleFavorite } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { Badge, Rating } from './ui/display';
import { Button } from './ui/button';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Apple,
  agro: Sprout,
  construction: BrickWall,
  textile: Shirt,
  electronics: Cpu,
  packaging: Package,
  chemicals: FlaskConical,
  furniture: Armchair,
  auto: Car,
  household: SprayCan,
  equipment: Factory,
  office: NotebookPen,
};

export const CATEGORY_COLORS: Record<string, string> = {
  food: '#eb6834',
  agro: '#008300',
  construction: '#a16207',
  textile: '#6250d6',
  electronics: '#2a78d6',
  packaging: '#c98500',
  chemicals: '#1baf7a',
  furniture: '#d55181',
  auto: '#e34948',
  household: '#199e70',
  equipment: '#52514e',
  office: '#3987e5',
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = CATEGORY_ICONS[slug] ?? Package;
  return <Icon className={className} />;
}

/** Product photo, or a tasteful category-tinted placeholder when the seller hasn't uploaded one. */
export const ProductImage = memo(function ProductImage({
  product,
  className,
  iconClassName,
  index = 0,
}: {
  product: Pick<Product, 'name' | 'categorySlug' | 'images'>;
  className?: string;
  iconClassName?: string;
  index?: number;
}) {
  const src = product.images[index];
  const color = CATEGORY_COLORS[product.categorySlug] ?? '#64748b';
  if (src) {
    return <img src={src} alt={product.name} loading="lazy" className={cn('h-full w-full object-cover', className)} />;
  }
  return (
    <div
      role="img"
      aria-label={product.name}
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}
      style={{
        color,
        background: `linear-gradient(135deg, color-mix(in oklab, ${color} 10%, var(--surface)) 0%, color-mix(in oklab, ${color} 24%, var(--surface)) 100%)`,
      }}
    >
      <div className="absolute -top-8 -right-8 size-28 rounded-full bg-current opacity-15" />
      <div className="absolute -bottom-12 -left-10 size-32 rounded-full bg-current opacity-10" />
      <CategoryIcon slug={product.categorySlug} className={cn('relative size-1/3 max-h-20 max-w-20 opacity-80', iconClassName)} />
    </div>
  );
});

export function VerifiedBadge({ className, withText = false }: { className?: string; withText?: boolean }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-1 text-primary', className)} title={t('company.verified')}>
      <BadgeCheck className="size-4 shrink-0" />
      {withText && <span className="text-xs font-semibold">{t('company.verified')}</span>}
    </span>
  );
}

export function useAddToCart() {
  const add = useCart((s) => s.add);
  const navigate = useNavigate();
  const t = useT();
  return (product: Pick<Product, 'id' | 'name' | 'moq' | 'stock'>, qty?: number) => {
    const quantity = qty ?? product.moq;
    if (product.stock < product.moq) {
      toast.error(t('product.outOfStock'));
      return;
    }
    add(product.id, quantity);
    toast.success(t('cart.added'), {
      description: product.name,
      action: { label: t('cart.view'), onClick: () => navigate('/cart') },
    });
  };
}

export function FavoriteButton({ productId, className }: { productId: string; className?: string }) {
  const { data: ids } = useFavoriteIds();
  const toggle = useToggleFavorite();
  const t = useT();
  const active = !!ids?.includes(productId);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
      aria-pressed={active}
      aria-label={active ? t('favorites.remove') : t('favorites.add')}
      className={cn(
        'flex size-9 items-center justify-center rounded-full bg-surface/90 shadow-sm backdrop-blur transition-colors hover:scale-105',
        active ? 'text-danger' : 'text-fg-muted hover:text-danger',
        className,
      )}
    >
      <motion.span key={String(active)} initial={active ? { scale: 0.4 } : false} animate={{ scale: [null, 1.3, 1] }} transition={{ duration: 0.4 }} className="flex">
        <Heart className="size-4.5" fill={active ? 'currentColor' : 'none'} />
      </motion.span>
    </motion.button>
  );
}

function AddToCartButton({ product, className, variant = 'soft' }: { product: ProductWithCompany; className?: string; variant?: 'soft' | 'primary' }) {
  const t = useT();
  const addToCart = useAddToCart();
  const [added, setAdded] = useState(false);
  const outOfStock = product.stock < product.moq;
  return (
    <Button
      variant={added ? 'success' : variant}
      size="sm"
      className={cn('overflow-hidden', className)}
      disabled={outOfStock}
      onClick={(e) => {
        e.preventDefault();
        addToCart(product);
        setAdded(true);
        setTimeout(() => setAdded(false), 1400);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={added ? 'added' : 'add'}
          className="inline-flex items-center gap-1.5"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {added ? <Check /> : <ShoppingCart />}
          {added ? t('cart.addedShort') : t('product.addToCart')}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

export function ProductCard({ product, layout = 'grid' }: { product: ProductWithCompany; layout?: 'grid' | 'list' }) {
  const f = useFormat();
  const t = useT();
  const td = useTd();
  const from = lowestUnitPrice(product);
  const base = unitPriceFor(product, product.moq);
  const outOfStock = product.stock < product.moq;
  const unit = td(`units.${product.unit}`);

  if (layout === 'list') {
    return (
      <Link to={`/products/${product.id}`} className="card group flex gap-4 p-3 transition-shadow hover:shadow-(--shadow-pop) sm:p-4">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-lg sm:size-36">
          <ProductImage product={product} className="transition-transform duration-300 group-hover:scale-105" />
          {product.discount > 0 && (
            <Badge tone="danger" className="absolute top-2 left-2 border-0 bg-danger text-white">
              −{product.discount}%
            </Badge>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="line-clamp-2 font-semibold text-fg group-hover:text-primary">{product.name}</h3>
          <p className="mt-1 line-clamp-2 hidden text-sm text-fg-muted sm:block">{product.description}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="truncate">{product.company.name}</span>
            {product.company.verified && <VerifiedBadge />}
            <span>·</span>
            <span className="shrink-0">{product.company.region}</span>
          </div>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
            <div>
              <div className="text-lg font-bold text-fg">
                {f.money(base)} <span className="text-xs font-normal text-fg-subtle">/ {unit}</span>
              </div>
              <div className="text-xs text-fg-muted">
                {t('product.moqShort', { n: f.number(product.moq), unit })}
                {from < base && <> · {t('product.fromPrice', { price: f.money(from) })}</>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Rating value={product.rating} count={product.reviewsCount} size={12} />
              <FavoriteButton productId={product.id} className="size-8 border border-border shadow-none" />
              <AddToCartButton product={product} variant="primary" />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/products/${product.id}`} className="card group flex h-full flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-(--shadow-pop)">
      <div className="relative aspect-[4/3] overflow-hidden">
        <ProductImage product={product} className="transition-transform duration-500 ease-out group-hover:scale-[1.07]" />
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {product.discount > 0 && <Badge className="border-0 bg-danger text-white">−{product.discount}%</Badge>}
          {outOfStock && <Badge className="border-0 bg-fg/80 text-bg">{t('product.outOfStock')}</Badge>}
        </div>
        <FavoriteButton productId={product.id} className="absolute top-2.5 right-2.5" />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="mb-1 flex items-center gap-1 text-xs text-fg-subtle">
          <span className="truncate">{product.company.name}</span>
          {product.company.verified && <VerifiedBadge className="[&_svg]:size-3.5" />}
        </div>
        <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold text-fg group-hover:text-primary">{product.name}</h3>
        <div className="mt-1.5">
          <Rating value={product.rating} count={product.reviewsCount} size={12} />
        </div>
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[15px] font-bold whitespace-nowrap text-fg sm:text-base">{f.money(base)}</span>
            <span className="text-xs text-fg-subtle">/ {unit}</span>
          </div>
          {product.discount > 0 && <div className="text-xs text-fg-subtle line-through">{f.money(product.price)}</div>}
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span>{t('product.moqShort', { n: f.number(product.moq), unit })}</span>
            <span className="inline-flex items-center gap-1">
              <Truck className="size-3.5" />
              {t('product.days', { n: product.deliveryDays })}
            </span>
          </div>
          <AddToCartButton product={product} className="mt-3 w-full" />
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[4/3] skeleton-shimmer" />
      <div className="space-y-2 p-3.5">
        <div className="h-3 w-1/2 skeleton-shimmer rounded" />
        <div className="h-4 w-full skeleton-shimmer rounded" />
        <div className="h-4 w-2/3 skeleton-shimmer rounded" />
        <div className="h-5 w-1/3 skeleton-shimmer rounded" />
        <div className="h-8 w-full skeleton-shimmer rounded-lg" />
      </div>
    </div>
  );
}
