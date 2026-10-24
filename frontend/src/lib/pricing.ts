import type { Product, PriceTier } from '@/types';

type Priceable = Pick<Product, 'price' | 'discount' | 'tiers'>;

/** Unit price before the product-level discount, chosen by quantity tier. */
export function tierPriceFor(product: Priceable, qty: number) {
  const tier = [...product.tiers].sort((a, b) => b.minQty - a.minQty).find((t) => qty >= t.minQty);
  return tier ? tier.price : product.price;
}

/** Final unit price the buyer pays at a given quantity. */
export function unitPriceFor(product: Priceable, qty: number) {
  const base = tierPriceFor(product, qty);
  return Math.round(base * (1 - (product.discount || 0) / 100));
}

export function lineTotal(product: Priceable, qty: number) {
  return unitPriceFor(product, qty) * qty;
}

/** Lowest possible unit price (largest tier + discount) — used for "from" labels. */
export function lowestUnitPrice(product: Priceable) {
  const prices = [product.price, ...product.tiers.map((t) => t.price)];
  return Math.round(Math.min(...prices) * (1 - (product.discount || 0) / 100));
}

export function nextTier(product: Priceable, qty: number): PriceTier | undefined {
  return [...product.tiers].sort((a, b) => a.minQty - b.minQty).find((t) => t.minQty > qty);
}

export const DELIVERY = {
  baseFee: 30_000,
  perKm: 2_500,
  freeFrom: 5_000_000,
  courierShare: 0.8,
  /** Courier delivery radius by road from the seller's warehouse. */
  maxKm: 60,
};

export function courierAvailable(distanceKm: number) {
  return distanceKm <= DELIVERY.maxKm;
}

/** Fee by road distance (km). Free above the order threshold. */
export function deliveryFee(subtotal: number, distanceKm: number) {
  if (subtotal >= DELIVERY.freeFrom) return 0;
  return Math.round((DELIVERY.baseFee + DELIVERY.perKm * Math.max(0, distanceKm - 3)) / 1000) * 1000;
}
