import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type Order, type OrderStatus, type PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.decorators';
import { ApiError, conflict, forbidden, notFound, validationError } from '../common/errors';
import { getRoute, inUzbekistan, pointAlong, progressOnPath, type RouteGeometry } from '../common/geo';
import { courierAvailable, deliveryFee, DELIVERY, unitPriceFor, type PriceTier } from '../common/pricing';
import { ORDER_INCLUDE, toOrder, type Address, type CourierLocation, type OrderFull } from '../common/serialize';
import { json, pageMeta, pageParams, searchWords } from '../common/util';
import { parse, zAddress } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../shared/notifications.service';
import { RealtimeGateway } from '../shared/realtime.gateway';
import { popularity } from '../catalog/product.util';

const checkoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number({ error: 'POSITIVE' }).int('POSITIVE').positive('POSITIVE') }))
    .max(100),
  deliveryType: z.enum(['courier', 'pickup'], { error: 'REQUIRED' }),
  address: zAddress.optional().nullable(),
  paymentMethod: z.enum(['card', 'cash', 'transfer'], { error: 'REQUIRED' }),
  note: z.string().max(1000).optional().nullable(),
});

const SELLER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['confirmed'],
  confirmed: ['ready'],
  ready: ['delivered'], // pickup handover only
};
const COURIER_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ready: ['in_transit'],
  in_transit: ['delivered'],
};
const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'ready', 'in_transit', 'delivered', 'cancelled'];
export const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: 'kutilmoqda',
  confirmed: 'tasdiqlandi',
  ready: "jo'natishga tayyor",
  in_transit: "yo'lda",
  delivered: 'yetkazildi',
  cancelled: 'bekor qilindi',
};
const SMS_STATUSES: OrderStatus[] = ['confirmed', 'in_transit', 'delivered', 'cancelled'];

