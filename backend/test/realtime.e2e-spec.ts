import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { api, bearer, createApp, login } from './helpers';

let app: INestApplication;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await createApp();
  await app.listen(0);
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/realtime`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await app.close();
});

function connect(token: string) {
  const s = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(s);
  return new Promise<Socket>((resolve, reject) => {
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const next = <T>(s: Socket, event: string) => new Promise<T>((resolve) => s.once(event, resolve));

describe('realtime', () => {
  it('rejects sockets without a valid token', async () => {
    const s = io(url, { auth: { token: 'bad' }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await new Promise<void>((resolve) => s.on('disconnect', () => resolve()));
  });

  it('pushes notifications, order updates and courier positions', async () => {
    const buyer = await login(app, 'buyer@demo.uz');
    const seller = await login(app, 'seller@demo.uz');
    const courier = await login(app, 'courier@demo.uz');
    const sellerSocket = await connect(seller);
    const buyerSocket = await connect(buyer);

    const newOrder = next<{ title: string }>(sellerSocket, 'notification');
    const res = await api(app)
      .post('/api/v1/orders/checkout')
      .set(bearer(buyer))
      .send({ items: [{ productId: 'p1', quantity: 10 }], deliveryType: 'courier', paymentMethod: 'cash', address: { text: 'Toshkent', lat: 41.3, lng: 69.25 } })
      .expect(201);
    expect((await newOrder).title).toBe('Yangi buyurtma');
    const id = res.body[0].id;

    const updated = next<{ id: string; status: string }>(buyerSocket, 'order:updated');
    await api(app).post(`/api/v1/orders/${id}/status`).set(bearer(seller)).send({ status: 'confirmed' }).expect(200);
    expect(await updated).toMatchObject({ id, status: 'confirmed' });

    await api(app).post(`/api/v1/orders/${id}/status`).set(bearer(seller)).send({ status: 'ready' }).expect(200);
    await api(app).post(`/api/v1/orders/${id}/assign`).set(bearer(courier)).expect(200);
    const sub = await buyerSocket.emitWithAck('order:subscribe', { orderId: id });
    expect(sub).toEqual({ ok: true });
    const position = next<{ orderId: string; lat: number }>(buyerSocket, 'order:location');
    await api(app).post('/api/v1/courier/location').set(bearer(courier)).send({ lat: 41.31, lng: 69.26 }).expect(200);
    expect(await position).toMatchObject({ orderId: id, lat: 41.31 });

    const foreign = await (await connect(await login(app, 'buyer2@demo.uz'))).emitWithAck('order:subscribe', { orderId: id });
    expect(foreign).toEqual({ ok: false });
  });
});
