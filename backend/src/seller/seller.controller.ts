import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { OrderStatus, Prisma, Product } from '@prisma/client';
import { z } from 'zod';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { notFound, validationError } from '../common/errors';
import { inUzbekistan } from '../common/geo';
import { ORDER_INCLUDE, toCompany, toOrder, toProduct } from '../common/serialize';
import { daySeries, json, pageMeta, pageParams, pctChange, searchWords, within } from '../common/util';
import { EMAIL_RE, parse, zAddress } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';
import { derivedProductFields, reindexCompanyProducts } from '../catalog/product.util';

const UNITS = ['piece', 'kg', 'ton', 'liter', 'meter', 'm2', 'box', 'pack', 'bag', 'set'] as const;
const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready', 'in_transit', 'delivered', 'cancelled'];

const num = (code: string) => z.number({ error: code }).finite(code);
const productSchema = z.object({
  name: z.string({ error: 'MIN_LENGTH' }).trim().min(3, 'MIN_LENGTH').max(200, 'MAX_LENGTH'),
  categorySlug: z.string({ error: 'REQUIRED' }).min(1, 'REQUIRED'),
  description: z.string().trim().max(5000, 'MAX_LENGTH').default(''),
  images: z.array(z.string().max(2000)).max(10, 'RANGE').default([]),
  price: num('POSITIVE').int('POSITIVE').positive('POSITIVE').max(10_000_000_000, 'RANGE'),
  unit: z.enum(UNITS, { error: 'REQUIRED' }),
  moq: num('POSITIVE').int('POSITIVE').min(1, 'POSITIVE'),
  stock: num('POSITIVE').int('POSITIVE').min(0, 'POSITIVE'),
  discount: num('RANGE').min(0, 'RANGE').max(90, 'RANGE').default(0),
  tiers: z.array(z.object({ minQty: num('POSITIVE').int('POSITIVE').positive('POSITIVE'), price: num('POSITIVE').int('POSITIVE').positive('POSITIVE') })).max(10, 'RANGE').default([]),
  specs: z.array(z.object({ key: z.string().trim().min(1).max(80), value: z.string().trim().max(300) })).max(30, 'RANGE').default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20, 'RANGE').default([]),
  deliveryDays: num('POSITIVE').int('POSITIVE').min(1, 'POSITIVE').max(90, 'RANGE').default(2),
  status: z.enum(['active', 'inactive']).default('active'),
});
type ProductInput = z.infer<typeof productSchema>;

const companySchema = z
  .object({
    name: z.string().trim().min(2, 'MIN_LENGTH').max(200, 'MAX_LENGTH'),
    description: z.string().trim().max(5000, 'MAX_LENGTH'),
    logo: z.string().max(2000).nullable(),
    address: z.string().trim().max(300, 'MAX_LENGTH'),
    phone: z.string().trim().max(40, 'MAX_LENGTH'),
    email: z.string().trim().regex(EMAIL_RE, 'INVALID_EMAIL'),
    website: z.string().trim().max(200, 'MAX_LENGTH').nullable(),
    employees: z.string().trim().max(40, 'MAX_LENGTH'),
    foundedYear: z.number().int().min(1900, 'RANGE').max(new Date().getFullYear(), 'RANGE'),
    pickupPoint: zAddress,
    region: z.string().trim().min(2, 'REQUIRED').max(80),
  })
  .partial();

