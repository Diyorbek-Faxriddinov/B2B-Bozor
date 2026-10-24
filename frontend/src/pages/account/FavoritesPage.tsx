import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { favoritesApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT } from '@/i18n';
import { ProductCard, ProductCardSkeleton } from '@/components/catalog';
import { Card, EmptyState, PageHeader } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export default function FavoritesPage() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: qk.favorites, queryFn: favoritesApi.list });
  return (
    <>
      <PageHeader title={t('account.nav.favorites')} description={data ? t('favorites.count', { n: data.length }) : undefined} />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Heart />} title={t('favorites.emptyTitle')} description={t('favorites.emptyText')} action={<ButtonLink to="/catalog">{t('cart.goShopping')}</ButtonLink>} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </>
  );
}
