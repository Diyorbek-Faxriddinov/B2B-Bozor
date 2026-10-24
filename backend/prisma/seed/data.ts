/**
 * Demo data — a faithful port of frontend/src/api/mock/seed.ts (same deterministic RNG),
 * so the real backend starts with exactly the data the UI was designed against.
 * Timestamps are relative to the moment the seed runs.
 */
import type { Address, Company, Order, OrderEvent, OrderStatus, PaymentMethod, Product, ProductUnit, Review, Rfq, ScheduleDay, User } from './types';
import { unitPriceFor, deliveryFee, DELIVERY } from '../../src/common/pricing';
import { haversineKm } from '../../src/common/geo';

type DbUser = User & { passwordHash: string };
type DbConversation = { id: string; participantIds: [string, string]; productId?: string; productName?: string; lastMessage?: { text: string; senderId: string; at: string }; unreadBy: Record<string, number>; updatedAt: string };
type Category = { id: string; slug: string; color: string; name: { uz: string; ru: string; en: string } };
type Message = { id: string; conversationId: string; senderId: string; text: string; createdAt: string };
type Notification = { id: string; userId: string; type: 'order' | 'rfq' | 'message' | 'system' | 'review'; title: string; body: string; link?: string; read: boolean; createdAt: string };

/* ---------- deterministic randomness ---------- */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261024);
const rint = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86400000 - h * 3600000).toISOString();

/** Replaced with a real argon2 hash of `demo1234` by seed.ts. */
const PASSWORD = 'demo1234';

/* ---------- categories ---------- */
const categories: Category[] = [
  { id: 'cat-food', slug: 'food', color: '#eb6834', name: { uz: 'Oziq-ovqat', ru: 'Продукты питания', en: 'Food & Beverages' } },
  { id: 'cat-agro', slug: 'agro', color: '#008300', name: { uz: "Qishloq xo'jaligi", ru: 'Сельское хозяйство', en: 'Agriculture' } },
  { id: 'cat-construction', slug: 'construction', color: '#a16207', name: { uz: 'Qurilish materiallari', ru: 'Стройматериалы', en: 'Construction' } },
  { id: 'cat-textile', slug: 'textile', color: '#6250d6', name: { uz: "To'qimachilik va kiyim", ru: 'Текстиль и одежда', en: 'Textile & Apparel' } },
  { id: 'cat-electronics', slug: 'electronics', color: '#2a78d6', name: { uz: 'Elektronika', ru: 'Электроника', en: 'Electronics' } },
  { id: 'cat-packaging', slug: 'packaging', color: '#c98500', name: { uz: 'Qadoqlash', ru: 'Упаковка', en: 'Packaging' } },
  { id: 'cat-chemicals', slug: 'chemicals', color: '#1baf7a', name: { uz: 'Kimyo va plastmassa', ru: 'Химия и пластмассы', en: 'Chemicals & Plastics' } },
  { id: 'cat-furniture', slug: 'furniture', color: '#d55181', name: { uz: 'Mebel', ru: 'Мебель', en: 'Furniture' } },
  { id: 'cat-auto', slug: 'auto', color: '#e34948', name: { uz: 'Avto ehtiyot qismlar', ru: 'Автозапчасти', en: 'Auto Parts' } },
  { id: 'cat-household', slug: 'household', color: '#199e70', name: { uz: "Xo'jalik tovarlari", ru: 'Хозтовары', en: 'Household' } },
  { id: 'cat-equipment', slug: 'equipment', color: '#52514e', name: { uz: 'Sanoat uskunalari', ru: 'Промоборудование', en: 'Industrial Equipment' } },
  { id: 'cat-office', slug: 'office', color: '#3987e5', name: { uz: 'Ofis va kanselyariya', ru: 'Офис и канцелярия', en: 'Office Supplies' } },
];

/* ---------- warehouses (all companies keep a Tashkent pickup point) ---------- */
const warehouses: Address[] = [
  { label: 'Ombor', text: "Toshkent, Sergeli tumani, Yangi Sergeli ko'chasi, 12", lat: 41.2232, lng: 69.2201 },
  { label: 'Ombor', text: "Toshkent, Yakkasaroy tumani, Shota Rustaveli ko'chasi, 88", lat: 41.2851, lng: 69.2489 },
  { label: 'Ombor', text: "Toshkent, Bektemir tumani, Husayn Boyqaro ko'chasi, 5", lat: 41.2094, lng: 69.3346 },
  { label: 'Ombor', text: "Toshkent, Yunusobod tumani, Amir Temur ko'chasi, 107", lat: 41.3419, lng: 69.2867 },
  { label: 'Ombor', text: "Toshkent, Olmazor tumani, Qorasaroy ko'chasi, 34", lat: 41.3444, lng: 69.2101 },
  { label: 'Ombor', text: "Toshkent, Uchtepa tumani, Lutfiy ko'chasi, 19", lat: 41.2931, lng: 69.1795 },
  { label: 'Ombor', text: "Toshkent, Mirzo Ulug'bek tumani, Buyuk Ipak Yo'li, 156", lat: 41.3256, lng: 69.3361 },
  { label: 'Ombor', text: "Toshkent, Yashnobod tumani, Mahtumquli ko'chasi, 77", lat: 41.2969, lng: 69.3108 },
  { label: 'Ombor', text: "Toshkent, Chilonzor tumani, Bunyodkor shoh ko'chasi, 21", lat: 41.2762, lng: 69.2047 },
  { label: 'Ombor', text: "Toshkent, Shayxontohur tumani, Navoiy ko'chasi, 30", lat: 41.3249, lng: 69.2382 },
  { label: 'Ombor', text: "Toshkent, Mirobod tumani, Oybek ko'chasi, 18", lat: 41.2952, lng: 69.2731 },
];