@ApiTags('seller')
@Controller('seller')
@Auth('seller')
export class SellerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async company(u: AuthUser) {
    const c = u.company ? await this.prisma.company.findUnique({ where: { id: u.company.id } }) : null;
    if (!c) throw notFound('COMPANY_NOT_FOUND', 'Company not found');
    return c;
  }

  private async validateProduct(input: ProductInput) {
    const fields: Record<string, string> = {};
    if (!(await this.prisma.category.findUnique({ where: { slug: input.categorySlug } }))) fields.categorySlug = 'REQUIRED';
    const tiers = [...input.tiers].sort((a, b) => a.minQty - b.minQty);
    tiers.forEach((t, i) => {
      const idx = input.tiers.indexOf(t);
      const prev = tiers[i - 1];
      if (t.minQty <= input.moq || (prev && t.minQty <= prev.minQty)) fields[`tiers.${idx}.minQty`] = 'TIER_ABOVE_MOQ';
      if (t.price >= input.price || (prev && t.price >= prev.price)) fields[`tiers.${idx}.price`] = 'TIER_BELOW_BASE';
    });
    if (Object.keys(fields).length) validationError(fields);
    return tiers;
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser, @Query('range') rangeRaw?: string) {
    const c = await this.company(u);
    const range = Math.min(365, Math.max(1, Number(rangeRaw) || 30));
    const since = new Date(Date.now() - range * 2 * 86400000);
    const [orders, recent, products, openRfqs] = await Promise.all([
      this.prisma.order.findMany({ where: { companyId: c.id, createdAt: { gte: since } }, include: { items: true } }),
      this.prisma.order.findMany({ where: { companyId: c.id }, orderBy: { createdAt: 'desc' }, take: 6, include: ORDER_INCLUDE }),
      this.prisma.product.findMany({ where: { companyId: c.id }, select: { id: true, name: true, categorySlug: true, status: true, stock: true, moq: true } }),
      this.prisma.rfq.count({ where: { companyId: c.id, status: 'open' } }),
    ]);
    const live = orders.filter((o) => o.status !== 'cancelled');
    const cur = live.filter((o) => within(o.createdAt, range));
    const prev = live.filter((o) => within(o.createdAt, range * 2, range));
    const revenue = cur.reduce((s, o) => s + o.subtotal, 0);
    const prevRevenue = prev.reduce((s, o) => s + o.subtotal, 0);

    const stats = new Map<string, { sold: number; revenue: number }>();
    for (const o of cur) {
      for (const it of o.items) {
        const s = stats.get(it.productId) ?? { sold: 0, revenue: 0 };
        s.sold += it.quantity;
        s.revenue += it.total;
        stats.set(it.productId, s);
      }
    }
    return {
      revenue,
      revenueChange: pctChange(revenue, prevRevenue),
      orders: cur.length,
      ordersChange: pctChange(cur.length, prev.length),
      avgOrder: cur.length ? Math.round(revenue / cur.length) : 0,
      activeProducts: products.filter((p) => p.status === 'active').length,
      lowStock: products.filter((p) => p.stock < p.moq * 3).length,
      openRfqs,
      rating: c.rating,
      revenueSeries: daySeries(
        range,
        cur.map((o) => ({ at: o.createdAt, value: o.subtotal })),
      ),
      statusBreakdown: STATUSES.map((status) => ({ status, count: orders.filter((o) => o.status === status && within(o.createdAt, range)).length })),
      topProducts: [...stats.entries()]
        .map(([id, s]) => {
          const p = products.find((x) => x.id === id);
          return { id, name: p?.name ?? id, categorySlug: p?.categorySlug ?? 'food', ...s };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
      recentOrders: recent.map(toOrder),
    };
  }

  @Get('products')
  async products(@CurrentUser() u: AuthUser, @Query() query: Record<string, string | undefined>) {
    const c = await this.company(u);
    const and: Prisma.ProductWhereInput[] = [{ companyId: c.id }];
    for (const w of searchWords(query.q ?? '')) and.push({ OR: [{ name: { contains: w } }, { searchText: { contains: w } }] });
    if (query.status && ['active', 'inactive', 'pending', 'rejected'].includes(query.status)) and.push({ status: query.status as Product['status'] });
    if (query.category) and.push({ categorySlug: query.category });

    let rows: Product[];
    let total: number;
    const { page, pageSize } = pageParams(query, 10);
    if (query.status === 'low_stock') {
      // stock < moq * 3 isn't expressible as a Prisma field comparison → filter in memory (one company only)
      const all = await this.prisma.product.findMany({ where: { AND: and }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
      const low = all.filter((p) => p.stock < p.moq * 3);
      total = low.length;
      const m = pageMeta(total, page, pageSize);
      rows = low.slice(m.skip, m.skip + pageSize);
    } else {
      total = await this.prisma.product.count({ where: { AND: and } });
      const m = pageMeta(total, page, pageSize);
      rows = await this.prisma.product.findMany({ where: { AND: and }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize });
    }
    const m = pageMeta(total, page, pageSize);
    return { items: rows.map(toProduct), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Get('products/:id')
  async product(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, companyId: u.company?.id ?? '-' } });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    return toProduct(p);
  }

  @Post('products')
  async create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const c = await this.company(u);
    const input = parse(productSchema, body);
    const tiers = await this.validateProduct(input);
    const status = c.verified ? input.status : 'pending';
    const product = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...input,
          tiers,
          companyId: c.id,
          status,
          ...derivedProductFields({ ...input, tiers, companyName: c.name }),
        },
      });
      const cats = json<string[]>(c.mainCategories, []);
      await tx.company.update({
        where: { id: c.id },
        data: { productsCount: { increment: 1 }, ...(cats.includes(p.categorySlug) ? {} : { mainCategories: [...cats, p.categorySlug] }) },
      });
      return p;
    });
    if (status === 'pending') {
      await this.notifications.notifyAdmins({ type: 'system', title: 'Moderatsiya', body: `${c.name}: "${product.name}" tasdiqlashni kutmoqda.`, link: '/admin/products' });
    }
    return toProduct(product);
  }

  @Patch('products/:id')
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const c = await this.company(u);
    const p = await this.prisma.product.findFirst({ where: { id, companyId: c.id } });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    const current = toProduct(p);
    const merged = parse(productSchema, { ...current, status: p.status === 'active' || p.status === 'inactive' ? p.status : 'inactive', ...body });
    const tiers = await this.validateProduct(merged);
    // moderation states can't be overridden by the seller
    const status = p.status === 'pending' || p.status === 'rejected' ? p.status : merged.status;
    const updated = await this.prisma.product.update({
      where: { id },
      data: { ...merged, tiers, status, ...derivedProductFields({ ...merged, tiers, companyName: c.name }) },
    });
    return toProduct(updated);
  }

  @Delete('products/:id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const c = await this.company(u);
    const res = await this.prisma.product.deleteMany({ where: { id, companyId: c.id } });
    if (!res.count) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    await this.prisma.company.update({ where: { id: c.id }, data: { productsCount: Math.max(0, c.productsCount - 1) } });
    return { ok: true };
  }

  @Get('company')
  async getCompany(@CurrentUser() u: AuthUser) {
    return toCompany(await this.company(u));
  }

  @Patch('company')
  async updateCompany(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    const c = await this.company(u);
    const patch = parse(companySchema, body);
    if (patch.pickupPoint && !inUzbekistan(patch.pickupPoint)) validationError({ pickupPoint: 'OUTSIDE_SERVICE_AREA' });
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.company.update({
        where: { id: c.id },
        data: { ...patch, pickupPoint: patch.pickupPoint as object | undefined, logo: patch.logo === undefined ? undefined : patch.logo || null },
      });
      if (patch.name && patch.name !== c.name) await reindexCompanyProducts(tx, c.id, patch.name);
      return next;
    });
    return toCompany(updated);
  }
}

