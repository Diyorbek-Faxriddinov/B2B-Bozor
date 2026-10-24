/**
 * In-browser mock implementation of the B2B Bozor REST API (v1).
 * Every route here is part of the contract the real backend must implement.
 */
import type {
  ActivityItem,
  AdminDashboard,
  AiChat,
  AppNotification,
  CheckoutPayload,
  CourierLocation,
  Company,
  Conversation,
  CourierDashboard,
  ID,
  Locale,
  Order,
  OrderStatus,
  OrderTracking,
  Paginated,
  Product,
  ProductInput,
  ProductWithCompany,
  PublicStats,
  RegisterPayload,
  Rfq,
  Role,
  ScheduleDay,
  SellerDashboard,
  SeriesPoint,
  User,
} from '@/types';
import { ApiError, type Query } from '../client';
import { db, mockHash, persist, resetDb, uid, type DbConversation, type DbUser } from './db';
import { unitPriceFor, deliveryFee, courierAvailable, DELIVERY } from '@/lib/pricing';
import { sleep } from '@/lib/utils';
import { getRoute, inUzbekistan, pointAlong, progressOnPath } from '@/lib/geo';
import { generateAssistantReply } from './ai';

/* ---------- routing ---------- */
interface Ctx {
  params: Record<string, string>;
  query: Query;
  body: any;
  user: DbUser | null;
  token: string | null;
  locale: Locale;
}
type Handler = (ctx: Ctx) => unknown;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, pattern, keys, handler });
}

export async function handleMockRequest(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; token: string | null; locale: Locale },
) {
  await sleep(150 + Math.random() * 350);
  const data = db();
  const userId = opts.token ? data.sessions[opts.token] : undefined;
  const user = userId ? (data.users.find((u) => u.id === userId) ?? null) : null;
  if (opts.token && !user) throw new ApiError(401, 'UNAUTHORIZED', 'Session expired');
  if (user?.status === 'blocked') throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');

  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const result = await r.handler({ params, query: opts.query ?? {}, body: structuredClone(opts.body ?? {}), user, token: opts.token, locale: opts.locale });
    if (method !== 'GET') persist();
    return structuredClone(result);
  }
  throw new ApiError(404, 'NOT_FOUND', `No mock route for ${method} ${path}`);
}

/* ---------- helpers ---------- */
const now = () => new Date().toISOString();