/* ---------- companies ---------- */
type CompanySeed = [name: string, slug: string, region: string, cats: string[], founded: number, employees: string, verified: boolean, desc: string];
const companySeeds: CompanySeed[] = [
  ['Toshkent Oziq-ovqat Savdo', 'toshkent-oziq-ovqat', 'Toshkent shahri', ['food'], 2011, '50–100', true,
    "Respublika bo'ylab oziq-ovqat mahsulotlarini ulgurji yetkazib beruvchi distribyutor. 600 dan ortiq do'kon, kafe va restoranlar bilan doimiy hamkorlik. O'z omborlarimiz va transport parkimiz mavjud."],
  ['Samarqand Tekstil Group', 'samarqand-tekstil', 'Samarqand', ['textile'], 2008, '250–500', true,
    "Paxta kalavasidan tayyor kiyimgacha — to'liq ishlab chiqarish sikli. Mahsulotlarimiz Yevropa va MDH davlatlariga eksport qilinadi. OEKO-TEX sertifikatiga egamiz."],
  ["Farg'ona Qurilish Invest", 'fargona-qurilish', "Farg'ona", ['construction'], 2014, '100–250', true,
    "Sement, armatura, g'isht va quruq qorishmalar ishlab chiqaruvchi va yetkazib beruvchi. Yirik qurilish obyektlari uchun maxsus shartlar."],
  ['TechnoMart Distribution', 'technomart', 'Toshkent shahri', ['electronics'], 2016, '50–100', true,
    "Kompyuter texnikasi, smartfonlar, tarmoq uskunalari va elektr mollari bo'yicha rasmiy distribyutor. Korporativ mijozlar uchun kafolat va servis xizmati."],
  ['Andijon Agro Export', 'andijon-agro', 'Andijon', ['agro', 'food'], 2012, '100–250', true,
    "Meva-sabzavot, quruq mevalar va qishloq xo'jaligi uchun o'g'itlar. Sovutgichli omborlar va eksport sertifikatlari."],
  ['Namangan Plast', 'namangan-plast', 'Namangan', ['packaging', 'chemicals'], 2015, '50–100', false,
    "PET preformalar, polietilen paketlar, gofrokarton qutilar va polimer xomashyosi. Buyurtma asosida logotip bosish."],
  ['Buxoro Mebel Fabrikasi', 'buxoro-mebel', 'Buxoro', ['furniture'], 2010, '100–250', true,
    "Ofis, mehmonxona va oshxona mebellari ishlab chiqarish. O'lchov bo'yicha buyurtmalar va o'rnatish xizmati."],
  ['AvtoDetal Servis', 'avtodetal-servis', 'Toshkent viloyati', ['auto'], 2017, '10–50', true,
    "Avtomobil ehtiyot qismlari, moylar, akkumulyatorlar va shinalar — taksoparklar va servis markazlari uchun ulgurji narxlar."],
  ["Xorazm Xo'jalik Savdo", 'xorazm-xojalik', 'Xorazm', ['household'], 2018, '10–50', false,
    "Maishiy kimyo, gigiyena va xo'jalik mollari. Do'konlar tarmog'i va HoReCa uchun qulay qadoqlar."],
  ['Navoiy Sanoat Texnika', 'navoiy-sanoat', 'Navoiy', ['equipment'], 2009, '50–100', true,
    "Generatorlar, kompressorlar, payvandlash va ko'tarish uskunalari. Montaj, ishga tushirish va texnik xizmat ko'rsatish."],
  ['Ofis Plus', 'ofis-plus', 'Toshkent shahri', ['office'], 2019, '10–50', true,
    "Ofis qog'ozi, kanselyariya, kartrijlar va ofis jihozlari. Toshkent bo'ylab 24 soat ichida yetkazib berish."],
];

const sellerNames = ['Dilshod Karimov', 'Nilufar Rashidova', 'Javlon Usmonov', 'Sanjar Aliyev', 'Kamola Tojiboyeva', 'Bahrom Nazarov', 'Shahnoza Ismoilova', 'Ulugbek Hamidov', 'Mohira Saidova', 'Akmal Yoqubov', 'Dildora Qosimova'];

const companies: Company[] = companySeeds.map(([name, slug, region, cats, founded, employees, verified, desc], i) => ({
  id: `c${i + 1}`,
  ownerId: i === 0 ? 'u-seller' : `u-seller${i + 1}`,
  name,
  slug,
  tin: String(300000000 + rint(100000, 999999) * 100 + i),
  description: desc,
  region,
  address: `${region}, ${pick(['Mustaqillik', 'Navoiy', 'Amir Temur', 'Bobur', 'Alisher Navoiy', "Istiqlol"])} ko'chasi, ${rint(1, 140)}`,
  phone: `+998 ${pick(['90', '91', '93', '94', '97', '99'])} ${rint(100, 999)} ${rint(10, 99)} ${rint(10, 99)}`,
  email: `info@${slug.replace(/-/g, '')}.uz`,
  website: `https://${slug.replace(/-/g, '')}.uz`,
  foundedYear: founded,
  employees,
  verified,
  rating: 0,
  reviewsCount: 0,
  productsCount: 0,
  ordersCount: 0,
  responseRate: rint(82, 99),
  responseTimeHours: rint(1, 8),
  mainCategories: cats,
  pickupPoint: warehouses[i],
  createdAt: daysAgo(rint(400, 1200)),
}));

/* ---------- users ---------- */
const basePrefs = { email: true, sms: true, orders: true, marketing: false };
const tashkentAddresses: Address[] = [
  { label: 'Ofis', text: "Toshkent, Chilonzor tumani, 9-kvartal, 14-uy", lat: 41.2795, lng: 69.1932, apartment: '23', entrance: '2', floor: '4', landmark: "Chilonzor bozori yonida", contactName: 'Jasur Olimov', contactPhone: '+998901234567' },
  { label: 'Do‘kon', text: "Toshkent, Yunusobod tumani, 4-mavze, 22", lat: 41.3653, lng: 69.2867, landmark: "Mega Planet ro'parasida, orqa eshik", contactName: 'Bobur (omborchi)', contactPhone: '+998935551122' },
  { label: 'Ombor', text: "Toshkent, Sergeli tumani, Qumariq ko'chasi, 3", lat: 41.2266, lng: 69.2367 },
  { label: 'Restoran', text: "Toshkent, Mirobod tumani, Afrosiyob ko'chasi, 7", lat: 41.2932, lng: 69.2786 },
  { label: 'Ofis', text: "Toshkent, Mirzo Ulug'bek tumani, Qorasu-1, 41", lat: 41.3302, lng: 69.3549 },
  { label: 'Do‘kon', text: "Toshkent, Olmazor tumani, Sag'bon ko'chasi, 101", lat: 41.3589, lng: 69.2215 },
  { label: 'Kafe', text: "Toshkent, Yakkasaroy tumani, Bobur ko'chasi, 56", lat: 41.2875, lng: 69.2583 },
  { label: 'Sex', text: "Toshkent, Bektemir tumani, Sanoat ko'chasi, 9", lat: 41.2179, lng: 69.3268 },
];

