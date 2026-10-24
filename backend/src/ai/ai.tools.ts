/**
 * Tools the assistant can call. All read-only and scoped to the asking user.
 * Schemas are strict (every property required, `null` for "not specified").
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.decorators';
import { unitPriceFor, type PriceTier } from '../common/pricing';
import { json } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { productOrderBy, productSearchWhere } from '../catalog/product.util';

export const AI_TOOLS: BetaTool[] = [
  {
    name: 'search_products',
    description:
      'Search the active B2B Bozor catalog. Use for any question about products, availability, suppliers or prices. ' +
      'Query words are matched against product name, description, tags and supplier name (Uzbek/Russian keywords work best as they appear in the catalog, e.g. "un", "guruch", "sement", "noutbuk"). ' +
      'Returns up to `limit` products with id, supplier, catalog unit price at MOQ (UZS), MOQ, stock, rating and volume tiers.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: ['string', 'null'], description: 'Keywords; null to browse a category' },
        category: {
          type: ['string', 'null'],
          enum: ['food', 'agro', 'construction', 'textile', 'electronics', 'packaging', 'chemicals', 'furniture', 'auto', 'household', 'equipment', 'office', null],
          description: 'Category slug filter or null',
        },
        max_price: { type: ['integer', 'null'], description: 'Max unit price in UZS at MOQ, or null' },
        verified_only: { type: 'boolean', description: 'Only verified suppliers' },
        sort: { type: 'string', enum: ['popular', 'cheapest', 'rating', 'newest'] },
        limit: { type: 'integer', description: '1–8' },
      },
      required: ['query', 'category', 'max_price', 'verified_only', 'sort', 'limit'],
    },
  },
  {
    name: 'get_product',
    description: 'Full details of one product by id: description, specs, volume price tiers, stock, delivery days and supplier info.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { product_id: { type: 'string' } },
      required: ['product_id'],
    },
  },
  {
    name: 'calculate_price',
    description: 'Exact unit price and line total for a quantity (applies volume tiers and discount, checks MOQ and stock). Use before quoting a total.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { product_id: { type: 'string' }, quantity: { type: 'integer' } },
      required: ['product_id', 'quantity'],
    },
  },
  {
    name: 'get_my_orders',
    description:
      "The current user's latest orders (buyer: own purchases; seller: their company's orders; courier: assigned deliveries) with number, status, payment status, total and items.",
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { status: { type: 'string', enum: ['all', 'active', 'delivered', 'cancelled'] } },
      required: ['status'],
    },
  },
  {
    name: 'show_products',
    description:
      'Display product cards (image, price, add-to-cart) under your reply. Call it whenever you recommend specific products, with the ids in the order you recommend them. Max 6.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { product_ids: { type: 'array', items: { type: 'string' } } },
      required: ['product_ids'],
    },
  },
  {
    name: 'suggest_replies',
    description: 'Offer 2–4 short follow-up questions the user can tap (in the user\'s language, each under 40 characters).',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { suggestions: { type: 'array', items: { type: 'string' } } },
      required: ['suggestions'],
    },
  },
];

export interface ToolOutputs {
  productIds: string[];
  suggestions: string[];
}

type Input = Record<string, unknown>;

/** Executes one tool call; returns JSON text for the tool_result. Never throws. */
export async function runTool(prisma: PrismaService, user: AuthUser, name: string, input: Input, out: ToolOutputs): Promise<{ content: string; isError?: boolean }> {
  try {
    switch (name) {
      case 'search_products':
        return { content: JSON.stringify(await searchProducts(prisma, input)) };
      case 'get_product':
        return { content: JSON.stringify(await getProduct(prisma, String(input.product_id))) };
      case 'calculate_price':
        return { content: JSON.stringify(await calculatePrice(prisma, String(input.product_id), Number(input.quantity))) };
      case 'get_my_orders':
        return { content: JSON.stringify(await myOrders(prisma, user, String(input.status))) };
      case 'show_products': {
        const ids = (Array.isArray(input.product_ids) ? input.product_ids : []).map(String).slice(0, 6);
        const found = await prisma.product.findMany({ where: { id: { in: ids }, status: 'active' }, select: { id: true } });
        const ok = new Set(found.map((f) => f.id));
        out.productIds = ids.filter((id) => ok.has(id));
        return { content: JSON.stringify({ shown: out.productIds, unknown: ids.filter((id) => !ok.has(id)) }) };
      }
      case 'suggest_replies':
        out.suggestions = (Array.isArray(input.suggestions) ? input.suggestions : []).map((s) => String(s).slice(0, 60)).slice(0, 4);
        return { content: '{"ok":true}' };
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (err) {
    return { content: `Tool failed: ${(err as Error).message}`, isError: true };
  }
}

async function searchProducts(prisma: PrismaService, input: Input) {
  const where: Prisma.ProductWhereInput = {
    status: 'active',
    ...productSearchWhere(typeof input.query === 'string' ? input.query : undefined),
    ...(typeof input.category === 'string' ? { categorySlug: input.category } : {}),
    ...(typeof input.max_price === 'number' ? { moqPrice: { lte: input.max_price } } : {}),
    ...(input.verified_only ? { company: { verified: true } } : {}),
  };
  const sort = input.sort === 'cheapest' ? 'price_asc' : input.sort === 'rating' ? 'rating' : input.sort === 'newest' ? 'newest' : 'popular';
  const limit = Math.min(8, Math.max(1, Number(input.limit) || 5));
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: productOrderBy(sort), take: limit, include: { company: true } }),
  ]);
  return {
    total,
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.categorySlug,
      supplier: p.company.name,
      supplier_verified: p.company.verified,
      supplier_region: p.company.region,
      unit: p.unit,
      price_at_moq_uzs: p.moqPrice,
      discount_percent: p.discount,
      moq: p.moq,
      stock: p.stock,
      rating: p.rating,
      reviews: p.reviewsCount,
      delivery_days: p.deliveryDays,
      tiers: json<PriceTier[]>(p.tiers, []),
    })),
  };
}

