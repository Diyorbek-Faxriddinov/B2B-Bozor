/** Port of frontend/src/lib/pricing.ts — the server is the source of truth for prices. */
export interface PriceTier {
  minQty: number;
  price: number;
}

interface Priceable {
  price: number;
  discount: number;
  tiers: PriceTier[];
}

export function tierPriceFor(product: Priceable, qty: number) {
  const tier = [...product.tiers].sort((a, b) => b.minQty - a.minQty).find((t) => qty >= t.minQty);
  return tier ? tier.price : product.price;
}

/** Final unit price the buyer pays at a given quantity. */
export function unitPriceFor(product: Priceable, qty: number) {
  const base = tierPriceFor(product, qty);
  return Math.round(base * (1 - (product.discount || 0) / 100));
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

export function deliveryFee(subtotal: number, distanceKm: number) {
  if (subtotal >= DELIVERY.freeFrom) return 0;
  return Math.round((DELIVERY.baseFee + DELIVERY.perKm * Math.max(0, distanceKm - 3)) / 1000) * 1000;
}
