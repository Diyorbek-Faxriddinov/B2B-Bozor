/**
 * Loads the demo data into the database (wipes existing rows first).
 * Run: npm run db:seed   ·   All demo accounts use the password `demo1234`.
 */
import { existsSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { PrismaClient, type Prisma } from '@prisma/client';
import { derivedProductFields, popularity } from '../src/catalog/product.util';
import { seedData } from './seed/data';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.SEED_DATABASE_URL) process.env.DATABASE_URL = process.env.SEED_DATABASE_URL;

const prisma = new PrismaClient();
const d = (iso: string) => new Date(iso);

export async function seed(client: PrismaClient = prisma) {
  const s = seedData;
  const passwordHash = await hash('demo1234');

  // children first
  await client.$transaction([
    client.payment.deleteMany(),
    client.orderEvent.deleteMany(),
    client.orderItem.deleteMany(),
    client.order.deleteMany(),
    client.message.deleteMany(),
    client.conversationParticipant.deleteMany(),
    client.conversation.deleteMany(),
    client.notification.deleteMany(),
    client.favorite.deleteMany(),
    client.review.deleteMany(),
    client.rfq.deleteMany(),
    client.product.deleteMany(),
    client.company.deleteMany(),
    client.category.deleteMany(),
    client.aiChat.deleteMany(),
    client.upload.deleteMany(),
    client.otpCode.deleteMany(),
    client.session.deleteMany(),
    client.user.deleteMany(),
    client.contactMessage.deleteMany(),
    client.newsletterSubscriber.deleteMany(),
    client.counter.deleteMany(),
  ]);

  await client.category.createMany({
    data: s.categories.map((c, i) => ({ id: c.id, slug: c.slug, nameUz: c.name.uz, nameRu: c.name.ru, nameEn: c.name.en, color: c.color, sortOrder: i })),
  });

  await client.user.createMany({
    data: s.users.map(
      (u): Prisma.UserCreateManyInput => ({
        id: u.id,
        role: u.role,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone.replace(/\s/g, ''),
        passwordHash,
        status: u.status,
        organization: u.organization ?? null,
        addresses: u.addresses as object[],
        notificationPrefs: u.notificationPrefs,
        courierTransport: u.courier?.transport,
        courierRegion: u.courier?.region,
        courierRating: u.courier?.rating,
        courierDeliveries: u.courier?.deliveriesCount ?? 0,
        courierLocation: (u.courier?.location as object | undefined) ?? undefined,
        courierSchedule: (s.schedules[u.id] as object[] | undefined) ?? undefined,
        createdAt: d(u.createdAt),
      }),
    ),
  });

  await client.company.createMany({
    data: s.companies.map((c) => ({
      id: c.id,
      ownerId: c.ownerId,
      name: c.name,
      slug: c.slug,
      tin: c.tin,
      description: c.description,
      region: c.region,
      address: c.address,
      phone: c.phone,
      email: c.email,
      website: c.website,
      foundedYear: c.foundedYear,
      employees: c.employees,
      verified: c.verified,
      rating: c.rating,
      reviewsCount: c.reviewsCount,
      productsCount: c.productsCount,
      ordersCount: c.ordersCount,
      responseRate: c.responseRate,
      responseTimeHours: c.responseTimeHours,
      mainCategories: c.mainCategories,
      pickupPoint: c.pickupPoint as object,
      createdAt: d(c.createdAt),
    })),
  });

  const companyName = new Map(s.companies.map((c) => [c.id, c.name]));
  await client.product.createMany({
    data: s.products.map((p) => ({
      id: p.id,
      companyId: p.companyId,
      categorySlug: p.categorySlug,
      name: p.name,
      description: p.description,
      images: p.images,
      price: p.price,
      unit: p.unit,
      moq: p.moq,
      stock: p.stock,
      discount: p.discount,
      tiers: p.tiers as object[],
      specs: p.specs as object[],
      tags: p.tags,
      ...derivedProductFields({ ...p, companyName: companyName.get(p.companyId)! }),
      popularity: popularity(p.soldCount, p.views),
      rating: p.rating,
      reviewsCount: p.reviewsCount,
      soldCount: p.soldCount,
      views: p.views,
      deliveryDays: p.deliveryDays,
      status: p.status,
      createdAt: d(p.createdAt),
      updatedAt: d(p.updatedAt),
    })),
  });

  // seed reviewers are fictional (not accounts) → userId null
  await client.review.createMany({
    data: s.reviews.map((r) => ({ id: r.id, productId: r.productId, userId: null, userName: r.userName, rating: r.rating, comment: r.comment, createdAt: d(r.createdAt) })),
  });

  await client.order.createMany({
    data: s.orders.map((o) => ({
      id: o.id,
      number: o.number,
      buyerId: o.buyerId,
      buyerName: o.buyerName,
      buyerPhone: o.buyerPhone,
      buyerOrganization: o.buyerOrganization ?? null,
      companyId: o.companyId,
      companyName: o.companyName,
      subtotal: o.subtotal,
      deliveryFee: o.deliveryFee,
      total: o.total,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      deliveryType: o.delivery.type,
      deliveryAddress: (o.delivery.address as object | undefined) ?? undefined,
      pickupPoint: o.delivery.pickupPoint as object,
      distanceKm: o.delivery.distanceKm,
      durationMin: o.delivery.durationMin,
      routeSource: o.delivery.routeSource,
      courierId: o.courierId ?? null,
      courierName: o.courierName ?? null,
      courierPhone: o.courierPhone ?? null,
      courierFee: o.courierFee ?? null,
      cancelReason: o.cancelReason ?? null,
      createdAt: d(o.createdAt),
      updatedAt: d(o.updatedAt),
    })),
  });
  await client.orderItem.createMany({
    data: s.orders.flatMap((o) =>
      o.items.map((i) => ({ orderId: o.id, productId: i.productId, name: i.name, image: i.image ?? null, categorySlug: i.categorySlug, unit: i.unit, unitPrice: i.unitPrice, quantity: i.quantity, total: i.total })),
    ),
  });
  await client.orderEvent.createMany({
    data: s.orders.flatMap((o) => o.timeline.map((e) => ({ orderId: o.id, status: e.status, at: d(e.at), by: e.by ?? null, note: e.note ?? null }))),
  });

  await client.rfq.createMany({
    data: s.rfqs.map((r) => ({
      id: r.id,
      number: r.number,
      buyerId: r.buyerId,
      buyerName: r.buyerName,
      buyerOrganization: r.buyerOrganization ?? null,
      companyId: r.companyId,
      companyName: r.companyName,
      productId: r.productId ?? null,
      productName: r.productName,
      quantity: r.quantity,
      unit: r.unit,
      targetPrice: r.targetPrice ?? null,
      deadline: r.deadline ? d(r.deadline) : null,
      message: r.message,
      status: r.status,
      responsePrice: r.response?.unitPrice ?? null,
      responseMessage: r.response?.message ?? null,
      responseValidTo: r.response ? d(r.response.validUntil) : null,
      respondedAt: r.response ? d(r.response.at) : null,
      createdAt: d(r.createdAt),
    })),
  });

  for (const c of s.conversations) {
    await client.conversation.create({
      data: {
        id: c.id,
        productId: c.productId,
        productName: c.productName,
        updatedAt: d(c.updatedAt),
        participants: { create: c.participantIds.map((userId) => ({ userId, unread: c.unreadBy[userId] ?? 0 })) },
      },
    });
  }
  await client.message.createMany({ data: s.messages.map((m) => ({ ...m, createdAt: d(m.createdAt) })) });
  await client.notification.createMany({ data: s.notifications.map((n) => ({ ...n, createdAt: d(n.createdAt) })) });

  const now = Date.now();
  await client.favorite.createMany({
    data: Object.entries(s.favorites).flatMap(([userId, ids]) => ids.map((productId, i) => ({ userId, productId, createdAt: new Date(now - i * 60000) }))),
  });
  await client.counter.createMany({
    data: [
      { name: 'order', value: s.counters.order },
      { name: 'rfq', value: s.counters.rfq },
    ],
  });

  return { users: s.users.length, companies: s.companies.length, products: s.products.length, orders: s.orders.length };
}

if (require.main === module) {
  seed()
    .then((r) => console.log(`✔ seeded: ${r.users} users, ${r.companies} companies, ${r.products} products, ${r.orders} orders (password: demo1234)`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
