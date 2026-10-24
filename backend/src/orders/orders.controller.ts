import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { validationError } from '../common/errors';
import { ORDER_INCLUDE, toOrder, type ScheduleDay } from '../common/serialize';
import { daySeries, json, round1, within } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  @Auth('buyer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  checkout(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.orders.checkout(u, body);
  }

  @Get()
  @Auth()
  list(@CurrentUser() u: AuthUser, @Query() query: Record<string, string | undefined>) {
    return this.orders.list(u, query);
  }

  @Get(':id')
  @Auth()
  async get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return toOrder(await this.orders.findVisible(u, id));
  }

  @Post(':id/cancel')
  @Auth()
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { reason?: unknown }) {
    return this.orders.cancel(u, id, body?.reason);
  }

  @Post(':id/status')
  @Auth('seller', 'courier', 'admin')
  @HttpCode(200)
  status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { status?: unknown; note?: unknown }) {
    return this.orders.setStatus(u, id, body?.status, body?.note);
  }

  @Post(':id/mark-paid')
  @Auth('seller', 'admin')
  @HttpCode(200)
  markPaid(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.markPaid(u, id);
  }

  @Post(':id/assign')
  @Auth('courier')
  @HttpCode(200)
  assign(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.assign(u, id);
  }

  @Get(':id/tracking')
  @Auth()
  tracking(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.orders.tracking(u, id);
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

@ApiTags('courier')
@Controller('courier')
@Auth('courier')
export class CourierController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get('available')
  async available() {
    const items = await this.prisma.order.findMany({
      where: { status: 'ready', deliveryType: 'courier', courierId: null },
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
      take: 100,
    });
    return items.map(toOrder);
  }

  @Post('location')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  location(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    return this.orders.updateCourierLocation(u, body ?? {});
  }

  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const [mine, available] = await Promise.all([
      this.prisma.order.findMany({ where: { courierId: u.id }, include: { events: { where: { status: 'delivered' }, take: 1 } } }),
      this.prisma.order.count({ where: { status: 'ready', deliveryType: 'courier', courierId: null } }),
    ]);
    const delivered = mine.filter((o) => o.status === 'delivered');
    const deliveredAt = (o: (typeof mine)[number]) => o.events[0]?.at ?? o.updatedAt;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      earnings: delivered.filter((o) => within(deliveredAt(o), 30)).reduce((s, o) => s + (o.courierFee ?? 0), 0),
      earningsToday: delivered.filter((o) => deliveredAt(o) >= today).reduce((s, o) => s + (o.courierFee ?? 0), 0),
      delivered: delivered.length,
      active: mine.filter((o) => o.status === 'ready' || o.status === 'in_transit').length,
      available,
      rating: u.courierRating ?? 5,
      avgDistanceKm: delivered.length ? round1(delivered.reduce((s, o) => s + (o.distanceKm ?? 0), 0) / delivered.length) : 0,
      earningsSeries: daySeries(
        30,
        delivered.map((o) => ({ at: deliveredAt(o), value: o.courierFee ?? 0 })),
      ),
    };
  }

  @Get('schedule')
  schedule(@CurrentUser() u: AuthUser) {
    return json<ScheduleDay[]>(u.courierSchedule, []);
  }

  @Put('schedule')
  async saveSchedule(@CurrentUser() u: AuthUser, @Body() body: { days?: unknown }) {
    if (!Array.isArray(body?.days) || body.days.length > 7) validationError({ days: 'REQUIRED' });
    const days: ScheduleDay[] = [];
    for (const raw of body.days as Record<string, unknown>[]) {
      const d = { day: Number(raw.day), active: Boolean(raw.active), from: String(raw.from ?? ''), to: String(raw.to ?? '') };
      if (!Number.isInteger(d.day) || d.day < 0 || d.day > 6 || !TIME_RE.test(d.from) || !TIME_RE.test(d.to)) validationError({ [`day${raw.day}`]: 'INVALID_RANGE' });
      if (d.active && d.from >= d.to) validationError({ [`day${d.day}`]: 'INVALID_RANGE' });
      days.push(d);
    }
    await this.prisma.user.update({ where: { id: u.id }, data: { courierSchedule: days as object[] } });
    return days;
  }
}
