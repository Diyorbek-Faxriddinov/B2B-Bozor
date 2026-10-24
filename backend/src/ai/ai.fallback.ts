/**
 * Rule-based assistant used when ANTHROPIC_API_KEY is not set or the API is unreachable.
 * Port of frontend/src/api/mock/ai.ts, reading from the database.
 */
import type { OrderStatus } from '@prisma/client';
import type { AuthUser, Locale } from '../auth/auth.decorators';
import { unitPriceFor, type PriceTier } from '../common/pricing';
import { json } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';

export interface Reply {
  content: string;
  productIds?: string[];
  suggestions?: string[];
}

export function formatMoney(n: number, locale: Locale) {
  const grouped = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, locale === 'en' ? ',' : ' ');
  return locale === 'ru' ? `${grouped} сум` : locale === 'en' ? `${grouped} UZS` : `${grouped} so'm`;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’`ʻʼ']/g, "'");
const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const T = {
  greeting: {
    uz: "Assalomu alaykum! Men B2B Bozor yordamchisiman. Mahsulot topish, narxlarni solishtirish, buyurtma holati yoki yetkazib berish bo'yicha yordam bera olaman.",
    ru: 'Здравствуйте! Я ассистент B2B Bozor. Помогу найти товары, сравнить цены, узнать статус заказа или условия доставки.',
    en: "Hello! I'm the B2B Bozor assistant. I can help you find products, compare prices, check order status or delivery terms.",
  },
  suggestions: {
    uz: ["Arzon un toping", 'Buyurtmalarim holati', 'Yetkazib berish shartlari', "Qanday qilib sotuvchi bo'laman?"],
    ru: ['Найди дешёвую муку', 'Статус моих заказов', 'Условия доставки', 'Как стать продавцом?'],
    en: ['Find cheap flour', 'My order status', 'Delivery terms', 'How do I become a seller?'],
  },
  delivery: {
    uz: "**Yetkazib berish shartlari:**\n\n- Kuryer orqali yetkazish: 30 000 so'm + 3 km dan keyin har km uchun 2 500 so'm\n- 5 000 000 so'm dan ortiq buyurtmalarda — **bepul**\n- Olib ketish (pickup): sotuvchining omboridan bepul\n- Kuryer radiusi: ombordan 60 km gacha (yo'l bo'yicha)",
    ru: '**Условия доставки:**\n\n- Курьером: 30 000 сум + 2 500 сум за каждый км после 3 км\n- Для заказов от 5 000 000 сум — **бесплатно**\n- Самовывоз со склада продавца — бесплатно\n- Радиус курьера: до 60 км по дороге от склада',
    en: '**Delivery terms:**\n\n- Courier: 30,000 UZS + 2,500 UZS per km beyond 3 km\n- Orders above 5,000,000 UZS ship **free**\n- Pickup from the seller warehouse is free\n- Courier radius: up to 60 km by road from the warehouse',
  },
  payment: {
    uz: "**To'lov usullari:**\n\n- **Bank kartasi** — Payme yoki Click orqali, darhol tasdiqlanadi\n- **Bank o'tkazmasi** — sotuvchi tasdiqlagach hisob-faktura beriladi (yuridik shaxslar uchun qulay)\n- **Naqd pul** — yetkazib berilganda kuryerga",
    ru: '**Способы оплаты:**\n\n- **Банковская карта** — через Payme или Click, мгновенно\n- **Банковский перевод** — счёт после подтверждения продавцом\n- **Наличные** — курьеру при получении',
    en: '**Payment methods:**\n\n- **Bank card** — via Payme or Click, instant\n- **Bank transfer** — invoice once the seller confirms\n- **Cash** — to the courier on delivery',
  },
  rfq: {
    uz: "**Narx so'rovi (RFQ)** — katta hajmdagi xaridlar uchun maxsus narx olish usuli.\n\n1. Mahsulot sahifasida **\"Narx so'rash\"** tugmasini bosing\n2. Miqdor, maqsadli narx va izoh yozing\n3. Sotuvchi taklif yuboradi — uni **Kabinet → Narx so'rovlari** bo'limida qabul qilasiz yoki rad etasiz",
    ru: '**Запрос цены (RFQ)** — спеццена на крупный объём.\n\n1. На странице товара нажмите **«Запросить цену»**\n2. Укажите количество, целевую цену и комментарий\n3. Примите или отклоните предложение в **Кабинет → Запросы цен**',
    en: '**Request for quotation (RFQ)** — a special price for large volumes.\n\n1. Click **"Request a quote"** on the product page\n2. Enter quantity, target price and a note\n3. Accept or decline the offer under **Account → Quotes**',
  },
  seller: {
    uz: "**Sotuvchi bo'lish uchun:**\n\n1. Ro'yxatdan o'tishda **\"Sotuvchi\"** rolini tanlang\n2. Kompaniya nomi va STIR raqamini kiriting\n3. Mahsulotlaringizni qo'shing — verifikatsiyadan o'tgan kompaniyalar mahsulotlari darhol katalogda chiqadi",
    ru: '**Чтобы стать продавцом:**\n\n1. При регистрации выберите роль **«Продавец»**\n2. Укажите название компании и ИНН\n3. Добавьте товары — у верифицированных компаний они сразу в каталоге',
    en: '**To become a seller:**\n\n1. Choose the **"Seller"** role when registering\n2. Enter your company name and TIN\n3. Add products — verified companies go live immediately',
  },
  returns: {
    uz: "**Qaytarish siyosati:** nuqsonli yoki tavsifga mos kelmaydigan mahsulotni qabul qilgandan keyin 14 kun ichida qaytarish mumkin. Buyurtma sahifasidan sotuvchiga yozing.",
    ru: '**Возврат:** бракованный или не соответствующий описанию товар можно вернуть в течение 14 дней. Напишите продавцу со страницы заказа.',
    en: '**Returns:** defective or not-as-described goods can be returned within 14 days. Message the seller from the order page.',
  },
  found: { uz: 'Mana sizga mos mahsulotlar:', ru: 'Вот подходящие товары:', en: 'Here are matching products:' },
  cheapest: { uz: 'Eng arzon variant', ru: 'Самый дешёвый вариант', en: 'Cheapest option' },
  notFound: {
    uz: "Afsuski, so'rovingiz bo'yicha mahsulot topilmadi. Boshqa so'z bilan qidirib ko'ring yoki sotuvchilarga **narx so'rovi** yuboring.",
    ru: 'К сожалению, ничего не найдено. Попробуйте другие слова или отправьте продавцам **запрос цены**.',
    en: 'Sorry, nothing matched. Try different words or send sellers a **quote request**.',
  },
  noOrders: { uz: "Sizda hali buyurtmalar yo'q.", ru: 'У вас пока нет заказов.', en: "You don't have any orders yet." },
  orders: { uz: "So'nggi buyurtmalaringiz:", ru: 'Ваши последние заказы:', en: 'Your latest orders:' },
  sellerOrders: {
    uz: (p: number, c: number) => `Sizda **${p}** ta yangi va **${c}** ta jarayondagi buyurtma bor. **Sotuvchi paneli → Buyurtmalar** bo'limida boshqaring.`,
    ru: (p: number, c: number) => `У вас **${p}** новых и **${c}** заказов в работе. Управляйте ими в **Панель продавца → Заказы**.`,
    en: (p: number, c: number) => `You have **${p}** new and **${c}** in-progress orders. Manage them under **Seller dashboard → Orders**.`,
  },
  fallback: {
    uz: "Men mahsulot qidirish, narxlar, buyurtmalar, to'lov va yetkazib berish bo'yicha yordam bera olaman. Masalan: *\"10 qop sement narxi\"* yoki *\"eng arzon guruch\"* deb yozing.",
    ru: 'Я помогу с поиском товаров, ценами, заказами, оплатой и доставкой. Например: *«цена цемента»* или *«самый дешёвый рис»*.',
    en: 'I can help with products, prices, orders, payment and delivery. For example: *"price of cement"* or *"cheapest rice"*.',
  },
  statuses: {
    uz: { pending: 'kutilmoqda', confirmed: 'tasdiqlangan', ready: 'tayyor', in_transit: "yo'lda", delivered: 'yetkazilgan', cancelled: 'bekor qilingan' },
    ru: { pending: 'ожидает', confirmed: 'подтверждён', ready: 'готов', in_transit: 'в пути', delivered: 'доставлен', cancelled: 'отменён' },
    en: { pending: 'pending', confirmed: 'confirmed', ready: 'ready', in_transit: 'in transit', delivered: 'delivered', cancelled: 'cancelled' },
  } as Record<Locale, Record<OrderStatus, string>>,
};