const users: DbUser[] = [
  {
    id: 'u-admin', role: 'admin', fullName: 'Platforma Administratori', email: 'admin@demo.uz', phone: '+998901000000',
    status: 'active', createdAt: daysAgo(900), addresses: [], notificationPrefs: basePrefs, passwordHash: PASSWORD,
  },
  {
    id: 'u-buyer', role: 'buyer', fullName: 'Jasur Olimov', email: 'buyer@demo.uz', phone: '+998901234567',
    organization: 'Olimov Savdo MChJ', status: 'active', createdAt: daysAgo(320),
    addresses: [tashkentAddresses[0], tashkentAddresses[1]], notificationPrefs: basePrefs, passwordHash: PASSWORD,
  },
  {
    id: 'u-courier', role: 'courier', fullName: 'Sardor Rahimov', email: 'courier@demo.uz', phone: '+998935554433',
    status: 'active', createdAt: daysAgo(210), addresses: [], notificationPrefs: basePrefs, passwordHash: PASSWORD,
    courier: { transport: 'car', region: 'Toshkent shahri', rating: 4.9, deliveriesCount: 0, location: { lat: 41.3111, lng: 69.2797, at: daysAgo(0, 0.2), accuracy: 15 } },
  },
  {
    id: 'u-courier2', role: 'courier', fullName: 'Islom Ortiqov', email: 'courier2@demo.uz', phone: '+998977771122',
    status: 'active', createdAt: daysAgo(150), addresses: [], notificationPrefs: basePrefs, passwordHash: PASSWORD,
    courier: { transport: 'truck', region: 'Toshkent shahri', rating: 4.7, deliveriesCount: 0 },
  },
  ...companies.map<DbUser>((c, i) => ({
    id: c.ownerId, role: 'seller', fullName: sellerNames[i], email: i === 0 ? 'seller@demo.uz' : `seller${i + 1}@demo.uz`,
    phone: `+99890${rint(1000000, 9999999)}`, companyId: c.id, status: 'active', createdAt: c.createdAt,
    addresses: [], notificationPrefs: basePrefs, passwordHash: PASSWORD,
  })),
  ...[
    ['Aziz Tursunov', 'Tursunov Market'],
    ['Malika Yusupova', 'Malika Kafe'],
    ['Bekzod Sobirov', 'BS Qurilish'],
    ['Nodira Xasanova', 'Nur Textile'],
    ['Otabek Ergashev', 'Ergashev Avto'],
  ].map<DbUser>(([name, org], i) => ({
    id: `u-buyer${i + 2}`, role: 'buyer', fullName: name, email: `buyer${i + 2}@demo.uz`, phone: `+99899${rint(1000000, 9999999)}`,
    organization: org, status: 'active', createdAt: daysAgo(rint(30, 300)), addresses: [tashkentAddresses[(i + 2) % tashkentAddresses.length]],
    notificationPrefs: basePrefs, passwordHash: PASSWORD,
  })),
];