function requireUser(ctx: Ctx, ...roles: Role[]): DbUser {
  if (!ctx.user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
  if (roles.length && !roles.includes(ctx.user.role)) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
  return ctx.user;
}

function publicUser(u: DbUser): User {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

function paginate<T>(items: T[], query: Query, defaultSize = 12): Paginated<T> {
  const pageSize = Math.min(100, Number(query.pageSize) || defaultSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(query.page) || 1));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`ʻʼ']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function matches(text: string, q: string) {
  const n = normalize(text);
  return normalize(q)
    .split(' ')
    .every((w) => n.includes(w));
}

function companyCard(c: Company): ProductWithCompany['company'] {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    logo: c.logo,
    verified: c.verified,
    rating: c.rating,
    region: c.region,
    responseRate: c.responseRate,
    responseTimeHours: c.responseTimeHours,
  };
}

function withCompany(p: Product): ProductWithCompany {
  const c = db().companies.find((x) => x.id === p.companyId)!;
  return { ...p, company: companyCard(c) };
}

function notify(userId: ID, n: Omit<AppNotification, 'id' | 'userId' | 'read' | 'createdAt'>) {
  db().notifications.unshift({ id: uid('n'), userId, read: false, createdAt: now(), ...n });
}

function issueToken(userId: ID) {
  const token = `mock.${uid()}.${uid()}`;
  db().sessions[token] = userId;
  return token;
}

function validationError(fields: Record<string, string>): never {
  throw new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', fields);
}

function findOrder(id: string) {
  const o = db().orders.find((x) => x.id === id || x.number === id);
  if (!o) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  return o;
}

function canSeeOrder(u: DbUser, o: Order) {
  return (
    u.role === 'admin' ||
    o.buyerId === u.id ||
    (u.role === 'seller' && o.companyId === u.companyId) ||
    (u.role === 'courier' && (o.courierId === u.id || (!o.courierId && o.status === 'ready' && o.delivery.type === 'courier')))
  );
}

function pushEvent(o: Order, status: OrderStatus, by: string, note?: string) {
  o.status = status;
  o.updatedAt = now();
  o.timeline.push({ status, at: o.updatedAt, by, note });
}

function daySeries(days: number, entries: { at: string; value: number }[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: 0, count: 0 });
  }
  const index = new Map(out.map((p, i) => [p.date, i]));
  for (const e of entries) {
    const d = new Date(e.at);
    d.setHours(0, 0, 0, 0);
    const i = index.get(d.toISOString().slice(0, 10));
    if (i !== undefined) {
      out[i].value += e.value;
      out[i].count! += 1;
    }
  }
  return out;
}

function within(iso: string, fromDaysAgo: number, toDaysAgo = 0) {
  const t = new Date(iso).getTime();
  return t >= Date.now() - fromDaysAgo * 86400000 && t < Date.now() - toDaysAgo * 86400000;
}

function pctChange(cur: number, prev: number) {
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function recomputeProductRating(productId: ID) {
  const data = db();
  const p = data.products.find((x) => x.id === productId);
  if (!p) return;
  const rs = data.reviews.filter((r) => r.productId === productId);
  p.reviewsCount = rs.length;
  p.rating = rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : 0;
  const c = data.companies.find((x) => x.id === p.companyId);
  if (c) {
    const ps = data.products.filter((x) => x.companyId === c.id);
    c.reviewsCount = ps.reduce((s, x) => s + x.reviewsCount, 0);
    c.rating = Math.round((ps.reduce((s, x) => s + x.rating * x.reviewsCount, 0) / Math.max(1, c.reviewsCount)) * 10) / 10;
  }
}

/* ======================================================================
   AUTH
   ====================================================================== */
route('POST', '/auth/register', ({ body }) => {
  const data = db();
  const p = body as RegisterPayload;
  const email = String(p.email || '').trim().toLowerCase();
  const fields: Record<string, string> = {};
  if (!p.fullName || p.fullName.trim().length < 3) fields.fullName = 'MIN_LENGTH';
  if (!/^\S+@\S+\.\S+$/.test(email)) fields.email = 'INVALID_EMAIL';
  if (data.users.some((u) => u.email === email)) fields.email = 'EMAIL_TAKEN';
  if (!/^\+998\d{9}$/.test(p.phone || '')) fields.phone = 'INVALID_PHONE';
  if (!p.password || p.password.length < 8) fields.password = 'MIN_LENGTH';
  if (p.role === 'seller') {
    if (!p.company?.name) fields['company.name'] = 'REQUIRED';
    if (!/^\d{9}$/.test(p.company?.tin || '')) fields['company.tin'] = 'INVALID_TIN';
    if (data.companies.some((c) => c.tin === p.company?.tin)) fields['company.tin'] = 'TIN_TAKEN';
  }
  if (Object.keys(fields).length) validationError(fields);

  const id = uid('u-');
  const user: DbUser = {
    id,
    role: p.role,
    fullName: p.fullName.trim(),
    email,
    phone: p.phone,
    organization: p.organization,
    status: 'active',
    createdAt: now(),
    addresses: [],
    notificationPrefs: { email: true, sms: true, orders: true, marketing: false },
    passwordHash: mockHash(p.password),
  };
  if (p.role === 'courier' && p.courier) {
    user.courier = { transport: p.courier.transport, region: p.courier.region, rating: 5, deliveriesCount: 0 };
    data.schedules[id] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d as ScheduleDay['day'], active: d < 5, from: '09:00', to: '18:00' }));
  }
  if (p.role === 'seller' && p.company) {
    const companyId = uid('c');
    const slug = p.company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || companyId;
    data.companies.push({
      id: companyId,
      ownerId: id,
      name: p.company.name,
      slug: `${slug}-${companyId.slice(-4)}`,
      tin: p.company.tin,
      description: '',
      region: p.company.region,
      address: p.company.region,
      phone: p.phone,
      email,
      foundedYear: new Date().getFullYear(),
      employees: '1–10',
      verified: false,
      rating: 0,
      reviewsCount: 0,
      productsCount: 0,
      ordersCount: 0,
      responseRate: 100,
      responseTimeHours: 2,
      mainCategories: [],
      pickupPoint: { label: 'Ombor', text: 'Toshkent', lat: 41.2995, lng: 69.2401 },
      createdAt: now(),
    });
    user.companyId = companyId;
    notify('u-admin', { type: 'system', title: 'Yangi kompaniya', body: `${p.company.name} ro'yxatdan o'tdi va tasdiqlashni kutmoqda.`, link: '/admin/companies' });
  }
  data.users.push(user);
  notify(id, {
    type: 'system',
    title: 'Xush kelibsiz!',
    body: "B2B Bozor platformasiga xush kelibsiz. Profilingizni to'ldirishni unutmang.",
    link: '/account/profile',
  });
  return { token: issueToken(id), user: publicUser(user) };
});

route('POST', '/auth/login', ({ body }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const user = db().users.find((u) => u.email === email);
  if (!user || user.passwordHash !== mockHash(String(body.password || ''))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (user.status === 'blocked') throw new ApiError(403, 'ACCOUNT_BLOCKED', 'Account is blocked');
  return { token: issueToken(user.id), user: publicUser(user) };
});

route('POST', '/auth/logout', (ctx) => {
  if (ctx.token) delete db().sessions[ctx.token];
  return { ok: true };
});

route('POST', '/auth/forgot-password', () => ({ ok: true }));

// The mock never emails a reset link, so any token is rejected.
route('POST', '/auth/reset-password', () => {
  throw new ApiError(400, 'INVALID_TOKEN', 'Reset link is invalid or expired');
});

const MOCK_PHONE_CODE = '123456';
route('POST', '/users/me/phone/send-code', (ctx) => {
  requireUser(ctx);
  return { ok: true, channel: 'console', devCode: MOCK_PHONE_CODE };
});

route('POST', '/users/me/phone/verify', (ctx) => {
  const u = requireUser(ctx);
  if (String(ctx.body.code ?? '') !== MOCK_PHONE_CODE) validationError({ code: 'WRONG_CODE' });
  u.phoneVerified = true;
  return publicUser(u);
});

/* ---------- payments (mock: the provider confirms instantly) ---------- */
route('POST', '/payments', (ctx) => {
  const u = requireUser(ctx, 'buyer');
  const data = db();
  const ids: ID[] = Array.isArray(ctx.body.orderIds) ? ctx.body.orderIds : [];
  const orders = ids.map((id) => data.orders.find((o) => o.id === id && o.buyerId === u.id));
  if (!ids.length || orders.some((o) => !o)) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  if (orders.some((o) => o!.paymentMethod !== 'card' || o!.paymentStatus !== 'unpaid' || o!.status === 'cancelled')) throw new ApiError(409, 'NOT_PAYABLE', 'Not payable');
  const id = uid('pay');
  orders.forEach((o) => {
    o!.paymentStatus = 'paid';
    o!.updatedAt = now();
  });
  (data.payments ??= {})[id] = { id, userId: u.id, provider: ctx.body.provider === 'click' ? 'click' : 'payme', orderIds: ids, amount: orders.reduce((s, o) => s + o!.total, 0), status: 'paid', createdAt: now() };
  return { id, url: `/checkout/success?payment=${id}`, amount: data.payments[id].amount };
});

route('GET', '/payments/:id', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const p = data.payments?.[ctx.params.id];
  if (!p || p.userId !== u.id) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  return { ...p, orders: p.orderIds.map((id) => data.orders.find((o) => o.id === id)).filter(Boolean) };
});

route('GET', '/auth/me', (ctx) => publicUser(requireUser(ctx)));

route('PATCH', '/users/me', (ctx) => {
  const u = requireUser(ctx);
  const allowed = ['fullName', 'phone', 'organization', 'avatar', 'addresses', 'notificationPrefs'] as const;
  const fields: Record<string, string> = {};
  if (ctx.body.fullName !== undefined && String(ctx.body.fullName).trim().length < 3) fields.fullName = 'MIN_LENGTH';
  if (ctx.body.phone !== undefined && !/^\+998\d{9}$/.test(ctx.body.phone)) fields.phone = 'INVALID_PHONE';
  if (ctx.body.email !== undefined) {
    const email = String(ctx.body.email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) fields.email = 'INVALID_EMAIL';
    else if (db().users.some((x) => x.email === email && x.id !== u.id)) fields.email = 'EMAIL_TAKEN';
    else u.email = email;
  }
  if (Object.keys(fields).length) validationError(fields);
  for (const k of allowed) if (ctx.body[k] !== undefined) (u as any)[k] = ctx.body[k];
  if (u.courier && ctx.body.courier) u.courier = { ...u.courier, ...ctx.body.courier };
  return publicUser(u);
});

route('POST', '/users/me/password', (ctx) => {
  const u = requireUser(ctx);
  if (u.passwordHash !== mockHash(String(ctx.body.currentPassword || ''))) validationError({ currentPassword: 'WRONG_PASSWORD' });
  if (String(ctx.body.newPassword || '').length < 8) validationError({ newPassword: 'MIN_LENGTH' });
  u.passwordHash = mockHash(ctx.body.newPassword);
  return { ok: true };
});

route('POST', '/uploads', (ctx) => {
  requireUser(ctx);
  // The real backend accepts multipart/form-data and returns a CDN url.
  return { url: String(ctx.body.dataUrl) };
});

route('POST', '/dev/reset', () => {
  resetDb();
  return { ok: true };
});

/* ======================================================================
   CATALOG
   ====================================================================== */
route('GET', '/categories', () => {
  const data = db();
  return data.categories.map((c) => ({
    ...c,
    productsCount: data.products.filter((p) => p.categorySlug === c.slug && p.status === 'active').length,
  }));
});

route('GET', '/stats/public', (): PublicStats => {
  const data = db();
  return {
    products: data.products.filter((p) => p.status === 'active').length,
    companies: data.companies.length,
    buyers: data.users.filter((u) => u.role === 'buyer').length,
    orders: data.orders.length,
    regions: new Set(data.companies.map((c) => c.region)).size,
    ordersToday: data.orders.filter((o) => within(o.createdAt, 1)).length,
    avgResponseHours: Math.round((data.companies.reduce((s, c) => s + c.responseTimeHours, 0) / Math.max(1, data.companies.length)) * 10) / 10,
  };
});

route('GET', '/stats/activity', (): ActivityItem[] => {
  return db()
    .orders.filter((o) => o.status !== 'cancelled')
    .slice(0, 14)
    .map((o) => {
      const it = o.items[0];
      const parts = (o.delivery.address?.text ?? o.delivery.pickupPoint.text).split(',').map((x) => x.trim());
      return {
        id: o.id,
        companyName: o.companyName,
        productName: it.name,
        categorySlug: it.categorySlug,
        quantity: it.quantity,
        unit: it.unit,
        area: parts.slice(0, 2).join(', '),
        at: o.createdAt,
      };
    });
});

function filterProducts(query: Query, base: Product[]) {
  const data = db();
  let items = base;
  const q = String(query.q ?? '').trim();
  if (q) {
    items = items.filter((p) => {
      const c = data.companies.find((x) => x.id === p.companyId);
      return matches(`${p.name} ${p.description} ${p.tags.join(' ')} ${c?.name ?? ''}`, q);
    });
  }
  if (query.category) items = items.filter((p) => p.categorySlug === query.category);
  if (query.company) items = items.filter((p) => p.companyId === query.company);
  if (query.minPrice) items = items.filter((p) => unitPriceFor(p, p.moq) >= Number(query.minPrice));
  if (query.maxPrice) items = items.filter((p) => unitPriceFor(p, p.moq) <= Number(query.maxPrice));
  if (query.rating) items = items.filter((p) => p.rating >= Number(query.rating));
  if (String(query.discount) === 'true') items = items.filter((p) => p.discount > 0);
  if (String(query.inStock) === 'true') items = items.filter((p) => p.stock >= p.moq);
  if (String(query.verified) === 'true') {
    items = items.filter((p) => data.companies.find((c) => c.id === p.companyId)?.verified);
  }
  if (query.region) items = items.filter((p) => data.companies.find((c) => c.id === p.companyId)?.region === query.region);

  const sort = String(query.sort || 'popular');
  const sorted = [...items];
  if (sort === 'price_asc') sorted.sort((a, b) => unitPriceFor(a, a.moq) - unitPriceFor(b, b.moq));
  else if (sort === 'price_desc') sorted.sort((a, b) => unitPriceFor(b, b.moq) - unitPriceFor(a, a.moq));
  else if (sort === 'rating') sorted.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
  else if (sort === 'newest') sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else sorted.sort((a, b) => b.soldCount * 3 + b.views / 10 - (a.soldCount * 3 + a.views / 10));
  return sorted;
}

route('GET', '/products', ({ query }) => {
  const active = db().products.filter((p) => p.status === 'active');
  const page = paginate(filterProducts(query, active), query);
  return { ...page, items: page.items.map(withCompany) };
});

route('GET', '/products/suggest', ({ query, locale }) => {
  const data = db();
  const q = String(query.q ?? '').trim();
  if (q.length < 2) return { products: [], categories: [], companies: [] };
  return {
    products: filterProducts({ q }, data.products.filter((p) => p.status === 'active'))
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, categorySlug: p.categorySlug, price: unitPriceFor(p, p.moq), unit: p.unit })),
    categories: data.categories.filter((c) => matches(`${c.name.uz} ${c.name.ru} ${c.name.en}`, q)).map((c) => ({ slug: c.slug, name: c.name[locale] })),
    companies: data.companies.filter((c) => matches(c.name, q)).slice(0, 3).map((c) => ({ id: c.id, name: c.name, verified: c.verified })),
  };
});

route('POST', '/products/batch', ({ body }) => {
  const ids: ID[] = Array.isArray(body.ids) ? body.ids : [];
  const data = db();
  return ids
    .map((id) => data.products.find((p) => p.id === id))
    .filter((p): p is Product => !!p)
    .map(withCompany);
});

route('GET', '/products/:id', (ctx) => {
  const p = db().products.find((x) => x.id === ctx.params.id);
  const isOwner = ctx.user?.role === 'seller' && ctx.user.companyId === p?.companyId;
  if (!p || (p.status !== 'active' && !isOwner && ctx.user?.role !== 'admin')) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  p.views += 1;
  persist();
  return withCompany(p);
});

route('GET', '/products/:id/similar', ({ params }) => {
  const data = db();
  const p = data.products.find((x) => x.id === params.id);
  if (!p) return [];
  return data.products
    .filter((x) => x.id !== p.id && x.status === 'active' && x.categorySlug === p.categorySlug)
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 8)
    .map(withCompany);
});

route('GET', '/products/:id/reviews', ({ params, query }) => {
  const items = db()
    .reviews.filter((r) => r.productId === params.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const distribution = [5, 4, 3, 2, 1].map((star) => ({ star, count: items.filter((r) => r.rating === star).length }));
  return { ...paginate(items, query, 5), distribution };
});

route('GET', '/products/:id/can-review', (ctx) => {
  if (!ctx.user || ctx.user.role !== 'buyer') return { canReview: false, reason: 'NOT_BUYER' };
  const bought = db().orders.some((o) => o.buyerId === ctx.user!.id && o.status === 'delivered' && o.items.some((i) => i.productId === ctx.params.id));
  return { canReview: bought, reason: bought ? undefined : 'NOT_PURCHASED' };
});

route('POST', '/products/:id/reviews', (ctx) => {
  const u = requireUser(ctx, 'buyer');
  const data = db();
  const bought = data.orders.some((o) => o.buyerId === u.id && o.status === 'delivered' && o.items.some((i) => i.productId === ctx.params.id));
  if (!bought) throw new ApiError(403, 'NOT_PURCHASED', 'Only verified buyers can review');
  const rating = Math.round(Number(ctx.body.rating));
  if (!(rating >= 1 && rating <= 5)) validationError({ rating: 'REQUIRED' });
  const comment = String(ctx.body.comment ?? '').trim();
  if (comment.length < 5) validationError({ comment: 'MIN_LENGTH' });
  const existing = data.reviews.find((r) => r.productId === ctx.params.id && r.userId === u.id);
  if (existing) {
    Object.assign(existing, { rating, comment, createdAt: now() });
  } else {
    data.reviews.push({ id: uid('r'), productId: ctx.params.id, userId: u.id, userName: u.fullName, rating, comment, createdAt: now() });
  }
  recomputeProductRating(ctx.params.id);
  const p = data.products.find((x) => x.id === ctx.params.id)!;
  const owner = data.companies.find((c) => c.id === p.companyId)!.ownerId;
  notify(owner, { type: 'review', title: 'Yangi sharh', body: `${u.fullName} "${p.name}" uchun ${rating}★ baho qoldirdi.`, link: `/products/${p.id}` });
  return { ok: true };
});

route('GET', '/companies', ({ query }) => {
  const data = db();
  let items = [...data.companies];
  const q = String(query.q ?? '').trim();
  if (q) items = items.filter((c) => matches(`${c.name} ${c.description}`, q));
  if (query.region) items = items.filter((c) => c.region === query.region);
  if (query.category) items = items.filter((c) => c.mainCategories.includes(String(query.category)));
  if (String(query.verified) === 'true') items = items.filter((c) => c.verified);
  items.sort((a, b) => Number(b.verified) - Number(a.verified) || b.rating - a.rating);
  return paginate(items, query, 12);
});

route('GET', '/companies/:id', ({ params }) => {
  const c = db().companies.find((x) => x.id === params.id || x.slug === params.id);
  if (!c) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'Company not found');
  return c;
});

/* ======================================================================
   FAVORITES
   ====================================================================== */
route('GET', '/favorites', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const ids = data.favorites[u.id] ?? [];
  return ids
    .map((id) => data.products.find((p) => p.id === id))
    .filter((p): p is Product => !!p)
    .map(withCompany);
});

route('GET', '/favorites/ids', (ctx) => {
  const u = requireUser(ctx);
  return db().favorites[u.id] ?? [];
});

route('POST', '/favorites/:productId', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const list = (data.favorites[u.id] ??= []);
  const i = list.indexOf(ctx.params.productId);
  if (i >= 0) list.splice(i, 1);
  else list.unshift(ctx.params.productId);
  return { favorited: i < 0, ids: list };
});

/* ======================================================================
   ORDERS
   ====================================================================== */
route('POST', '/orders/checkout', async (ctx) => {
  const u = requireUser(ctx, 'buyer');
  const data = db();
  const p = ctx.body as CheckoutPayload;
  if (!p.items?.length) throw new ApiError(400, 'CART_EMPTY', 'Cart is empty');
  if (p.deliveryType === 'courier' && !p.address) validationError({ address: 'REQUIRED' });
  if (p.address && !inUzbekistan(p.address)) validationError({ address: 'OUTSIDE_SERVICE_AREA' });

  const groups = new Map<ID, { product: Product; quantity: number }[]>();
  for (const it of p.items) {
    const product = data.products.find((x) => x.id === it.productId && x.status === 'active');
    if (!product) throw new ApiError(409, 'PRODUCT_UNAVAILABLE', `Product ${it.productId} unavailable`);
    if (it.quantity < product.moq) throw new ApiError(409, 'BELOW_MOQ', `${product.name}: min ${product.moq}`);
    if (it.quantity > product.stock) throw new ApiError(409, 'OUT_OF_STOCK', `${product.name}: only ${product.stock} left`);
    const list = groups.get(product.companyId) ?? [];
    list.push({ product, quantity: it.quantity });
    groups.set(product.companyId, list);
  }

  // Road routes per seller warehouse (real routing; the backend calls OSRM server-side).
  const routes = new Map<ID, Awaited<ReturnType<typeof getRoute>>>();
  if (p.deliveryType === 'courier' && p.address) {
    for (const companyId of groups.keys()) {
      const company = data.companies.find((c) => c.id === companyId)!;
      const r = await getRoute(company.pickupPoint, p.address);
      if (!courierAvailable(r.distanceKm)) {
        throw new ApiError(409, 'DELIVERY_OUT_OF_RANGE', `${company.name}: ${r.distanceKm} km > ${DELIVERY.maxKm} km`);
      }
      routes.set(companyId, r);
    }
  }

  const created: Order[] = [];
  for (const [companyId, lines] of groups) {
    const company = data.companies.find((c) => c.id === companyId)!;
    const items = lines.map(({ product, quantity }) => {
      const unitPrice = unitPriceFor(product, quantity);
      product.stock -= quantity;
      product.soldCount += quantity;
      return {
        productId: product.id,
        name: product.name,
        image: product.images[0],
        categorySlug: product.categorySlug,
        unit: product.unit,
        unitPrice,
        quantity,
        total: unitPrice * quantity,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const route = routes.get(companyId);
    const fee = route ? deliveryFee(subtotal, route.distanceKm) : 0;
    const order: Order = {
      id: uid('o'),
      number: `B2B-${++data.counters.order}`,
      buyerId: u.id,
      buyerName: u.fullName,
      buyerPhone: u.phone,
      buyerOrganization: u.organization,
      companyId,
      companyName: company.name,
      items,
      subtotal,
      deliveryFee: fee,
      total: subtotal + fee,
      status: 'pending',
      paymentMethod: p.paymentMethod,
      // card orders are paid via POST /payments (Payme / Click), like the real backend
      paymentStatus: 'unpaid',
      delivery: {
        type: p.deliveryType,
        address: p.deliveryType === 'courier' ? p.address : undefined,
        pickupPoint: company.pickupPoint,
        distanceKm: route?.distanceKm,
        durationMin: route?.durationMin,
        routeSource: route?.source,
      },
      note: p.note?.trim() || undefined,
      timeline: [{ status: 'pending', at: now(), by: u.fullName }],
      createdAt: now(),
      updatedAt: now(),
    };
    data.orders.unshift(order);
    if (route) data.routes[order.id] = route;
    company.ordersCount += 1;
    created.push(order);
    notify(company.ownerId, { type: 'order', title: 'Yangi buyurtma', body: `${order.number} — ${u.fullName} (${items.length} ta mahsulot)`, link: `/seller/orders/${order.id}` });
  }
  notify(u.id, {
    type: 'order',
    title: 'Buyurtma qabul qilindi',
    body: `${created.map((o) => o.number).join(', ')} — sotuvchi tasdiqlashini kuting.`,
    link: '/account/orders',
  });
  if (p.address && !u.addresses.some((a) => a.text === p.address!.text)) {
    u.addresses.unshift({ ...p.address, label: p.address.label || 'Manzil' });
    u.addresses = u.addresses.slice(0, 5);
  }
  return created;
});

route('GET', '/orders', (ctx) => {
  const u = requireUser(ctx);
  const { query } = ctx;
  let items = db().orders.filter((o) => {
    if (u.role === 'admin') return true;
    if (u.role === 'seller') return o.companyId === u.companyId;
    if (u.role === 'courier') return o.courierId === u.id;
    return o.buyerId === u.id;
  });
  if (query.status === 'active') items = items.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  else if (query.status) items = items.filter((o) => o.status === query.status);
  const q = String(query.q ?? '').trim();
  if (q) items = items.filter((o) => matches(`${o.number} ${o.buyerName} ${o.companyName} ${o.items.map((i) => i.name).join(' ')}`, q));
  return paginate(items, query, Number(query.pageSize) || 10);
});

route('GET', '/orders/:id', (ctx) => {
  const u = requireUser(ctx);
  const o = findOrder(ctx.params.id);
  if (!canSeeOrder(u, o)) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  return o;
});

route('POST', '/orders/:id/cancel', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const o = findOrder(ctx.params.id);
  const isBuyer = o.buyerId === u.id;
  const isSeller = u.role === 'seller' && o.companyId === u.companyId;
  if (!isBuyer && !isSeller && u.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Access denied');
  const allowed = isBuyer ? ['pending'] : ['pending', 'confirmed', 'ready'];
  if (!allowed.includes(o.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'Order cannot be cancelled now');
  const reason = String(ctx.body.reason || '').trim() || undefined;
  pushEvent(o, 'cancelled', u.fullName, reason);
  o.cancelReason = reason;
  if (o.paymentStatus === 'paid') o.paymentStatus = 'refunded';
  for (const it of o.items) {
    const p = data.products.find((x) => x.id === it.productId);
    if (p) {
      p.stock += it.quantity;
      p.soldCount = Math.max(0, p.soldCount - it.quantity);
    }
  }
  const owner = data.companies.find((c) => c.id === o.companyId)!.ownerId;
  const target = isBuyer ? owner : o.buyerId;
  notify(target, { type: 'order', title: 'Buyurtma bekor qilindi', body: `${o.number}${reason ? ': ' + reason : ''}`, link: isBuyer ? `/seller/orders/${o.id}` : `/account/orders/${o.id}` });
  return o;
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
const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: 'kutilmoqda',
  confirmed: 'tasdiqlandi',
  ready: "jo'natishga tayyor",
  in_transit: "yo'lda",
  delivered: 'yetkazildi',
  cancelled: 'bekor qilindi',
};

route('POST', '/orders/:id/status', (ctx) => {
  const u = requireUser(ctx, 'seller', 'courier', 'admin');
  const data = db();
  const o = findOrder(ctx.params.id);
  const next = ctx.body.status as OrderStatus;
  if (u.role === 'seller') {
    if (o.companyId !== u.companyId) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    if (!SELLER_TRANSITIONS[o.status]?.includes(next)) throw new ApiError(409, 'INVALID_TRANSITION', 'Invalid status change');
    if (next === 'delivered' && o.delivery.type !== 'pickup') throw new ApiError(409, 'INVALID_TRANSITION', 'Courier must deliver this order');
    if (next === 'confirmed' && o.paymentMethod === 'card' && o.paymentStatus !== 'paid') throw new ApiError(409, 'PAYMENT_PENDING', 'Waiting for card payment');
  } else if (u.role === 'courier') {
    if (o.courierId !== u.id) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    if (!COURIER_TRANSITIONS[o.status]?.includes(next)) throw new ApiError(409, 'INVALID_TRANSITION', 'Invalid status change');
  }
  pushEvent(o, next, u.fullName, ctx.body.note);
  if (next === 'confirmed' && o.paymentMethod === 'transfer') {
    // invoice issued on confirmation; marked paid when the transfer lands (simulated)
  }
  if (next === 'delivered') {
    o.paymentStatus = 'paid';
    if (o.courierId) {
      const c = data.users.find((x) => x.id === o.courierId);
      if (c?.courier) c.courier.deliveriesCount += 1;
    }
  }
  notify(o.buyerId, { type: 'order', title: `Buyurtma ${STATUS_TEXT[next]}`, body: `${o.number} — ${o.companyName}`, link: `/account/orders/${o.id}` });
  if (u.role === 'courier') {
    const owner = data.companies.find((c) => c.id === o.companyId)!.ownerId;
    notify(owner, { type: 'order', title: `Buyurtma ${STATUS_TEXT[next]}`, body: `${o.number} — kuryer ${u.fullName}`, link: `/seller/orders/${o.id}` });
  }
  if (next === 'ready' && o.delivery.type === 'courier') {
    data.users
      .filter((x) => x.role === 'courier' && x.status === 'active')
      .forEach((c) => notify(c.id, { type: 'order', title: 'Yangi yetkazish', body: `${o.number}: ${o.delivery.distanceKm ?? '—'} km`, link: '/courier/available' }));
  }
  return o;
});

route('POST', '/orders/:id/mark-paid', (ctx) => {
  const u = requireUser(ctx, 'seller', 'admin');
  const o = findOrder(ctx.params.id);
  if (u.role === 'seller' && o.companyId !== u.companyId) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
  o.paymentStatus = 'paid';
  o.updatedAt = now();
  return o;
});

/* ======================================================================
   COURIER
   ====================================================================== */
route('GET', '/courier/available', (ctx) => {
  requireUser(ctx, 'courier');
  return db().orders.filter((o) => o.status === 'ready' && o.delivery.type === 'courier' && !o.courierId);
});

route('POST', '/orders/:id/assign', (ctx) => {
  const u = requireUser(ctx, 'courier');
  const data = db();
  const o = findOrder(ctx.params.id);
  if (o.courierId) throw new ApiError(409, 'ALREADY_ASSIGNED', 'Another courier already took this order');
  if (o.status !== 'ready' || o.delivery.type !== 'courier') throw new ApiError(409, 'INVALID_TRANSITION', 'Order is not ready');
  const active = data.orders.filter((x) => x.courierId === u.id && ['ready', 'in_transit'].includes(x.status)).length;
  if (active >= 5) throw new ApiError(409, 'TOO_MANY_ACTIVE', 'Finish current deliveries first');
  o.courierId = u.id;
  o.courierName = u.fullName;
  o.courierPhone = u.phone;
  o.courierFee = Math.round((o.deliveryFee || DELIVERY.baseFee) * DELIVERY.courierShare);
  o.updatedAt = now();
  o.timeline.push({ status: 'ready', at: now(), by: u.fullName, note: 'Kuryer biriktirildi' });
  notify(o.buyerId, { type: 'order', title: 'Kuryer biriktirildi', body: `${o.number}: ${u.fullName}, ${u.phone}`, link: `/account/orders/${o.id}` });
  return o;
});

route('POST', '/courier/location', (ctx) => {
  const u = requireUser(ctx, 'courier');
  const lat = Number(ctx.body.lat);
  const lng = Number(ctx.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) validationError({ lat: 'REQUIRED' });
  const loc: CourierLocation = {
    lat,
    lng,
    at: now(),
    accuracy: ctx.body.accuracy ? Math.round(Number(ctx.body.accuracy)) : undefined,
    heading: Number.isFinite(Number(ctx.body.heading)) && ctx.body.heading !== null ? Number(ctx.body.heading) : undefined,
    speed: Number.isFinite(Number(ctx.body.speed)) && ctx.body.speed !== null ? Number(ctx.body.speed) : undefined,
  };
  if (u.courier) u.courier.location = loc;
  const active = db().orders.filter((o) => o.courierId === u.id && ['ready', 'in_transit'].includes(o.status));
  active.forEach((o) => (o.courierLocation = loc));
  return { ok: true, activeOrders: active.length };
});

/** A GPS fix older than this is considered stale and replaced by simulation (demo only). */
const GPS_FRESH_MS = 90_000;

async function orderRoute(o: Order) {
  const data = db();
  if (!o.delivery.address) return undefined;
  const cached = data.routes[o.id];
  if (cached && cached.source === 'osrm') return cached;
  const r = await getRoute(o.delivery.pickupPoint, o.delivery.address);
  data.routes[o.id] = r;
  if (r.source === 'osrm') {
    o.delivery.distanceKm = r.distanceKm;
    o.delivery.durationMin = r.durationMin;
    o.delivery.routeSource = 'osrm';
  }
  persist();
  return r;
}

route('GET', '/orders/:id/tracking', async (ctx): Promise<OrderTracking> => {
  const u = requireUser(ctx);
  const o = findOrder(ctx.params.id);
  if (!canSeeOrder(u, o)) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  const route = o.delivery.type === 'courier' ? await orderRoute(o) : undefined;
  const result: OrderTracking = { orderId: o.id, status: o.status, route };
  if (!route || !o.delivery.address) return result;

  const gps = o.courierLocation && Date.now() - new Date(o.courierLocation.at).getTime() < GPS_FRESH_MS ? o.courierLocation : undefined;
  const speedKmPerMin = route.durationMin ? route.distanceKm / route.durationMin : 0.45;

  if (o.status === 'in_transit') {
    if (gps) {
      const pr = progressOnPath(route.geometry, gps);
      result.courier = { ...gps, source: 'gps' };
      result.remainingKm = Math.round(pr.remainingKm * 10) / 10;
      result.progress = pr.progress;
    } else {
      // Demo: move the courier along the real road from the moment it was picked up.
      const startedAt = [...o.timeline].reverse().find((e) => e.status === 'in_transit')?.at ?? o.updatedAt;
      const elapsedMin = (Date.now() - new Date(startedAt).getTime()) / 60000;
      const fraction = Math.min(0.97, Math.max(0, elapsedMin / Math.max(1, route.durationMin)));
      const { point, heading } = pointAlong(route.geometry, fraction);
      result.courier = { ...point, heading, at: now(), source: 'simulated' };
      result.remainingKm = Math.round(route.distanceKm * (1 - fraction) * 10) / 10;
      result.progress = fraction;
    }
    result.etaMin = Math.max(1, Math.round((result.remainingKm ?? 0) / speedKmPerMin));
  } else if (o.status === 'ready' && o.courierId && gps) {
    result.courier = { ...gps, source: 'gps' };
  } else if (o.status === 'delivered') {
    result.progress = 1;
    result.remainingKm = 0;
  }
  return result;
});

route('GET', '/courier/dashboard', (ctx): CourierDashboard => {
  const u = requireUser(ctx, 'courier');
  const data = db();
  const mine = data.orders.filter((o) => o.courierId === u.id);
  const delivered = mine.filter((o) => o.status === 'delivered');
  const deliveredAt = (o: Order) => o.timeline.find((e) => e.status === 'delivered')?.at ?? o.updatedAt;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    earnings: delivered.filter((o) => within(deliveredAt(o), 30)).reduce((s, o) => s + (o.courierFee ?? 0), 0),
    earningsToday: delivered.filter((o) => new Date(deliveredAt(o)) >= today).reduce((s, o) => s + (o.courierFee ?? 0), 0),
    delivered: delivered.length,
    active: mine.filter((o) => ['ready', 'in_transit'].includes(o.status)).length,
    available: data.orders.filter((o) => o.status === 'ready' && o.delivery.type === 'courier' && !o.courierId).length,
    rating: u.courier?.rating ?? 5,
    avgDistanceKm: delivered.length ? Math.round((delivered.reduce((s, o) => s + (o.delivery.distanceKm ?? 0), 0) / delivered.length) * 10) / 10 : 0,
    earningsSeries: daySeries(30, delivered.map((o) => ({ at: deliveredAt(o), value: o.courierFee ?? 0 }))),
  };
});

route('GET', '/courier/schedule', (ctx) => {
  const u = requireUser(ctx, 'courier');
  return db().schedules[u.id] ?? [];
});

route('PUT', '/courier/schedule', (ctx) => {
  const u = requireUser(ctx, 'courier');
  const days = ctx.body.days as ScheduleDay[];
  for (const d of days) {
    if (d.active && d.from >= d.to) validationError({ [`day${d.day}`]: 'INVALID_RANGE' });
  }
  db().schedules[u.id] = days;
  return days;
});

/* ======================================================================
   SELLER
   ====================================================================== */
function sellerCompany(u: DbUser) {
  const c = db().companies.find((x) => x.id === u.companyId);
  if (!c) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'Company not found');
  return c;
}

route('GET', '/seller/dashboard', (ctx): SellerDashboard => {
  const u = requireUser(ctx, 'seller');
  const data = db();
  const c = sellerCompany(u);
  const range = Math.min(365, Number(ctx.query.range) || 30);
  const orders = data.orders.filter((o) => o.companyId === c.id);
  const live = orders.filter((o) => o.status !== 'cancelled');
  const cur = live.filter((o) => within(o.createdAt, range));
  const prev = live.filter((o) => within(o.createdAt, range * 2, range));
  const revenue = cur.reduce((s, o) => s + o.subtotal, 0);
  const prevRevenue = prev.reduce((s, o) => s + o.subtotal, 0);
  const products = data.products.filter((p) => p.companyId === c.id);

  const productStats = new Map<ID, { sold: number; revenue: number }>();
  for (const o of cur) {
    for (const it of o.items) {
      const s = productStats.get(it.productId) ?? { sold: 0, revenue: 0 };
      s.sold += it.quantity;
      s.revenue += it.total;
      productStats.set(it.productId, s);
    }
  }
  const statuses: OrderStatus[] = ['pending', 'confirmed', 'ready', 'in_transit', 'delivered', 'cancelled'];
  return {
    revenue,
    revenueChange: pctChange(revenue, prevRevenue),
    orders: cur.length,
    ordersChange: pctChange(cur.length, prev.length),
    avgOrder: cur.length ? Math.round(revenue / cur.length) : 0,
    activeProducts: products.filter((p) => p.status === 'active').length,
    lowStock: products.filter((p) => p.stock < p.moq * 3).length,
    openRfqs: data.rfqs.filter((r) => r.companyId === c.id && r.status === 'open').length,
    rating: c.rating,
    revenueSeries: daySeries(range, cur.map((o) => ({ at: o.createdAt, value: o.subtotal }))),
    statusBreakdown: statuses.map((status) => ({ status, count: orders.filter((o) => o.status === status && within(o.createdAt, range)).length })),
    topProducts: [...productStats.entries()]
      .map(([id, s]) => {
        const p = products.find((x) => x.id === id);
        return { id, name: p?.name ?? id, categorySlug: p?.categorySlug ?? 'food', ...s };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    recentOrders: orders.slice(0, 6),
  };
});

route('GET', '/seller/products', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const c = sellerCompany(u);
  let items = db().products.filter((p) => p.companyId === c.id);
  const q = String(ctx.query.q ?? '').trim();
  if (q) items = items.filter((p) => matches(`${p.name} ${p.tags.join(' ')}`, q));
  if (ctx.query.status === 'low_stock') items = items.filter((p) => p.stock < p.moq * 3);
  else if (ctx.query.status) items = items.filter((p) => p.status === ctx.query.status);
  if (ctx.query.category) items = items.filter((p) => p.categorySlug === ctx.query.category);
  items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return paginate(items, ctx.query, 10);
});

route('GET', '/seller/products/:id', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const p = db().products.find((x) => x.id === ctx.params.id && x.companyId === u.companyId);
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  return p;
});

function validateProduct(input: ProductInput) {
  const fields: Record<string, string> = {};
  if (!input.name || input.name.trim().length < 3) fields.name = 'MIN_LENGTH';
  if (!db().categories.some((c) => c.slug === input.categorySlug)) fields.categorySlug = 'REQUIRED';
  if (!(input.price > 0)) fields.price = 'POSITIVE';
  if (!(input.moq >= 1)) fields.moq = 'POSITIVE';
  if (!(input.stock >= 0)) fields.stock = 'POSITIVE';
  if (!(input.discount >= 0 && input.discount <= 90)) fields.discount = 'RANGE';
  input.tiers?.forEach((t, i) => {
    if (t.minQty <= input.moq) fields[`tiers.${i}.minQty`] = 'TIER_ABOVE_MOQ';
    if (t.price >= input.price) fields[`tiers.${i}.price`] = 'TIER_BELOW_BASE';
  });
  if (Object.keys(fields).length) validationError(fields);
}

route('POST', '/seller/products', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const c = sellerCompany(u);
  const input = ctx.body as ProductInput;
  validateProduct(input);
  const product: Product = {
    id: uid('p'),
    companyId: c.id,
    ...input,
    name: input.name.trim(),
    tiers: [...(input.tiers ?? [])].sort((a, b) => a.minQty - b.minQty),
    rating: 0,
    reviewsCount: 0,
    soldCount: 0,
    views: 0,
    status: c.verified ? input.status : 'pending',
    createdAt: now(),
    updatedAt: now(),
  };
  db().products.unshift(product);
  c.productsCount += 1;
  if (!c.mainCategories.includes(product.categorySlug)) c.mainCategories.push(product.categorySlug);
  if (product.status === 'pending') {
    notify('u-admin', { type: 'system', title: 'Moderatsiya', body: `${c.name}: "${product.name}" tasdiqlashni kutmoqda.`, link: '/admin/products' });
  }
  return product;
});

route('PATCH', '/seller/products/:id', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const c = sellerCompany(u);
  const p = db().products.find((x) => x.id === ctx.params.id && x.companyId === c.id);
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  const input = { ...p, ...ctx.body } as ProductInput;
  validateProduct(input);
  const status = ctx.body.status && ['pending', 'rejected'].includes(p.status) ? p.status : (ctx.body.status ?? p.status);
  Object.assign(p, ctx.body, { status, tiers: [...(input.tiers ?? [])].sort((a, b) => a.minQty - b.minQty), updatedAt: now() });
  return p;
});

route('DELETE', '/seller/products/:id', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const data = db();
  const c = sellerCompany(u);
  const i = data.products.findIndex((x) => x.id === ctx.params.id && x.companyId === c.id);
  if (i < 0) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  data.products.splice(i, 1);
  c.productsCount = Math.max(0, c.productsCount - 1);
  return { ok: true };
});

route('GET', '/seller/company', (ctx) => sellerCompany(requireUser(ctx, 'seller')));

route('PATCH', '/seller/company', (ctx) => {
  const c = sellerCompany(requireUser(ctx, 'seller'));
  const allowed = ['name', 'description', 'logo', 'address', 'phone', 'email', 'website', 'employees', 'foundedYear', 'pickupPoint', 'region'] as const;
  if (ctx.body.name !== undefined && String(ctx.body.name).trim().length < 2) validationError({ name: 'MIN_LENGTH' });
  for (const k of allowed) if (ctx.body[k] !== undefined) (c as any)[k] = ctx.body[k];
  return c;
});

/* ======================================================================
   RFQ (requests for quotation)
   ====================================================================== */
route('POST', '/rfqs', (ctx) => {
  const u = requireUser(ctx, 'buyer');
  const data = db();
  const company = data.companies.find((c) => c.id === ctx.body.companyId);
  if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'Company not found');
  const product = ctx.body.productId ? data.products.find((p) => p.id === ctx.body.productId) : undefined;
  const fields: Record<string, string> = {};
  if (!(Number(ctx.body.quantity) > 0)) fields.quantity = 'POSITIVE';
  if (String(ctx.body.message ?? '').trim().length < 10) fields.message = 'MIN_LENGTH';
  if (!product && !String(ctx.body.productName ?? '').trim()) fields.productName = 'REQUIRED';
  if (Object.keys(fields).length) validationError(fields);
  const rfq: Rfq = {
    id: uid('q'),
    number: `RFQ-${++data.counters.rfq}`,
    buyerId: u.id,
    buyerName: u.fullName,
    buyerOrganization: u.organization,
    companyId: company.id,
    companyName: company.name,
    productId: product?.id,
    productName: product?.name ?? String(ctx.body.productName).trim(),
    quantity: Number(ctx.body.quantity),
    unit: product?.unit ?? ctx.body.unit ?? 'piece',
    targetPrice: ctx.body.targetPrice ? Number(ctx.body.targetPrice) : undefined,
    deadline: ctx.body.deadline || undefined,
    message: String(ctx.body.message).trim(),
    status: 'open',
    createdAt: now(),
  };
  data.rfqs.unshift(rfq);
  notify(company.ownerId, { type: 'rfq', title: "Yangi narx so'rovi", body: `${u.fullName}: ${rfq.productName} × ${rfq.quantity}`, link: '/seller/rfqs' });
  return rfq;
});

route('GET', '/rfqs', (ctx) => {
  const u = requireUser(ctx);
  let items = db().rfqs.filter((r) => (u.role === 'admin' ? true : u.role === 'seller' ? r.companyId === u.companyId : r.buyerId === u.id));
  if (ctx.query.status) items = items.filter((r) => r.status === ctx.query.status);
  return paginate(items, ctx.query, 10);
});

route('POST', '/rfqs/:id/respond', (ctx) => {
  const u = requireUser(ctx, 'seller');
  const r = db().rfqs.find((x) => x.id === ctx.params.id && x.companyId === u.companyId);
  if (!r) throw new ApiError(404, 'RFQ_NOT_FOUND', 'RFQ not found');
  if (!['open', 'answered'].includes(r.status)) throw new ApiError(409, 'INVALID_TRANSITION', 'RFQ is closed');
  if (!(Number(ctx.body.unitPrice) > 0)) validationError({ unitPrice: 'POSITIVE' });
  r.response = { unitPrice: Number(ctx.body.unitPrice), message: String(ctx.body.message ?? ''), validUntil: ctx.body.validUntil, at: now() };
  r.status = 'answered';
  notify(r.buyerId, { type: 'rfq', title: 'Narx taklifi keldi', body: `${r.companyName}: ${r.number}`, link: '/account/rfqs' });
  return r;
});

route('POST', '/rfqs/:id/:decision', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const r = data.rfqs.find((x) => x.id === ctx.params.id);
  if (!r) throw new ApiError(404, 'RFQ_NOT_FOUND', 'RFQ not found');
  const decision = ctx.params.decision;
  if (decision === 'close') {
    if (r.buyerId !== u.id && !(u.role === 'seller' && r.companyId === u.companyId)) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    r.status = u.role === 'seller' ? 'rejected' : 'closed';
  } else if (decision === 'accept' || decision === 'reject') {
    if (r.buyerId !== u.id) throw new ApiError(403, 'FORBIDDEN', 'Access denied');
    if (r.status !== 'answered') throw new ApiError(409, 'INVALID_TRANSITION', 'No offer to decide on');
    r.status = decision === 'accept' ? 'accepted' : 'rejected';
  } else {
    throw new ApiError(404, 'NOT_FOUND', 'Unknown action');
  }
  const owner = data.companies.find((c) => c.id === r.companyId)!.ownerId;
  const target = r.buyerId === u.id ? owner : r.buyerId;
  notify(target, { type: 'rfq', title: `${r.number}: ${r.status}`, body: r.productName, link: r.buyerId === u.id ? '/seller/rfqs' : '/account/rfqs' });
  return r;
});

/* ======================================================================
   NOTIFICATIONS
   ====================================================================== */
route('GET', '/notifications', (ctx) => {
  const u = requireUser(ctx);
  const items = db().notifications.filter((n) => n.userId === u.id);
  return { items: items.slice(0, 50), unread: items.filter((n) => !n.read).length };
});

route('POST', '/notifications/read-all', (ctx) => {
  const u = requireUser(ctx);
  db().notifications.forEach((n) => n.userId === u.id && (n.read = true));
  return { ok: true };
});

route('POST', '/notifications/:id/read', (ctx) => {
  const u = requireUser(ctx);
  const n = db().notifications.find((x) => x.id === ctx.params.id && x.userId === u.id);
  if (n) n.read = true;
  return { ok: true };
});

/* ======================================================================
   MESSAGES
   ====================================================================== */
function presentConversation(c: DbConversation, me: ID): Conversation {
  const data = db();
  return {
    ...c,
    unreadBy: undefined,
    unread: c.unreadBy[me] ?? 0,
    participants: c.participantIds.map((id) => {
      const u = data.users.find((x) => x.id === id);
      const company = u?.companyId ? data.companies.find((x) => x.id === u.companyId) : undefined;
      return { id, name: u?.fullName ?? '—', avatar: u?.avatar, role: u?.role ?? 'buyer', companyName: company?.name ?? u?.organization };
    }),
  } as Conversation;
}

route('GET', '/conversations', (ctx) => {
  const u = requireUser(ctx);
  return db()
    .conversations.filter((c) => c.participantIds.includes(u.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((c) => presentConversation(c, u.id));
});

route('GET', '/conversations/unread', (ctx) => {
  const u = requireUser(ctx);
  return { count: db().conversations.reduce((s, c) => s + (c.participantIds.includes(u.id) ? (c.unreadBy[u.id] ?? 0) : 0), 0) };
});

function addMessage(conv: DbConversation, senderId: ID, text: string) {
  const data = db();
  const msg = { id: uid('m'), conversationId: conv.id, senderId, text, createdAt: now() };
  data.messages.push(msg);
  conv.lastMessage = { text, senderId, at: msg.createdAt };
  conv.updatedAt = msg.createdAt;
  for (const pid of conv.participantIds) if (pid !== senderId) conv.unreadBy[pid] = (conv.unreadBy[pid] ?? 0) + 1;
  return msg;
}

function scheduleAutoReply(conv: DbConversation, toUserId: ID) {
  const replier = conv.participantIds.find((id) => id !== toUserId)!;
  setTimeout(() => {
    const replies = [
      "Rahmat, xabaringizni oldik! Tez orada batafsil javob beramiz.",
      "Assalomu alaykum! So'rovingiz bo'yicha menejerimiz siz bilan bog'lanadi.",
      "Ha, bu mahsulot omborda bor. Qancha miqdor kerakligini aniqlashtirib bera olasizmi?",
    ];
    addMessage(conv, replier, replies[Math.floor(Math.random() * replies.length)]);
    const sender = db().users.find((x) => x.id === replier);
    notify(toUserId, { type: 'message', title: 'Yangi xabar', body: `${sender?.fullName}: ...`, link: `/messages/${conv.id}` });
    persist();
  }, 2500);
}

route('POST', '/conversations', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  let recipientId: ID | undefined = ctx.body.recipientId;
  if (ctx.body.companyId) recipientId = data.companies.find((c) => c.id === ctx.body.companyId)?.ownerId;
  if (!recipientId || recipientId === u.id || !data.users.some((x) => x.id === recipientId)) {
    throw new ApiError(400, 'INVALID_RECIPIENT', 'Invalid recipient');
  }
  const text = String(ctx.body.text ?? '').trim();
  let conv = data.conversations.find((c) => c.participantIds.includes(u.id) && c.participantIds.includes(recipientId!));
  const isNew = !conv;
  if (!conv) {
    const product = ctx.body.productId ? data.products.find((p) => p.id === ctx.body.productId) : undefined;
    conv = {
      id: uid('cv'),
      participantIds: [u.id, recipientId],
      productId: product?.id,
      productName: product?.name,
      unreadBy: { [u.id]: 0, [recipientId]: 0 },
      updatedAt: now(),
    };
    data.conversations.unshift(conv);
  }
  if (text) {
    addMessage(conv, u.id, text);
    notify(recipientId, { type: 'message', title: 'Yangi xabar', body: `${u.fullName}: ${text.slice(0, 80)}`, link: `/messages/${conv.id}` });
    if (isNew) scheduleAutoReply(conv, u.id);
  }
  return presentConversation(conv, u.id);
});

route('GET', '/conversations/:id/messages', (ctx) => {
  const u = requireUser(ctx);
  const data = db();
  const conv = data.conversations.find((c) => c.id === ctx.params.id && c.participantIds.includes(u.id));
  if (!conv) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  if (conv.unreadBy[u.id]) {
    conv.unreadBy[u.id] = 0;
    persist();
  }
  return {
    conversation: presentConversation(conv, u.id),
    messages: data.messages.filter((m) => m.conversationId === conv.id),
  };
});

route('POST', '/conversations/:id/messages', (ctx) => {
  const u = requireUser(ctx);
  const conv = db().conversations.find((c) => c.id === ctx.params.id && c.participantIds.includes(u.id));
  if (!conv) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
  const text = String(ctx.body.text ?? '').trim();
  if (!text) validationError({ text: 'REQUIRED' });
  const msg = addMessage(conv, u.id, text.slice(0, 2000));
  const other = conv.participantIds.find((id) => id !== u.id)!;
  notify(other, { type: 'message', title: 'Yangi xabar', body: `${u.fullName}: ${text.slice(0, 80)}`, link: `/messages/${conv.id}` });
  return msg;
});

/* ======================================================================
   AI ASSISTANT
   ====================================================================== */
route('GET', '/ai/chats', (ctx) => {
  const u = requireUser(ctx);
  return db()
    .aiChats.filter((c) => c.userId === u.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages, ...rest }) => ({ ...rest, messagesCount: messages.length }));
});

route('POST', '/ai/chats', (ctx) => {
  const u = requireUser(ctx);
  const chat: AiChat = { id: uid('ai'), userId: u.id, title: String(ctx.body.title || 'Yangi suhbat'), messages: [], createdAt: now(), updatedAt: now() };
  db().aiChats.unshift(chat);
  return chat;
});

function findChat(ctx: Ctx) {
  const u = requireUser(ctx);
  const chat = db().aiChats.find((c) => c.id === ctx.params.id && c.userId === u.id);
  if (!chat) throw new ApiError(404, 'CHAT_NOT_FOUND', 'Chat not found');
  return chat;
}

route('GET', '/ai/chats/:id', (ctx) => findChat(ctx));

route('PATCH', '/ai/chats/:id', (ctx) => {
  const chat = findChat(ctx);
  const title = String(ctx.body.title ?? '').trim();
  if (!title) validationError({ title: 'REQUIRED' });
  chat.title = title.slice(0, 80);
  return chat;
});

route('DELETE', '/ai/chats/:id', (ctx) => {
  const chat = findChat(ctx);
  const data = db();
  data.aiChats = data.aiChats.filter((c) => c.id !== chat.id);
  return { ok: true };
});

route('POST', '/ai/chats/:id/messages', async (ctx) => {
  const chat = findChat(ctx);
  const content = String(ctx.body.content ?? '').trim();
  if (!content) validationError({ content: 'REQUIRED' });
  const userMessage = { id: uid('am'), role: 'user' as const, content, createdAt: now() };
  chat.messages.push(userMessage);
  await sleep(500 + Math.random() * 700);
  const reply = generateAssistantReply(content, ctx.user!, ctx.locale);
  const assistantMessage = { id: uid('am'), role: 'assistant' as const, createdAt: now(), ...reply };
  chat.messages.push(assistantMessage);
  if (chat.messages.length === 2) chat.title = content.slice(0, 48);
  chat.updatedAt = now();
  return { userMessage, assistantMessage, chat };
});

/* ======================================================================
   ADMIN
   ====================================================================== */
route('GET', '/admin/dashboard', (ctx): AdminDashboard => {
  requireUser(ctx, 'admin');
  const data = db();
  const live = data.orders.filter((o) => o.status !== 'cancelled');
  const byCat = new Map<string, number>();
  for (const o of live) for (const it of o.items) byCat.set(it.categorySlug, (byCat.get(it.categorySlug) ?? 0) + it.total);
  const roles: Role[] = ['buyer', 'seller', 'courier', 'admin'];
  return {
    users: data.users.length,
    usersByRole: Object.fromEntries(roles.map((r) => [r, data.users.filter((u) => u.role === r).length])) as Record<Role, number>,
    companies: data.companies.length,
    pendingCompanies: data.companies.filter((c) => !c.verified).length,
    products: data.products.length,
    pendingProducts: data.products.filter((p) => p.status === 'pending').length,
    orders: data.orders.length,
    gmv: live.reduce((s, o) => s + o.total, 0),
    gmvSeries: daySeries(30, live.map((o) => ({ at: o.createdAt, value: o.total }))),
    categoryShare: [...byCat.entries()].map(([slug, revenue]) => ({ slug, revenue })).sort((a, b) => b.revenue - a.revenue),
  };
});

route('GET', '/admin/users', (ctx) => {
  requireUser(ctx, 'admin');
  let items = db().users.map(publicUser);
  if (ctx.query.role) items = items.filter((u) => u.role === ctx.query.role);
  if (ctx.query.status) items = items.filter((u) => u.status === ctx.query.status);
  const q = String(ctx.query.q ?? '').trim();
  if (q) items = items.filter((u) => matches(`${u.fullName} ${u.email} ${u.phone} ${u.organization ?? ''}`, q));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(items, ctx.query, 12);
});

route('PATCH', '/admin/users/:id', (ctx) => {
  const admin = requireUser(ctx, 'admin');
  const u = db().users.find((x) => x.id === ctx.params.id);
  if (!u) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  if (u.id === admin.id) throw new ApiError(409, 'CANNOT_MODIFY_SELF', 'You cannot change your own account here');
  if (ctx.body.status) u.status = ctx.body.status;
  if (u.status === 'blocked') {
    const data = db();
    for (const [t, id] of Object.entries(data.sessions)) if (id === u.id) delete data.sessions[t];
  }
  return publicUser(u);
});

route('GET', '/admin/companies', (ctx) => {
  requireUser(ctx, 'admin');
  let items = [...db().companies];
  if (ctx.query.verified === 'true') items = items.filter((c) => c.verified);
  if (ctx.query.verified === 'false') items = items.filter((c) => !c.verified);
  const q = String(ctx.query.q ?? '').trim();
  if (q) items = items.filter((c) => matches(`${c.name} ${c.tin}`, q));
  items.sort((a, b) => Number(a.verified) - Number(b.verified) || b.createdAt.localeCompare(a.createdAt));
  return paginate(items, ctx.query, 12);
});

route('PATCH', '/admin/companies/:id', (ctx) => {
  requireUser(ctx, 'admin');
  const data = db();
  const c = data.companies.find((x) => x.id === ctx.params.id);
  if (!c) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'Company not found');
  if (typeof ctx.body.verified === 'boolean') {
    c.verified = ctx.body.verified;
    if (c.verified) {
      data.products.filter((p) => p.companyId === c.id && p.status === 'pending').forEach((p) => (p.status = 'active'));
      notify(c.ownerId, { type: 'system', title: 'Kompaniya tasdiqlandi', body: `${c.name} verifikatsiyadan o'tdi. Mahsulotlaringiz endi katalogda.`, link: '/seller' });
    }
  }
  return c;
});

