import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { md5, PaymentsService } from '../src/payments/payments.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { api, bearer, createApp, login, TASHKENT_ADDRESS } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
let payments: PaymentsService;
const t: Record<string, string> = {};

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  payments = app.get(PaymentsService);
  for (const [k, email] of Object.entries({ buyer: 'buyer@demo.uz', buyer2: 'buyer2@demo.uz', seller: 'seller@demo.uz', seller3: 'seller3@demo.uz', courier: 'courier@demo.uz', courier2: 'courier2@demo.uz', admin: 'admin@demo.uz' })) {
    t[k] = await login(app, email);
  }
});
afterAll(async () => {
  await app.close();
});

const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
const checkout = (token: string, body: object) => api(app).post('/api/v1/orders/checkout').set(bearer(token)).send(body);

describe('checkout rules', () => {
  it('rejects MOQ, stock, service area and range violations', async () => {
    expect((await checkout(t.buyer, { items: [{ productId: 'p1', quantity: 5 }], deliveryType: 'pickup', paymentMethod: 'cash' }).expect(409)).body.error.code).toBe('BELOW_MOQ');
    expect((await checkout(t.buyer, { items: [{ productId: 'p1', quantity: 999999 }], deliveryType: 'pickup', paymentMethod: 'cash' }).expect(409)).body.error.code).toBe('OUT_OF_STOCK');
    expect((await checkout(t.buyer, { items: [{ productId: 'p1', quantity: 10 }], deliveryType: 'courier', paymentMethod: 'cash' }).expect(422)).body.error.fields).toEqual({ address: 'REQUIRED' });
    const abroad = await checkout(t.buyer, { items: [{ productId: 'p1', quantity: 10 }], deliveryType: 'courier', paymentMethod: 'cash', address: { text: 'Almaty', lat: 43.24, lng: 76.9 } }).expect(422);
    expect(abroad.body.error.fields).toEqual({ address: 'OUTSIDE_SERVICE_AREA' });
    const far = await checkout(t.buyer, { items: [{ productId: 'p1', quantity: 10 }], deliveryType: 'courier', paymentMethod: 'cash', address: { text: 'Samarqand', lat: 39.65, lng: 66.96 } }).expect(409);
    expect(far.body.error.code).toBe('DELIVERY_OUT_OF_RANGE');
    expect((await checkout(t.seller, { items: [{ productId: 'p1', quantity: 10 }], deliveryType: 'pickup', paymentMethod: 'cash' }).expect(403)).body.error.code).toBe('FORBIDDEN');
  });
});