/* ---------- products ---------- */
// [companyIdx, category, name, unit, price, moq, stock, discount, description, specs "k:v;k:v", tags]
type ProductSeed = [number, string, string, ProductUnit, number, number, number, number, string, string, string];
const productSeeds: ProductSeed[] = [
  [0, 'food', "Bug'doy uni, oliy nav, 50 kg", 'bag', 385000, 10, 1200, 0, "Qattiq bug'doy navlaridan tayyorlangan oliy navli un. Non, somsa va qandolat mahsulotlari uchun ideal. Kleykovina miqdori 28% dan kam emas.", "Navi:Oliy;Og'irligi:50 kg;Kleykovina:28–30%;Ishlab chiqaruvchi:O'zbekiston", 'un,bugdoy,non'],
  [0, 'food', 'Guruch Lazer, Xorazm, 25 kg', 'bag', 520000, 5, 640, 5, "Xorazmning mashhur lazer guruchi — palov uchun eng yaxshi tanlov. Saralangan, toza, bir xil kattalikdagi donlar.", "Navi:Lazer;Og'irligi:25 kg;Hosil yili:2026;Hudud:Xorazm", 'guruch,palov'],
  [0, 'food', "Kungaboqar yog'i, rafinatsiyalangan, 5 L", 'piece', 98000, 20, 2400, 0, "Rafinatsiyalangan, dezodoratsiyalangan kungaboqar yog'i. Qovurish va salatlar uchun. PET idishda.", "Hajmi:5 L;Turi:Rafinatsiyalangan;Qadoq:PET;Saqlash muddati:12 oy", "yog',moy"],
  [0, 'food', 'Shakar, oq kristall, 50 kg', 'bag', 560000, 10, 800, 0, "Lavlagi shakari, GOST talablariga mos. Qandolatchilik va HoReCa uchun.", "Og'irligi:50 kg;Standart:GOST 33222;Rangi:Oq", 'shakar'],
  [0, 'food', 'Makaron mahsulotlari, 400 g × 20', 'box', 145000, 10, 950, 7, "Qattiq bug'doydan tayyorlangan makaron: shoxcha, spiral va spagetti assortimentda.", "Qadoq:20 × 400 g;Xomashyo:Durum bug'doy;Saqlash muddati:24 oy", 'makaron'],
  [0, 'food', "Ko'k choy, 100 g × 50", 'box', 410000, 5, 300, 0, "Xitoyning 95-navli ko'k choyi. Choyxona va restoranlar uchun qulay qadoq.", "Qadoq:50 × 100 g;Navi:95;Kelib chiqishi:Xitoy", 'choy'],
  [0, 'food', 'Tuz, yodlangan, 1 kg × 25', 'bag', 62000, 20, 1500, 0, "Yodlangan osh tuzi, mayda tuyilgan. Qop ichida 25 ta 1 kg lik paket.", "Qadoq:25 × 1 kg;Turi:Yodlangan;Tuyilishi:Mayda", 'tuz'],
  [0, 'food', 'Mosh, saralangan, 25 kg', 'bag', 690000, 4, 260, 3, "Yirik donli, saralangan mosh. Mahalliy hosil.", "Og'irligi:25 kg;Hosil yili:2026;Hudud:Qashqadaryo", 'mosh,dukkakli'],

  [4, 'agro', "Quritilgan o'rik, 10 kg", 'box', 520000, 5, 420, 0, "Tabiiy usulda quritilgan, oltingugurtsiz o'rik. Eksport sifati.", "Og'irligi:10 kg;Navi:Subxoni;Ishlov:Tabiiy quritilgan", "o'rik,quruq meva"],
  [4, 'agro', 'Mayiz, qora, 10 kg', 'box', 450000, 5, 380, 6, "Kishmish navidan tayyorlangan qora mayiz. Yuvilgan va saralangan.", "Og'irligi:10 kg;Navi:Kishmish;Rangi:Qora", 'mayiz'],
  [4, 'food', "Yong'oq mag'zi, 5 kg", 'box', 610000, 3, 150, 0, "Tozalangan yong'oq mag'zi, och rangli, butun pallalar 70% dan ortiq.", "Og'irligi:5 kg;Rangi:Light;Butun palla:70%+", "yong'oq"],
  [4, 'agro', 'Pomidor, yangi, 1-nav', 'kg', 9000, 500, 25000, 0, "Issiqxonada yetishtirilgan yangi pomidor. Kunlik terim, sovutgichli transportda yetkaziladi.", "Navi:Pink Paradise;Kalibr:5–7 sm;Qadoq:Yashik 10 kg", 'pomidor,sabzavot'],
  [4, 'agro', "Kartoshka, urug'lik", 'kg', 6500, 1000, 60000, 0, "Gollandiya navli urug'lik kartoshka, fraksiya 35–55 mm.", "Navi:Arizona;Fraksiya:35–55 mm;Qadoq:Setka 25 kg", "kartoshka,urug'"],
  [4, 'agro', "Mineral o'g'it NPK 16:16:16, 50 kg", 'bag', 420000, 10, 900, 4, "Kompleks mineral o'g'it — barcha ekinlar uchun asosiy oziqlantirish.", "Tarkibi:N16 P16 K16;Og'irligi:50 kg;Shakli:Granula", "o'g'it,npk"],

  [1, 'textile', 'Paxta kalava Ne 30/1, 100% paxta', 'kg', 46000, 200, 18000, 0, "Halqali usulda yigirilgan taralgan paxta kalavasi. Trikotaj ishlab chiqarish uchun.", "Raqami:Ne 30/1;Tarkibi:100% paxta;Usul:Combed ring-spun", 'kalava,paxta,ip'],
  [1, 'textile', 'Trikotaj mato, kulirka, 180 g/m²', 'kg', 78000, 100, 7500, 0, "Bo'yalgan kulirka matosi, 20 dan ortiq rang. Futbolka va ichki kiyim uchun.", "Zichligi:180 g/m²;Tarkibi:100% paxta;Eni:180 sm (trubka)", 'mato,kulirka'],
  [1, 'textile', 'Erkaklar futbolkasi, paxta', 'piece', 38000, 100, 12000, 10, "Klassik bichimli erkaklar futbolkasi. S–XXL o'lchamlar, logotip bosish imkoniyati.", "Tarkibi:100% paxta;O'lchamlar:S–XXL;Zichligi:160 g/m²", 'futbolka,kiyim'],
  [1, 'textile', "Ish kiyimi to'plami (kombinezon)", 'set', 185000, 20, 1400, 0, "Mustahkam ish kiyimi: kurtka va kombinezon. Aks ettiruvchi chiziqlar bilan.", "Mato:Twill 65/35;O'lchamlar:46–60;Rangi:Ko'k/kulrang", 'ish kiyimi,maxsus kiyim'],
  [1, 'textile', "Choyshab to'plami, 2 kishilik, satin", 'set', 165000, 30, 2200, 5, "Satin matodan choyshab to'plami: choyshab, ko'rpa jild, 2 ta yostiq jild.", "Mato:Satin;Tarkibi:100% paxta;O'lchami:2 kishilik", "choyshab,to'qimachilik"],
  [1, 'textile', 'Sochiq, maxra, 70×140', 'piece', 42000, 50, 5000, 0, "Yumshoq maxra sochiq, 450 g/m². Mehmonxonalar uchun oq rangda mavjud.", "O'lchami:70×140 sm;Zichligi:450 g/m²;Tarkibi:100% paxta", 'sochiq'],

  [2, 'construction', 'Portlandsement M400, 50 kg', 'bag', 52000, 100, 40000, 0, "Umumiy qurilish ishlari uchun portlandsement. Poydevor, quyma beton va suvoq ishlari uchun.", "Markasi:M400 D20;Og'irligi:50 kg;Standart:GOST 31108", 'sement,beton'],
  [2, 'construction', 'Armatura A500C, Ø12 mm', 'ton', 8900000, 1, 320, 0, "Issiq prokatlangan davriy profilli armatura. 11.7 m uzunlikda.", "Diametri:12 mm;Sinfi:A500C;Uzunligi:11.7 m", 'armatura,metall'],
  [2, 'construction', "G'isht, pishgan, M150", 'piece', 1100, 5000, 900000, 0, "To'liq pishgan qizil g'isht, standart o'lcham. Poddonlarda yetkaziladi.", "Markasi:M150;O'lchami:250×120×65;Poddonda:300 dona", "g'isht"],
  [2, 'construction', 'Gipsokarton list, 12.5 mm', 'piece', 54000, 50, 8000, 3, "Devor va shiftlar uchun standart gipsokarton list.", "Qalinligi:12.5 mm;O'lchami:1200×2500;Turi:Standart", 'gipsokarton'],
  [2, 'construction', 'Profnastil S-20, 0.45 mm', 'm2', 68000, 50, 15000, 0, "Polimer qoplamali profnastil. Tom va devor uchun, 15 dan ortiq rang.", "Qalinligi:0.45 mm;Profil:S-20;Qoplama:Poliester", 'profnastil,tom'],
  [2, 'construction', 'Plitka yelimi, 25 kg', 'bag', 48000, 40, 6000, 0, "Kafel va keramogranit uchun sement asosidagi yelim.", "Og'irligi:25 kg;Sarfi:3–5 kg/m²;Turi:C1T", 'qorishma,plitka'],

  [3, 'electronics', 'Noutbuk Lenovo IdeaPad 3, 15.6"', 'piece', 7200000, 3, 85, 0, "Ofis ishlari uchun ishonchli noutbuk. Core i5, 16 GB RAM, 512 GB SSD. Rasmiy kafolat 12 oy.", "Protsessor:Intel Core i5-1235U;Xotira:16 GB;SSD:512 GB;Kafolat:12 oy", 'noutbuk,kompyuter'],
  [3, 'electronics', 'Smartfon Samsung Galaxy A35, 128 GB', 'piece', 4150000, 5, 140, 4, "Korporativ xodimlar uchun smartfon. Rasmiy import, IMEI ro'yxatdan o'tgan.", "Xotira:8/128 GB;Ekran:6.6\" AMOLED;Batareya:5000 mAh;Kafolat:12 oy", 'smartfon,telefon'],
  [3, 'electronics', 'Monitor 24" IPS Full HD', 'piece', 1650000, 5, 120, 0, "Ofis va dizayn uchun IPS monitor, 75 Gts.", "Diagonal:23.8\";Matritsa:IPS;Ruxsat:1920×1080", 'monitor'],
  [3, 'electronics', 'LED lampa E27, 12 W (100 dona)', 'box', 690000, 2, 400, 8, "Energiya tejamkor LED lampalar, issiq va sovuq yorug'lik.", "Quvvati:12 W;Patron:E27;Qutida:100 dona;Xizmat muddati:25 000 soat", 'lampa,yoritish'],
  [3, 'electronics', 'Wi-Fi router TP-Link Archer C6', 'piece', 420000, 10, 260, 0, "Ikki diapazonli gigabit router. Ofis va do'konlar uchun.", "Standart:AC1200;Portlar:4 × Gigabit;Diapazon:2.4/5 GHz", 'router,tarmoq'],
  [3, 'electronics', 'IP kuzatuv kamerasi, 4 MP', 'piece', 560000, 4, 300, 0, "Tashqi o'rnatish uchun IP kamera, tungi ko'rish 30 m.", "Ruxsat:4 MP;Himoya:IP67;Tungi rejim:30 m;PoE:Ha", 'kamera,xavfsizlik'],
  [3, 'electronics', 'Elektr kabeli VVG 3×2.5 (100 m)', 'pack', 1150000, 2, 180, 0, "Mis o'tkazgichli kuch kabeli, buxtada 100 m.", "Kesimi:3×2.5 mm²;Uzunligi:100 m;O'tkazgich:Mis", 'kabel,elektr'],

  [5, 'packaging', 'PET preforma 28 g (1000 dona)', 'box', 780000, 5, 600, 0, "1–1.5 L idishlar uchun PET preforma, bo'yin PCO 1881.", "Og'irligi:28 g;Bo'yin:PCO 1881;Qutida:1000 dona", 'preforma,pet'],
  [5, 'packaging', 'Polietilen paket, mayka, 30×55 (1000 dona)', 'pack', 95000, 10, 5000, 0, "Mustahkam mayka paketlar. Logotip bosish buyurtma asosida.", "O'lchami:30×55 sm;Qalinligi:15 mkm;Pachkada:1000 dona", 'paket,polietilen'],
  [5, 'packaging', 'Gofrokarton quti, 40×30×30 (100 dona)', 'pack', 560000, 2, 900, 5, "Uch qatlamli gofrokarton qutilar. Yuk tashish va saqlash uchun.", "O'lchami:40×30×30 sm;Qatlam:3;Markasi:T-23", 'quti,karton'],
  [5, 'packaging', 'Stretch plyonka, 500 mm, 2 kg', 'piece', 68000, 24, 3000, 0, "Poddonlarni o'rash uchun stretch plyonka.", "Eni:500 mm;Qalinligi:20 mkm;Og'irligi:2 kg", 'plyonka,stretch'],
  [5, 'chemicals', 'PVX granula', 'kg', 16500, 1000, 40000, 0, "Kabel va profil ishlab chiqarish uchun PVX granula.", "Markasi:SG-5;Qadoq:Qop 25 kg;Shakli:Granula", 'pvx,polimer'],
  [5, 'chemicals', 'Polipropilen granula', 'kg', 15800, 1000, 55000, 3, "Shorgil'dan PP granula — qopqoq, idish va plyonka uchun.", "Markasi:J350;MFI:10 g/10 min;Qadoq:Qop 25 kg", 'polipropilen,polimer'],

  [6, 'furniture', 'Ofis stoli, 120×60, laminat', 'piece', 1150000, 5, 140, 0, "Metall karkasli ofis stoli, 3 ta tortmasi bilan.", "O'lchami:120×60×75 sm;Material:LDSP 22 mm;Karkas:Metall", 'stol,ofis'],
  [6, 'furniture', 'Ofis kreslosi, ergonomik', 'piece', 980000, 5, 200, 8, "To'r suyanchiqli ergonomik kreslo, bel tayanchi va bosh suyanchig'i bilan.", "Maksimal yuk:120 kg;Mexanizm:Tilt;G'ildiraklar:Neylon", 'kreslo,stul'],
  [6, 'furniture', 'Metall stellaj, 5 tokchali', 'piece', 720000, 4, 260, 0, "Ombor va arxivlar uchun yig'iladigan metall stellaj.", "O'lchami:200×100×50 sm;Tokchaga yuk:150 kg;Qoplama:Poroshok", 'stellaj,ombor'],
  [6, 'furniture', "Oshxona to'plami, 6 kishilik", 'set', 3400000, 2, 40, 0, "Kafe va restoranlar uchun stol va 6 ta stul to'plami.", "Stol:160×90 sm;Stullar:6 dona;Material:Yong'oq", "stol,stul,to'plam"],

  [7, 'auto', 'Motor moyi 5W-40, sintetik, 4 L', 'piece', 285000, 12, 900, 5, "Benzin va dizel dvigatellar uchun to'liq sintetik moy.", "Yopishqoqlik:5W-40;Turi:Sintetik;Hajmi:4 L;Standart:API SN/CF", 'moy,avto'],
  [7, 'auto', 'Akkumulyator 60 Ah', 'piece', 890000, 4, 160, 0, "Xizmat ko'rsatilmaydigan avtomobil akkumulyatori.", "Sig'imi:60 Ah;Ishga tushirish toki:540 A;Kafolat:18 oy", 'akkumulyator'],
  [7, 'auto', 'Tormoz kolodkasi (Cobalt/Lacetti)', 'set', 145000, 10, 700, 0, "Old g'ildirak uchun tormoz kolodkalari to'plami.", "Mos keladi:Cobalt, Lacetti, Nexia 3;To'plamda:4 dona", 'kolodka,tormoz'],
  [7, 'auto', 'Shina 185/65 R15, yozgi', 'piece', 620000, 8, 400, 6, "Yozgi shina, past shovqin va yaxshi ilashish.", "O'lchami:185/65 R15;Mavsum:Yozgi;Indeks:88H", "shina,g'ildirak"],

  [8, 'household', 'Kir yuvish kukuni, avtomat, 3 kg', 'piece', 54000, 24, 2400, 0, "Avtomat kir yuvish mashinalari uchun universal kukun.", "Og'irligi:3 kg;Turi:Avtomat;Kir yuvish soni:30", 'kukun,maishiy kimyo'],
  [8, 'household', 'Idish yuvish vositasi, 5 L', 'piece', 47000, 20, 1800, 4, "HoReCa uchun konsentrlangan idish yuvish vositasi.", "Hajmi:5 L;Hidi:Limon;pH:Neytral", 'idish yuvish'],
  [8, 'household', "Hojatxona qog'ozi, 24 rulon", 'pack', 52000, 20, 3000, 0, "Ikki qatlamli oq hojatxona qog'ozi.", "Qatlam:2;Rulon:24;Uzunligi:18 m", "qog'oz,gigiyena"],
  [8, 'household', 'Axlat paketi, 120 L (10 dona)', 'pack', 18000, 50, 8000, 0, "Mustahkam axlat paketlari, bog'ichli.", "Hajmi:120 L;Qalinligi:30 mkm;Rulonda:10 dona", 'paket,axlat'],

  [9, 'equipment', 'Dizel generator 30 kVt', 'piece', 98000000, 1, 6, 0, "Kojuxli dizel generator, avtomatik ishga tushirish (ATS) bilan.", "Quvvati:30 kVt;Dvigatel:Ricardo;Yoqilg'i baki:120 L;ATS:Ha", 'generator,energiya'],
  [9, 'equipment', 'Payvandlash apparati, invertor 250A', 'piece', 2350000, 2, 60, 5, "Professional invertor payvandlash apparati MMA/TIG.", "Tok:20–250 A;Kuchlanish:220 V;Rejim:MMA/TIG", 'payvandlash'],
  [9, 'equipment', 'Kompressor, 100 L, 2.2 kVt', 'piece', 4600000, 1, 25, 0, "Moyli porshenli havo kompressori ustaxonalar uchun.", "Resiver:100 L;Quvvati:2.2 kVt;Unumdorlik:400 L/min", 'kompressor'],
  [9, 'equipment', "Elektr tal (ko'targich), 1 t", 'piece', 6900000, 1, 14, 0, "Arqonli elektr tal, ko'tarish balandligi 12 m.", "Yuk ko'tarish:1 t;Balandlik:12 m;Kuchlanish:380 V", "tal,ko'targich"],

  [10, 'office', "A4 qog'oz, 80 g/m² (5 pachka)", 'box', 265000, 10, 3000, 6, "Ofis printerlari uchun oq A4 qog'oz, qutida 5 pachka × 500 varaq.", "Format:A4;Zichligi:80 g/m²;Oqligi:146% CIE;Qutida:2500 varaq", "qog'oz,a4"],
  [10, 'office', "Sharikli ruchka, ko'k (50 dona)", 'box', 45000, 10, 2000, 0, "Yengil yozuvchi sharikli ruchkalar.", "Rangi:Ko'k;Uchi:0.7 mm;Qutida:50 dona", 'ruchka,kanselyariya'],
  [10, 'office', 'Papka-registrator, 75 mm', 'piece', 19000, 50, 5000, 0, "Hujjatlarni saqlash uchun A4 papka-registrator.", "Kengligi:75 mm;Format:A4;Material:Karton/PVX", 'papka'],
  [10, 'office', 'Kartrij HP 85A (muqobil)', 'piece', 165000, 5, 600, 0, "HP LaserJet printerlari uchun muqobil kartrij, 1600 bet.", "Mos keladi:HP P1102, M1132;Resurs:1600 bet;Rangi:Qora", 'kartrij,printer'],
];

