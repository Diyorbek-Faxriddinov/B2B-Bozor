/** Copy of the domain contract (frontend/src/types/index.ts) used to type the demo data. */
/**
 * Domain types — the contract shared by the UI, the mock server and the future backend.
 * All money values are integers in UZS (so'm). Dates are ISO-8601 strings.
 */

export type ID = string;
export type Locale = 'uz' | 'ru' | 'en';
export type Currency = 'UZS' | 'USD' | 'RUB';
export type LocalizedText = Record<Locale, string>;

export type Role = 'buyer' | 'seller' | 'courier' | 'admin';
export type UserStatus = 'active' | 'blocked';
export type TransportType = 'car' | 'motorcycle' | 'bicycle' | 'truck';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Address extends GeoPoint {
  label?: string;
  /** Human-readable street address (from reverse geocoding, editable). */
  text: string;
  apartment?: string; // kvartira / ofis
  entrance?: string; // podyezd
  floor?: string;
  landmark?: string; // mo'ljal
  contactName?: string;
  contactPhone?: string;
}

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  /** 'osrm' = real road routing, 'estimate' = straight-line fallback. */
  source: 'osrm' | 'estimate';
}

export interface RouteGeometry extends RouteInfo {
  /** [lat, lng] pairs, simplified. */
  geometry: [number, number][];
}

export interface CourierLocation extends GeoPoint {
  at: string;
  accuracy?: number; // metres
  heading?: number; // degrees
  speed?: number; // m/s
}

export interface OrderTracking {
  orderId: ID;
  status: OrderStatus;
  courier?: CourierLocation & { source: 'gps' | 'simulated' };
  route?: RouteGeometry;
  remainingKm?: number;
  etaMin?: number;
  progress?: number; // 0..1
}

export interface User {
  id: ID;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  avatar?: string;
  status: UserStatus;
  createdAt: string;
  /** Seller: the company they own. */
  companyId?: ID;
  /** Buyer: optional organisation they purchase for. */
  organization?: string;
  courier?: {
    transport: TransportType;
    region: string;
    rating: number;
    deliveriesCount: number;
    location?: CourierLocation;
  };
  addresses: Address[];
  notificationPrefs: {
    email: boolean;
    sms: boolean;
    orders: boolean;
    marketing: boolean;
  };
}

export interface Company {
  id: ID;
  ownerId: ID;
  name: string;
  slug: string;
  tin: string; // STIR
  logo?: string;
  description: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  foundedYear: number;
  employees: string;
  verified: boolean;
  rating: number;
  reviewsCount: number;
  productsCount: number;
  ordersCount: number;
  responseRate: number; // %
  responseTimeHours: number;
  mainCategories: string[]; // category slugs
  pickupPoint: Address;
  createdAt: string;
}

export interface Category {
  id: ID;
  slug: string;
  name: LocalizedText;
  color: string;
  productsCount: number;
}

export type ProductUnit = 'piece' | 'kg' | 'ton' | 'liter' | 'meter' | 'm2' | 'box' | 'pack' | 'bag' | 'set';
export type ProductStatus = 'active' | 'inactive' | 'pending' | 'rejected';

export interface PriceTier {
  minQty: number;
  price: number; // unit price in UZS at this quantity
}

export interface ProductSpec {
  key: string;
  value: string;
}

