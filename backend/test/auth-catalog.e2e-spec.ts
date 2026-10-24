import type { INestApplication } from '@nestjs/common';
import { api, bearer, createApp, login } from './helpers';

let app: INestApplication;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
});

describe('auth', () => {
  it('logs in demo accounts and returns the public user', async () => {
    const res = await api(app).post('/api/v1/auth/login').send({ email: 'SELLER@demo.uz', password: 'demo1234' }).expect(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: 'u-seller', role: 'seller', companyId: 'c1' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects wrong passwords with INVALID_CREDENTIALS', async () => {
    const res = await api(app).post('/api/v1/auth/login').send({ email: 'buyer@demo.uz', password: 'nope' }).expect(401);
    expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
  });

  it('validates registration with frontend field codes', async () => {
    const res = await api(app)
      .post('/api/v1/auth/register')
      .send({ role: 'seller', fullName: 'Al', email: 'buyer@demo.uz', phone: '998', password: 'short', company: { name: '', tin: '12', region: 'Toshkent' } })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toEqual({
      fullName: 'MIN_LENGTH',
      email: 'EMAIL_TAKEN',
      phone: 'INVALID_PHONE',
      password: 'MIN_LENGTH',
      'company.name': 'REQUIRED',
      'company.tin': 'INVALID_TIN',
    });
  });

  it('registers a seller with an unverified company, then logout revokes the token', async () => {
    const res = await api(app)
      .post('/api/v1/auth/register')
      .send({ role: 'seller', fullName: 'Test Sotuvchi', email: 'new-seller@test.uz', phone: '+998901112233', password: 'password1', company: { name: 'Test Savdo', tin: '123456789', region: 'Samarqand' } })
      .expect(201);
    const token = res.body.token;
    expect(res.body.user.companyId).toEqual(expect.any(String));
    const company = await api(app).get('/api/v1/seller/company').set(bearer(token)).expect(200);
    expect(company.body).toMatchObject({ name: 'Test Savdo', verified: false, tin: '123456789' });

    const dup = await api(app)
      .post('/api/v1/auth/register')
      .send({ role: 'seller', fullName: 'Boshqa', email: 'other@test.uz', phone: '+998901112234', password: 'password1', company: { name: 'X', tin: '123456789', region: 'Samarqand' } })
      .expect(422);
    expect(dup.body.error.fields['company.tin']).toBe('TIN_TAKEN');

    await api(app).post('/api/v1/auth/logout').set(bearer(token)).expect(200);
    const after = await api(app).get('/api/v1/auth/me').set(bearer(token)).expect(401);
    expect(after.body.error.code).toBe('UNAUTHORIZED');
  });

  it('any invalid bearer token is a 401 even on public routes', async () => {
    await api(app).get('/api/v1/categories').set(bearer('garbage')).expect(401);
  });

  it('enforces roles', async () => {
    const buyer = await login(app, 'buyer@demo.uz');
    const res = await api(app).get('/api/v1/admin/dashboard').set(bearer(buyer)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await api(app).get('/api/v1/admin/dashboard').expect(401);
  });

  it('changes password and validates the current one', async () => {
    const t = await login(app, 'buyer6@demo.uz');
    const bad = await api(app).post('/api/v1/users/me/password').set(bearer(t)).send({ currentPassword: 'x', newPassword: 'newpass123' }).expect(422);
    expect(bad.body.error.fields).toEqual({ currentPassword: 'WRONG_PASSWORD' });
    await api(app).post('/api/v1/users/me/password').set(bearer(t)).send({ currentPassword: 'demo1234', newPassword: 'newpass123' }).expect(200);
    await login(app, 'buyer6@demo.uz', 'newpass123');
  });

  it('verifies a phone with an SMS code (console mode exposes devCode outside production)', async () => {
    const t = await login(app, 'buyer5@demo.uz');
    const sent = await api(app).post('/api/v1/users/me/phone/send-code').set(bearer(t)).expect(200);
    expect(sent.body.channel).toBe('console');
    const wrong = await api(app).post('/api/v1/users/me/phone/verify').set(bearer(t)).send({ code: '000000' }).expect(422);
    expect(wrong.body.error.fields).toEqual({ code: 'WRONG_CODE' });
    const ok = await api(app).post('/api/v1/users/me/phone/verify').set(bearer(t)).send({ code: sent.body.devCode }).expect(200);
    expect(ok.body.phoneVerified).toBe(true);
  });

  it('updates the profile and saved addresses', async () => {
    const t = await login(app, 'buyer4@demo.uz');
    const res = await api(app)
      .patch('/api/v1/users/me')
      .set(bearer(t))
      .send({ fullName: 'Nodira X.', addresses: [{ text: 'Toshkent', lat: 41.3, lng: 69.2, landmark: 'Bozor yonida' }], notificationPrefs: { marketing: true } })
      .expect(200);
    expect(res.body).toMatchObject({ fullName: 'Nodira X.', addresses: [{ text: 'Toshkent', landmark: 'Bozor yonida' }], notificationPrefs: { marketing: true, email: true } });
    const bad = await api(app).patch('/api/v1/users/me').set(bearer(t)).send({ phone: '123', email: 'seller@demo.uz' }).expect(422);
    expect(bad.body.error.fields).toEqual({ phone: 'INVALID_PHONE', email: 'EMAIL_TAKEN' });
  });
});

describe('catalog', () => {
  it('lists categories with active product counts', async () => {
    const res = await api(app).get('/api/v1/categories').expect(200);
    expect(res.body).toHaveLength(12);
    const food = res.body.find((c: { slug: string }) => c.slug === 'food');
    expect(food).toMatchObject({ name: { uz: 'Oziq-ovqat' }, productsCount: 9 });
  });

  it('paginates, filters and sorts products like the mock', async () => {
    const page = await api(app).get('/api/v1/products').query({ pageSize: 5, page: 2 }).expect(200);
    expect(page.body).toMatchObject({ page: 2, pageSize: 5, total: 59, totalPages: 12 });
    expect(page.body.items[0].company).toMatchObject({ id: expect.any(String), verified: expect.any(Boolean) });

    const cheap = await api(app).get('/api/v1/products').query({ category: 'construction', sort: 'price_asc' }).expect(200);
    const prices = cheap.body.items.map((p: { price: number }) => p.price);
    expect(cheap.body.items.every((p: { categorySlug: string }) => p.categorySlug === 'construction')).toBe(true);
    expect(prices[0]).toBe(1100); // brick

    const search = await api(app).get('/api/v1/products').query({ q: "bug'doy uni" }).expect(200);
    expect(search.body.items.map((p: { id: string }) => p.id)).toContain('p1');

    const verified = await api(app).get('/api/v1/products').query({ verified: true, pageSize: 100 }).expect(200);
    expect(verified.body.items.every((p: { company: { verified: boolean } }) => p.company.verified)).toBe(true);
  });

  it('suggests products, categories and companies', async () => {
    const res = await api(app).get('/api/v1/products/suggest').query({ q: 'sement' }).set('Accept-Language', 'ru').expect(200);
    expect(res.body.products.map((p: { id: string }) => p.id)).toContain('p21');
    const cats = await api(app).get('/api/v1/products/suggest').query({ q: 'mebel' }).set('Accept-Language', 'ru').expect(200);
    expect(cats.body.categories).toEqual([{ slug: 'furniture', name: 'Мебель' }]);
  });

  it('counts product views and returns reviews with distribution', async () => {
    const a = await api(app).get('/api/v1/products/p1').expect(200);
    const b = await api(app).get('/api/v1/products/p1').expect(200);
    expect(b.body.views).toBe(a.body.views + 1);
    const reviews = await api(app).get('/api/v1/products/p1/reviews').expect(200);
    expect(reviews.body.distribution).toHaveLength(5);
    expect(reviews.body.pageSize).toBe(5);
    await api(app).get('/api/v1/products/nope').expect(404);
  });

  it('returns batch products in requested order', async () => {
    const res = await api(app).post('/api/v1/products/batch').send({ ids: ['p3', 'missing', 'p1'] }).expect(201);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(['p3', 'p1']);
  });

  it('lists companies (verified first) and finds by slug', async () => {
    const res = await api(app).get('/api/v1/companies').query({ pageSize: 50 }).expect(200);
    const flags = res.body.items.map((c: { verified: boolean }) => c.verified);
    expect(flags.slice(flags.indexOf(false)).includes(true)).toBe(false);
    const bySlug = await api(app).get('/api/v1/companies/toshkent-oziq-ovqat').expect(200);
    expect(bySlug.body.id).toBe('c1');
    const byCat = await api(app).get('/api/v1/companies').query({ category: 'packaging' }).expect(200);
    expect(byCat.body.items.map((c: { id: string }) => c.id)).toEqual(['c6']);
  });

  it('public stats and activity feed', async () => {
    const stats = await api(app).get('/api/v1/stats/public').expect(200);
    expect(stats.body).toMatchObject({ products: 59, companies: expect.any(Number), orders: 260 });
    const feed = await api(app).get('/api/v1/stats/activity').expect(200);
    expect(feed.body).toHaveLength(14);
    expect(feed.body[0]).toMatchObject({ companyName: expect.any(String), area: expect.any(String) });
  });

  it('toggles favorites', async () => {
    const t = await login(app, 'buyer@demo.uz');
    const ids = await api(app).get('/api/v1/favorites/ids').set(bearer(t)).expect(200);
    expect(ids.body).toEqual(['p2', 'p15', 'p27', 'p42']);
    const on = await api(app).post('/api/v1/favorites/p5').set(bearer(t)).expect(200);
    expect(on.body).toEqual({ favorited: true, ids: ['p5', 'p2', 'p15', 'p27', 'p42'] });
    const off = await api(app).post('/api/v1/favorites/p5').set(bearer(t)).expect(200);
    expect(off.body.favorited).toBe(false);
  });
});