const niceRound = (n: number) => (n >= 100000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n));

const products: Product[] = productSeeds.map(([ci, cat, name, unit, price, moq, stock, discount, description, specs, tags], i) => {
  const tiers =
    moq <= 2
      ? [{ minQty: 3, price: niceRound(price * 0.97) }, { minQty: 5, price: niceRound(price * 0.94) }]
      : [{ minQty: moq * 5, price: niceRound(price * 0.95) }, { minQty: moq * 20, price: niceRound(price * 0.9) }];
  const created = daysAgo(rint(20, 300));
  return {
    id: `p${i + 1}`,
    companyId: `c${ci + 1}`,
    categorySlug: cat,
    name,
    description,
    images: [],
    price,
    unit,
    moq,
    stock,
    discount,
    tiers,
    specs: specs.split(';').map((s) => {
      const [key, ...rest] = s.split(':');
      return { key, value: rest.join(':') };
    }),
    tags: tags.split(','),
    rating: 0,
    reviewsCount: 0,
    soldCount: rint(20, 900),
    views: rint(200, 6000),
    deliveryDays: rint(1, 5),
    status: 'active',
    createdAt: created,
    updatedAt: created,
  };
});

/* ---------- reviews ---------- */
const reviewers = ['Aziz Tursunov', 'Malika Yusupova', 'Bekzod Sobirov', 'Nodira Xasanova', 'Otabek Ergashev', 'Gulnora Ahmedova', 'Rustam Qodirov', 'Feruza Islomova', 'Shoxrux Mirzayev', 'Zarina Abdullayeva', 'Jasur Olimov'];
const comments: [number, string][] = [
  [5, "Sifati a'lo, o'z vaqtida yetkazib berishdi. Hamkorlikni davom ettiramiz."],
  [5, 'Narxi bozordagidan arzonroq, ulgurji chegirma juda qulay.'],
  [5, "Qadoqlash yaxshi, hech qanday shikast yo'q edi."],
  [4, 'Sotuvchi tez javob beradi, hujjatlar (hisob-faktura) to‘liq taqdim etildi.'],
  [4, 'Umuman olganda yaxshi, lekin yetkazib berish bir kun kechikdi.'],
  [5, "Mahsulot tavsifga to'liq mos keldi. Tavsiya qilaman!"],
  [4, "Yaxshi mahsulot. Keyingi safar kattaroq partiya olamiz."],
  [3, "O'rtacha. Partiyaning bir qismi sifati past bo'ldi, lekin sotuvchi almashtirib berdi."],
  [5, 'Doimiy yetkazib beruvchimiz — hech qachon pand bermagan.'],
  [4, 'Narx va sifat nisbati yaxshi.'],
];
const reviews: Review[] = [];
for (const p of products) {
  const count = rint(2, 7);
  for (let k = 0; k < count; k++) {
    const [rating, comment] = pick(comments);
    reviews.push({
      id: `r${reviews.length + 1}`,
      productId: p.id,
      userId: `u-rev${k}`,
      userName: reviewers[(k + Number(p.id.slice(1))) % reviewers.length],
      rating,
      comment,
      createdAt: daysAgo(rint(1, 200)),
    });
  }
}
for (const p of products) {
  const rs = reviews.filter((r) => r.productId === p.id);
  p.reviewsCount = rs.length;
  p.rating = Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10;
}
for (const c of companies) {
  const ps = products.filter((p) => p.companyId === c.id);
  c.productsCount = ps.length;
  c.reviewsCount = ps.reduce((s, p) => s + p.reviewsCount, 0);
  c.rating = Math.round((ps.reduce((s, p) => s + p.rating * p.reviewsCount, 0) / Math.max(1, c.reviewsCount)) * 10) / 10;
}

