# B2B Bozor

O'zbekiston uchun ulgurji savdo (B2B) platformasi: xaridorlar, sotuvchilar (ishlab chiqaruvchi/distribyutorlar), kuryerlar va administratorni bitta joyda bog'laydi.

```
B2B/
├── frontend/   ← React + TypeScript SPA
├── backend/    ← NestJS + Prisma + MySQL REST API (+ Socket.IO)
└── docs/       ← API shartnomasi
```

## Tez ishga tushirish

**1. Backend** (batafsil: [backend/README.md](backend/README.md))

```bash
cd backend
npm install
# backend/.env: MYSQL_ROOT_PASSWORD (bir martalik), ixtiyoriy ANTHROPIC_API_KEY, SMTP_*, ESKIZ_*, PAYME_*, CLICK_*
npm run db:setup     # b2b_bozor bazasi + alohida b2b_app foydalanuvchisi, DATABASE_URL avtomatik yoziladi
npm run db:deploy    # migratsiyalar
npm run db:seed      # demo ma'lumotlar
npm run build
npm start            # http://localhost:4000/api/v1 · Swagger: /api/docs
```

> Windows PowerShell 5.1 `&&` ni tushunmaydi — buyruqlarni alohida qatorda yozing. Asosiy `B2B` papkasidan ham ishlaydi: `npm run db:setup`, `npm run db:deploy`, `npm run db:seed`, `npm run api` (backend), `npm run web` (frontend).

**2. Frontend**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

`frontend/.env` da `VITE_USE_MOCK=false` bo'lsa real backendga, `true` bo'lsa brauzer ichidagi **mock server**ga (`src/api/mock`, `localStorage`) ulanadi — backendsiz ham to'liq ishlaydi.

### Demo hisoblar (parol: `demo1234`)

| Rol | Email |
|---|---|
| Xaridor | `buyer@demo.uz` |
| Sotuvchi | `seller@demo.uz` |
| Kuryer | `courier@demo.uz`, `courier2@demo.uz` |
| Administrator | `admin@demo.uz` |

Kirish sahifasida bir bosishda kirish tugmalari bor.

## Texnologiyalar

| Soha | Tanlov |
|---|---|
| UI | React 19, TypeScript (strict), Vite 8 |
| Stil | Tailwind CSS v4, dizayn tokenlari (`src/index.css`), light/dark/system |
| Routing | React Router 7 (lazy-loaded sahifalar, rol bo'yicha guardlar) |
| Server holati | TanStack Query 5 (kesh, optimistik yangilash, polling) |
| Mijoz holati | Zustand (auth, savat, sozlamalar — `persist`) |
| Formalar | react-hook-form + zod 4 |
| Animatsiya | Motion (`motion/react`): scroll-reveal, stagger, layout-indikatorlar, modal kirish/chiqish; CSS: marquee, aurora, border-beam, shimmer. `prefers-reduced-motion` hurmat qilinadi |
| Grafiklar | Recharts (dataviz palitrasi bo'yicha) |
| Xarita | Leaflet + react-leaflet, OpenStreetMap / Nominatim geokodlash |
| i18n | O'zbek / Rus / Ingliz, tip-xavfsiz kalitlar |
| Valyuta | UZS / USD / RUB ko'rinishi (to'lov doim UZS) |
| Backend | NestJS 11, Prisma 6, MySQL 8, JWT + DB sessiyalar, argon2, zod, Socket.IO, Swagger |
| Integratsiyalar | Claude API (AI yordamchi), Payme Merchant API, Click SHOP API, Eskiz SMS, SMTP (nodemailer), OSRM |
| Testlar | Jest + supertest e2e (Payme/Click protokol testlari bilan), Playwright brauzer oqimlari |

## Imkoniyatlar

**Xaridor**
- Katalog: qidiruv takliflari, kategoriya/narx/reyting/hudud filtrlari (URL bilan sinxron), grid/list ko'rinish
- Mahsulot: **ulgurji narx pog'onalari**, MOQ, zahira, "yana N dona qo'shsangiz arzonlashadi" maslahati, sharhlar (faqat tasdiqlangan xaridorlar), o'xshash mahsulotlar
- Savat: sotuvchilar bo'yicha guruhlash, MOQ/zahira tekshiruvi, ulgurji tejamkorlik
- Checkout: kuryer yoki olib ketish, **xaritadan manzil tanlash**, masofaga qarab yetkazish narxi, karta (**Payme / Click** — real merchant protokollari, kalitsiz lokal simulyator) / bank o'tkazmasi / naqd; savat sotuvchilar bo'yicha alohida buyurtmalarga bo'linadi, bitta to'lov bilan to'lanadi; 30 daqiqada to'lanmagan karta buyurtmasi avtomatik bekor bo'ladi
- Buyurtmalar: holat stepper, marshrut xaritasi, tarix, bekor qilish, qayta buyurtma, **hisob-faktura chop etish**
- **Narx so'rovi (RFQ)**: so'rov yuborish, takliflarni qabul/rad etish
- Sevimlilar, yaqinda ko'rilganlar, xabarlar (sotuvchi bilan chat), bildirishnomalar, AI yordamchi

**Sotuvchi paneli** — daromad grafigi (7/30/90 kun), holatlar, top mahsulotlar; mahsulot CRUD (rasmlar, narx pog'onalari, xususiyatlar, jonli ko'rinish, nusxa olish); buyurtmalarni tasdiqlash → tayyor → topshirish; RFQ'ga javob; kompaniya profili va ombor joylashuvi; CSV eksport.

**Kuryer paneli** — bo'sh buyurtmalar (daromad/masofa bo'yicha saralash), qabul qilish → yukni olish → yetkazish, daromad grafigi, haftalik ish jadvali.

