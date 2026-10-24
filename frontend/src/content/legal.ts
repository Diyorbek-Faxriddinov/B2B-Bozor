import type { Locale } from '@/types';

export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: { title: string; paragraphs?: string[]; bullets?: string[] }[];
}

export const TERMS: Record<Locale, LegalDoc> = {
  uz: {
    title: 'Foydalanish shartlari (Ommaviy oferta)',
    updated: '2026-10-01',
    intro: "Ushbu ommaviy oferta B2B Bozor platformasi (keyingi o'rinlarda — «Platforma») xizmatlaridan foydalanish shartlarini belgilaydi. Platformada ro'yxatdan o'tish orqali siz ushbu shartlarni to'liq qabul qilasiz.",
    sections: [
      { title: '1. Umumiy qoidalar', bullets: ["Platforma xaridorlar, sotuvchilar va kuryerlarni bog'lovchi elektron savdo maydonchasidir.", 'Foydalanuvchilar 18 yoshdan katta bo‘lishi va to‘g‘ri ma’lumotlarni taqdim etishi shart.', "Xizmatlar O'zbekiston Respublikasi qonunchiligiga, jumladan «Elektron tijorat to'g'risida»gi Qonunga muvofiq ko'rsatiladi."] },
      { title: '2. Hisob qaydnomasi', bullets: ['Har bir foydalanuvchi o‘z hisobi xavfsizligi va paroli maxfiyligi uchun javobgar.', "Sotuvchilar haqiqiy kompaniya nomi va STIR raqamini kiritishlari shart; Platforma verifikatsiya uchun qo'shimcha hujjatlar so'rashi mumkin.", 'Qoidalarni buzgan hisoblar ogohlantirishsiz bloklanishi mumkin.'] },
      { title: '3. Buyurtmalar va narxlar', bullets: ["Narxlar sotuvchilar tomonidan belgilanadi va QQS bilan ko'rsatiladi.", "Buyurtma sotuvchi tomonidan tasdiqlangandan so'ng shartnoma tuzilgan hisoblanadi.", "Narx so'rovi (RFQ) bo'yicha takliflar ko'rsatilgan amal qilish muddatigacha kuchda bo'ladi."] },
      { title: "4. To'lov va yetkazib berish", bullets: ["To'lovlar bank kartasi, bank o'tkazmasi yoki naqd pulda amalga oshiriladi.", "Yetkazib berish narxi masofa va buyurtma summasiga qarab hisoblanadi va rasmiylashtirishda ko'rsatiladi.", 'Yetkazib berish muddati sotuvchi va kuryer imkoniyatlariga bog‘liq.'] },
      { title: '5. Qaytarish', bullets: ["Nuqsonli yoki tavsifga mos kelmaydigan mahsulot 14 kun ichida qaytarilishi mumkin.", "Qaytarish so'rovi buyurtma sahifasi yoki qo'llab-quvvatlash xizmati orqali yuboriladi."] },
      { title: "6. Mas'uliyat", paragraphs: ["Platforma tomonlar o'rtasidagi vositachi bo'lib, mahsulot sifati uchun bevosita sotuvchi javobgardir. Platforma uchinchi tomon xizmatlari (to'lov tizimlari, internet provayderlar) nosozliklari uchun javobgar emas."] },
      { title: '7. Shartlarning o‘zgarishi', paragraphs: ["Platforma ushbu shartlarni o'zgartirish huquqini saqlab qoladi. O'zgarishlar haqida foydalanuvchilarga elektron pochta yoki bildirishnoma orqali xabar beriladi."] },
    ],
  },
  ru: {
    title: 'Условия использования (Публичная оферта)',
    updated: '2026-10-01',
    intro: 'Настоящая публичная оферта определяет условия использования платформы B2B Bozor (далее — «Платформа»). Регистрируясь, вы полностью принимаете эти условия.',
    sections: [
      { title: '1. Общие положения', bullets: ['Платформа — электронная торговая площадка, объединяющая покупателей, продавцов и курьеров.', 'Пользователи должны быть старше 18 лет и предоставлять достоверные данные.', 'Услуги оказываются в соответствии с законодательством Республики Узбекистан, включая Закон «Об электронной коммерции».'] },
      { title: '2. Учётная запись', bullets: ['Каждый пользователь отвечает за безопасность своей учётной записи и конфиденциальность пароля.', 'Продавцы обязаны указывать реальное название компании и ИНН; Платформа может запросить документы для верификации.', 'Учётные записи, нарушающие правила, могут быть заблокированы без предупреждения.'] },
      { title: '3. Заказы и цены', bullets: ['Цены устанавливаются продавцами и указываются с НДС.', 'Договор считается заключённым после подтверждения заказа продавцом.', 'Предложения по запросам цен (RFQ) действуют до указанного срока.'] },
      { title: '4. Оплата и доставка', bullets: ['Оплата производится картой, банковским переводом или наличными.', 'Стоимость доставки рассчитывается по расстоянию и сумме заказа и отображается при оформлении.', 'Сроки доставки зависят от продавца и курьера.'] },
      { title: '5. Возврат', bullets: ['Бракованный или не соответствующий описанию товар можно вернуть в течение 14 дней.', 'Запрос на возврат отправляется со страницы заказа или через поддержку.'] },
      { title: '6. Ответственность', paragraphs: ['Платформа является посредником между сторонами; за качество товара непосредственно отвечает продавец. Платформа не несёт ответственности за сбои сторонних сервисов (платёжные системы, интернет-провайдеры).'] },
      { title: '7. Изменение условий', paragraphs: ['Платформа вправе изменять настоящие условия. Пользователи уведомляются об изменениях по электронной почте или через уведомления.'] },
    ],
  },
  en: {
    title: 'Terms of Service (Public Offer)',
    updated: '2026-10-01',
    intro: 'This public offer sets out the terms for using the B2B Bozor platform (the "Platform"). By registering you accept these terms in full.',
    sections: [
      { title: '1. General', bullets: ['The Platform is an online marketplace connecting buyers, sellers and couriers.', 'Users must be over 18 and provide accurate information.', 'Services are provided under the laws of the Republic of Uzbekistan, including the Law "On E-Commerce".'] },
      { title: '2. Accounts', bullets: ['Each user is responsible for the security of their account and password.', 'Sellers must provide a real company name and TIN; the Platform may request documents for verification.', 'Accounts that break the rules may be blocked without notice.'] },
      { title: '3. Orders and prices', bullets: ['Prices are set by sellers and include VAT.', 'A contract is formed once the seller confirms the order.', 'Quotes (RFQ offers) are valid until the stated expiry date.'] },
      { title: '4. Payment and delivery', bullets: ['Payment is by card, bank transfer or cash.', 'Delivery cost depends on distance and order value and is shown at checkout.', 'Delivery times depend on the seller and courier.'] },
      { title: '5. Returns', bullets: ['Defective or not-as-described goods can be returned within 14 days.', 'Return requests are sent from the order page or via support.'] },
      { title: '6. Liability', paragraphs: ['The Platform acts as an intermediary; the seller is directly responsible for product quality. The Platform is not liable for failures of third-party services (payment providers, ISPs).'] },
      { title: '7. Changes', paragraphs: ['The Platform may update these terms. Users are notified by email or in-app notification.'] },
    ],
  },
};