/* ---------- orders ---------- */
const buyers = users.filter((u) => u.role === 'buyer');
const couriers = users.filter((u) => u.role === 'courier');
const orders: Order[] = [];
let orderCounter = 1000;

function buildTimeline(status: OrderStatus, createdAt: string, delivery: 'courier' | 'pickup'): OrderEvent[] {
  const flow: OrderStatus[] = delivery === 'courier' ? ['pending', 'confirmed', 'ready', 'in_transit', 'delivered'] : ['pending', 'confirmed', 'ready', 'delivered'];
  const t0 = new Date(createdAt).getTime();
  if (status === 'cancelled') {
    return [
      { status: 'pending', at: createdAt },
      { status: 'cancelled', at: new Date(t0 + 3 * 3600000).toISOString(), note: 'Mijoz so‘rovi bilan bekor qilindi' },
    ];
  }
  const idx = flow.indexOf(status);
  const done = flow.slice(0, idx + 1);
  const steps = [0, 2, 20, 26, 30];
  // Never schedule an event in the future: squeeze the steps into [createdAt, now).
  const span = Math.max(0, Date.now() - 10 * 60000 - t0);
  const last = steps[done.length - 1] * 3600000 || 1;
  const k = Math.min(1, span / last);
  const events = done.map((s, i) => ({ status: s, at: new Date(t0 + steps[i] * 3600000 * k).toISOString() }));
  if (status === 'in_transit') {
    // couriers on the road right now left the warehouse a few minutes ago
    const left = Math.max(new Date(events[events.length - 2].at).getTime() + 60000, Date.now() - rint(3, 12) * 60000);
    events[events.length - 1].at = new Date(left).toISOString();
  }
  return events;
}

