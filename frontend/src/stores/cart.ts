import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, ID } from '@/types';

interface CartState {
  items: CartItem[];
  /** Product ids the buyer unticked — kept in cart but excluded from checkout. */
  excluded: ID[];
  add: (productId: ID, quantity: number) => void;
  setQuantity: (productId: ID, quantity: number) => void;
  remove: (productId: ID) => void;
  toggleExcluded: (productId: ID) => void;
  removeMany: (ids: ID[]) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      excluded: [],
      add: (productId, quantity) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === productId);
          if (existing) {
            return { items: s.items.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + quantity } : i)) };
          }
          return { items: [...s.items, { productId, quantity }] };
        }),
      setQuantity: (productId, quantity) =>
        set((s) => ({ items: s.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)) })),
      remove: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId), excluded: s.excluded.filter((x) => x !== productId) })),
      toggleExcluded: (productId) =>
        set((s) => ({
          excluded: s.excluded.includes(productId) ? s.excluded.filter((x) => x !== productId) : [...s.excluded, productId],
        })),
      removeMany: (ids) =>
        set((s) => ({ items: s.items.filter((i) => !ids.includes(i.productId)), excluded: s.excluded.filter((x) => !ids.includes(x)) })),
      clear: () => set({ items: [], excluded: [] }),
    }),
    { name: 'b2b-cart' },
  ),
);

export const useCartCount = () => useCart((s) => s.items.length);

interface RecentState {
  ids: ID[];
  push: (id: ID) => void;
}

export const useRecentlyViewed = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      push: (id) => set((s) => ({ ids: [id, ...s.ids.filter((x) => x !== id)].slice(0, 12) })),
    }),
    { name: 'b2b-recent' },
  ),
);
