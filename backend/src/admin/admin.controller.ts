import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma, ProductStatus, Role, UserStatus } from '@prisma/client';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { conflict, notFound, validationError } from '../common/errors';
import { toCompany, toProductWithCompany, toUser } from '../common/serialize';
import { daySeries, pageMeta, pageParams, searchWords } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';
import { productFilters } from '../catalog/catalog.controller';
import { productOrderBy } from '../catalog/product.util';

const ROLES: Role[] = ['buyer', 'seller', 'courier', 'admin'];
type Query = Record<string, string | undefined>;

@ApiTags('admin')
@Controller('admin')
@Auth('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const since = new Date(Date.now() - 30 * 86400000);
    const [users, byRole, companies, pendingCompanies, products, pendingProducts, orders, gmv, recent, byCategory] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.company.count(),
      this.prisma.company.count({ where: { verified: false } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: 'pending' } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({ where: { status: { not: 'cancelled' } }, _sum: { total: true } }),
      this.prisma.order.findMany({ where: { status: { not: 'cancelled' }, createdAt: { gte: since } }, select: { createdAt: true, total: true } }),
      this.prisma.orderItem.groupBy({ by: ['categorySlug'], where: { order: { status: { not: 'cancelled' } } }, _sum: { total: true } }),
    ]);
    const roleCounts = new Map(byRole.map((r) => [r.role, r._count]));
    return {
      users,
      usersByRole: Object.fromEntries(ROLES.map((r) => [r, roleCounts.get(r) ?? 0])),
      companies,
      pendingCompanies,
      products,
      pendingProducts,
      orders,
      gmv: gmv._sum.total ?? 0,
      gmvSeries: daySeries(
        30,
        recent.map((o) => ({ at: o.createdAt, value: o.total })),
      ),
      categoryShare: byCategory.map((c) => ({ slug: c.categorySlug, revenue: c._sum.total ?? 0 })).sort((a, b) => b.revenue - a.revenue),
    };
  }

  @Get('users')
  async users(@Query() query: Query) {
    const and: Prisma.UserWhereInput[] = [];
    if (query.role && ROLES.includes(query.role as Role)) and.push({ role: query.role as Role });
    if (query.status === 'active' || query.status === 'blocked') and.push({ status: query.status });
    for (const w of searchWords(query.q ?? '')) {
      and.push({ OR: [{ fullName: { contains: w } }, { email: { contains: w } }, { phone: { contains: w } }, { organization: { contains: w } }] });
    }
    const where = { AND: and };
    const { page, pageSize } = pageParams(query, 12);
    const total = await this.prisma.user.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: m.skip,
      take: pageSize,
      include: { company: { select: { id: true } } },
    });
    return { items: items.map(toUser), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Patch('users/:id')
  async updateUser(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() body: { status?: unknown }) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw notFound('USER_NOT_FOUND', 'User not found');
    if (u.id === admin.id) throw conflict('CANNOT_MODIFY_SELF', 'You cannot change your own account here');
    const status = body?.status as UserStatus | undefined;
    if (status !== undefined && status !== 'active' && status !== 'blocked') validationError({ status: 'REQUIRED' });
    const updated = await this.prisma.user.update({ where: { id }, data: status ? { status } : {}, include: { company: { select: { id: true } } } });
    if (updated.status === 'blocked') await this.auth.revokeAllSessions(id);
    return toUser(updated);
  }

  @Get('companies')
  async companies(@Query() query: Query) {
    const and: Prisma.CompanyWhereInput[] = [];
    if (query.verified === 'true') and.push({ verified: true });
    if (query.verified === 'false') and.push({ verified: false });
    for (const w of searchWords(query.q ?? '')) and.push({ OR: [{ name: { contains: w } }, { tin: { contains: w } }] });
    const where = { AND: and };
    const { page, pageSize } = pageParams(query, 12);
    const total = await this.prisma.company.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.company.findMany({ where, orderBy: [{ verified: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize });
    return { items: items.map(toCompany), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Patch('companies/:id')
  async updateCompany(@Param('id') id: string, @Body() body: { verified?: unknown }) {
    const c = await this.prisma.company.findUnique({ where: { id } });
    if (!c) throw notFound('COMPANY_NOT_FOUND', 'Company not found');
    if (typeof body?.verified !== 'boolean') return toCompany(c);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.company.update({ where: { id }, data: { verified: body.verified as boolean } });
      if (next.verified) await tx.product.updateMany({ where: { companyId: id, status: 'pending' }, data: { status: 'active' } });
      return next;
    });
    if (updated.verified && !c.verified) {
      await this.notifications.notify(
        c.ownerId,
        { type: 'system', title: 'Kompaniya tasdiqlandi', body: `${c.name} verifikatsiyadan o'tdi. Mahsulotlaringiz endi katalogda.`, link: '/seller' },
        { email: true },
      );
    }
    return toCompany(updated);
  }

  @Get('products')
  async products(@Query() query: Query) {
    const where: Prisma.ProductWhereInput = productFilters({ q: query.q, category: query.category }, this.prisma);
    if (query.status && ['active', 'inactive', 'pending', 'rejected'].includes(query.status)) where.status = query.status as ProductStatus;
    const { page, pageSize } = pageParams(query, 12);
    const total = await this.prisma.product.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.product.findMany({ where, orderBy: productOrderBy('newest'), skip: m.skip, take: pageSize, include: { company: true } });
    return { items: items.map(toProductWithCompany), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Patch('products/:id')
  async updateProduct(@Param('id') id: string, @Body() body: { status?: unknown; reason?: unknown }) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
    const status = body?.status as ProductStatus | undefined;
    if (status !== undefined && !['active', 'inactive', 'pending', 'rejected'].includes(status)) validationError({ status: 'REQUIRED' });
    const updated = await this.prisma.product.update({ where: { id }, data: status ? { status } : { updatedAt: new Date() }, include: { company: true } });
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : '';
    await this.notifications.notify(
      updated.company.ownerId,
      {
        type: 'system',
        title: updated.status === 'active' ? 'Mahsulot tasdiqlandi' : updated.status === 'rejected' ? 'Mahsulot rad etildi' : 'Mahsulot holati o‘zgardi',
        body: `"${updated.name}"${reason ? ': ' + reason : ''}`,
        link: '/seller/products',
      },
      { email: updated.status === 'rejected' },
    );
    return toProductWithCompany(updated);
  }
}