const STOP = new Set([
  'menga', 'kerak', 'bormi', 'qancha', 'narxi', 'narx', 'toping', 'top', 'qidir', 'qidiring', "ko'rsat", 'eng', 'arzon', 'yaxshi', 'uchun', 'va', 'bilan', 'qop', 'dona', 'kg',
  'найди', 'нужен', 'нужно', 'нужна', 'цена', 'сколько', 'самый', 'дешёвый', 'дешевый', 'дешевле', 'лучший', 'для', 'и', 'покажи',
  'find', 'need', 'price', 'cheap', 'cheapest', 'best', 'show', 'me', 'for', 'the', 'a', 'of', 'bags', 'some', 'i',
]);

const CATEGORY_WORDS: Record<string, string[]> = {
  food: ['oziq', 'ovqat', 'продукт', 'food'],
  agro: ['qishloq', 'agro', 'сельск', 'agricult', "o'g'it", 'удобр'],
  construction: ['qurilish', 'строй', 'construct', 'sement', 'цемент', 'cement'],
  textile: ['tekstil', "to'qimachilik", 'kiyim', 'текстил', 'одежд', 'textile', 'apparel'],
  electronics: ['elektron', 'электрон', 'electronic', 'noutbuk', 'ноутбук', 'laptop', 'telefon', 'телефон', 'phone'],
  packaging: ['qadoq', 'упаков', 'packag', 'paket', 'пакет'],
  furniture: ['mebel', 'мебел', 'furniture'],
  auto: ['avto', 'авто', 'auto', 'car'],
  office: ['ofis', 'офис', 'office', 'kanselyar', 'канцел'],
};

