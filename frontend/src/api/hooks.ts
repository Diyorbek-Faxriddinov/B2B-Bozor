import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { catalogApi, favoritesApi, messagesApi, notificationsApi } from './endpoints';
import { ApiError } from './client';
import { useAuth } from '@/stores/auth';
import { useCart } from '@/stores/cart';
import type { ID, ProductQuery } from '@/types';
import { useT } from '@/i18n';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

/** Central query keys — invalidate by prefix. */
export const qk = {
  categories: ['categories'] as const,
  stats: ['stats'] as const,
  activity: ['stats', 'activity'] as const,
  products: (q: ProductQuery) => ['products', q] as const,
  productsByIds: (ids: ID[]) => ['products', 'batch', ids] as const,
  product: (id: ID) => ['product', id] as const,
  similar: (id: ID) => ['product', id, 'similar'] as const,
  reviews: (id: ID, page: number) => ['product', id, 'reviews', page] as const,
  canReview: (id: ID) => ['product', id, 'can-review'] as const,
  companies: (q: object) => ['companies', q] as const,
  company: (id: ID) => ['company', id] as const,
  favorites: ['favorites'] as const,
  favoriteIds: ['favorites', 'ids'] as const,
  orders: (q: object) => ['orders', q] as const,
  order: (id: ID) => ['orders', 'detail', id] as const,
  tracking: (id: ID) => ['orders', 'tracking', id] as const,
  rfqs: (q: object) => ['rfqs', q] as const,
  notifications: ['notifications'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: ID) => ['conversations', id] as const,
  unreadMessages: ['conversations', 'unread'] as const,
  aiChats: ['ai'] as const,
  aiChat: (id: ID) => ['ai', id] as const,
  seller: (...rest: unknown[]) => ['seller', ...rest] as const,
  courier: (...rest: unknown[]) => ['courier', ...rest] as const,
  admin: (...rest: unknown[]) => ['admin', ...rest] as const,
};

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: catalogApi.categories, staleTime: 5 * 60_000 });
}

export function useProducts(q: ProductQuery, enabled = true) {
  return useQuery({ queryKey: qk.products(q), queryFn: () => catalogApi.products(q), placeholderData: keepPreviousData, enabled });
}

export function useProductsByIds(ids: ID[]) {
  return useQuery({
    queryKey: qk.productsByIds(ids),
    queryFn: () => catalogApi.productsByIds(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Products referenced by the cart, joined with quantities. */
export function useCartProducts() {
  const items = useCart((s) => s.items);
  const ids = items.map((i) => i.productId);
  const query = useProductsByIds(ids);
  const rows = items
    .map((it) => ({ ...it, product: query.data?.find((p) => p.id === it.productId) }))
    .filter((r): r is typeof r & { product: NonNullable<typeof r.product> } => !!r.product);
  return { ...query, rows, isLoading: ids.length > 0 && query.isLoading };
}

export function useFavoriteIds() {
  const user = useAuth((s) => s.user);
  return useQuery({ queryKey: qk.favoriteIds, queryFn: favoritesApi.ids, enabled: !!user, staleTime: 60_000 });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const t = useT();
  const m = useMutation({
    mutationFn: favoritesApi.toggle,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.favoriteIds });
      const prev = qc.getQueryData<ID[]>(qk.favoriteIds) ?? [];
      qc.setQueryData<ID[]>(qk.favoriteIds, prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]);
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx && qc.setQueryData(qk.favoriteIds, ctx.prev),
    onSuccess: (res) => {
      toast.success(res.favorited ? t('favorites.added') : t('favorites.removed'));
      qc.invalidateQueries({ queryKey: qk.favorites, exact: true });
    },
  });
  return (id: ID) => {
    if (!user) {
      toast.info(t('auth.loginRequired'));
      return;
    }
    m.mutate(id);
  };
}

export function useNotifications() {
  const user = useAuth((s) => s.user);
  return useQuery({ queryKey: qk.notifications, queryFn: notificationsApi.list, enabled: !!user, refetchInterval: 20_000 });
}

export function useUnreadMessages() {
  const user = useAuth((s) => s.user);
  return useQuery({ queryKey: qk.unreadMessages, queryFn: messagesApi.unread, enabled: !!user, refetchInterval: 15_000 });
}