describe('order lifecycle (courier delivery, cash)', () => {
  let order1: any; // c1 — p1
  let order2: any; // c3 — p21

  it('splits the cart per seller, prices on the server and reserves stock', async () => {
    const before = await stockOf('p1');
    const res = await checkout(t.buyer, {
      items: [
        { productId: 'p1', quantity: 10 },
        { productId: 'p21', quantity: 100 },
      ],
      deliveryType: 'courier',
      paymentMethod: 'cash',
      address: TASHKENT_ADDRESS,
      note: 'Ertalab',
    }).expect(201);
    expect(res.body).toHaveLength(2);
    [order1, order2] = res.body;
    expect(order1).toMatchObject({ companyId: 'c1', status: 'pending', paymentStatus: 'unpaid', subtotal: 3_850_000, note: 'Ertalab' });
    expect(order1.number).toMatch(/^B2B-\d+$/);
    expect(order1.delivery).toMatchObject({ type: 'courier', routeSource: 'estimate', address: { text: TASHKENT_ADDRESS.text } });
    expect(order1.deliveryFee).toBeGreaterThanOrEqual(30_000);
    expect(order1.total).toBe(order1.subtotal + order1.deliveryFee);
    expect(order2).toMatchObject({ companyId: 'c3', subtotal: 5_200_000, deliveryFee: 0 }); // free above 5M
    expect(order1.timeline).toEqual([expect.objectContaining({ status: 'pending', by: 'Jasur Olimov' })]);
    expect(await stockOf('p1')).toBe(before - 10);

    const notes = await api(app).get('/api/v1/notifications').set(bearer(t.seller)).expect(200);
    expect(notes.body.items[0]).toMatchObject({ type: 'order', title: 'Yangi buyurtma', link: `/seller/orders/${order1.id}` });
  });

  it('enforces visibility', async () => {
    await api(app).get(`/api/v1/orders/${order1.id}`).set(bearer(t.buyer2)).expect(404);
    await api(app).get(`/api/v1/orders/${order1.number}`).set(bearer(t.seller)).expect(200);
    await api(app).get(`/api/v1/orders/${order1.id}`).set(bearer(t.seller3)).expect(404);
  });

  it('seller confirms and prepares; cannot hand a courier order over itself', async () => {
    const status = (token: string, s: string) => api(app).post(`/api/v1/orders/${order1.id}/status`).set(bearer(token)).send({ status: s });
    expect((await status(t.seller, 'ready').expect(409)).body.error.code).toBe('INVALID_TRANSITION');
    await status(t.seller, 'confirmed').expect(200);
    await status(t.seller, 'ready').expect(200);
    expect((await status(t.seller, 'delivered').expect(409)).body.error.code).toBe('INVALID_TRANSITION');
    const available = await api(app).get('/api/v1/courier/available').set(bearer(t.courier)).expect(200);
    expect(available.body.map((o: { id: string }) => o.id)).toContain(order1.id);
  });

  it('first courier wins the assignment', async () => {
    const res = await api(app).post(`/api/v1/orders/${order1.id}/assign`).set(bearer(t.courier)).expect(200);
    expect(res.body).toMatchObject({ courierId: 'u-courier', courierName: 'Sardor Rahimov', courierFee: Math.round(order1.deliveryFee * 0.8) });
    expect((await api(app).post(`/api/v1/orders/${order1.id}/assign`).set(bearer(t.courier2)).expect(409)).body.error.code).toBe('ALREADY_ASSIGNED');
  });

  it('tracks the courier: simulated without GPS, real GPS once shared', async () => {
    await api(app).post(`/api/v1/orders/${order1.id}/status`).set(bearer(t.courier)).send({ status: 'in_transit' }).expect(200);
    await prisma.order.update({ where: { id: order1.id }, data: { courierLocation: { lat: 41.3, lng: 69.27, at: new Date(Date.now() - 10 * 60000).toISOString() } } });
    const sim = await api(app).get(`/api/v1/orders/${order1.id}/tracking`).set(bearer(t.buyer)).expect(200);
    expect(sim.body).toMatchObject({ status: 'in_transit', route: { source: 'estimate' }, courier: { source: 'simulated' } });
    expect(sim.body.etaMin).toBeGreaterThanOrEqual(1);

    const loc = await api(app).post('/api/v1/courier/location').set(bearer(t.courier)).send({ lat: 41.29, lng: 69.22, accuracy: 12.4, heading: 90 }).expect(200);
    expect(loc.body.activeOrders).toBeGreaterThanOrEqual(1);
    const gps = await api(app).get(`/api/v1/orders/${order1.id}/tracking`).set(bearer(t.buyer)).expect(200);
    expect(gps.body.courier).toMatchObject({ source: 'gps', lat: 41.29, lng: 69.22, accuracy: 12 });
    expect(gps.body.remainingKm).toEqual(expect.any(Number));
  });

  it('delivery marks cash as paid and unlocks reviews', async () => {
    expect((await api(app).get('/api/v1/products/p1/can-review').set(bearer(t.courier)).expect(200)).body).toEqual({ canReview: false, reason: 'NOT_BUYER' });
    const res = await api(app).post(`/api/v1/orders/${order1.id}/status`).set(bearer(t.courier)).send({ status: 'delivered' }).expect(200);
    expect(res.body).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(res.body.timeline.map((e: { status: string }) => e.status)).toEqual(['pending', 'confirmed', 'ready', 'ready', 'in_transit', 'delivered']);

    const dash = await api(app).get('/api/v1/courier/dashboard').set(bearer(t.courier)).expect(200);
    expect(dash.body.earningsToday).toBeGreaterThanOrEqual(res.body.courierFee);

    const bad = await api(app).post('/api/v1/products/p1/reviews').set(bearer(t.buyer)).send({ rating: 5, comment: 'ok' }).expect(422);
    expect(bad.body.error.fields).toEqual({ comment: 'MIN_LENGTH' });
    await api(app).post('/api/v1/products/p1/reviews').set(bearer(t.buyer)).send({ rating: 1, comment: 'Sifati yomon edi' }).expect(201);
    const p = await prisma.product.findUniqueOrThrow({ where: { id: 'p1' } });
    const agg = await prisma.review.aggregate({ where: { productId: 'p1' }, _avg: { rating: true }, _count: true });
    expect(p.reviewsCount).toBe(agg._count);
    expect(p.rating).toBe(Math.round((agg._avg.rating ?? 0) * 10) / 10);
  });

  it('buyer cancels a pending order and stock comes back', async () => {
    const before = await stockOf('p21');
    const res = await api(app).post(`/api/v1/orders/${order2.id}/cancel`).set(bearer(t.buyer)).send({ reason: "Fikrimni o'zgartirdim" }).expect(200);
    expect(res.body).toMatchObject({ status: 'cancelled', cancelReason: "Fikrimni o'zgartirdim" });
    expect(await stockOf('p21')).toBe(before + 100);
    expect((await api(app).post(`/api/v1/orders/${order2.id}/cancel`).set(bearer(t.buyer)).expect(409)).body.error.code).toBe('INVALID_TRANSITION');
  });

  it('lists orders per role with status filter', async () => {
    const mine = await api(app).get('/api/v1/orders').query({ status: 'cancelled', pageSize: 50 }).set(bearer(t.buyer)).expect(200);
    expect(mine.body.items.every((o: { buyerId: string; status: string }) => o.buyerId === 'u-buyer' && o.status === 'cancelled')).toBe(true);
    const seller = await api(app).get('/api/v1/orders').query({ q: order1.number }).set(bearer(t.seller)).expect(200);
    expect(seller.body.items.map((o: { id: string }) => o.id)).toEqual([order1.id]);
  });
});