/** A GPS fix older than this is stale; the tracking endpoint then simulates progress. */
const GPS_FRESH_MS = 90_000;
/** Card orders left unpaid this long are cancelled and their stock released. */
export const UNPAID_CARD_TTL_MS = 30 * 60000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /* ---------- helpers ---------- */

  async find(idOrNumber: string): Promise<OrderFull> {
    const o = await this.prisma.order.findFirst({ where: { OR: [{ id: idOrNumber }, { number: idOrNumber }] }, include: ORDER_INCLUDE });
    if (!o) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    return o;
  }

  canSee(u: AuthUser, o: Order) {
    return (
      u.role === 'admin' ||
      o.buyerId === u.id ||
      (u.role === 'seller' && o.companyId === u.company?.id) ||
      (u.role === 'courier' && (o.courierId === u.id || (!o.courierId && o.status === 'ready' && o.deliveryType === 'courier')))
    );
  }

  async findVisible(u: AuthUser, id: string) {
    const o = await this.find(id);
    if (!this.canSee(u, o)) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    return o;
  }

  private async ownerOf(companyId: string) {
    const c = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { ownerId: true } });
    return c.ownerId;
  }

  /** Tells every party of the order to refetch it. */
  async broadcast(orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { company: { select: { ownerId: true } } } });
    if (!o) return;
    const payload = { id: o.id, number: o.number, status: o.status, paymentStatus: o.paymentStatus };
    for (const userId of new Set([o.buyerId, o.company.ownerId, o.courierId].filter(Boolean) as string[])) this.realtime.toUser(userId, 'order:updated', payload);
    this.realtime.toOrder(o.id, 'order:updated', payload);
  }

  private async nextNumber(tx: Prisma.TransactionClient, name: 'order' | 'rfq', base: number) {
    const c = await tx.counter.upsert({ where: { name }, create: { name, value: base + 1 }, update: { value: { increment: 1 } } });
    return c.value;
  }

  /** Releases stock reserved by an order (cancel / failed payment). */
  private async restock(tx: Prisma.TransactionClient, o: OrderFull) {
    for (const it of o.items) {
      const p = await tx.product.findUnique({ where: { id: it.productId }, select: { soldCount: true, views: true } });
      if (!p) continue;
      const sold = Math.max(0, p.soldCount - it.quantity);
      await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.quantity }, soldCount: sold, popularity: popularity(sold, p.views) } });
    }
  }

  /* ---------- checkout ---------- */

  async checkout(u: AuthUser, body: unknown) {
    const p = parse(checkoutSchema, body);
    if (!p.items.length) throw new ApiError(400, 'CART_EMPTY', 'Cart is empty');
    if (p.deliveryType === 'courier' && !p.address) validationError({ address: 'REQUIRED' });
    if (p.address && !inUzbekistan(p.address)) validationError({ address: 'OUTSIDE_SERVICE_AREA' });

    // merge duplicate lines
    const qty = new Map<string, number>();
    for (const it of p.items) qty.set(it.productId, (qty.get(it.productId) ?? 0) + it.quantity);

    const products = await this.prisma.product.findMany({ where: { id: { in: [...qty.keys()] }, status: 'active' }, include: { company: true } });
    const byId = new Map(products.map((x) => [x.id, x]));
    const groups = new Map<string, { product: (typeof products)[number]; quantity: number }[]>();
    for (const [productId, quantity] of qty) {
      const product = byId.get(productId);
      if (!product) throw conflict('PRODUCT_UNAVAILABLE', `Product ${productId} unavailable`);
      if (quantity < product.moq) throw conflict('BELOW_MOQ', `${product.name}: min ${product.moq}`);
      if (quantity > product.stock) throw conflict('OUT_OF_STOCK', `${product.name}: only ${product.stock} left`);
      const list = groups.get(product.companyId) ?? [];
      list.push({ product, quantity });
      groups.set(product.companyId, list);
    }

    // Road route per seller warehouse (OSRM; straight-line estimate if unreachable).
    const routes = new Map<string, RouteGeometry>();
    if (p.deliveryType === 'courier' && p.address) {
      for (const [companyId, lines] of groups) {
        const company = lines[0].product.company;
        const r = await getRoute(json<Address>(company.pickupPoint, { lat: 0, lng: 0, text: '' }), p.address);
        if (!courierAvailable(r.distanceKm)) throw conflict('DELIVERY_OUT_OF_RANGE', `${company.name}: ${r.distanceKm} km > ${DELIVERY.maxKm} km`);
        routes.set(companyId, r);
      }
    }

    const address = p.deliveryType === 'courier' ? (p.address ?? undefined) : undefined;
    const created = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const [companyId, lines] of groups) {
        const company = lines[0].product.company;
        const items = [];
        for (const { product, quantity } of lines) {
          // atomic reservation — fails if someone bought the stock meanwhile
          const res = await tx.product.updateMany({
            where: { id: product.id, status: 'active', stock: { gte: quantity } },
            data: { stock: { decrement: quantity }, soldCount: { increment: quantity }, popularity: { increment: quantity * 3 } },
          });
          if (res.count !== 1) throw conflict('OUT_OF_STOCK', `${product.name}: not enough stock`);
          const unitPrice = unitPriceFor({ price: product.price, discount: product.discount, tiers: json<PriceTier[]>(product.tiers, []) }, quantity);
          items.push({
            productId: product.id,
            name: product.name,
            image: json<string[]>(product.images, [])[0] ?? null,
            categorySlug: product.categorySlug,
            unit: product.unit,
            unitPrice,
            quantity,
            total: unitPrice * quantity,
          });
        }
        const subtotal = items.reduce((s, i) => s + i.total, 0);
        const route = routes.get(companyId);
        const fee = route ? deliveryFee(subtotal, route.distanceKm) : 0;
        const number = await this.nextNumber(tx, 'order', 1000);
        const order = await tx.order.create({
          data: {
            number: `B2B-${number}`,
            buyerId: u.id,
            buyerName: u.fullName,
            buyerPhone: u.phone,
            buyerOrganization: u.organization,
            companyId,
            companyName: company.name,
            subtotal,
            deliveryFee: fee,
            total: subtotal + fee,
            paymentMethod: p.paymentMethod,
            // card orders become "paid" only when Payme/Click confirms the transaction
            paymentStatus: 'unpaid',
            deliveryType: p.deliveryType,
            deliveryAddress: address ? (address as object) : Prisma.DbNull,
            pickupPoint: company.pickupPoint as object,
            distanceKm: route?.distanceKm,
            durationMin: route?.durationMin,
            routeSource: route?.source,
            routeGeometry: route ? (route as object) : Prisma.DbNull,
            note: p.note?.trim() || null,
            items: { create: items },
            events: { create: { status: 'pending', by: u.fullName } },
          },
        });
        await tx.company.update({ where: { id: companyId }, data: { ordersCount: { increment: 1 } } });
        ids.push(order.id);
      }

      if (address) {
        const saved = json<Address[]>(u.addresses, []);
        if (!saved.some((a) => a.text === address.text)) {
          await tx.user.update({ where: { id: u.id }, data: { addresses: [{ ...address, label: address.label || 'Manzil' }, ...saved].slice(0, 5) as object[] } });
        }
      }
      return tx.order.findMany({ where: { id: { in: ids } }, include: ORDER_INCLUDE, orderBy: { number: 'asc' } });
    });

    // Card orders are announced to sellers once paid (see PaymentsService).
    if (p.paymentMethod !== 'card') for (const o of created) await this.announceToSeller(o);
    await this.notifications.notify(u.id, {
      type: 'order',
      title: 'Buyurtma qabul qilindi',
      body:
        p.paymentMethod === 'card'
          ? `${created.map((o) => o.number).join(', ')} — to'lovni yakunlang.`
          : `${created.map((o) => o.number).join(', ')} — sotuvchi tasdiqlashini kuting.`,
      link: '/account/orders',
    });
    return created.map(toOrder);
  }

  async announceToSeller(o: Order & { items: unknown[] }) {
    await this.notifications.notify(
      await this.ownerOf(o.companyId),
      { type: 'order', title: 'Yangi buyurtma', body: `${o.number} — ${o.buyerName} (${o.items.length} ta mahsulot)`, link: `/seller/orders/${o.id}` },
      { email: true },
    );
    await this.broadcast(o.id);
  }

  /* ---------- queries ---------- */

  async list(u: AuthUser, query: Record<string, string | undefined>) {
    const and: Prisma.OrderWhereInput[] = [];
    if (u.role === 'seller') and.push({ companyId: u.company?.id ?? '-' });
    else if (u.role === 'courier') and.push({ courierId: u.id });
    else if (u.role === 'buyer') and.push({ buyerId: u.id });
    if (query.status === 'active') and.push({ status: { notIn: ['delivered', 'cancelled'] } });
    else if (query.status && STATUSES.includes(query.status as OrderStatus)) and.push({ status: query.status as OrderStatus });
    for (const w of searchWords(query.q ?? '')) {
      and.push({ OR: [{ number: { contains: w } }, { buyerName: { contains: w } }, { companyName: { contains: w } }, { items: { some: { name: { contains: w } } } }] });
    }
    const where = { AND: and };
    const { page, pageSize } = pageParams(query, 10);
    const total = await this.prisma.order.count({ where });
    const m = pageMeta(total, page, pageSize);
    const items = await this.prisma.order.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: m.skip, take: pageSize, include: ORDER_INCLUDE });
    return { items: items.map(toOrder), total, page: m.page, pageSize, totalPages: m.totalPages };
  }

  /* ---------- transitions ---------- */

  /** Moves the order only if nobody changed its status meanwhile. */
  private async transition(o: Order, next: OrderStatus, by: string, note?: string, extra: Prisma.OrderUpdateManyMutationInput = {}) {
    const res = await this.prisma.order.updateMany({ where: { id: o.id, status: o.status }, data: { status: next, ...extra } });
    if (res.count !== 1) throw conflict('INVALID_TRANSITION', 'Order status changed meanwhile');
    await this.prisma.orderEvent.create({ data: { orderId: o.id, status: next, by, note: note?.trim().slice(0, 300) || null } });
  }

  async cancel(u: AuthUser, id: string, reasonRaw?: unknown) {
    const o = await this.find(id);
    const isBuyer = o.buyerId === u.id;
    const isSeller = u.role === 'seller' && o.companyId === u.company?.id;
    if (!isBuyer && !isSeller && u.role !== 'admin') throw forbidden();
    const allowed: OrderStatus[] = isBuyer ? ['pending'] : ['pending', 'confirmed', 'ready'];
    if (!allowed.includes(o.status)) throw conflict('INVALID_TRANSITION', 'Order cannot be cancelled now');
    const reason = String(reasonRaw ?? '').trim().slice(0, 300) || undefined;
    await this.cancelInternal(o, u.fullName, reason);

    const owner = await this.ownerOf(o.companyId);
    const target = isBuyer ? owner : o.buyerId;
    await this.notifications.notify(
      target,
      { type: 'order', title: 'Buyurtma bekor qilindi', body: `${o.number}${reason ? ': ' + reason : ''}`, link: isBuyer ? `/seller/orders/${o.id}` : `/account/orders/${o.id}` },
      { email: true, sms: isBuyer ? undefined : `B2B Bozor: ${o.number} buyurtmangiz bekor qilindi.` },
    );
    return toOrder(await this.find(o.id));
  }

  /** Shared by manual cancel, unpaid-order expiry and refunds. */
  async cancelInternal(o: OrderFull, by: string, reason?: string) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: o.id, status: o.status },
        data: { status: 'cancelled', cancelReason: reason ?? null, ...(o.paymentStatus === 'paid' ? { paymentStatus: 'refunded' } : {}) },
      });
      if (res.count !== 1) throw conflict('INVALID_TRANSITION', 'Order status changed meanwhile');
      await tx.orderEvent.create({ data: { orderId: o.id, status: 'cancelled', by, note: reason ?? null } });
      await this.restock(tx, o);
    });
    await this.broadcast(o.id);
  }

  async setStatus(u: AuthUser, id: string, nextRaw: unknown, note?: unknown) {
    const o = await this.find(id);
    const next = String(nextRaw) as OrderStatus;
    if (!STATUSES.includes(next) || next === o.status) throw conflict('INVALID_TRANSITION', 'Invalid status change');
    if (u.role === 'seller') {
      if (o.companyId !== u.company?.id) throw forbidden();
      if (!SELLER_TRANSITIONS[o.status]?.includes(next)) throw conflict('INVALID_TRANSITION', 'Invalid status change');
      if (next === 'delivered' && o.deliveryType !== 'pickup') throw conflict('INVALID_TRANSITION', 'Courier must deliver this order');
      if (next === 'confirmed' && o.paymentMethod === 'card' && o.paymentStatus !== 'paid') throw conflict('PAYMENT_PENDING', 'Waiting for card payment');
    } else if (u.role === 'courier') {
      if (o.courierId !== u.id) throw forbidden();
      if (!COURIER_TRANSITIONS[o.status]?.includes(next)) throw conflict('INVALID_TRANSITION', 'Invalid status change');
    } else if (next === 'cancelled') {
      return this.cancel(u, id, note);
    }

    await this.transition(o, next, u.fullName, typeof note === 'string' ? note : undefined, next === 'delivered' ? { paymentStatus: 'paid' } : {});
    if (next === 'delivered' && o.courierId) {
      await this.prisma.user.update({ where: { id: o.courierId }, data: { courierDeliveries: { increment: 1 } } });
    }

    await this.notifications.notify(
      o.buyerId,
      { type: 'order', title: `Buyurtma ${STATUS_TEXT[next]}`, body: `${o.number} — ${o.companyName}`, link: `/account/orders/${o.id}` },
      { email: true, sms: SMS_STATUSES.includes(next) ? `B2B Bozor: ${o.number} buyurtmangiz ${STATUS_TEXT[next]}.` : undefined },
    );
    if (u.role === 'courier') {
      await this.notifications.notify(await this.ownerOf(o.companyId), {
        type: 'order',
        title: `Buyurtma ${STATUS_TEXT[next]}`,
        body: `${o.number} — kuryer ${u.fullName}`,
        link: `/seller/orders/${o.id}`,
      });
    }
    if (next === 'ready' && o.deliveryType === 'courier') {
      const couriers = await this.prisma.user.findMany({ where: { role: 'courier', status: 'active' }, select: { id: true } });
      await this.notifications.notifyMany(
        couriers.map((c) => c.id),
        { type: 'order', title: 'Yangi yetkazish', body: `${o.number}: ${o.distanceKm ?? '—'} km`, link: '/courier/available' },
      );
    }
    await this.broadcast(o.id);
    return toOrder(await this.find(o.id));
  }

  async markPaid(u: AuthUser, id: string) {
    const o = await this.find(id);
    if (u.role === 'seller' && o.companyId !== u.company?.id) throw forbidden();
    if (o.status === 'cancelled') throw conflict('INVALID_TRANSITION', 'Order is cancelled');
    await this.prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'paid' } });
    await this.broadcast(o.id);
    return toOrder(await this.find(o.id));
  }

  async assign(u: AuthUser, id: string) {
    const o = await this.find(id);
    if (o.courierId) throw conflict('ALREADY_ASSIGNED', 'Another courier already took this order');
    if (o.status !== 'ready' || o.deliveryType !== 'courier') throw conflict('INVALID_TRANSITION', 'Order is not ready');
    const active = await this.prisma.order.count({ where: { courierId: u.id, status: { in: ['ready', 'in_transit'] } } });
    if (active >= 5) throw conflict('TOO_MANY_ACTIVE', 'Finish current deliveries first');

    const res = await this.prisma.order.updateMany({
      where: { id: o.id, courierId: null, status: 'ready' },
      data: {
        courierId: u.id,
        courierName: u.fullName,
        courierPhone: u.phone,
        courierFee: Math.round((o.deliveryFee || DELIVERY.baseFee) * DELIVERY.courierShare),
        ...(u.courierLocation ? { courierLocation: u.courierLocation as object } : {}),
      },
    });
    if (res.count !== 1) throw conflict('ALREADY_ASSIGNED', 'Another courier already took this order');
    await this.prisma.orderEvent.create({ data: { orderId: o.id, status: 'ready', by: u.fullName, note: 'Kuryer biriktirildi' } });
    await this.notifications.notify(
      o.buyerId,
      { type: 'order', title: 'Kuryer biriktirildi', body: `${o.number}: ${u.fullName}, ${u.phone}`, link: `/account/orders/${o.id}` },
      { sms: `B2B Bozor: ${o.number} buyurtmangizga kuryer biriktirildi: ${u.fullName}, ${u.phone}` },
    );
    await this.broadcast(o.id);
    return toOrder(await this.find(o.id));
  }

  /* ---------- live tracking ---------- */

  async updateCourierLocation(u: AuthUser, body: Record<string, unknown>) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) validationError({ lat: 'REQUIRED' });
    const opt = (v: unknown) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const loc: CourierLocation = { lat, lng, at: new Date().toISOString() };
    const accuracy = opt(body.accuracy);
    const heading = opt(body.heading);
    const speed = opt(body.speed);
    if (accuracy !== undefined) loc.accuracy = Math.round(accuracy);
    if (heading !== undefined) loc.heading = heading;
    if (speed !== undefined) loc.speed = speed;

    await this.prisma.user.update({ where: { id: u.id }, data: { courierLocation: loc as object } });
    const active = await this.prisma.order.findMany({
      where: { courierId: u.id, status: { in: ['ready', 'in_transit'] } },
      select: { id: true, buyerId: true, company: { select: { ownerId: true } } },
    });
    if (active.length) {
      await this.prisma.order.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { courierLocation: loc as object } });
      for (const a of active) {
        const payload = { orderId: a.id, ...loc };
        this.realtime.toOrder(a.id, 'order:location', payload);
        this.realtime.toUser(a.buyerId, 'order:location', payload);
        this.realtime.toUser(a.company.ownerId, 'order:location', payload);
      }
    }
    return { ok: true, activeOrders: active.length };
  }

  private async orderRoute(o: Order): Promise<RouteGeometry | undefined> {
    const address = json<Address | null>(o.deliveryAddress, null);
    if (!address) return undefined;
    const cached = json<RouteGeometry | null>(o.routeGeometry, null);
    if (cached && cached.source === 'osrm' && cached.geometry?.length) return cached;
    const r = await getRoute(json<Address>(o.pickupPoint, { lat: 0, lng: 0, text: '' }), address);
    await this.prisma.order.update({
      where: { id: o.id },
      data: {
        routeGeometry: r as object,
        ...(r.source === 'osrm' ? { distanceKm: r.distanceKm, durationMin: r.durationMin, routeSource: 'osrm' } : {}),
      },
    });
    return r;
  }

  async tracking(u: AuthUser, id: string) {
    const o = await this.findVisible(u, id);
    const route = o.deliveryType === 'courier' ? await this.orderRoute(o) : undefined;
    const result: Record<string, unknown> = { orderId: o.id, status: o.status };
    if (route) result.route = route;
    if (!route) return result;

    const loc = json<CourierLocation | null>(o.courierLocation, null);
    const gps = loc && Date.now() - new Date(loc.at).getTime() < GPS_FRESH_MS ? loc : undefined;
    const speedKmPerMin = route.durationMin ? route.distanceKm / route.durationMin : 0.45;

    if (o.status === 'in_transit') {
      let remainingKm: number;
      if (gps) {
        const pr = progressOnPath(route.geometry, gps);
        result.courier = { ...gps, source: 'gps' };
        remainingKm = Math.round(pr.remainingKm * 10) / 10;
        result.progress = pr.progress;
      } else {
        // No fresh GPS (courier app closed): estimate position along the road since pickup.
        const startedAt = [...o.events].reverse().find((e) => e.status === 'in_transit')?.at ?? o.updatedAt;
        const elapsedMin = (Date.now() - startedAt.getTime()) / 60000;
        const fraction = Math.min(0.97, Math.max(0, elapsedMin / Math.max(1, route.durationMin)));
        const { point, heading } = pointAlong(route.geometry, fraction);
        result.courier = { ...point, heading, at: new Date().toISOString(), source: 'simulated' };
        remainingKm = Math.round(route.distanceKm * (1 - fraction) * 10) / 10;
        result.progress = fraction;
      }
      result.remainingKm = remainingKm;
      result.etaMin = Math.max(1, Math.round(remainingKm / speedKmPerMin));
    } else if (o.status === 'ready' && o.courierId && gps) {
      result.courier = { ...gps, source: 'gps' };
    } else if (o.status === 'delivered') {
      result.progress = 1;
      result.remainingKm = 0;
    }
    return result;
  }

  /* ---------- payments ---------- */

  /** Called by PaymentsService when Payme/Click confirms money for these orders. */
  async markOrdersPaid(orderIds: string[]) {
    const orders = await this.prisma.order.findMany({ where: { id: { in: orderIds } }, include: ORDER_INCLUDE });
    await this.prisma.order.updateMany({ where: { id: { in: orderIds }, paymentStatus: 'unpaid' }, data: { paymentStatus: 'paid' } });
    for (const o of orders) {
      if (o.paymentStatus === 'paid') continue;
      if (o.paymentMethod === 'card') await this.announceToSeller(o);
      else await this.broadcast(o.id);
    }
    if (orders[0]) {
      await this.notifications.notify(orders[0].buyerId, {
        type: 'order',
        title: "To'lov qabul qilindi",
        body: `${orders.map((o) => o.number).join(', ')} — sotuvchi tasdiqlashini kuting.`,
        link: '/account/orders',
      });
    }
  }

  /** Refund after a performed transaction was cancelled by the provider. */
  async refundOrders(orderIds: string[], by: string) {
    const orders = await this.prisma.order.findMany({ where: { id: { in: orderIds } }, include: ORDER_INCLUDE });
    for (const o of orders) {
      if (['pending', 'confirmed', 'ready'].includes(o.status)) {
        await this.cancelInternal({ ...o, paymentStatus: 'paid' }, by, "To'lov qaytarildi");
      } else {
        await this.prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'refunded' } });
        await this.broadcast(o.id);
      }
      await this.notifications.notify(o.buyerId, { type: 'order', title: "To'lov qaytarildi", body: o.number, link: `/account/orders/${o.id}` }, { email: true });
    }
  }

  /** Unpaid card orders are cancelled after 30 minutes so reserved stock is released. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireUnpaidCardOrders() {
    const cutoff = new Date(Date.now() - UNPAID_CARD_TTL_MS);
    const stale = await this.prisma.order.findMany({
      where: { paymentMethod: 'card' as PaymentMethod, paymentStatus: 'unpaid', status: 'pending', createdAt: { lt: cutoff } },
      include: ORDER_INCLUDE,
      take: 100,
    });
    for (const o of stale) {
      // keep orders whose Payme/Click transaction is in progress
      const busy = await this.prisma.payment.findFirst({ where: { status: 'pending', updatedAt: { gt: cutoff }, orderIds: { array_contains: o.id } } });
      if (busy) continue;
      try {
        await this.cancelInternal(o, 'Tizim', "To'lov o'z vaqtida amalga oshirilmadi");
        await this.notifications.notify(o.buyerId, {
          type: 'order',
          title: 'Buyurtma bekor qilindi',
          body: `${o.number}: to'lov 30 daqiqa ichida amalga oshirilmadi.`,
          link: `/account/orders/${o.id}`,
        });
      } catch (err) {
        this.logger.warn(`expire ${o.number}: ${(err as Error).message}`);
      }
    }
  }

}