for (let i = 0; i < 260; i++) {
  const age = rand() < 0.06 ? rand() * 2.5 : rand() * 120;
  const createdAt = new Date(Date.now() - age * 86400000).toISOString();
  const company = rand() < 0.38 ? companies[0] : pick(companies);
  const buyer = rand() < 0.2 ? buyers[0] : pick(buyers);
  const companyProducts = products.filter((p) => p.companyId === company.id);
  const lineCount = Math.min(companyProducts.length, rint(1, 3));
  const chosen = [...companyProducts].sort(() => rand() - 0.5).slice(0, lineCount);
  const items = chosen.map((p) => {
    const qty = p.moq * rint(1, p.moq >= 100 ? 4 : 8);
    const unitPrice = unitPriceFor(p, qty);
    return { productId: p.id, name: p.name, categorySlug: p.categorySlug, unit: p.unit, unitPrice, quantity: qty, total: unitPrice * qty };
  });
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const deliveryType = rand() < 0.8 ? 'courier' : 'pickup';
  const address = buyer.addresses[0];
  const distanceKm = Math.round(haversineKm(company.pickupPoint, address) * 1.3 * 10) / 10;
  const fee = deliveryType === 'courier' ? deliveryFee(subtotal, distanceKm) : 0;

  let status: OrderStatus;
  if (age < 0.4) status = pick(['pending', 'pending', 'confirmed'] as const);
  else if (age < 1.2) status = pick(['confirmed', 'ready', 'ready', 'in_transit'] as const);
  else if (age < 2.5) status = pick(['ready', 'in_transit', 'delivered'] as const);
  else status = rand() < 0.1 ? 'cancelled' : 'delivered';
  if (deliveryType === 'pickup' && status === 'in_transit') status = 'ready';

  const paymentMethod: PaymentMethod = pick(['card', 'card', 'transfer', 'cash'] as const);
  const paid = status === 'delivered' || (paymentMethod === 'card' && status !== 'cancelled') || (paymentMethod === 'transfer' && !['pending', 'cancelled'].includes(status));
  const needsCourier = deliveryType === 'courier' && (status === 'in_transit' || status === 'delivered' || (status === 'ready' && rand() < 0.4));
  const courier = needsCourier ? (rand() < 0.65 ? couriers[0] : couriers[1]) : undefined;
  const timeline = buildTimeline(status, createdAt, deliveryType);

  orders.push({
    id: `o${i + 1}`,
    number: `B2B-${++orderCounter}`,
    buyerId: buyer.id,
    buyerName: buyer.fullName,
    buyerPhone: buyer.phone,
    buyerOrganization: buyer.organization,
    companyId: company.id,
    companyName: company.name,
    items,
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
    status,
    paymentMethod,
    paymentStatus: status === 'cancelled' && paymentMethod === 'card' ? 'refunded' : paid ? 'paid' : 'unpaid',
    delivery: {
      type: deliveryType,
      address: deliveryType === 'courier' ? address : undefined,
      pickupPoint: company.pickupPoint,
      distanceKm,
      durationMin: Math.max(5, Math.round((distanceKm / 28) * 60)),
      routeSource: 'estimate',
    },
    courierId: courier?.id,
    courierName: courier?.fullName,
    courierPhone: courier?.phone,
    courierFee: courier ? Math.round((fee || DELIVERY.baseFee) * DELIVERY.courierShare) : undefined,
    cancelReason: status === 'cancelled' ? 'Mijoz so‘rovi bilan bekor qilindi' : undefined,
    timeline,
    createdAt,
    updatedAt: timeline[timeline.length - 1].at,
  });
}
orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
for (const c of companies) c.ordersCount = orders.filter((o) => o.companyId === c.id).length;
for (const u of couriers) u.courier!.deliveriesCount = orders.filter((o) => o.courierId === u.id && o.status === 'delivered').length + rint(80, 300);

