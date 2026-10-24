import { Prisma, type PrismaClient } from '@prisma/client';
import { unitPriceFor, type PriceTier } from '../common/pricing';
import { normalize, round1, searchWords } from '../common/util';

/** Derived columns kept in sync on every product write. */
export function derivedProductFields(p: {
  name: string;
  description: string;
  tags: string[];
  price: number;
  discount: number;
  tiers: PriceTier[];
  moq: number;
  companyName: string;
}) {
  return {
    searchText: normalize(`${p.name} ${p.description} ${p.tags.join(' ')} ${p.companyName}`),
    moqPrice: unitPriceFor(p, p.moq),
  };
}

export const popularity = (soldCount: number, views: number) => soldCount * 3 + views / 10;

/** `q` → every word must occur in searchText. */
export function productSearchWhere(q?: string): Prisma.ProductWhereInput {
  const words = q ? searchWords(q) : [];
  return words.length ? { AND: words.map((w) => ({ searchText: { contains: w } })) } : {};
}

export function productOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ moqPrice: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ moqPrice: 'desc' }, { id: 'asc' }];
    case 'rating':
      return [{ rating: 'desc' }, { reviewsCount: 'desc' }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    default:
      return [{ popularity: 'desc' }, { id: 'asc' }];
  }
}

type Tx = PrismaClient | Prisma.TransactionClient;

/** Product rating = mean of its reviews; company rating = review-weighted mean of its products. */
export async function recomputeRatings(tx: Tx, productId: string) {
  const agg = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: true });
  const product = await tx.product.update({
    where: { id: productId },
    data: { reviewsCount: agg._count, rating: agg._count ? round1(agg._avg.rating ?? 0) : 0 },
  });
  const ps = await tx.product.findMany({ where: { companyId: product.companyId }, select: { rating: true, reviewsCount: true } });
  const reviewsCount = ps.reduce((s, x) => s + x.reviewsCount, 0);
  const rating = round1(ps.reduce((s, x) => s + x.rating * x.reviewsCount, 0) / Math.max(1, reviewsCount));
  await tx.company.update({ where: { id: product.companyId }, data: { reviewsCount, rating } });
}

/** Re-derives searchText for all products of a company (after a rename). */
export async function reindexCompanyProducts(tx: Tx, companyId: string, companyName: string) {
  const products = await tx.product.findMany({ where: { companyId } });
  for (const p of products) {
    const { searchText } = derivedProductFields({
      ...p,
      tags: p.tags as string[],
      tiers: p.tiers as unknown as PriceTier[],
      companyName,
    });
    await tx.product.update({ where: { id: p.id }, data: { searchText } });
  }
}
