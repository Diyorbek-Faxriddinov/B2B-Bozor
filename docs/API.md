# B2B Bozor REST API v1 — shartnoma

Frontend (`frontend/src/api/endpoints.ts`) aynan shu endpointlarni chaqiradi. Amalga oshirish: **`backend/`** (NestJS + MySQL) va brauzer ichidagi mock — `frontend/src/api/mock/server.ts` (ikkalasi bir xil shartnomaga amal qiladi). Swagger: `http://localhost:4000/api/docs`.
Tiplar: `frontend/src/types/index.ts`.

## Umumiy qoidalar

- Bazaviy URL: `/api/v1`. JSON so'rov/javob. Pul — **butun son, UZS**. Sana — ISO-8601.
- Avtorizatsiya: `Authorization: Bearer <token>`. Til: `Accept-Language: uz|ru|en`.
- Sahifalash: `?page=1&pageSize=12` → `{ items, total, page, pageSize, totalPages }`.
- Xato formati:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "email": "EMAIL_TAKEN" } } }
  ```
  `code` va `fields` qiymatlari frontendda tarjima qilinadi (`i18n/*.ts` → `errors.*`, `validation.*`).
- Statuslar: 401 `UNAUTHORIZED` (frontend logout qiladi), 403 `FORBIDDEN` / `ACCOUNT_BLOCKED`, 404 `*_NOT_FOUND`, 409 biznes qoidasi (`INVALID_TRANSITION`, `BELOW_MOQ`, `OUT_OF_STOCK`, `ALREADY_ASSIGNED`, …), 422 `VALIDATION_ERROR`.

Rollar: `buyer`, `seller`, `courier`, `admin`.

## Auth va profil

| Metod | Yo'l | Rol | Izoh |
|---|---|---|---|
| POST | `/auth/register` | — | `RegisterPayload` → `{ token, user }`. Seller uchun kompaniya (verified=false) yaratiladi |
| POST | `/auth/login` | — | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | * | sessiyani bekor qiladi |
| POST | `/auth/forgot-password` | — | `{ email }` → doim `{ ok: true }`. Ro'yxatdan o'tgan bo'lsa emailga 30 daqiqalik havola: `FRONTEND_URL/reset-password?token=…` |
| POST | `/auth/reset-password` | — | `{ token, password }` → `{ ok: true }`; barcha sessiyalar bekor qilinadi. Yaroqsiz token → 400 `INVALID_TOKEN` |
| GET | `/auth/me` | * | `User` |
| PATCH | `/users/me` | * | `fullName, email, phone, organization, avatar, addresses[], notificationPrefs, courier` |
| POST | `/users/me/password` | * | `{ currentPassword, newPassword }` (boshqa qurilmalardagi sessiyalar yopiladi) |
| POST | `/users/me/phone/send-code` | * | 6 xonali SMS kod (Eskiz). SMS sozlanmagan va `NODE_ENV≠production` bo'lsa javobda `devCode` |
| POST | `/users/me/phone/verify` | * | `{ code }` → `User` (`phoneVerified: true`). SMS bildirishnomalar faqat tasdiqlangan raqamga |
| POST | `/uploads` | * | `multipart/form-data` (`file`) → `{ url }` |

## Katalog (ochiq)

| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/categories` | `Category[]` (`productsCount` bilan) |
| GET | `/stats/public` | `PublicStats` (`ordersToday`, `avgResponseHours` bilan) |
| GET | `/stats/activity` | `ActivityItem[]` — so'nggi 14 ta bitim, anonimlashtirilgan (kompaniya, mahsulot, miqdor, hudud, vaqt) — bosh sahifadagi jonli lenta uchun |
| GET | `/products` | `ProductQuery`: `q, category, company, minPrice, maxPrice, rating, discount, inStock, verified, region, sort(popular\|newest\|price_asc\|price_desc\|rating), page, pageSize` → `Paginated<ProductWithCompany>`. Faqat `active`. Narx filtri — MOQ dagi yakuniy birlik narxi |
| GET | `/products/suggest?q=` | `{ products[], categories[], companies[] }` |
| POST | `/products/batch` | `{ ids }` → `ProductWithCompany[]` (savat, sevimlilar, AI) |
| GET | `/products/:id` | `ProductWithCompany`; `views++`. Faol bo'lmasa faqat egasi/admin ko'radi |
| GET | `/products/:id/similar` | o'sha kategoriyadan 8 ta |
| GET | `/products/:id/reviews` | `Paginated<Review> & { distribution: {star,count}[] }` |
| GET | `/products/:id/can-review` | `{ canReview, reason? }` |
| POST | `/products/:id/reviews` | buyer, faqat `delivered` buyurtmasi bo'lsa. `{ rating 1–5, comment }`. Mahsulot va kompaniya reytingi qayta hisoblanadi |
| GET | `/companies` | `q, region, category, verified, page` → `Paginated<Company>` |
| GET | `/companies/:idOrSlug` | `Company` |

## Sevimlilar (buyer)

`GET /favorites` → mahsulotlar · `GET /favorites/ids` → `ID[]` · `POST /favorites/:productId` → toggle `{ favorited, ids }`

## Buyurtmalar

| Metod | Yo'l | Rol | Izoh |
|---|---|---|---|
| POST | `/orders/checkout` | buyer | `CheckoutPayload` → `Order[]`. Savat **sotuvchi bo'yicha bo'linadi**. Tekshiruv: faol, `qty ≥ moq`, `qty ≤ stock`, manzil O'zbekistonda (`OUTSIDE_SERVICE_AREA`). Narx serverda `unitPriceFor` (pog'ona + chegirma). Yetkazish: har bir ombor → manzil uchun **OSRM yo'l masofasi**; `> 60 km` bo'lsa 409 `DELIVERY_OUT_OF_RANGE`; `deliveryFee(subtotal, roadKm)`. `delivery.distanceKm/durationMin/routeSource` saqlanadi. Stock kamayadi. Karta → `unpaid`, keyin `POST /payments` |
| GET | `/orders` | * | rolga qarab: buyer — o'ziniki, seller — kompaniyaniki, courier — biriktirilgan, admin — hammasi. `status` (`active` = delivered/cancelled emas), `q`, `page` |
| GET | `/orders/:id` | * | ko'rish huquqi tekshiriladi |
| POST | `/orders/:id/cancel` | buyer (pending) / seller (pending, confirmed, ready) / admin | `{ reason? }`. Stock qaytadi, `paid` → `refunded` |
| POST | `/orders/:id/status` | seller / courier | seller: `pending→confirmed→ready`, pickup uchun `ready→delivered`. courier: `ready→in_transit→delivered`. `delivered` → `paid`. To'lanmagan karta buyurtmasini tasdiqlash → 409 `PAYMENT_PENDING` |
| POST | `/orders/:id/mark-paid` | seller | bank o'tkazmasi tushdi |
| GET | `/orders/:id/tracking` | * | `OrderTracking`: `route` (geometriya, km, daqiqa), `courier` (joylashuv + `source: gps\|simulated`), `remainingKm`, `etaMin`, `progress`. GPS 90 s dan eski bo'lsa mock simulyatsiya qiladi; real backend oxirgi GPS'ni qaytaradi |
| POST | `/orders/:id/assign` | courier | `ready` + courier yetkazish + kuryersiz. Bir vaqtda ≤5 faol. `courierFee = deliveryFee × 0.8` |

Holatlar: `pending → confirmed → ready → in_transit → delivered`, yoki `cancelled`. Har o'zgarish `timeline[]` ga yoziladi va tegishli tomonlarga bildirishnoma yuboriladi.

## To'lovlar (Payme / Click)

| Metod | Yo'l | Kim | Izoh |
|---|---|---|---|
| POST | `/payments` | buyer | `{ orderIds, provider: 'payme' \| 'click' }` → `{ id, url, amount }`. Brauzer `url` ga yo'naltiriladi (Payme/Click checkout yoki lokal simulyator). Bir to'lov bir nechta buyurtmani (har xil sotuvchi) qoplaydi |
| GET | `/payments/:id` | egasi | `{ id, provider, amount, status: created\|pending\|paid\|cancelled\|failed, orders }` — qaytish sahifasi `/checkout/success?payment=:id` shuni so'raydi |
| POST | `/payments/payme` | Payme | Merchant API (JSON-RPC 2.0, `Authorization: Basic Paycom:<KEY>`). Metodlar: `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement`. Hisob maydoni: **`payment_id`**. Summa tiyinda (`amount × 100`), tranzaksiya 12 soatda eskiradi |
| POST | `/payments/click/prepare` · `/payments/click/complete` | Click | SHOP API, `sign_string` = md5 tekshiruvi; `merchant_trans_id` = to'lov id |

Kalitlar bo'lmasa (`PAYME_MERCHANT_ID`, `CLICK_*` bo'sh) `url` lokal **simulyator** sahifasiga olib boradi: u Payme/Click serveri yuboradigan so'rovlarni backendning o'ziga aynan protokol bo'yicha yuboradi (production'da o'chadi). 30 daqiqa ichida to'lanmagan karta buyurtmalari avtomatik bekor qilinadi va zaxira qaytadi.

## Kuryer

`GET /courier/dashboard` · `GET /courier/available` · `GET /courier/schedule` · `PUT /courier/schedule { days: ScheduleDay[] }`

`POST /courier/location { lat, lng, accuracy?, heading?, speed? }` — kuryer ilovasi GPS ulashish yoqilganda har ~10 s (yoki sezilarli siljishda) yuboradi. `user.courier.location` va kuryerning barcha faol buyurtmalaridagi `courierLocation` yangilanadi.

## Sotuvchi

| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/seller/dashboard?range=7\|30\|90` | `SellerDashboard` (o'zgarish % oldingi teng davrga nisbatan) |
| GET | `/seller/products` | `q, status(active\|inactive\|pending\|rejected\|low_stock), category, page` |
| GET/POST/PATCH/DELETE | `/seller/products[/:id]` | `ProductInput`. Tekshiruv: pog'ona `minQty > moq` va o'suvchi, narx kamayuvchi. Kompaniya tasdiqlanmagan bo'lsa yangi mahsulot `pending` |
| GET/PATCH | `/seller/company` | profil, logo, `pickupPoint` |

## RFQ (narx so'rovi)

`POST /rfqs` (buyer) · `GET /rfqs` (rolga qarab) · `POST /rfqs/:id/respond { unitPrice, message, validUntil }` (seller) · `POST /rfqs/:id/accept|reject` (buyer, `answered` holatida) · `POST /rfqs/:id/close`

## Bildirishnomalar va xabarlar

`GET /notifications` → `{ items, unread }` · `POST /notifications/:id/read` · `POST /notifications/read-all`

`GET /conversations` · `GET /conversations/unread` → `{ count }` · `POST /conversations { recipientId? | companyId?, productId?, text? }` (mavjud suhbatni qaytaradi yoki yaratadi) · `GET /conversations/:id/messages` (o'qilgan deb belgilaydi) · `POST /conversations/:id/messages { text }`

> Real vaqt: Socket.IO, namespace `/realtime`, `io(API_ORIGIN + '/realtime', { auth: { token } })`. Hodisalar: `notification`, `message`, `order:updated` `{ id, number, status, paymentStatus }`, `order:location` `{ orderId, lat, lng, at, … }`. `order:subscribe { orderId }` — buyurtma xonasiga qo'shilish (ruxsat tekshiriladi). Frontend hodisada tegishli so'rovlarni yangilaydi, polling zaxira sifatida qoladi.

## AI yordamchi

`GET /ai/chats` · `POST /ai/chats` · `GET/PATCH/DELETE /ai/chats/:id` · `POST /ai/chats/:id/messages { content }` → `{ userMessage, assistantMessage, chat }`

`assistantMessage`: `{ content (markdown), productIds?, suggestions? }`. Backend: Claude (`AI_MODEL`, standart `claude-opus-5-5`) + tool'lar — `search_products`, `get_product`, `calculate_price`, `get_my_orders`, `show_products`, `suggest_replies`. `ANTHROPIC_API_KEY` bo'lmasa yoki API xato bersa — qoidaga asoslangan zaxira javob.

## Administrator

`GET /admin/dashboard` · `GET /admin/users?role&status&q` · `PATCH /admin/users/:id { status }` · `GET /admin/companies?verified&q` · `PATCH /admin/companies/:id { verified }` (tasdiqlanganda `pending` mahsulotlar `active` bo'ladi) · `GET /admin/products?status&q` · `PATCH /admin/products/:id { status, reason? }`

## Boshqa

`POST /contact { name, email, subject?, message }` · `POST /newsletter { email }` · `GET /health` → DB holati va integratsiyalar rejimi (`claude`/`rule-based`, `smtp`/`console`, `eskiz`/`console`, `live`/`test`/`simulator`)

## Manzil va geo

`Address`: `{ lat, lng, text, label?, apartment?, entrance?, floor?, landmark?, contactName?, contactPhone? }` — `users.addresses[]` (≤5) va `orders.delivery.address` da saqlanadi. Kuryer barcha maydonlarni ko'radi.

Frontend tashqi geo-servislarni to'g'ridan-to'g'ri chaqiradi (`frontend/src/lib/geo.ts`), URL'lar env orqali almashtiriladi:

| Vazifa | Servis | Eslatma |
|---|---|---|
| Yo'l marshruti, masofa, vaqt | OSRM (`/route/v1/driving`) | Demo server cheklangan — production'da o'z OSRM (O'zbekiston OSM extract) yoki backend proxy. Backend checkout'da ham shu servisni chaqiradi |
| Manzil avtoto'ldirish | Photon (komoot) | Faqat O'zbekiston bbox, `lang=default` |
| Koordinata → manzil | Nominatim `/reverse` | ≤1 so'rov/s, keshlanadi. Avtoto'ldirish uchun ishlatish **taqiqlangan** (usage policy) |
| Tashqi navigatsiya | Yandex Navigator / Yandex Maps / Google Maps deep link | |

Real vaqt: `order:location` Socket.IO hodisasi + 5 s polling (zaxira). GPS 90 s dan eski bo'lsa tracking pozitsiyani yo'l bo'ylab taxmin qiladi (`source: 'simulated'`).
