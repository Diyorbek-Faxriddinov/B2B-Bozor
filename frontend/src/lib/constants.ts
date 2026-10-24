import type { OrderStatus, ProductUnit, RfqStatus, TransportType } from '@/types';

export const REGIONS = [
  'Toshkent shahri',
  'Toshkent viloyati',
  'Andijon',
  'Buxoro',
  "Farg'ona",
  'Jizzax',
  'Xorazm',
  'Namangan',
  'Navoiy',
  'Qashqadaryo',
  "Qoraqalpog'iston",
  'Samarqand',
  'Sirdaryo',
  'Surxondaryo',
] as const;

export const UNITS: ProductUnit[] = ['piece', 'kg', 'ton', 'liter', 'meter', 'm2', 'box', 'pack', 'bag', 'set'];
export const TRANSPORTS: TransportType[] = ['car', 'truck', 'motorcycle', 'bicycle'];

export const ORDER_FLOW: OrderStatus[] = ['pending', 'confirmed', 'ready', 'in_transit', 'delivered'];

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: 'warning',
  confirmed: 'info',
  ready: 'accent',
  in_transit: 'primary',
  delivered: 'success',
  cancelled: 'danger',
};

export const RFQ_STATUS_TONE: Record<RfqStatus, Tone> = {
  open: 'warning',
  answered: 'info',
  accepted: 'success',
  rejected: 'danger',
  closed: 'neutral',
};

export const TASHKENT_CENTER = { lat: 41.2995, lng: 69.2401 };

export const DEMO_ACCOUNTS = [
  { role: 'buyer', email: 'buyer@demo.uz' },
  { role: 'seller', email: 'seller@demo.uz' },
  { role: 'courier', email: 'courier@demo.uz' },
  { role: 'admin', email: 'admin@demo.uz' },
] as const;
export const DEMO_PASSWORD = 'demo1234';

export const SUPPORT = {
  phone: '+998 71 200 00 00',
  phoneHref: 'tel:+998712000000',
  email: 'support@b2bbozor.uz',
  telegram: 'https://t.me/b2bbozor',
  address: "Toshkent sh., Chilonzor tumani, Bunyodkor ko'chasi, 45A",
  location: { lat: 41.2856, lng: 69.2044 },
};