export const PRIVACY: Record<Locale, LegalDoc> = {
  uz: {
    title: 'Maxfiylik siyosati',
    updated: '2026-10-01',
    intro: "Biz shaxsiy ma'lumotlaringizni «Shaxsga doir ma'lumotlar to'g'risida»gi Qonunga muvofiq himoya qilamiz va faqat xizmat ko'rsatish uchun ishlatamiz.",
    sections: [
      { title: "Qanday ma'lumotlarni yig'amiz", bullets: ['Ism, elektron pochta, telefon raqami', 'Kompaniya nomi, STIR, manzillar', "Buyurtmalar tarixi va to'lov holati (karta ma'lumotlari saqlanmaydi — to'lovlar Payme/Click orqali)", 'Joylashuv — faqat siz xaritadan manzil tanlaganingizda'] },
      { title: 'Nima uchun ishlatamiz', bullets: ['Buyurtmalarni qayta ishlash va yetkazib berish', 'Sotuvchi va kuryer bilan aloqa', 'Xizmat sifatini yaxshilash va firibgarlikning oldini olish'] },
      { title: 'Uchinchi tomonlar', paragraphs: ["Ma'lumotlar faqat buyurtmani bajarish uchun zarur bo'lgan hajmda sotuvchi, kuryer va to'lov tizimlariga, shuningdek qonun talab qilgan hollarda davlat organlariga uzatiladi."] },
      { title: 'Saqlash va himoya', paragraphs: ["Ma'lumotlar O'zbekiston hududidagi serverlarda saqlanadi va TLS shifrlash bilan himoyalanadi. Parollar qaytarib bo'lmaydigan xesh ko'rinishida saqlanadi."] },
      { title: 'Huquqlaringiz', bullets: ["Ma'lumotlaringizni ko'rish va tahrirlash (Kabinet → Profil)", "Hisobni o'chirishni so'rash", 'Marketing xabarlaridan voz kechish (Kabinet → Sozlamalar)'] },
    ],
  },
  ru: {
    title: 'Политика конфиденциальности',
    updated: '2026-10-01',
    intro: 'Мы защищаем ваши персональные данные в соответствии с Законом «О персональных данных» и используем их только для оказания услуг.',
    sections: [
      { title: 'Какие данные мы собираем', bullets: ['Имя, электронная почта, телефон', 'Название компании, ИНН, адреса', 'История заказов и статус оплаты (данные карт не хранятся — оплата через Payme/Click)', 'Геолокация — только когда вы выбираете адрес на карте'] },
      { title: 'Зачем мы их используем', bullets: ['Обработка и доставка заказов', 'Связь с продавцом и курьером', 'Улучшение сервиса и предотвращение мошенничества'] },
      { title: 'Третьи лица', paragraphs: ['Данные передаются продавцу, курьеру и платёжным системам только в объёме, необходимом для выполнения заказа, а также госорганам в случаях, предусмотренных законом.'] },
      { title: 'Хранение и защита', paragraphs: ['Данные хранятся на серверах в Узбекистане и защищены TLS-шифрованием. Пароли хранятся в виде необратимого хеша.'] },
      { title: 'Ваши права', bullets: ['Просматривать и изменять данные (Кабинет → Профиль)', 'Запросить удаление учётной записи', 'Отказаться от маркетинговых рассылок (Кабинет → Настройки)'] },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: '2026-10-01',
    intro: 'We protect your personal data in line with the Law "On Personal Data" and use it only to provide our services.',
    sections: [
      { title: 'What we collect', bullets: ['Name, email, phone number', 'Company name, TIN, addresses', 'Order history and payment status (card details are never stored — payments go through Payme/Click)', 'Location — only when you pick an address on the map'] },
      { title: 'Why we use it', bullets: ['Processing and delivering orders', 'Connecting you with sellers and couriers', 'Improving the service and preventing fraud'] },
      { title: 'Third parties', paragraphs: ['Data is shared with sellers, couriers and payment providers only as needed to fulfil an order, and with authorities where required by law.'] },
      { title: 'Storage and security', paragraphs: ['Data is stored on servers in Uzbekistan and protected with TLS. Passwords are stored as irreversible hashes.'] },
      { title: 'Your rights', bullets: ['View and edit your data (Account → Profile)', 'Request account deletion', 'Opt out of marketing (Account → Settings)'] },
    ],
  },
};
