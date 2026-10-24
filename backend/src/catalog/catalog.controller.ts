import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Auth, CurrentUser, Lang, type AuthUser, type Locale } from '../auth/auth.decorators';
import { ApiError, notFound, validationError } from '../common/errors';
import { toCompany, toProductWithCompany, toReview, type Address } from '../common/serialize';
import { json, matches, pageMeta, pageParams, round1, searchWords } from '../common/util';
import { q } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';
import { productOrderBy, productSearchWhere, recomputeRatings } from './product.util';

type Query = Record<string, string | undefined>;

export function productFilters(query: Query, prisma: PrismaService): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [productSearchWhere(q.str(query.q))];
  if (q.str(query.category)) and.push({ categorySlug: query.category });
  if (q.str(query.company)) and.push({ companyId: query.company });
  const min = q.num(query.minPrice);
  const max = q.num(query.maxPrice);
  if (min) and.push({ moqPrice: { gte: min } });
  if (max) and.push({ moqPrice: { lte: max } });
  const rating = q.num(query.rating);
  if (rating) and.push({ rating: { gte: rating } });
  if (q.bool(query.discount)) and.push({ discount: { gt: 0 } });
  if (q.bool(query.inStock)) and.push({ stock: { gte: prisma.product.fields.moq } });
  if (q.bool(query.verified)) and.push({ company: { verified: true } });
  if (q.str(query.region)) and.push({ company: { region: query.region } });
  return { AND: and };
}

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('categories')
  async categories() {
    const [cats, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.product.groupBy({ by: ['categorySlug'], where: { status: 'active' }, _count: true }),
    ]);
    const bySlug = new Map(counts.map((c) => [c.categorySlug, c._count]));
    return cats.map((c) => ({ id: c.id, slug: c.slug, name: { uz: c.nameUz, ru: c.nameRu, en: c.nameEn }, color: c.color, productsCount: bySlug.get(c.slug) ?? 0 }));
  }

  @Get('stats/public')
  async publicStats() {
    const [products, companies, buyers, orders, regions, ordersToday, response] = await Promise.all([
      this.prisma.product.count({ where: { status: 'active' } }),
      this.prisma.company.count(),
      this.prisma.user.count({ where: { role: 'buyer' } }),
      this.prisma.order.count(),
      this.prisma.company.groupBy({ by: ['region'] }),
      this.prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.company.aggregate({ _avg: { responseTimeHours: true } }),
    ]);
    return { products, companies, buyers, orders, regions: regions.length, ordersToday, avgResponseHours: round1(response._avg.responseTimeHours ?? 0) };
  }

  /** Anonymised recent deals for the home-page live feed. */
  @Get('stats/activity')
  async activity() {
    const orders = await this.prisma.order.findMany({
      where: { status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 14,
      include: { items: { take: 1, orderBy: { id: 'asc' } } },
    });
    return orders
      .filter((o) => o.items.length)
      .map((o) => {
        const it = o.items[0];
        const text = json<Address | null>(o.deliveryAddress, null)?.text ?? json<Address>(o.pickupPoint, { text: '', lat: 0, lng: 0 }).text;
        return {
          id: o.id,
          companyName: o.companyName,
          productName: it.name,
          categorySlug: it.categorySlug,
          quantity: it.quantity,
          unit: it.unit,
          area: text
            .split(',')
            .map((x) => x.trim())
            .slice(0, 2)
            .join(', '),
          at: o.createdAt.toISOString(),
        };
      });
  }

  @Get('products')
  async products(@Query() query: Query) {
    const where: Prisma.ProductWhereInput = { status: 'active', ...productFilters(query, this.prisma) };
    const { page, pageSize } = pageParams(query, 12);
    const total = await this.prisma.product.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.product.findMany({ where, orderBy: productOrderBy(query.sort), skip: m.skip, take: pageSize, include: { company: true } });
    return { items: items.map(toProductWithCompany), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Get('products/suggest')
  async suggest(@Query('q') raw: string | undefined, @Lang() locale: Locale) {
    const text = String(raw ?? '').trim();
    if (text.length < 2) return { products: [], categories: [], companies: [] };
    const words = searchWords(text);
    const [products, cats, companies] = await Promise.all([
      this.prisma.product.findMany({ where: { status: 'active', ...productSearchWhere(text) }, orderBy: productOrderBy('popular'), take: 6 }),
      this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.company.findMany({ where: { AND: words.map((w) => ({ name: { contains: w } })) }, take: 3 }),
    ]);
    const nameKey = locale === 'ru' ? 'nameRu' : locale === 'en' ? 'nameEn' : 'nameUz';
    return {
      products: products.map((p) => ({ id: p.id, name: p.name, categorySlug: p.categorySlug, price: p.moqPrice, unit: p.unit })),
      categories: cats.filter((c) => matches(`${c.nameUz} ${c.nameRu} ${c.nameEn}`, text)).map((c) => ({ slug: c.slug, name: c[nameKey] })),
      companies: companies.map((c) => ({ id: c.id, name: c.name, verified: c.verified })),
    };
  }

  @Post('products/batch')
  async batch(@Body() body: { ids?: unknown }) {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 200) : [];
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: { company: true } });
    const byId = new Map(rows.map((p) => [p.id, p]));
    return ids.flatMap((id) => (byId.has(id) ? [toProductWithCompany(byId.get(id)!)] : []));
  }

  @Get('products/:id')
  async product(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { company: true } });
    const isOwner = user?.role === 'seller' && user.company?.id === p?.companyId;
    if (!p || (p.status !== 'active' && !isOwner && user?.role !== 'admin')) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    const updated = await this.prisma.product.update({
      where: { id },
      data: { views: { increment: 1 }, popularity: { increment: 0.1 } },
      include: { company: true },
    });
    return toProductWithCompany(updated);
  }

  @Get('products/:id/similar')
  async similar(@Param('id') id: string) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) return [];
    const items = await this.prisma.product.findMany({
      where: { id: { not: p.id }, status: 'active', categorySlug: p.categorySlug },
      orderBy: [{ soldCount: 'desc' }, { id: 'asc' }],
      take: 8,
      include: { company: true },
    });
    return items.map(toProductWithCompany);
  }

  @Get('products/:id/reviews')
  async reviews(@Param('id') id: string, @Query() query: Query) {
    const { page, pageSize } = pageParams(query, 5);
    const [total, groups] = await Promise.all([
      this.prisma.review.count({ where: { productId: id } }),
      this.prisma.review.groupBy({ by: ['rating'], where: { productId: id }, _count: true }),
    ]);
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.review.findMany({ where: { productId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize });
    const counts = new Map(groups.map((g) => [g.rating, g._count]));
    return {
      items: items.map(toReview),
      total,
      page: m.page,
      pageSize,
      totalPages: m.totalPages,
      distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: counts.get(star) ?? 0 })),
    };
  }

  private hasDeliveredOrder(userId: string, productId: string) {
    return this.prisma.order.findFirst({ where: { buyerId: userId, status: 'delivered', items: { some: { productId } } }, select: { id: true } });
  }

  @Get('products/:id/can-review')
  async canReview(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    if (!user || user.role !== 'buyer') return { canReview: false, reason: 'NOT_BUYER' };
    const bought = !!(await this.hasDeliveredOrder(user.id, id));
    return bought ? { canReview: true } : { canReview: false, reason: 'NOT_PURCHASED' };
  }

  @Post('products/:id/reviews')
  @Auth('buyer')
  async addReview(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    if (!(await this.hasDeliveredOrder(u.id, id))) throw new ApiError(403, 'NOT_PURCHASED', 'Only verified buyers can review');
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) validationError({ rating: 'REQUIRED' });
    const comment = String(body.comment ?? '').trim();
    if (comment.length < 5) validationError({ comment: 'MIN_LENGTH' });

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.review.upsert({
        where: { productId_userId: { productId: id, userId: u.id } },
        create: { productId: id, userId: u.id, userName: u.fullName, rating, comment: comment.slice(0, 2000) },
        update: { rating, comment: comment.slice(0, 2000), createdAt: new Date() },
      });
      await recomputeRatings(tx, id);
      await tx.order.updateMany({ where: { buyerId: u.id, status: 'delivered', items: { some: { productId: id } } }, data: { rated: true } });
      return tx.product.findUniqueOrThrow({ where: { id }, include: { company: true } });
    });
    await this.notifications.notify(product.company.ownerId, {
      type: 'review',
      title: 'Yangi sharh',
      body: `${u.fullName} "${product.name}" uchun ${rating}★ baho qoldirdi.`,
      link: `/products/${product.id}`,
    });
    return { ok: true };
  }

  @Get('companies')
  async companies(@Query() query: Query) {
    const and: Prisma.CompanyWhereInput[] = searchWords(q.str(query.q) ?? '').map((w) => ({ OR: [{ name: { contains: w } }, { description: { contains: w } }] }));
    if (q.str(query.region)) and.push({ region: query.region });
    if (q.str(query.category)) and.push({ mainCategories: { array_contains: query.category } });
    if (q.bool(query.verified)) and.push({ verified: true });
    const where = { AND: and };
    const { page, pageSize } = pageParams(query, 12);
    const total = await this.prisma.company.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.company.findMany({ where, orderBy: [{ verified: 'desc' }, { rating: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize });
    return { items: items.map(toCompany), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Get('companies/:idOrSlug')
  async company(@Param('idOrSlug') idOrSlug: string) {
    const c = await this.prisma.company.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
    if (!c) throw notFound('COMPANY_NOT_FOUND', 'Company not found');
    return toCompany(c);
  }
}