**Administrator** — GMV va kategoriyalar statistikasi, foydalanuvchilarni bloklash, kompaniyalarni verifikatsiya qilish, mahsulot moderatsiyasi, barcha buyurtmalar.

**Xarita va yetkazish (real servislar)**
- Manzil tanlash: Photon avtoto'ldirish, xaritani bosish / pinni sudrash, GPS ("Mening joylashuvim", aniqlik doirasi), Nominatim orqali koordinatani manzilga aylantirish; faqat O'zbekiston hududi
- Manzil tafsilotlari: kvartira/ofis, podyezd, qavat, mo'ljal, qabul qiluvchi va telefon; saqlangan manzillarni tahrirlash
- OSRM orqali **haqiqiy yo'l marshruti**: xaritada chizilgan yo'l, km va taxminiy vaqt; yetkazish narxi yo'l masofasidan; kuryer radiusi 60 km
- Xaridor: "Yo'lda" buyurtmada kuryerni jonli kuzatish (5 s), yetib kelish vaqti, qolgan masofa
- Kuryer: GPS ulashish, o'z joylashuvidan marshrut, Yandex Navigator / Yandex Maps / Google Maps'da ochish, "menga eng yaqin" saralash, buyurtmalar xaritasi, manzildan uzoqda "yetkazildi" bosilsa ogohlantirish
- Xarita/sun'iy yo'ldosh qatlami, to'liq ekran, qorong'i rejim

**Dizayn** — bento-grid bo'limlar, aurora/grid fonlar, kursor ortidan yuruvchi yorug'lik (spotlight), almashinuvchi sarlavha, count-up statistika, kompaniyalar va jonli bitimlar lentasi (marquee), sahifalar orasida o'tish animatsiyasi, ixchamlashuvchi shishasimon header, mahsulot rasmida zoom, mobil "yopishqoq" xarid paneli, konfetti bilan muvaffaqiyat ekrani. Animatsiya primitivlari: `frontend/src/components/motion.tsx`

**Bildirishnomalar** — ilova ichida + Socket.IO orqali darhol; muhim hodisalar emailga (SMTP) va tasdiqlangan telefonga SMS (Eskiz). Parolni email orqali tiklash, telefonni SMS kod bilan tasdiqlash.

**Umumiy** — responsive (mobil pastki navigatsiya), qorong'i rejim, 3 til, yordam markazi (FAQ), aloqa formasi, oferta va maxfiylik siyosati, 404/xato sahifalari.

## Arxitektura

```
frontend/src/
├── api/
│   ├── client.ts      HTTP klient (fetch, Bearer token, xatolar → ApiError)
│   ├── endpoints.ts   har bir REST endpoint uchun tiplangan funksiya
│   ├── hooks.ts       TanStack Query: queryClient, query kalitlari, umumiy hooklar
│   └── mock/          brauzer ichidagi mock server (seed, routelar, AI)
├── app/router.tsx     marshrutlar, layoutlar, rol guardlari
├── components/        ui/ (dizayn tizimi), layout/, domen komponentlari
├── content/           FAQ va huquqiy matnlar (3 tilda)
├── i18n/              uz (asosiy), ru, en lug'atlari
├── lib/               pricing (ulgurji narx), formatlash, xatolar, hisob-faktura
├── pages/             sahifalar (account/, seller/, courier/, admin/, auth/, info/)
├── stores/            Zustand: auth, cart, settings
└── types/             domen tiplari — UI, mock va backend uchun umumiy shartnoma
```

```
backend/src/
├── main.ts / app.module.ts   HTTP sozlash (helmet, CORS, /api/v1, Swagger), modullar
├── config/env.ts             .env tekshiruvi (zod) — bo'sh kalit = zaxira rejim
├── auth/ users/              ro'yxat, kirish, sessiyalar, profil, parol tiklash, SMS tasdiq, yuklash
├── catalog/ seller/ admin/   katalog, sevimlilar, sotuvchi va admin panellari
├── orders/                   checkout, holatlar, kuryer, jonli kuzatish, to'lanmaganlarni bekor qilish
├── payments/                 Payme (JSON-RPC) va Click (prepare/complete) + simulyator
├── ai/                       Claude + tool'lar, qoidaga asoslangan zaxira
├── shared/                   bildirishnomalar, mail, SMS, Socket.IO gateway
└── common/                   xato formati, validatsiya, narxlash, geo, serializerlar
```

Frontend va backend bitta shartnomaga amal qiladi: [docs/API.md](docs/API.md). Geo-servislar URL'lari `.env` orqali sozlanadi (`VITE_OSRM_URL`, `VITE_PHOTON_URL`, `VITE_NOMINATIM_URL`).