export async function ruleBasedReply(prisma: PrismaService, input: string, user: AuthUser, L: Locale): Promise<Reply> {
  const text = norm(input);

  if (/^(salom|assalom|привет|здравств|hello|hi\b|hey)/.test(text)) return { content: T.greeting[L], suggestions: T.suggestions[L] };

  if (has(text, ['buyurtma', 'zakaz', 'заказ', 'order'])) {
    if (user.role === 'seller') {
      const companyId = user.company?.id ?? '-';
      const [p, c] = await Promise.all([
        prisma.order.count({ where: { companyId, status: 'pending' } }),
        prisma.order.count({ where: { companyId, status: { in: ['confirmed', 'ready', 'in_transit'] } } }),
      ]);
      return { content: T.sellerOrders[L](p, c) };
    }
    const mine = await prisma.order.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: 'desc' }, take: 4 });
    if (!mine.length) return { content: T.noOrders[L], suggestions: T.suggestions[L].slice(0, 1) };
    const lines = mine.map((o) => `- **${o.number}** · ${o.companyName} · ${formatMoney(o.total, L)} — _${T.statuses[L][o.status]}_`);
    return { content: `${T.orders[L]}\n\n${lines.join('\n')}` };
  }
  if (has(text, ['yetkaz', 'dostav', 'достав', 'deliver', 'shipping', 'kuryer', 'курьер'])) return { content: T.delivery[L] };
  if (has(text, ["to'lov", 'tolov', 'оплат', 'payment', 'pay ', 'karta', 'карт', 'naqd', 'налич', 'faktura', 'фактур', 'invoice', 'payme', 'click'])) return { content: T.payment[L] };
  if (has(text, ['rfq', "so'rov", 'kotirov', 'котиров', 'quote', 'quotation', 'запрос цен', 'chegirma', 'скидк', 'discount', 'ulgurji', 'опт'])) return { content: T.rfq[L] };
  if (has(text, ['sotuvchi', 'sotish', 'продав', 'sell', 'seller', 'tadbirkor'])) return { content: T.seller[L] };
  if (has(text, ['qaytar', 'возврат', 'return', 'refund'])) return { content: T.returns[L] };

  const wantsCheap = has(text, ['arzon', 'дешев', 'дешёв', 'cheap', 'past narx']);
  const wantsBest = has(text, ['eng yaxshi', 'top', 'лучш', 'best', 'reyting', 'рейтинг']);
  const category = Object.entries(CATEGORY_WORDS).find(([, ws]) => has(text, ws))?.[0];
  const words = text
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

  const active = await prisma.product.findMany({ where: { status: 'active' }, include: { company: { select: { name: true } } }, take: 3000 });
  const price = (p: (typeof active)[number]) => unitPriceFor({ price: p.price, discount: p.discount, tiers: json<PriceTier[]>(p.tiers, []) }, p.moq);
  const scored = active
    .map((p) => {
      const hay = norm(`${p.name} ${json<string[]>(p.tags, []).join(' ')} ${p.description}`);
      let score = words.reduce((s, w) => s + (hay.includes(w.slice(0, Math.max(3, w.length - 2))) ? 2 : 0), 0);
      if (category && p.categorySlug === category) score += 1.5;
      return { p, score };
    })
    .filter((x) => x.score > 0);

  if (!scored.length) {
    return words.length || category ? { content: T.notFound[L], suggestions: T.suggestions[L].slice(0, 2) } : { content: T.fallback[L], suggestions: T.suggestions[L] };
  }

  let products = scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (wantsCheap) return price(a.p) - price(b.p);
      if (wantsBest) return b.p.rating - a.p.rating;
      return b.p.soldCount - a.p.soldCount;
    })
    .slice(0, 4)
    .map((x) => x.p);
  if (wantsCheap) products = [...products].sort((a, b) => price(a) - price(b));
  if (wantsBest) products = [...products].sort((a, b) => b.rating - a.rating);

  const top = products[0];
  const highlight = wantsCheap ? `\n\n**${T.cheapest[L]}:** ${top.name} — ${formatMoney(price(top), L)} (${top.company.name})` : '';
  return { content: `${T.found[L]}${highlight}`, productIds: products.map((p) => p.id) };
}