/* ---------- RFQs ---------- */
const rfqs: Rfq[] = [
  {
    id: 'q1', number: 'RFQ-301', buyerId: 'u-buyer', buyerName: 'Jasur Olimov', buyerOrganization: 'Olimov Savdo MChJ', companyId: 'c1', companyName: companies[0].name,
    productId: 'p1', productName: products[0].name, quantity: 300, unit: 'bag', targetPrice: 355000, deadline: daysAgo(-14),
    message: "Har oy 300 qop un kerak bo'ladi. Yillik shartnoma asosida maxsus narx bera olasizmi?", status: 'answered',
    response: { unitPrice: 362000, message: "Yillik shartnoma uchun 362 000 so'm taklif qilamiz, yetkazib berish bepul.", validUntil: daysAgo(-10), at: daysAgo(1) },
    createdAt: daysAgo(3),
  },
  {
    id: 'q2', number: 'RFQ-302', buyerId: 'u-buyer', buyerName: 'Jasur Olimov', buyerOrganization: 'Olimov Savdo MChJ', companyId: 'c4', companyName: companies[3].name,
    productId: 'p27', productName: products[26].name, quantity: 25, unit: 'piece', targetPrice: 6800000,
    message: "Ofisimiz uchun 25 ta noutbuk kerak. O'rnatilgan Windows va 24 oylik kafolat bilan narx qancha bo'ladi?", status: 'open', createdAt: daysAgo(0, 5),
  },
  {
    id: 'q3', number: 'RFQ-303', buyerId: 'u-buyer3', buyerName: 'Malika Yusupova', buyerOrganization: 'Malika Kafe', companyId: 'c1', companyName: companies[0].name,
    productId: 'p3', productName: products[2].name, quantity: 200, unit: 'piece', message: "Kafe tarmog'imiz uchun har hafta yog' kerak. Doimiy mijoz chegirmasi bormi?", status: 'open', createdAt: daysAgo(1, 2),
  },
  {
    id: 'q4', number: 'RFQ-304', buyerId: 'u-buyer4', buyerName: 'Bekzod Sobirov', buyerOrganization: 'BS Qurilish', companyId: 'c1', companyName: companies[0].name,
    productName: 'Guruch (Devzira), 1 tonna', quantity: 40, unit: 'bag', message: "Devzira guruchi bormi? 40 qop kerak, narx va muddatini yozing.", status: 'open', createdAt: daysAgo(0, 9),
  },
  {
    id: 'q5', number: 'RFQ-305', buyerId: 'u-buyer2', buyerName: 'Aziz Tursunov', buyerOrganization: 'Tursunov Market', companyId: 'c1', companyName: companies[0].name,
    productId: 'p4', productName: products[3].name, quantity: 100, unit: 'bag', targetPrice: 530000, message: '100 qop shakar kerak.', status: 'accepted',
    response: { unitPrice: 535000, message: "Kelishdik, 535 000 so'mdan. Ertaga yuklab beramiz.", validUntil: daysAgo(-5), at: daysAgo(6) },
    createdAt: daysAgo(8),
  },
];

/* ---------- conversations ---------- */
const conversations: DbConversation[] = [
  {
    id: 'cv1', participantIds: ['u-buyer', 'u-seller'], productId: 'p2', productName: products[1].name,
    lastMessage: { text: 'Ha, ertaga ertalab yuklab yuboramiz.', senderId: 'u-seller', at: daysAgo(0, 3) },
    unreadBy: { 'u-buyer': 1, 'u-seller': 0 }, updatedAt: daysAgo(0, 3),
  },
  {
    id: 'cv2', participantIds: ['u-buyer3', 'u-seller'], productId: 'p3', productName: products[2].name,
    lastMessage: { text: 'Hisob-fakturani elektron yuborsangiz bo‘ladimi?', senderId: 'u-buyer3', at: daysAgo(0, 6) },
    unreadBy: { 'u-buyer3': 0, 'u-seller': 1 }, updatedAt: daysAgo(0, 6),
  },
];
const messages: Message[] = [
  { id: 'm1', conversationId: 'cv1', senderId: 'u-buyer', text: 'Assalomu alaykum! Lazer guruchidan 40 qop olsak, qachon yetkazib bera olasiz?', createdAt: daysAgo(0, 5) },
  { id: 'm2', conversationId: 'cv1', senderId: 'u-seller', text: 'Vaalaykum assalom! Omborda yetarli miqdor bor.', createdAt: daysAgo(0, 4) },
  { id: 'm3', conversationId: 'cv1', senderId: 'u-buyer', text: 'Zo‘r, buyurtma beraman. Ertaga olib kelish mumkinmi?', createdAt: daysAgo(0, 3.5) },
  { id: 'm4', conversationId: 'cv1', senderId: 'u-seller', text: 'Ha, ertaga ertalab yuklab yuboramiz.', createdAt: daysAgo(0, 3) },
  { id: 'm5', conversationId: 'cv2', senderId: 'u-buyer3', text: 'Salom! Yog‘ uchun buyurtmani rasmiylashtirdim.', createdAt: daysAgo(0, 7) },
  { id: 'm6', conversationId: 'cv2', senderId: 'u-buyer3', text: 'Hisob-fakturani elektron yuborsangiz bo‘ladimi?', createdAt: daysAgo(0, 6) },
];

/* ---------- notifications ---------- */
const notifications: Notification[] = [
  { id: 'n1', userId: 'u-buyer', type: 'rfq', title: 'Narx taklifi keldi', body: `${companies[0].name} RFQ-301 bo'yicha taklif yubordi.`, link: '/account/rfqs', read: false, createdAt: daysAgo(1) },
  { id: 'n2', userId: 'u-buyer', type: 'message', title: 'Yangi xabar', body: 'Dilshod Karimov: Ha, ertaga ertalab yuklab yuboramiz.', link: '/messages/cv1', read: false, createdAt: daysAgo(0, 3) },
  { id: 'n3', userId: 'u-buyer', type: 'system', title: 'Xush kelibsiz!', body: "B2B Bozor platformasiga xush kelibsiz. Profilingizni to'ldiring va birinchi buyurtmangizni bering.", link: '/account/profile', read: true, createdAt: daysAgo(30) },
  { id: 'n4', userId: 'u-seller', type: 'rfq', title: "Yangi narx so'rovi", body: "Malika Yusupova kungaboqar yog'i uchun narx so'radi.", link: '/seller/rfqs', read: false, createdAt: daysAgo(1, 2) },
  { id: 'n5', userId: 'u-seller', type: 'message', title: 'Yangi xabar', body: 'Malika Yusupova: Hisob-fakturani elektron yuborsangiz bo‘ladimi?', link: '/messages/cv2', read: false, createdAt: daysAgo(0, 6) },
  { id: 'n6', userId: 'u-courier', type: 'order', title: 'Yangi buyurtmalar mavjud', body: 'Yaqin atrofda yetkazib berish uchun tayyor buyurtmalar bor.', link: '/courier/available', read: false, createdAt: daysAgo(0, 1) },
  { id: 'n7', userId: 'u-admin', type: 'system', title: 'Tasdiqlash kutilmoqda', body: "2 ta kompaniya verifikatsiyani kutmoqda.", link: '/admin/companies', read: false, createdAt: daysAgo(2) },
];

const defaultSchedule: ScheduleDay[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  day: d as ScheduleDay['day'],
  active: d < 6,
  from: '09:00',
  to: d === 5 ? '15:00' : '19:00',
}));

export const seedData = {
  users,
  companies,
  categories,
  products,
  reviews,
  orders,
  rfqs,
  notifications,
  conversations,
  messages,
  favorites: { 'u-buyer': ['p2', 'p15', 'p27', 'p42'] } as Record<string, string[]>,
  schedules: { 'u-courier': defaultSchedule, 'u-courier2': defaultSchedule } as Record<string, ScheduleDay[]>,
  counters: { order: orderCounter, rfq: 305 },
};