async function getProduct(prisma: PrismaService, id: string) {
  const p = await prisma.product.findFirst({ where: { id, status: 'active' }, include: { company: true } });
  if (!p) return { error: 'Product not found or not active' };
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.categorySlug,
    unit: p.unit,
    base_price_uzs: p.price,
    price_at_moq_uzs: p.moqPrice,
    discount_percent: p.discount,
    tiers: json<PriceTier[]>(p.tiers, []),
    moq: p.moq,
    stock: p.stock,
    specs: p.specs,
    tags: p.tags,
    rating: p.rating,
    reviews: p.reviewsCount,
    sold: p.soldCount,
    delivery_days: p.deliveryDays,
    supplier: {
      id: p.company.id,
      name: p.company.name,
      verified: p.company.verified,
      region: p.company.region,
      rating: p.company.rating,
      response_time_hours: p.company.responseTimeHours,
    },
  };
}

async function calculatePrice(prisma: PrismaService, id: string, quantity: number) {
  const p = await prisma.product.findFirst({ where: { id, status: 'active' } });
  if (!p) return { error: 'Product not found or not active' };
  const q = Math.max(0, Math.floor(quantity));
  const unit = unitPriceFor({ price: p.price, discount: p.discount, tiers: json<PriceTier[]>(p.tiers, []) }, q);
  return {
    product_id: p.id,
    quantity: q,
    unit: p.unit,
    unit_price_uzs: unit,
    total_uzs: unit * q,
    meets_moq: q >= p.moq,
    moq: p.moq,
    in_stock: q <= p.stock,
    stock: p.stock,
    note: 'Courier delivery: 30 000 UZS + 2 500 UZS/km after 3 km; free for orders from 5 000 000 UZS per supplier.',
  };
}

async function myOrders(prisma: PrismaService, user: AuthUser, status: string) {
  const scope: Prisma.OrderWhereInput =
    user.role === 'seller' ? { companyId: user.company?.id ?? '-' } : user.role === 'courier' ? { courierId: user.id } : user.role === 'admin' ? {} : { buyerId: user.id };
  const statusWhere: Prisma.OrderWhereInput =
    status === 'active'
      ? { status: { notIn: ['delivered', 'cancelled'] as OrderStatus[] } }
      : status === 'delivered' || status === 'cancelled'
        ? { status: status as OrderStatus }
        : {};
  const rows = await prisma.order.findMany({ where: { ...scope, ...statusWhere }, orderBy: { createdAt: 'desc' }, take: 10, include: { items: true } });
  return {
    role: user.role,
    orders: rows.map((o) => ({
      id: o.id,
      number: o.number,
      created_at: o.createdAt.toISOString(),
      status: o.status,
      payment_method: o.paymentMethod,
      payment_status: o.paymentStatus,
      delivery: o.deliveryType,
      supplier: o.companyName,
      buyer: user.role === 'buyer' ? undefined : o.buyerName,
      total_uzs: o.total,
      items: o.items.map((i) => `${i.name} × ${i.quantity}`),
      link: user.role === 'seller' ? `/seller/orders/${o.id}` : user.role === 'courier' ? `/courier/deliveries/${o.id}` : `/account/orders/${o.id}`,
    })),
  };
}