export interface Product {
  id: ID;
  companyId: ID;
  categorySlug: string;
  name: string;
  description: string;
  images: string[];
  price: number; // base unit price (UZS)
  unit: ProductUnit;
  moq: number; // minimum order quantity
  stock: number;
  discount: number; // %
  tiers: PriceTier[];
  specs: ProductSpec[];
  tags: string[];
  rating: number;
  reviewsCount: number;
  soldCount: number;
  views: number;
  deliveryDays: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWithCompany extends Product {
  company: Pick<Company, 'id' | 'name' | 'slug' | 'logo' | 'verified' | 'rating' | 'region' | 'responseRate' | 'responseTimeHours'>;
}

export interface Review {
  id: ID;
  productId: ID;
  userId: ID;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface CartItem {
  productId: ID;
  quantity: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'ready' | 'in_transit' | 'delivered' | 'cancelled';
export type PaymentMethod = 'card' | 'cash' | 'transfer';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type DeliveryType = 'courier' | 'pickup';

export interface OrderItem {
  productId: ID;
  name: string;
  image?: string;
  categorySlug: string;
  unit: ProductUnit;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface OrderEvent {
  status: OrderStatus;
  at: string;
  by?: string;
  note?: string;
}

export interface Order {
  id: ID;
  number: string;
  buyerId: ID;
  buyerName: string;
  buyerPhone: string;
  buyerOrganization?: string;
  companyId: ID;
  companyName: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  delivery: {
    type: DeliveryType;
    address?: Address;
    pickupPoint: Address;
    distanceKm?: number;
    durationMin?: number;
    routeSource?: RouteInfo['source'];
  };
  courierId?: ID;
  courierLocation?: CourierLocation;
  courierName?: string;
  courierPhone?: string;
  courierFee?: number;
  note?: string;
  cancelReason?: string;
  timeline: OrderEvent[];
  rated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RfqStatus = 'open' | 'answered' | 'accepted' | 'rejected' | 'closed';

export interface Rfq {
  id: ID;
  number: string;
  buyerId: ID;
  buyerName: string;
  buyerOrganization?: string;
  companyId: ID;
  companyName: string;
  productId?: ID;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  targetPrice?: number;
  deadline?: string;
  message: string;
  status: RfqStatus;
  response?: {
    unitPrice: number;
    message: string;
    validUntil: string;
    at: string;
  };
  createdAt: string;
}

export type NotificationType = 'order' | 'rfq' | 'message' | 'system' | 'review';

export interface AppNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface Conversation {
  id: ID;
  participantIds: [ID, ID];
  participants: { id: ID; name: string; avatar?: string; role: Role; companyName?: string }[];
  productId?: ID;
  productName?: string;
  lastMessage?: { text: string; senderId: ID; at: string };
  unread: number;
  updatedAt: string;
}

export interface Message {
  id: ID;
  conversationId: ID;
  senderId: ID;
  text: string;
  createdAt: string;
}

export interface ScheduleDay {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday
  active: boolean;
  from: string; // "09:00"
  to: string;
}

export interface AiMessage {
  id: ID;
  role: 'user' | 'assistant';
  content: string;
  productIds?: ID[];
  suggestions?: string[];
  createdAt: string;
}

export interface AiChat {
  id: ID;
  userId: ID;
  title: string;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SeriesPoint {
  date: string; // yyyy-mm-dd
  value: number;
  count?: number;
}

export interface SellerDashboard {
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  avgOrder: number;
  activeProducts: number;
  lowStock: number;
  openRfqs: number;
  rating: number;
  revenueSeries: SeriesPoint[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  topProducts: { id: ID; name: string; categorySlug: string; sold: number; revenue: number }[];
  recentOrders: Order[];
}

export interface CourierDashboard {
  earnings: number;
  earningsToday: number;
  delivered: number;
  active: number;
  available: number;
  rating: number;
  avgDistanceKm: number;
  earningsSeries: SeriesPoint[];
}

export interface AdminDashboard {
  users: number;
  usersByRole: Record<Role, number>;
  companies: number;
  pendingCompanies: number;
  products: number;
  pendingProducts: number;
  orders: number;
  gmv: number;
  gmvSeries: SeriesPoint[];
  categoryShare: { slug: string; revenue: number }[];
}

export interface PublicStats {
  products: number;
  companies: number;
  buyers: number;
  orders: number;
  regions: number;
  ordersToday: number;
  avgResponseHours: number;
}

/** Anonymised recent deal for the public activity feed. */
export interface ActivityItem {
  id: ID;
  companyName: string;
  productName: string;
  categorySlug: string;
  quantity: number;
  unit: ProductUnit;
  area: string;
  at: string;
}

/* ---------- Request payloads ---------- */

export interface ProductQuery {
  q?: string;
  category?: string;
  company?: ID;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  discount?: boolean;
  inStock?: boolean;
  verified?: boolean;
  region?: string;
  sort?: 'popular' | 'newest' | 'price_asc' | 'price_desc' | 'rating';
  page?: number;
  pageSize?: number;
}

export interface RegisterPayload {
  role: Exclude<Role, 'admin'>;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  organization?: string;
  company?: { name: string; tin: string; region: string };
  courier?: { transport: TransportType; region: string };
}

export interface CheckoutPayload {
  items: CartItem[];
  deliveryType: DeliveryType;
  address?: Address;
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface ProductInput {
  name: string;
  categorySlug: string;
  description: string;
  images: string[];
  price: number;
  unit: ProductUnit;
  moq: number;
  stock: number;
  discount: number;
  tiers: PriceTier[];
  specs: ProductSpec[];
  tags: string[];
  deliveryDays: number;
  status: 'active' | 'inactive';
}
