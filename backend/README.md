# B2B Bozor API

NestJS 11 · Prisma 6 · MySQL 8 · Socket.IO. Shartnoma: [../docs/API.md](../docs/API.md) · Swagger: `http://localhost:4000/api/docs`

## O'rnatish (lokal)

```bash
npm install
```

1. `backend/.env` ni oching (`.env.example` dan nusxa olingan, `JWT_SECRET` allaqachon yaratilgan) va to'ldiring:
   - `MYSQL_ROOT_PASSWORD` — faqat bir marta, keyingi qadam uchun;
   - ixtiyoriy: `ANTHROPIC_API_KEY`, `SMTP_*`, `ESKIZ_*`, `PAYME_*`, `CLICK_*` (pastga qarang).
2. Baza va alohida foydalanuvchi:
   ```bash
   npm run db:setup
   ```
   `b2b_bozor`, `b2b_bozor_test`, `b2b_bozor_shadow` bazalarini va faqat shu bazalarga huquqi bor `b2b_app` foydalanuvchisini (tasodifiy parol bilan) yaratadi, `DATABASE_URL`/`TEST_DATABASE_URL`/`SHADOW_DATABASE_URL` ni `.env` ga yozadi va **root parolini `.env` dan o'chiradi**.
3. Jadval va demo ma'lumotlar:
   ```bash
   npm run db:deploy   # migratsiyalarni qo'llash
   npm run db:seed     # demo ma'lumot (barcha hisoblar paroli: demo1234)
   ```
4. Ishga tushirish:
   ```bash
   npm run build
   npm start          # yoki: npm run dev (watch)
   ```
   `GET /api/v1/health` qaysi integratsiya real, qaysi biri zaxira rejimda ishlayotganini ko'rsatadi.
5. Frontendni ulash — `frontend/.env`:
   ```env
   VITE_API_URL=http://localhost:4000/api/v1
   VITE_USE_MOCK=false
   ```

## Skriptlar

| Buyruq | Vazifa |
|---|---|
| `npm run dev` | watch rejimida server |
| `npm run build` / `npm start` | production build / ishga tushirish |
| `npm run typecheck` | `src`, `prisma`, `test` tip tekshiruvi |
| `npm run db:migrate` | sxema o'zgarganda yangi migratsiya (`prisma migrate dev`) |
| `npm run db:deploy` | migratsiyalarni qo'llash |
| `npm run db:seed` | demo ma'lumotlarni qayta yuklash (bazani tozalaydi!) |
| `npm run test:e2e` | e2e testlar — `TEST_DATABASE_URL` bazasida, har suite oldidan qayta seed |

## Integratsiyalar va zaxira rejimlar

Kalit bo'sh bo'lsa ilova to'xtamaydi — mos zaxira rejim ishlaydi:

| Servis | `.env` | Kalitsiz |
|---|---|---|
| AI yordamchi (Claude) | `ANTHROPIC_API_KEY`, `AI_MODEL` (standart `claude-opus-5-5`) | qoidaga asoslangan javoblar (API xato bersa ham shunga o'tadi) |
| Email | `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` | konsolga yoziladi. `MAIL_SKIP_DOMAINS` (`demo.uz,…`) ga hech qachon yuborilmaydi |
| SMS (Eskiz) | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | konsolga yoziladi; dev rejimda tasdiq kodi javobda (`devCode`) qaytadi |
| Payme | `PAYME_MERCHANT_ID`, `PAYME_TEST_KEY` / `PAYME_KEY`, `PAYME_TEST_MODE` | lokal simulyator |
| Click | `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_MERCHANT_USER_ID`, `CLICK_SECRET_KEY` | lokal simulyator |
| Yo'l marshruti | `OSRM_URL` (`off` — faqat to'g'ri chiziq taxmini) | — |

**AI:** model Claude Opus 5.5, `effort: medium`, server tomonidagi refusal-fallback (`fallbacks: "default"`) yoqilgan. Tool'lar faqat o'qiydi va so'ragan foydalanuvchi doirasida ishlaydi (katalog qidiruv, mahsulot, narx hisoblash, mening buyurtmalarim, mahsulot kartalari, tavsiya savollar).

**SMS:** Eskiz faqat kabinetda tasdiqlangan shablonlarga mos matnlarni yetkazadi. Yuborilayotgan matnlar: `B2B Bozor: tasdiqlash kodi {code}…`, `B2B Bozor: {number} buyurtmangiz {holat}.`, `B2B Bozor: {number} buyurtmangizga kuryer biriktirildi…`. SMS faqat **tasdiqlangan** telefonlarga ketadi (profilda SMS kod bilan).

### Payme sozlash (business.payme.uz)

- Endpoint URL: `https://<domen>/api/v1/payments/payme`
- Hisob (account) maydoni: **`payment_id`**
- Test: `PAYME_TEST_MODE=true`, `PAYME_TEST_KEY=<test kalit>` → checkout `checkout.test.paycom.uz`. Production: `PAYME_TEST_MODE=false`, `PAYME_KEY`.
- Payme sizning serveringizga internet orqali murojaat qiladi, ya'ni lokal kompyuter uchun tunnel (masalan, ngrok) va `APP_URL` ni shu manzilga qo'yish kerak bo'ladi.
- Eslatma: fiskal chek (`detail`, MXIK kodlari) hozircha yuborilmaydi.

### Click sozlash (merchant.click.uz)

- Prepare URL: `https://<domen>/api/v1/payments/click/prepare`
- Complete URL: `https://<domen>/api/v1/payments/click/complete`
- `merchant_trans_id` = to'lov id, `merchant_prepare_id`/`merchant_confirm_id` = to'lovning raqamli `seq` maydoni.

### Simulyator

Merchant kalitlari bo'lmasa (va `NODE_ENV≠production`), `POST /payments` qaytargan `url` → `/api/v1/payments/simulator/:id`. "To'lash" tugmasi Payme (`CheckPerformTransaction → CreateTransaction → PerformTransaction`) yoki Click (`prepare → complete`) so'rovlarini kalit/imzo bilan backendning o'ziga yuboradi — ya'ni haqiqiy protokol kodi ishlaydi, faqat pul yechilmaydi.

## Xavfsizlik

- Parollar argon2 bilan; JWT ichida sessiya id — chiqish, parolni tiklash yoki bloklash tokenni darhol bekor qiladi.
- Xatolar frontend formatida: `{ error: { code, message, fields? } }`, maydon kodlari frontendda tarjima qilinadi.
- Rate limit (umumiy + kirish/ro'yxat/SMS/AI uchun qattiqroq), helmet, CORS faqat `CORS_ORIGINS`.
- Yuklangan rasmlar WebP ga qayta kodlanadi (EXIF/GPS o'chadi), faqat rasm turlari, `MAX_UPLOAD_MB`.
- Narx, chegirma, yetkazish narxi va zaxira faqat serverda hisoblanadi; zaxira atomik band qilinadi.
- MySQL'da ilova `root` emas, faqat o'z bazalariga huquqi bor `b2b_app` bilan ishlaydi.
