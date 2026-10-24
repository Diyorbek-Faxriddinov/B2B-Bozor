import { Injectable, Logger } from '@nestjs/common';
import type { Payment, PaymentProvider, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../auth/auth.decorators';
import { env } from '../config/env';
import { ApiError, conflict, notFound, validationError } from '../common/errors';
import { ORDER_INCLUDE, toOrder } from '../common/serialize';
import { json } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

export type Mode = 'live' | 'test' | 'simulator';

/* ======================================================================
   Payme Merchant API (JSON-RPC 2.0) — https://developer.help.paycom.uz
   ====================================================================== */
const PAYME_TIMEOUT_MS = 43_200_000; // 12 h — unperformed transactions expire
const msg = (uz: string, ru: string, en: string) => ({ uz, ru, en });
export const PaymeErrors = {
  parse: { code: -32700, message: msg("So'rovni o'qib bo'lmadi", 'Ошибка разбора запроса', 'Parse error') },
  invalidRequest: { code: -32600, message: msg("Noto'g'ri so'rov", 'Неверный запрос', 'Invalid request') },
  method: { code: -32601, message: msg('Metod topilmadi', 'Метод не найден', 'Method not found') },
  auth: { code: -32504, message: msg("Ruxsat yo'q", 'Недостаточно привилегий', 'Insufficient privileges') },
  amount: { code: -31001, message: msg("Summa noto'g'ri", 'Неверная сумма', 'Incorrect amount') },
  notFound: { code: -31003, message: msg('Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found') },
  cannotCancel: { code: -31007, message: msg("Buyurtma yetkazilgan, bekor qilib bo'lmaydi", 'Заказ выполнен, отмена невозможна', 'Order fulfilled, cannot cancel') },
  cannotPerform: { code: -31008, message: msg("Amalni bajarib bo'lmaydi", 'Невозможно выполнить операцию', 'Unable to perform operation') },
  account: { code: -31050, message: msg("To'lov topilmadi yoki to'lab bo'lmaydi", 'Платёж не найден или недоступен для оплаты', 'Payment not found or not payable'), data: 'payment_id' },
  busy: { code: -31099, message: msg("To'lov boshqa tranzaksiyada qayta ishlanmoqda", 'Платёж обрабатывается другой транзакцией', 'Payment is being processed by another transaction'), data: 'payment_id' },
};
type PaymeError = { code: number; message: Record<string, string>; data?: string };
class PaymeFault extends Error {
  constructor(public readonly error: PaymeError) {
    super(error.message.en);
  }
}

/* ======================================================================
   Click SHOP API (prepare / complete) — https://docs.click.uz
   ====================================================================== */
export const ClickErrors = {
  ok: [0, 'Success'],
  sign: [-1, 'SIGN CHECK FAILED!'],
  amount: [-2, 'Incorrect parameter amount'],
  action: [-3, 'Action not found'],
  paid: [-4, 'Already paid'],
  order: [-5, 'User does not exist'],
  transaction: [-6, 'Transaction does not exist'],
  update: [-7, 'Failed to update user'],
  request: [-8, 'Error in request from click'],
  cancelled: [-9, 'Transaction cancelled'],
} as const;

export const md5 = (s: string) => createHash('md5').update(s).digest('hex');

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  /** Keys used by the local simulator when no merchant credentials are configured. */
  private readonly simPaymeKey = randomBytes(16).toString('hex');
  private readonly simClickSecret = randomBytes(16).toString('hex');

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /* ---------- configuration ---------- */

  get paymeMode(): Mode {
    const e = env();
    if (!e.PAYME_MERCHANT_ID) return 'simulator';
    if (e.PAYME_TEST_MODE) return e.PAYME_TEST_KEY ? 'test' : 'simulator';
    return e.PAYME_KEY ? 'live' : 'simulator';
  }

  get clickMode(): Mode {
    const e = env();
    return e.CLICK_SERVICE_ID && e.CLICK_MERCHANT_ID && e.CLICK_SECRET_KEY ? 'live' : 'simulator';
  }

  paymeKey() {
    const e = env();
    if (this.paymeMode === 'simulator') return this.simPaymeKey;
    return (e.PAYME_TEST_MODE ? e.PAYME_TEST_KEY : e.PAYME_KEY)!;
  }

  clickSecret() {
    return this.clickMode === 'simulator' ? this.simClickSecret : env().CLICK_SECRET_KEY!;
  }

  clickServiceId() {
    return this.clickMode === 'simulator' ? '0' : env().CLICK_SERVICE_ID!;
  }

  simulatorEnabled(provider: PaymentProvider) {
    const mode = provider === 'payme' ? this.paymeMode : this.clickMode;
    return mode === 'simulator' && env().NODE_ENV !== 'production';
  }

  /* ---------- buyer-facing ---------- */

  private async payableOrders(orderIds: string[], userId?: string) {
    const orders = await this.prisma.order.findMany({ where: { id: { in: orderIds } } });
    const ok =
      orders.length === orderIds.length &&
      orders.every(
        (o) => (!userId || o.buyerId === userId) && o.paymentMethod === 'card' && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && o.status !== 'delivered',
      );
    return { orders, ok };
  }

  async create(u: AuthUser, body: Record<string, unknown>) {
    const provider = body.provider as PaymentProvider;
    if (provider !== 'payme' && provider !== 'click') validationError({ provider: 'REQUIRED' });
    const orderIds = [...new Set(Array.isArray(body.orderIds) ? body.orderIds.map(String) : [])].slice(0, 20);
    if (!orderIds.length) validationError({ orderIds: 'REQUIRED' });
    const { orders, ok } = await this.payableOrders(orderIds, u.id);
    if (!orders.length || orders.some((o) => o.buyerId !== u.id)) throw notFound('ORDER_NOT_FOUND', 'Order not found');
    if (!ok) throw conflict('NOT_PAYABLE', 'Orders are already paid, cancelled or not card orders');

    // previous unfinished attempts for these orders are superseded
    await this.prisma.payment.updateMany({ where: { userId: u.id, status: 'created', orderIds: { array_contains: orderIds[0] } }, data: { status: 'cancelled' } });
    const amount = orders.reduce((s, o) => s + o.total, 0);
    const payment = await this.prisma.payment.create({ data: { userId: u.id, provider, orderIds, amount } });
    return { id: payment.id, provider, amount, status: payment.status, url: this.checkoutUrl(payment) };
  }

  private checkoutUrl(p: Payment) {
    const e = env();
    const returnUrl = `${e.FRONTEND_URL.replace(/\/$/, '')}/checkout/success?payment=${p.id}`;
    if (this.simulatorEnabled(p.provider)) return `${e.APP_URL.replace(/\/$/, '')}/api/v1/payments/simulator/${p.id}`;
    if (p.provider === 'payme') {
      const params = `m=${e.PAYME_MERCHANT_ID};ac.payment_id=${p.id};a=${p.amount * 100};c=${returnUrl};l=uz`;
      const host = e.PAYME_TEST_MODE ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
      return `${host}/${Buffer.from(params).toString('base64')}`;
    }
    const q = new URLSearchParams({
      service_id: e.CLICK_SERVICE_ID!,
      merchant_id: e.CLICK_MERCHANT_ID!,
      amount: String(p.amount),
      transaction_param: p.id,
      return_url: returnUrl,
      ...(e.CLICK_MERCHANT_USER_ID ? { merchant_user_id: e.CLICK_MERCHANT_USER_ID } : {}),
    });
    return `https://my.click.uz/services/pay?${q}`;
  }

  returnUrl(paymentId: string) {
    return `${env().FRONTEND_URL.replace(/\/$/, '')}/checkout/success?payment=${paymentId}`;
  }

  async get(u: AuthUser, id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p || (p.userId !== u.id && u.role !== 'admin')) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    const orders = await this.prisma.order.findMany({ where: { id: { in: json<string[]>(p.orderIds, []) } }, include: ORDER_INCLUDE, orderBy: { number: 'asc' } });
    return { id: p.id, provider: p.provider, amount: p.amount, status: p.status, createdAt: p.createdAt.toISOString(), orders: orders.map(toOrder) };
  }

  async summary(id: string) {
    const p = await this.prisma.payment.findUnique({ where: { id } });
    if (!p) return null;
    const orders = await this.prisma.order.findMany({ where: { id: { in: json<string[]>(p.orderIds, []) } }, select: { number: true, companyName: true, total: true } });
    return { payment: p, orders };
  }

  private async onPaid(p: Payment) {
    await this.orders.markOrdersPaid(json<string[]>(p.orderIds, []));
  }

  /* ---------- Payme ---------- */

  /** Checks the `Authorization: Basic base64("Paycom:<key>")` header. */
  paymeAuthorized(header: string | undefined) {
    if (!header?.startsWith('Basic ')) return false;
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    const i = decoded.indexOf(':');
    return i > 0 && decoded.slice(i + 1) === this.paymeKey();
  }

  async payme(body: unknown, authHeader: string | undefined) {
    const rpc = (body ?? {}) as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
    const id = rpc.id ?? null;
    if (!this.paymeAuthorized(authHeader)) return { id, error: PaymeErrors.auth };
    if (typeof rpc.method !== 'string' || typeof rpc.params !== 'object' || rpc.params === null) return { id, error: PaymeErrors.invalidRequest };
    try {
      const result = await this.paymeMethod(rpc.method, rpc.params);
      return { id, result };
    } catch (err) {
      if (err instanceof PaymeFault) return { id, error: err.error };
      this.logger.error(`Payme ${rpc.method} failed: ${(err as Error).stack}`);
      return { id, error: { code: -32400, message: msg('Ichki xatolik', 'Системная ошибка', 'Internal error') } };
    }
  }

  private paymeMethod(method: string, params: Record<string, unknown>) {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.paymeCheckPerform(params);
      case 'CreateTransaction':
        return this.paymeCreate(params);
      case 'PerformTransaction':
        return this.paymePerform(params);
      case 'CancelTransaction':
        return this.paymeCancel(params);
      case 'CheckTransaction':
        return this.paymeCheck(params);
      case 'GetStatement':
        return this.paymeStatement(params);
      default:
        throw new PaymeFault(PaymeErrors.method);
    }
  }

  /** Validates account + amount; returns the payment. */
  private async paymeValidate(params: Record<string, unknown>) {
    const account = (params.account ?? {}) as Record<string, unknown>;
    const paymentId = typeof account.payment_id === 'string' ? account.payment_id : '';
    const p = paymentId ? await this.prisma.payment.findUnique({ where: { id: paymentId } }) : null;
    if (!p || p.provider !== 'payme' || p.status === 'paid' || p.status === 'cancelled' || p.status === 'failed') throw new PaymeFault(PaymeErrors.account);
    const { ok } = await this.payableOrders(json<string[]>(p.orderIds, []));
    if (!ok) throw new PaymeFault(PaymeErrors.account);
    if (Number(params.amount) !== p.amount * 100) throw new PaymeFault(PaymeErrors.amount);
    return p;
  }

  private async paymeCheckPerform(params: Record<string, unknown>) {
    await this.paymeValidate(params);
    return { allow: true };
  }

  private byPaymeId(id: unknown) {
    return typeof id === 'string' && id ? this.prisma.payment.findUnique({ where: { provider_externalId: { provider: 'payme', externalId: id } } }) : Promise.resolve(null);
  }

  private async paymeExpire(p: Payment) {
    await this.prisma.payment.updateMany({ where: { id: p.id, state: 1 }, data: { state: -1, reason: 4, cancelTime: BigInt(Date.now()), status: 'cancelled' } });
  }

  private async paymeCreate(params: Record<string, unknown>) {
    const existing = await this.byPaymeId(params.id);
    if (existing) {
      if (existing.state !== 1) throw new PaymeFault(PaymeErrors.cannotPerform);
      if (Date.now() - Number(existing.createTime) > PAYME_TIMEOUT_MS) {
        await this.paymeExpire(existing);
        throw new PaymeFault(PaymeErrors.cannotPerform);
      }
      return { create_time: Number(existing.createTime), transaction: existing.id, state: 1 };
    }
    if (typeof params.id !== 'string' || !params.id) throw new PaymeFault(PaymeErrors.invalidRequest);
    const p = await this.paymeValidate(params);
    if (p.externalId) throw new PaymeFault(p.state === 1 ? PaymeErrors.busy : PaymeErrors.account);
    const createTime = Date.now();
    const res = await this.prisma.payment.updateMany({
      where: { id: p.id, externalId: null },
      data: { externalId: params.id, state: 1, createTime: BigInt(createTime), status: 'pending', meta: { paymeTime: Number(params.time) || createTime } as Prisma.InputJsonValue },
    });
    if (res.count !== 1) throw new PaymeFault(PaymeErrors.busy);
    return { create_time: createTime, transaction: p.id, state: 1 };
  }

  private async paymePerform(params: Record<string, unknown>) {
    const p = await this.byPaymeId(params.id);
    if (!p) throw new PaymeFault(PaymeErrors.notFound);
    if (p.state === 2) return { transaction: p.id, perform_time: Number(p.performTime), state: 2 };
    if (p.state !== 1) throw new PaymeFault(PaymeErrors.cannotPerform);
    if (Date.now() - Number(p.createTime) > PAYME_TIMEOUT_MS) {
      await this.paymeExpire(p);
      throw new PaymeFault(PaymeErrors.cannotPerform);
    }
    const { ok } = await this.payableOrders(json<string[]>(p.orderIds, []));
    if (!ok) throw new PaymeFault(PaymeErrors.cannotPerform);
    const performTime = Date.now();
    const res = await this.prisma.payment.updateMany({ where: { id: p.id, state: 1 }, data: { state: 2, performTime: BigInt(performTime), status: 'paid' } });
    if (res.count !== 1) throw new PaymeFault(PaymeErrors.cannotPerform);
    await this.onPaid(p);
    return { transaction: p.id, perform_time: performTime, state: 2 };
  }

  private async paymeCancel(params: Record<string, unknown>) {
    const p = await this.byPaymeId(params.id);
    if (!p) throw new PaymeFault(PaymeErrors.notFound);
    const reason = Number(params.reason) || null;
    if (p.state === 1) {
      const cancelTime = Date.now();
      await this.prisma.payment.updateMany({ where: { id: p.id, state: 1 }, data: { state: -1, reason, cancelTime: BigInt(cancelTime), status: 'cancelled' } });
      return { transaction: p.id, cancel_time: cancelTime, state: -1 };
    }
    if (p.state === 2) {
      const orders = await this.prisma.order.findMany({ where: { id: { in: json<string[]>(p.orderIds, []) } }, select: { status: true } });
      if (orders.some((o) => o.status === 'delivered')) throw new PaymeFault(PaymeErrors.cannotCancel);
      const cancelTime = Date.now();
      const res = await this.prisma.payment.updateMany({ where: { id: p.id, state: 2 }, data: { state: -2, reason, cancelTime: BigInt(cancelTime), status: 'cancelled' } });
      if (res.count === 1) await this.orders.refundOrders(json<string[]>(p.orderIds, []), 'Payme');
      return { transaction: p.id, cancel_time: cancelTime, state: -2 };
    }
    return { transaction: p.id, cancel_time: Number(p.cancelTime ?? 0), state: p.state };
  }

  private async paymeCheck(params: Record<string, unknown>) {
    const p = await this.byPaymeId(params.id);
    if (!p) throw new PaymeFault(PaymeErrors.notFound);
    return {
      create_time: Number(p.createTime ?? 0),
      perform_time: Number(p.performTime ?? 0),
      cancel_time: Number(p.cancelTime ?? 0),
      transaction: p.id,
      state: p.state,
      reason: p.reason ?? null,
    };
  }

  private async paymeStatement(params: Record<string, unknown>) {
    const from = BigInt(Math.floor(Number(params.from) || 0));
    const to = BigInt(Math.floor(Number(params.to) || 0));
    const rows = await this.prisma.payment.findMany({ where: { provider: 'payme', externalId: { not: null }, createTime: { gte: from, lte: to } }, orderBy: { createTime: 'asc' } });
    return {
      transactions: rows.map((p) => ({
        id: p.externalId,
        time: json<{ paymeTime?: number }>(p.meta, {}).paymeTime ?? Number(p.createTime),
        amount: p.amount * 100,
        account: { payment_id: p.id },
        create_time: Number(p.createTime ?? 0),
        perform_time: Number(p.performTime ?? 0),
        cancel_time: Number(p.cancelTime ?? 0),
        transaction: p.id,
        state: p.state,
        reason: p.reason ?? null,
        receivers: null,
      })),
    };
  }

  /* ---------- Click ---------- */

  private clickReply(params: Record<string, string>, err: readonly [number, string], extra: Record<string, unknown> = {}) {
    return {
      click_trans_id: Number(params.click_trans_id) || 0,
      merchant_trans_id: params.merchant_trans_id ?? '',
      ...extra,
      error: err[0],
      error_note: err[1],
    };
  }

  async clickPrepare(params: Record<string, string>) {
    const sign = md5(`${params.click_trans_id}${params.service_id}${this.clickSecret()}${params.merchant_trans_id}${params.amount}${params.action}${params.sign_time}`);
    if (!params.sign_string || sign !== params.sign_string || params.service_id !== this.clickServiceId()) return this.clickReply(params, ClickErrors.sign);
    if (params.action !== '0') return this.clickReply(params, ClickErrors.action);
    const p = await this.prisma.payment.findUnique({ where: { id: params.merchant_trans_id ?? '' } });
    if (!p || p.provider !== 'click') return this.clickReply(params, ClickErrors.order);
    if (p.status === 'paid') return this.clickReply(params, ClickErrors.paid);
    if (p.status === 'cancelled' || p.status === 'failed') return this.clickReply(params, ClickErrors.cancelled);
    const { ok } = await this.payableOrders(json<string[]>(p.orderIds, []));
    if (!ok) return this.clickReply(params, ClickErrors.cancelled);
    if (Math.abs(Number(params.amount) - p.amount) > 0.01) return this.clickReply(params, ClickErrors.amount);
    if (p.externalId && p.externalId !== params.click_trans_id) return this.clickReply(params, ClickErrors.paid);
    await this.prisma.payment.update({ where: { id: p.id }, data: { externalId: params.click_trans_id, status: 'pending', meta: { prepare: params } as Prisma.InputJsonValue } });
    return this.clickReply(params, ClickErrors.ok, { merchant_prepare_id: p.seq });
  }

  async clickComplete(params: Record<string, string>) {
    const sign = md5(
      `${params.click_trans_id}${params.service_id}${this.clickSecret()}${params.merchant_trans_id}${params.merchant_prepare_id}${params.amount}${params.action}${params.sign_time}`,
    );
    if (!params.sign_string || sign !== params.sign_string || params.service_id !== this.clickServiceId()) return this.clickReply(params, ClickErrors.sign);
    if (params.action !== '1') return this.clickReply(params, ClickErrors.action);
    const p = await this.prisma.payment.findUnique({ where: { id: params.merchant_trans_id ?? '' } });
    if (!p || p.provider !== 'click') return this.clickReply(params, ClickErrors.order);
    if (String(p.seq) !== params.merchant_prepare_id || p.externalId !== params.click_trans_id) return this.clickReply(params, ClickErrors.transaction);
    if (p.status === 'paid') return this.clickReply(params, ClickErrors.paid);
    if (p.status === 'cancelled' || p.status === 'failed') return this.clickReply(params, ClickErrors.cancelled);
    if (Math.abs(Number(params.amount) - p.amount) > 0.01) return this.clickReply(params, ClickErrors.amount);

    if (Number(params.error) < 0) {
      // Click reports the payment failed on its side
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'cancelled' } });
      return this.clickReply(params, ClickErrors.cancelled);
    }
    const { ok } = await this.payableOrders(json<string[]>(p.orderIds, []));
    if (!ok) {
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'cancelled' } });
      return this.clickReply(params, ClickErrors.cancelled);
    }
    const res = await this.prisma.payment.updateMany({ where: { id: p.id, status: 'pending' }, data: { status: 'paid', performTime: BigInt(Date.now()) } });
    if (res.count !== 1) return this.clickReply(params, ClickErrors.update);
    await this.onPaid(p);
    return this.clickReply(params, ClickErrors.ok, { merchant_confirm_id: p.seq });
  }

  /* ---------- local simulator (no merchant keys) ---------- */

  /** Runs the real provider protocol against our own handlers, as the provider would. */
  async simulatePay(p: Payment) {
    if (p.provider === 'payme') {
      const auth = `Basic ${Buffer.from(`Paycom:${this.paymeKey()}`).toString('base64')}`;
      const txId = randomBytes(12).toString('hex');
      const params = { amount: p.amount * 100, account: { payment_id: p.id } };
      for (const [method, body] of [
        ['CheckPerformTransaction', params],
        ['CreateTransaction', { ...params, id: txId, time: Date.now() }],
        ['PerformTransaction', { id: txId }],
      ] as const) {
        const r = (await this.payme({ id: 1, method, params: body }, auth)) as { error?: PaymeError };
        if (r.error) return { ok: false, error: `${method}: ${r.error.message.uz}` };
      }
      return { ok: true };
    }
    const clickTransId = String(Date.now());
    const signTime = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const base = { click_trans_id: clickTransId, service_id: this.clickServiceId(), click_paydoc_id: clickTransId, merchant_trans_id: p.id, amount: String(p.amount), error: '0', error_note: 'Success', sign_time: signTime };
    const prepare = { ...base, action: '0' };
    const prep = await this.clickPrepare({
      ...prepare,
      sign_string: md5(`${clickTransId}${base.service_id}${this.clickSecret()}${p.id}${base.amount}0${signTime}`),
    });
    if (prep.error !== 0) return { ok: false, error: `prepare: ${prep.error_note}` };
    const prepareId = String((prep as { merchant_prepare_id?: number }).merchant_prepare_id);
    const done = await this.clickComplete({
      ...base,
      action: '1',
      merchant_prepare_id: prepareId,
      sign_string: md5(`${clickTransId}${base.service_id}${this.clickSecret()}${p.id}${prepareId}${base.amount}1${signTime}`),
    });
    return done.error === 0 ? { ok: true } : { ok: false, error: `complete: ${done.error_note}` };
  }

  async simulateCancel(p: Payment) {
    await this.prisma.payment.updateMany({ where: { id: p.id, status: { in: ['created', 'pending'] } }, data: { status: 'cancelled', state: p.state === 1 ? -1 : p.state, reason: 3 } });
  }
}
