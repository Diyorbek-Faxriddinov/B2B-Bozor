import type { Locale } from '@/types';

export interface FaqGroup {
  id: string;
  title: string;
  items: { q: string; a: string }[];
}

export const FAQ: Record<Locale, FaqGroup[]> = {
  uz: [
    {
      id: 'buying',
      title: 'Xarid qilish',
      items: [
        { q: 'Platformada kimlar xarid qilishi mumkin?', a: "Do'konlar, kafe va restoranlar, qurilish kompaniyalari, ishlab chiqaruvchilar va boshqa har qanday tadbirkorlik subyektlari. Jismoniy shaxslar ham ro'yxatdan o'tishi mumkin, lekin narxlar ulgurji hajmlar uchun belgilangan." },
        { q: 'MOQ nima?', a: "MOQ (minimal buyurtma miqdori) — sotuvchi bitta buyurtmada sotadigan eng kam miqdor. U har bir mahsulot sahifasida ko'rsatilgan va savatda avtomatik tekshiriladi." },
        { q: "Ulgurji narx pog'onalari qanday ishlaydi?", a: "Ko'proq miqdor olsangiz, birlik narxi pasayadi. Mahsulot sahifasida pog'onalar jadvali bor — miqdorni o'zgartirganingizda narx avtomatik qayta hisoblanadi." },
        { q: 'Bir nechta sotuvchidan bir vaqtda xarid qilsam nima bo‘ladi?', a: 'Savat yetkazib beruvchilar bo‘yicha guruhlanadi va har bir sotuvchi uchun alohida buyurtma yaratiladi. Har birini alohida kuzatishingiz mumkin.' },
      ],
    },
    {
      id: 'rfq',
      title: "Narx so'rovi (RFQ)",
      items: [
        { q: "Narx so'rovi nima uchun kerak?", a: "Katta hajm, maxsus shartlar yoki katalogda yo'q mahsulot uchun sotuvchidan individual narx olish imkonini beradi." },
        { q: "Qanday qilib narx so'rovi yuboraman?", a: "Mahsulot yoki kompaniya sahifasida «Narx so'rash» tugmasini bosing, miqdor va izohni yozing. Javob Kabinet → Narx so'rovlari bo'limida paydo bo'ladi." },
        { q: 'Taklifni qabul qilsam, keyin nima bo‘ladi?', a: 'Sotuvchiga xabar boradi va siz u bilan chat orqali buyurtma tafsilotlarini kelishasiz.' },
      ],
    },
    {
      id: 'delivery',
      title: 'Yetkazib berish',
      items: [
        { q: 'Yetkazib berish narxi qancha?', a: "Kuryer orqali: 30 000 so'm + 3 km dan keyin har bir km uchun 2 500 so'm. Bitta sotuvchidan 5 000 000 so'mdan ortiq buyurtmalar bepul yetkaziladi." },
        { q: 'O‘zim olib ketsam bo‘ladimi?', a: "Ha. Rasmiylashtirishda «Olib ketish»ni tanlang — sotuvchining Toshkentdagi ombori manzili ko'rsatiladi. Bu bepul." },
        { q: 'Buyurtmani qanday kuzataman?', a: "Kabinet → Buyurtmalar bo'limida har bir buyurtmaning holati, kuryer ma'lumotlari va xaritadagi marshrut ko'rinadi. Har bir o'zgarish haqida bildirishnoma olasiz." },
      ],
    },
    {
      id: 'payment',
      title: "To'lov",
      items: [
        { q: "Qanday to'lov usullari bor?", a: "Bank kartasi (Payme, Click, Uzcard, Humo), bank o'tkazmasi (yuridik shaxslar uchun hisob-faktura asosida) va yetkazib berilganda naqd pul." },
        { q: 'Hisob-faktura olsam bo‘ladimi?', a: "Ha, har bir buyurtma sahifasida «Hisob-faktura» tugmasi orqali chop etish mumkin. Elektron hisob-faktura (Didox, Soliq) integratsiyasi tez orada qo'shiladi." },
        { q: 'Buyurtma bekor qilinsa pul qaytariladimi?', a: "Ha. Karta orqali to'langan buyurtmalar bekor qilinganda mablag' 1–3 ish kunida kartaga qaytariladi." },
      ],
    },
    {
      id: 'sellers',
      title: 'Sotuvchilar uchun',
      items: [
        { q: "Qanday qilib sotuvchi bo'laman?", a: "Ro'yxatdan o'tishda «Sotuvchi» rolini tanlang, kompaniya nomi va STIR raqamini kiriting. Verifikatsiyadan so'ng mahsulotlaringiz darhol katalogda ko'rinadi." },
        { q: 'Platforma komissiyasi qancha?', a: "Hozirgi kunda ro'yxatdan o'tish va mahsulot joylashtirish bepul. Muvaffaqiyatli savdolardan komissiya tarif rejasiga bog'liq — batafsil ma'lumot uchun biz bilan bog'laning." },
        { q: 'Buyurtmalarni qanday boshqaraman?', a: "Sotuvchi panelida yangi buyurtmalarni tasdiqlash, jo'natishga tayyorlash, narx so'rovlariga javob berish va savdo statistikasini ko'rish mumkin." },
      ],
    },
    {
      id: 'returns',
      title: 'Qaytarish va kafolat',
      items: [
        { q: 'Mahsulotni qaytarsam bo‘ladimi?', a: "Nuqsonli yoki tavsifga mos kelmaydigan mahsulotni qabul qilgandan so'ng 14 kun ichida qaytarish mumkin. Buyurtma sahifasidan sotuvchiga yozing." },
        { q: 'Nizoli vaziyatda kim yordam beradi?', a: "Qo'llab-quvvatlash xizmatimiz tomonlar o'rtasida vositachilik qiladi. Aloqa sahifasi orqali murojaat qiling." },
      ],
    },
  ],
  ru: [
    {
      id: 'buying',
      title: 'Покупки',
      items: [
        { q: 'Кто может покупать на платформе?', a: 'Магазины, кафе и рестораны, строительные компании, производители и любые субъекты предпринимательства. Физлица тоже могут зарегистрироваться, но цены рассчитаны на оптовые объёмы.' },
        { q: 'Что такое MOQ?', a: 'MOQ (минимальный объём заказа) — наименьшее количество, которое продавец отпускает в одном заказе. Он указан на странице товара и автоматически проверяется в корзине.' },
        { q: 'Как работают оптовые ступени цен?', a: 'Чем больше объём, тем ниже цена за единицу. Таблица ступеней есть на странице товара — цена пересчитывается автоматически при изменении количества.' },
        { q: 'Что если я покупаю у нескольких продавцов?', a: 'Корзина группируется по поставщикам, и для каждого создаётся отдельный заказ, который можно отслеживать отдельно.' },
      ],
    },
    {
      id: 'rfq',
      title: 'Запрос цены (RFQ)',
      items: [
        { q: 'Зачем нужен запрос цены?', a: 'Чтобы получить индивидуальную цену на крупный объём, особые условия или товар, которого нет в каталоге.' },
        { q: 'Как отправить запрос?', a: 'Нажмите «Запросить цену» на странице товара или компании, укажите количество и комментарий. Ответ появится в разделе Кабинет → Запросы цен.' },
        { q: 'Что происходит после принятия предложения?', a: 'Продавец получает уведомление, и вы согласовываете детали заказа в чате.' },
      ],
    },
    {
      id: 'delivery',
      title: 'Доставка',
      items: [
        { q: 'Сколько стоит доставка?', a: 'Курьером: 30 000 сум + 2 500 сум за каждый км после 3 км. Заказы от 5 000 000 сум у одного продавца доставляются бесплатно.' },
        { q: 'Можно ли забрать самому?', a: 'Да. Выберите «Самовывоз» при оформлении — будет указан адрес склада продавца в Ташкенте. Это бесплатно.' },
        { q: 'Как отследить заказ?', a: 'В разделе Кабинет → Заказы видны статус, данные курьера и маршрут на карте. О каждом изменении вы получите уведомление.' },
      ],
    },
    {
      id: 'payment',
      title: 'Оплата',
      items: [
        { q: 'Какие способы оплаты доступны?', a: 'Банковская карта (Payme, Click, Uzcard, Humo), банковский перевод (по счёту для юрлиц) и наличные при получении.' },
        { q: 'Можно получить счёт-фактуру?', a: 'Да, на странице каждого заказа есть кнопка «Счёт-фактура» для печати. Интеграция с ЭСФ (Didox, Soliq) появится скоро.' },
        { q: 'Вернут ли деньги при отмене?', a: 'Да. При отмене заказа, оплаченного картой, средства возвращаются за 1–3 рабочих дня.' },
      ],
    },
    {
      id: 'sellers',
      title: 'Продавцам',
      items: [
        { q: 'Как стать продавцом?', a: 'При регистрации выберите роль «Продавец», укажите название компании и ИНН. После верификации товары сразу появляются в каталоге.' },
        { q: 'Какая комиссия платформы?', a: 'Сейчас регистрация и размещение товаров бесплатны. Комиссия с успешных продаж зависит от тарифа — свяжитесь с нами для деталей.' },
        { q: 'Как управлять заказами?', a: 'В панели продавца можно подтверждать заказы, готовить их к отправке, отвечать на запросы цен и смотреть аналитику продаж.' },
      ],
    },
    {
      id: 'returns',
      title: 'Возврат и гарантия',
      items: [
        { q: 'Можно ли вернуть товар?', a: 'Бракованный или не соответствующий описанию товар можно вернуть в течение 14 дней. Напишите продавцу со страницы заказа.' },
        { q: 'Кто поможет в спорной ситуации?', a: 'Наша служба поддержки выступает посредником между сторонами. Обратитесь через страницу контактов.' },
      ],
    },
  ],
  en: [
    {
      id: 'buying',
      title: 'Buying',
      items: [
        { q: 'Who can buy on the platform?', a: 'Shops, cafés and restaurants, construction firms, manufacturers and any registered business. Individuals can sign up too, but prices are set for wholesale volumes.' },
        { q: 'What is MOQ?', a: 'MOQ (minimum order quantity) is the smallest quantity a seller ships per order. It is shown on every product page and checked automatically in the cart.' },
        { q: 'How do volume price tiers work?', a: 'The more you buy, the lower the unit price. Each product page has a tier table — the price recalculates as you change the quantity.' },
        { q: 'What if I buy from several sellers at once?', a: 'Your cart is grouped by supplier and a separate order is created for each one, tracked independently.' },
      ],
    },
    {
      id: 'rfq',
      title: 'Requests for quotation (RFQ)',
      items: [
        { q: 'Why use a quote request?', a: 'To get an individual price for large volumes, special terms, or items not listed in the catalog.' },
        { q: 'How do I send one?', a: 'Click "Request a quote" on a product or company page and enter the quantity and a note. Replies appear under Account → Quotes.' },
        { q: 'What happens after I accept an offer?', a: 'The seller is notified and you finalise the order details in chat.' },
      ],
    },
    {
      id: 'delivery',
      title: 'Delivery',
      items: [
        { q: 'How much does delivery cost?', a: 'Courier: 30,000 UZS + 2,500 UZS per km beyond 3 km. Orders above 5,000,000 UZS from a single seller ship free.' },
        { q: 'Can I pick up myself?', a: "Yes. Choose \"Pickup\" at checkout — you'll see the seller's Tashkent warehouse address. It's free." },
        { q: 'How do I track an order?', a: 'Account → Orders shows the status, courier details and the route on a map. You get a notification for every change.' },
      ],
    },
    {
      id: 'payment',
      title: 'Payment',
      items: [
        { q: 'Which payment methods are available?', a: 'Bank card (Payme, Click, Uzcard, Humo), bank transfer (invoice for companies) and cash on delivery.' },
        { q: 'Can I get an invoice?', a: 'Yes, every order page has a printable "Invoice" button. E-invoicing integration (Didox, Soliq) is coming soon.' },
        { q: 'Do I get a refund if an order is cancelled?', a: 'Yes. Card payments for cancelled orders are refunded within 1–3 business days.' },
      ],
    },
    {
      id: 'sellers',
      title: 'For sellers',
      items: [
        { q: 'How do I become a seller?', a: 'Choose the "Seller" role at sign-up and enter your company name and TIN. Once verified, your products go live immediately.' },
        { q: "What is the platform's commission?", a: 'Registration and listing are currently free. The commission on completed sales depends on your plan — contact us for details.' },
        { q: 'How do I manage orders?', a: 'The seller dashboard lets you confirm orders, prepare them for dispatch, answer quote requests and view sales analytics.' },
      ],
    },
    {
      id: 'returns',
      title: 'Returns & warranty',
      items: [
        { q: 'Can I return a product?', a: 'Defective or not-as-described goods can be returned within 14 days of receipt. Message the seller from the order page.' },
        { q: 'Who helps in a dispute?', a: 'Our support team mediates between the parties. Reach out via the contact page.' },
      ],
    },
  ],
};