route('GET', '/admin/products', (ctx) => {
  requireUser(ctx, 'admin');
  let items = filterProducts({ q: ctx.query.q, category: ctx.query.category, sort: 'newest' }, db().products);
  if (ctx.query.status) items = items.filter((p) => p.status === ctx.query.status);
  const page = paginate(items, ctx.query, 12);
  return { ...page, items: page.items.map(withCompany) };
});

route('PATCH', '/admin/products/:id', (ctx) => {
  requireUser(ctx, 'admin');
  const p = db().products.find((x) => x.id === ctx.params.id);
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  if (ctx.body.status) p.status = ctx.body.status;
  p.updatedAt = now();
  const owner = db().companies.find((c) => c.id === p.companyId)!.ownerId;
  notify(owner, {
    type: 'system',
    title: p.status === 'active' ? 'Mahsulot tasdiqlandi' : p.status === 'rejected' ? 'Mahsulot rad etildi' : 'Mahsulot holati o‘zgardi',
    body: `"${p.name}"${ctx.body.reason ? ': ' + ctx.body.reason : ''}`,
    link: '/seller/products',
  });
  return withCompany(p);
});

/* ======================================================================
   MISC
   ====================================================================== */
route('POST', '/contact', ({ body }) => {
  const fields: Record<string, string> = {};
  if (!body.name || String(body.name).trim().length < 2) fields.name = 'MIN_LENGTH';
  if (!/^\S+@\S+\.\S+$/.test(String(body.email ?? ''))) fields.email = 'INVALID_EMAIL';
  if (!body.message || String(body.message).trim().length < 10) fields.message = 'MIN_LENGTH';
  if (Object.keys(fields).length) validationError(fields);
  db().contactMessages.unshift({ id: uid('cm'), name: body.name, email: body.email, subject: body.subject ?? '', message: body.message, createdAt: now() });
  notify('u-admin', { type: 'system', title: 'Yangi murojaat', body: `${body.name}: ${String(body.subject || body.message).slice(0, 60)}` });
  return { ok: true };
});

route('POST', '/newsletter', ({ body }) => {
  if (!/^\S+@\S+\.\S+$/.test(String(body.email ?? ''))) validationError({ email: 'INVALID_EMAIL' });
  return { ok: true };
});
