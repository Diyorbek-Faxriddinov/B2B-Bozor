/**
 * DB rows → the JSON shapes in frontend/src/types/index.ts.
 * Optional fields are omitted (not null) so the frontend sees the same objects as with the mock.
 */
import type {
  AiChat,
  Company,
  Notification,
  Order,
  OrderEvent,
  OrderItem,
  Product,
  Review,
  Rfq,
  User,
} from '@prisma/client';
import type { GeoPoint } from './geo';
import type { PriceTier } from './pricing';
import { iso, json } from './util';

export interface Address extends GeoPoint {
  label?: string;
  text: string;
  apartment?: string;
  entrance?: string;
  floor?: string;
  landmark?: string;
  contactName?: string;
  contactPhone?: string;
}

export interface CourierLocation extends GeoPoint {
  at: string;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

export interface NotificationPrefs {
  email: boolean;
  sms: boolean;
  orders: boolean;
  marketing: boolean;
}

export interface ScheduleDay {
  day: number;
  active: boolean;
  from: string;
  to: string;
}

export const DEFAULT_PREFS: NotificationPrefs = { email: true, sms: true, orders: true, marketing: false };

/** Drops undefined/null keys so optional fields disappear from JSON. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}

export function toUser(u: User & { company?: { id: string } | null }) {
  return clean({
    id: u.id,
    role: u.role,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    phoneVerified: u.phoneVerified,
    avatar: u.avatar,
    status: u.status,
    createdAt: iso(u.createdAt)!,
    companyId: u.company?.id,
    organization: u.organization,
    courier:
      u.role === 'courier'
        ? clean({
            transport: u.courierTransport ?? 'car',
            region: u.courierRegion ?? '',
            rating: u.courierRating ?? 5,
            deliveriesCount: u.courierDeliveries,
            location: json<CourierLocation | undefined>(u.courierLocation, undefined),
          })
        : undefined,
    addresses: json<Address[]>(u.addresses, []),
    notificationPrefs: { ...DEFAULT_PREFS, ...json<Partial<NotificationPrefs>>(u.notificationPrefs, {}) },
  });
}

export function toCompany(c: Company) {
  return clean({
    id: c.id,
    ownerId: c.ownerId,
    name: c.name,
    slug: c.slug,
    tin: c.tin,
    logo: c.logo,
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
    mainCategories: json<string[]>(c.mainCategories, []),
    pickupPoint: json<Address>(c.pickupPoint, { lat: 41.2995, lng: 69.2401, text: 'Toshkent' }),
    createdAt: iso(c.createdAt)!,
  });
}

export function companyCard(c: Company) {
  return clean({
    id: c.id,
    name: c.name,
    slug: c.slug,
    logo: c.logo,
    verified: c.verified,
    rating: c.rating,
    region: c.region,
    responseRate: c.responseRate,
    responseTimeHours: c.responseTimeHours,
  });
}

export function productTiers(p: Pick<Product, 'tiers'>) {
  return json<PriceTier[]>(p.tiers, []);
}

export function toProduct(p: Product) {
  return {
    id: p.id,
    companyId: p.companyId,
    categorySlug: p.categorySlug,
    name: p.name,
    description: p.description,
    images: json<string[]>(p.images, []),
    price: p.price,
    unit: p.unit,
    moq: p.moq,
    stock: p.stock,
    discount: p.discount,
    tiers: productTiers(p),
    specs: json<{ key: string; value: string }[]>(p.specs, []),
    tags: json<string[]>(p.tags, []),
    rating: p.rating,
    reviewsCount: p.reviewsCount,
    soldCount: p.soldCount,
    views: p.views,
    deliveryDays: p.deliveryDays,
    status: p.status,
    createdAt: iso(p.createdAt)!,
    updatedAt: iso(p.updatedAt)!,
  };
}

export function toProductWithCompany(p: Product & { company: Company }) {
  return { ...toProduct(p), company: companyCard(p.company) };
}

export function toReview(r: Review) {
  return { id: r.id, productId: r.productId, userId: r.userId ?? '', userName: r.userName, rating: r.rating, comment: r.comment, createdAt: iso(r.createdAt)! };
}

export type OrderFull = Order & { items: OrderItem[]; events: OrderEvent[] };
export const ORDER_INCLUDE = { items: true, events: { orderBy: [{ at: 'asc' as const }, { id: 'asc' as const }] } };

export function toOrder(o: OrderFull) {
  return clean({
    id: o.id,
    number: o.number,
    buyerId: o.buyerId,
    buyerName: o.buyerName,
    buyerPhone: o.buyerPhone,
    buyerOrganization: o.buyerOrganization,
    companyId: o.companyId,
    companyName: o.companyName,
    items: o.items.map((i) =>
      clean({
        productId: i.productId,
        name: i.name,
        image: i.image,
        categorySlug: i.categorySlug,
        unit: i.unit,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        total: i.total,
      }),
    ),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    delivery: clean({
      type: o.deliveryType,
      address: json<Address | undefined>(o.deliveryAddress, undefined),
      pickupPoint: json<Address>(o.pickupPoint, { lat: 41.2995, lng: 69.2401, text: 'Toshkent' }),
      distanceKm: o.distanceKm,
      durationMin: o.durationMin,
      routeSource: o.routeSource,
    }),
    courierId: o.courierId,
    courierLocation: json<CourierLocation | undefined>(o.courierLocation, undefined),
    courierName: o.courierName,
    courierPhone: o.courierPhone,
    courierFee: o.courierFee,
    note: o.note,
    cancelReason: o.cancelReason,
    timeline: o.events.map((e) => clean({ status: e.status, at: iso(e.at)!, by: e.by, note: e.note })),
    rated: o.rated || undefined,
    createdAt: iso(o.createdAt)!,
    updatedAt: iso(o.updatedAt)!,
  });
}

export function toRfq(r: Rfq) {
  return clean({
    id: r.id,
    number: r.number,
    buyerId: r.buyerId,
    buyerName: r.buyerName,
    buyerOrganization: r.buyerOrganization,
    companyId: r.companyId,
    companyName: r.companyName,
    productId: r.productId,
    productName: r.productName,
    quantity: r.quantity,
    unit: r.unit,
    targetPrice: r.targetPrice,
    deadline: iso(r.deadline),
    message: r.message,
    status: r.status,
    response:
      r.responsePrice !== null
        ? { unitPrice: r.responsePrice, message: r.responseMessage ?? '', validUntil: iso(r.responseValidTo) ?? '', at: iso(r.respondedAt) ?? '' }
        : undefined,
    createdAt: iso(r.createdAt)!,
  });
}

export function toNotification(n: Notification) {
  return clean({ id: n.id, userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: iso(n.createdAt)! });
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  productIds?: string[];
  suggestions?: string[];
  createdAt: string;
}

export function toAiChat(c: AiChat) {
  return { id: c.id, userId: c.userId, title: c.title, messages: json<AiMessage[]>(c.messages, []), createdAt: iso(c.createdAt)!, updatedAt: iso(c.updatedAt)! };
}
