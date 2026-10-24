import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma, RfqStatus } from '@prisma/client';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { ApiError, conflict, forbidden, notFound, validationError } from '../common/errors';
import { toRfq } from '../common/serialize';
import { pageMeta, pageParams } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';

const UNITS = ['piece', 'kg', 'ton', 'liter', 'meter', 'm2', 'box', 'pack', 'bag', 'set'];
const STATUSES: RfqStatus[] = ['open', 'answered', 'accepted', 'rejected', 'closed'];

const dateOrNull = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

@ApiTags('rfqs')
@Controller('rfqs')
export class RfqsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post()
  @Auth('buyer')
  async create(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    const company = body.companyId ? await this.prisma.company.findUnique({ where: { id: String(body.companyId) } }) : null;
    if (!company) throw notFound('COMPANY_NOT_FOUND', 'Company not found');
    const product = body.productId ? await this.prisma.product.findFirst({ where: { id: String(body.productId), companyId: company.id } }) : null;
    const fields: Record<string, string> = {};
    const quantity = Number(body.quantity);
    if (!(quantity > 0) || !Number.isInteger(quantity)) fields.quantity = 'POSITIVE';
    const message = String(body.message ?? '').trim();
    if (message.length < 10) fields.message = 'MIN_LENGTH';
    const productName = product?.name ?? String(body.productName ?? '').trim();
    if (!productName) fields.productName = 'REQUIRED';
    const targetPrice = body.targetPrice ? Number(body.targetPrice) : null;
    if (targetPrice !== null && !(targetPrice > 0)) fields.targetPrice = 'POSITIVE';
    if (Object.keys(fields).length) validationError(fields);

    const rfq = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({ where: { name: 'rfq' }, create: { name: 'rfq', value: 301 }, update: { value: { increment: 1 } } });
      return tx.rfq.create({
        data: {
          number: `RFQ-${counter.value}`,
          buyerId: u.id,
          buyerName: u.fullName,
          buyerOrganization: u.organization,
          companyId: company.id,
          companyName: company.name,
          productId: product?.id,
          productName: productName.slice(0, 200),
          quantity,
          unit: product?.unit ?? (UNITS.includes(String(body.unit)) ? String(body.unit) : 'piece'),
          targetPrice: targetPrice ? Math.round(targetPrice) : null,
          deadline: dateOrNull(body.deadline),
          message: message.slice(0, 3000),
        },
      });
    });
    await this.notifications.notify(
      company.ownerId,
      { type: 'rfq', title: "Yangi narx so'rovi", body: `${u.fullName}: ${rfq.productName} × ${rfq.quantity}`, link: '/seller/rfqs' },
      { email: true },
    );
    return toRfq(rfq);
  }

  @Get()
  @Auth()
  async list(@CurrentUser() u: AuthUser, @Query() query: Record<string, string | undefined>) {
    const where: Prisma.RfqWhereInput =
      u.role === 'admin' ? {} : u.role === 'seller' ? { companyId: u.company?.id ?? '-' } : { buyerId: u.id };
    if (query.status && STATUSES.includes(query.status as RfqStatus)) where.status = query.status as RfqStatus;
    const { page, pageSize } = pageParams(query, 10);
    const total = await this.prisma.rfq.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.rfq.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize });
    return { items: items.map(toRfq), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  @Post(':id/respond')
  @Auth('seller')
  @HttpCode(200)
  async respond(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const r = await this.prisma.rfq.findFirst({ where: { id, companyId: u.company?.id ?? '-' } });
    if (!r) throw notFound('RFQ_NOT_FOUND', 'RFQ not found');
    if (r.status !== 'open' && r.status !== 'answered') throw conflict('INVALID_TRANSITION', 'RFQ is closed');
    const unitPrice = Number(body.unitPrice);
    if (!(unitPrice > 0)) validationError({ unitPrice: 'POSITIVE' });
    const validUntil = dateOrNull(body.validUntil);
    const updated = await this.prisma.rfq.update({
      where: { id },
      data: {
        status: 'answered',
        responsePrice: Math.round(unitPrice),
        responseMessage: String(body.message ?? '').slice(0, 3000),
        responseValidTo: validUntil,
        respondedAt: new Date(),
      },
    });
    await this.notifications.notify(
      r.buyerId,
      { type: 'rfq', title: 'Narx taklifi keldi', body: `${r.companyName}: ${r.number}`, link: '/account/rfqs' },
      { email: true },
    );
    return toRfq(updated);
  }

  @Post(':id/:decision')
  @Auth()
  @HttpCode(200)
  async decide(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('decision') decision: string) {
    const r = await this.prisma.rfq.findUnique({ where: { id }, include: { company: { select: { ownerId: true } } } });
    if (!r) throw notFound('RFQ_NOT_FOUND', 'RFQ not found');
    let status: RfqStatus;
    if (decision === 'close') {
      const isSeller = u.role === 'seller' && r.companyId === u.company?.id;
      if (r.buyerId !== u.id && !isSeller) throw forbidden();
      if (r.status === 'accepted' || r.status === 'closed' || r.status === 'rejected') throw conflict('INVALID_TRANSITION', 'RFQ is already closed');
      status = isSeller ? 'rejected' : 'closed';
    } else if (decision === 'accept' || decision === 'reject') {
      if (r.buyerId !== u.id) throw forbidden();
      if (r.status !== 'answered') throw conflict('INVALID_TRANSITION', 'No offer to decide on');
      status = decision === 'accept' ? 'accepted' : 'rejected';
    } else {
      throw new ApiError(404, 'NOT_FOUND', 'Unknown action');
    }
    const updated = await this.prisma.rfq.update({ where: { id }, data: { status } });
    const buyerActed = r.buyerId === u.id;
    await this.notifications.notify(buyerActed ? r.company.ownerId : r.buyerId, {
      type: 'rfq',
      title: `${r.number}: ${status}`,
      body: r.productName,
      link: buyerActed ? '/seller/rfqs' : '/account/rfqs',
    });
    return toRfq(updated);
  }
}