describe('Payme merchant API', () => {
  let orderId: string;
  let paymentId: string;
  let amount: number;
  const auth = () => `Basic ${Buffer.from(`Paycom:${payments.paymeKey()}`).toString('base64')}`;
  const rpc = (method: string, params: object, authHeader = auth()) => api(app).post('/api/v1/payments/payme').set('Authorization', authHeader).send({ id: 7, method, params }).expect(200);

  it('card orders wait for payment', async () => {
    const res = await checkout(t.buyer, { items: [{ productId: 'p3', quantity: 20 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
    orderId = res.body[0].id;
    expect(res.body[0].paymentStatus).toBe('unpaid');
    const conf = await api(app).post(`/api/v1/orders/${orderId}/status`).set(bearer(t.seller)).send({ status: 'confirmed' }).expect(409);
    expect(conf.body.error.code).toBe('PAYMENT_PENDING');

    const pay = await api(app).post('/api/v1/payments').set(bearer(t.buyer)).send({ orderIds: [orderId], provider: 'payme' }).expect(201);
    expect(pay.body.url).toContain(`/api/v1/payments/simulator/${pay.body.id}`);
    paymentId = pay.body.id;
    amount = pay.body.amount;
    expect(amount).toBe(res.body[0].total);
    await api(app).post('/api/v1/payments').set(bearer(t.buyer2)).send({ orderIds: [orderId], provider: 'payme' }).expect(404);
  });

  it('rejects bad credentials, unknown methods, wrong accounts and amounts', async () => {
    expect((await rpc('CheckPerformTransaction', {}, 'Basic ' + Buffer.from('Paycom:wrong').toString('base64'))).body.error.code).toBe(-32504);
    expect((await rpc('Nope', {})).body.error.code).toBe(-32601);
    expect((await rpc('CheckPerformTransaction', { amount: amount * 100, account: { payment_id: 'missing' } })).body.error).toMatchObject({ code: -31050, data: 'payment_id' });
    expect((await rpc('CheckPerformTransaction', { amount: 100, account: { payment_id: paymentId } })).body.error.code).toBe(-31001);
    expect((await rpc('CheckPerformTransaction', { amount: amount * 100, account: { payment_id: paymentId } })).body).toEqual({ id: 7, result: { allow: true } });
  });

  it('creates idempotently, blocks a second transaction and performs once', async () => {
    const params = { id: 'payme-tx-1', time: Date.now(), amount: amount * 100, account: { payment_id: paymentId } };
    const c1 = await rpc('CreateTransaction', params);
    expect(c1.body.result).toMatchObject({ transaction: paymentId, state: 1, create_time: expect.any(Number) });
    const c2 = await rpc('CreateTransaction', params);
    expect(c2.body.result.create_time).toBe(c1.body.result.create_time);
    expect((await rpc('CreateTransaction', { ...params, id: 'payme-tx-2' })).body.error.code).toBe(-31099);
    expect((await rpc('PerformTransaction', { id: 'unknown' })).body.error.code).toBe(-31003);

    const p1 = await rpc('PerformTransaction', { id: 'payme-tx-1' });
    expect(p1.body.result).toMatchObject({ transaction: paymentId, state: 2 });
    const p2 = await rpc('PerformTransaction', { id: 'payme-tx-1' });
    expect(p2.body.result.perform_time).toBe(p1.body.result.perform_time);

    const order = await api(app).get(`/api/v1/orders/${orderId}`).set(bearer(t.buyer)).expect(200);
    expect(order.body.paymentStatus).toBe('paid');
    const check = await rpc('CheckTransaction', { id: 'payme-tx-1' });
    expect(check.body.result).toMatchObject({ state: 2, cancel_time: 0, reason: null });
    const st = await rpc('GetStatement', { from: c1.body.result.create_time - 1000, to: Date.now() + 1000 });
    expect(st.body.result.transactions).toEqual([expect.objectContaining({ id: 'payme-tx-1', amount: amount * 100, account: { payment_id: paymentId }, state: 2 })]);
    const status = await api(app).get(`/api/v1/payments/${paymentId}`).set(bearer(t.buyer)).expect(200);
    expect(status.body).toMatchObject({ status: 'paid', orders: [expect.objectContaining({ id: orderId })] });
  });

  it('cancel after perform refunds and cancels the order', async () => {
    const res = await rpc('CancelTransaction', { id: 'payme-tx-1', reason: 5 });
    expect(res.body.result).toMatchObject({ transaction: paymentId, state: -2 });
    const order = await api(app).get(`/api/v1/orders/${orderId}`).set(bearer(t.buyer)).expect(200);
    expect(order.body).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    expect((await rpc('CheckTransaction', { id: 'payme-tx-1' })).body.result).toMatchObject({ state: -2, reason: 5 });
    expect((await rpc('PerformTransaction', { id: 'payme-tx-1' })).body.error.code).toBe(-31008);
  });
});

describe('Click SHOP API', () => {
  let orderId: string;
  let paymentId: string;
  let amount: number;
  const secret = () => payments.clickSecret();
  const service = () => payments.clickServiceId();
  const prepareSign = (p: Record<string, string>) => md5(`${p.click_trans_id}${p.service_id}${secret()}${p.merchant_trans_id}${p.amount}${p.action}${p.sign_time}`);
  const completeSign = (p: Record<string, string>) => md5(`${p.click_trans_id}${p.service_id}${secret()}${p.merchant_trans_id}${p.merchant_prepare_id}${p.amount}${p.action}${p.sign_time}`);
  const form = (path: string, body: Record<string, string>) => api(app).post(`/api/v1/payments/click/${path}`).type('form').send(body).expect(200);

  it('prepare → complete marks the order paid', async () => {
    const res = await checkout(t.buyer2, { items: [{ productId: 'p4', quantity: 10 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
    orderId = res.body[0].id;
    const pay = await api(app).post('/api/v1/payments').set(bearer(t.buyer2)).send({ orderIds: [orderId], provider: 'click' }).expect(201);
    paymentId = pay.body.id;
    amount = pay.body.amount;

    const base = { click_trans_id: '5550001', service_id: service(), click_paydoc_id: '777', merchant_trans_id: paymentId, amount: `${amount}.00`, action: '0', error: '0', error_note: 'Success', sign_time: '2026-10-24 12:00:00' };
    expect((await form('prepare', { ...base, sign_string: 'bad' })).body.error).toBe(-1);
    expect((await form('prepare', { ...base, amount: '1', sign_string: prepareSign({ ...base, amount: '1' }) })).body.error).toBe(-2);
    const prep = await form('prepare', { ...base, sign_string: prepareSign(base) });
    expect(prep.body).toMatchObject({ error: 0, click_trans_id: 5550001, merchant_trans_id: paymentId, merchant_prepare_id: expect.any(Number) });

    const done = { ...base, action: '1', merchant_prepare_id: String(prep.body.merchant_prepare_id) };
    expect((await form('complete', { ...done, merchant_prepare_id: '999999', sign_string: completeSign({ ...done, merchant_prepare_id: '999999' }) })).body.error).toBe(-6);
    const ok = await form('complete', { ...done, sign_string: completeSign(done) });
    expect(ok.body).toMatchObject({ error: 0, merchant_confirm_id: prep.body.merchant_prepare_id });
    expect((await form('complete', { ...done, sign_string: completeSign(done) })).body.error).toBe(-4);

    const order = await api(app).get(`/api/v1/orders/${orderId}`).set(bearer(t.buyer2)).expect(200);
    expect(order.body.paymentStatus).toBe('paid');
    await api(app).post(`/api/v1/orders/${orderId}/status`).set(bearer(t.seller)).send({ status: 'confirmed' }).expect(200);
  });

  it('a failed payment reported by Click cancels the transaction', async () => {
    const res = await checkout(t.buyer2, { items: [{ productId: 'p4', quantity: 10 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
    const pay = await api(app).post('/api/v1/payments').set(bearer(t.buyer2)).send({ orderIds: [res.body[0].id], provider: 'click' }).expect(201);
    const base = { click_trans_id: '5550002', service_id: service(), click_paydoc_id: '778', merchant_trans_id: pay.body.id, amount: String(pay.body.amount), action: '0', error: '0', error_note: '', sign_time: '2026-10-24 12:00:00' };
    const prep = await form('prepare', { ...base, sign_string: prepareSign(base) });
    const done = { ...base, action: '1', error: '-5017', merchant_prepare_id: String(prep.body.merchant_prepare_id) };
    expect((await form('complete', { ...done, sign_string: completeSign(done) })).body.error).toBe(-9);
    const order = await api(app).get(`/api/v1/orders/${res.body[0].id}`).set(bearer(t.buyer2)).expect(200);
    expect(order.body.paymentStatus).toBe('unpaid');
  });
});

describe('payment simulator and unpaid-order expiry', () => {
  it('simulator runs the provider protocol and redirects back to the shop', async () => {
    const res = await checkout(t.buyer, { items: [{ productId: 'p6', quantity: 5 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
    for (const provider of ['payme', 'click'] as const) {
      const r = provider === 'payme' ? res : await checkout(t.buyer, { items: [{ productId: 'p6', quantity: 5 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
      const pay = await api(app).post('/api/v1/payments').set(bearer(t.buyer)).send({ orderIds: [r.body[0].id], provider }).expect(201);
      const page = await api(app).get(`/api/v1/payments/simulator/${pay.body.id}`).expect(200);
      expect(page.text).toContain(provider === 'payme' ? 'Payme' : 'Click');
      const done = await api(app).post(`/api/v1/payments/simulator/${pay.body.id}/pay`).expect(303);
      expect(done.headers.location).toBe(`http://localhost:5173/checkout/success?payment=${pay.body.id}`);
      const status = await api(app).get(`/api/v1/payments/${pay.body.id}`).set(bearer(t.buyer)).expect(200);
      expect(status.body.status).toBe('paid');
      expect(status.body.orders[0].paymentStatus).toBe('paid');
    }
  });

  it('cancels card orders left unpaid for 30 minutes and restocks', async () => {
    const before = await stockOf('p7');
    const res = await checkout(t.buyer, { items: [{ productId: 'p7', quantity: 20 }], deliveryType: 'pickup', paymentMethod: 'card' }).expect(201);
    await prisma.order.update({ where: { id: res.body[0].id }, data: { createdAt: new Date(Date.now() - 31 * 60000) } });
    await app.get(OrdersService).expireUnpaidCardOrders();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.body[0].id } });
    expect(order.status).toBe('cancelled');
    expect(await stockOf('p7')).toBe(before);
  });
});

describe('RFQ, messaging, admin, AI, uploads', () => {
  it('runs a quote request end to end', async () => {
    const bad = await api(app).post('/api/v1/rfqs').set(bearer(t.buyer)).send({ companyId: 'c1', quantity: 0, message: 'qisqa' }).expect(422);
    expect(bad.body.error.fields).toEqual({ quantity: 'POSITIVE', message: 'MIN_LENGTH', productName: 'REQUIRED' });
    const rfq = await api(app).post('/api/v1/rfqs').set(bearer(t.buyer)).send({ companyId: 'c1', productId: 'p2', quantity: 500, targetPrice: 480000, message: "Yillik shartnoma bo'yicha narx kerak" }).expect(201);
    expect(rfq.body).toMatchObject({ number: 'RFQ-306', productName: expect.stringContaining('Guruch'), unit: 'bag', status: 'open' });
    const resp = await api(app).post(`/api/v1/rfqs/${rfq.body.id}/respond`).set(bearer(t.seller)).send({ unitPrice: 490000, message: 'Taklif', validUntil: new Date(Date.now() + 7 * 86400000).toISOString() }).expect(200);
    expect(resp.body).toMatchObject({ status: 'answered', response: { unitPrice: 490000 } });
    await api(app).post(`/api/v1/rfqs/${rfq.body.id}/accept`).set(bearer(t.seller)).expect(403);
    expect((await api(app).post(`/api/v1/rfqs/${rfq.body.id}/accept`).set(bearer(t.buyer)).expect(200)).body.status).toBe('accepted');
  });

  it('starts a conversation with a company and tracks unread counts', async () => {
    const conv = await api(app).post('/api/v1/conversations').set(bearer(t.buyer)).send({ companyId: 'c3', productId: 'p21', text: 'Salom, sement bormi?' }).expect(201);
    expect(conv.body).toMatchObject({ productId: 'p21', lastMessage: { text: 'Salom, sement bormi?' }, unread: 0 });
    expect((await api(app).get('/api/v1/conversations/unread').set(bearer(t.seller3)).expect(200)).body.count).toBe(1);
    const thread = await api(app).get(`/api/v1/conversations/${conv.body.id}/messages`).set(bearer(t.seller3)).expect(200);
    expect(thread.body.messages).toHaveLength(1);
    expect((await api(app).get('/api/v1/conversations/unread').set(bearer(t.seller3)).expect(200)).body.count).toBe(0);
    await api(app).post(`/api/v1/conversations/${conv.body.id}/messages`).set(bearer(t.seller3)).send({ text: 'Ha, bor' }).expect(201);
    const again = await api(app).post('/api/v1/conversations').set(bearer(t.buyer)).send({ companyId: 'c3' }).expect(201);
    expect(again.body).toMatchObject({ id: conv.body.id, unread: 1 });
    await api(app).get(`/api/v1/conversations/${conv.body.id}/messages`).set(bearer(t.buyer2)).expect(404);
    expect((await api(app).post('/api/v1/conversations').set(bearer(t.buyer)).send({ recipientId: 'u-buyer' }).expect(400)).body.error.code).toBe('INVALID_RECIPIENT');
  });

  it('admin verifies companies (publishing pending products) and blocks users', async () => {
    const seller6 = await login(app, 'seller6@demo.uz');
    const created = await api(app)
      .post('/api/v1/seller/products')
      .set(bearer(seller6))
      .send({ name: 'Plastik idish 1 L', categorySlug: 'packaging', description: 'Oziq-ovqat uchun idish', price: 1200, unit: 'piece', moq: 1000, stock: 50000, discount: 0, tiers: [{ minQty: 5000, price: 1100 }], specs: [], tags: ['idish'], deliveryDays: 3, status: 'active', images: [] })
      .expect(201);
    expect(created.body.status).toBe('pending'); // c6 is not verified
    const badTier = await api(app).patch(`/api/v1/seller/products/${created.body.id}`).set(bearer(seller6)).send({ tiers: [{ minQty: 10, price: 5000 }] }).expect(422);
    expect(badTier.body.error.fields).toEqual({ 'tiers.0.minQty': 'TIER_ABOVE_MOQ', 'tiers.0.price': 'TIER_BELOW_BASE' });

    await api(app).patch('/api/v1/admin/companies/c6').set(bearer(t.admin)).send({ verified: true }).expect(200);
    expect((await api(app).get(`/api/v1/products/${created.body.id}`).expect(200)).body.status).toBe('active');

    expect((await api(app).patch('/api/v1/admin/users/u-admin').set(bearer(t.admin)).send({ status: 'blocked' }).expect(409)).body.error.code).toBe('CANNOT_MODIFY_SELF');
    const victim = await login(app, 'buyer3@demo.uz');
    await api(app).patch('/api/v1/admin/users/u-buyer3').set(bearer(t.admin)).send({ status: 'blocked' }).expect(200);
    await api(app).get('/api/v1/auth/me').set(bearer(victim)).expect(401);
    expect((await api(app).post('/api/v1/auth/login').send({ email: 'buyer3@demo.uz', password: 'demo1234' }).expect(403)).body.error.code).toBe('ACCOUNT_BLOCKED');

    const dash = await api(app).get('/api/v1/admin/dashboard').set(bearer(t.admin)).expect(200);
    expect(dash.body).toMatchObject({ usersByRole: { admin: 1, courier: 2 }, gmvSeries: expect.any(Array) });
    expect(dash.body.gmvSeries).toHaveLength(30);
  });

  it('seller dashboard has the contract shape', async () => {
    const res = await api(app).get('/api/v1/seller/dashboard').query({ range: 7 }).set(bearer(t.seller)).expect(200);
    expect(res.body.revenueSeries).toHaveLength(7);
    expect(res.body.statusBreakdown).toHaveLength(6);
    expect(res.body.recentOrders.length).toBeLessThanOrEqual(6);
  });

  it('AI assistant answers with product cards (rule-based without an API key)', async () => {
    const chat = await api(app).post('/api/v1/ai/chats').set(bearer(t.buyer)).send({}).expect(201);
    const res = await api(app).post(`/api/v1/ai/chats/${chat.body.id}/messages`).set(bearer(t.buyer)).send({ content: 'Eng arzon guruch kerak' }).expect(201);
    expect(res.body.assistantMessage.productIds).toContain('p2');
    expect(res.body.chat).toMatchObject({ title: 'Eng arzon guruch kerak', messages: [expect.objectContaining({ role: 'user' }), expect.objectContaining({ role: 'assistant' })] });
    const list = await api(app).get('/api/v1/ai/chats').set(bearer(t.buyer)).expect(200);
    expect(list.body[0]).toMatchObject({ id: chat.body.id, messagesCount: 2 });
    await api(app).get(`/api/v1/ai/chats/${chat.body.id}`).set(bearer(t.buyer2)).expect(404);
  });

  it('uploads images as WebP and serves them', async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0f766e' } }).png().toBuffer();
    const res = await api(app).post('/api/v1/uploads').set(bearer(t.seller)).attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(201);
    expect(res.body.url).toMatch(/\/uploads\/\d{4}\/\d{2}\/.+\.webp$/);
    const path = new URL(res.body.url).pathname;
    const file = await api(app).get(path).expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    const txt = await api(app).post('/api/v1/uploads').set(bearer(t.seller)).attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(415);
    expect(txt.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('contact form validation', async () => {
    const res = await api(app).post('/api/v1/contact').send({ name: 'A', email: 'x', message: 'short' }).expect(422);
    expect(res.body.error.fields).toEqual({ name: 'MIN_LENGTH', email: 'INVALID_EMAIL', message: 'MIN_LENGTH' });
    await api(app).post('/api/v1/contact').send({ name: 'Ali', email: 'ali@example.com', message: 'Hamkorlik bo‘yicha savol bor' }).expect(200);
    await api(app).post('/api/v1/newsletter').send({ email: 'ali@example.com' }).expect(200);
  });

  it('unknown routes use the error contract', async () => {
    const res = await api(app).get('/api/v1/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
