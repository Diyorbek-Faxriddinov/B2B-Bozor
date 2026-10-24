/** Typed REST client — one function per backend endpoint. */
import { http, USE_MOCK } from './client';
import { compressImage } from '@/lib/utils';
import type {
  ActivityItem,
  AdminDashboard,
  AiChat,
  AiMessage,
  AppNotification,
  Category,
  CheckoutPayload,
  Company,
  CourierLocation,
  Conversation,
  CourierDashboard,
  ID,
  Message,
  Order,
  OrderStatus,
  OrderTracking,
  Paginated,
  Product,
  ProductInput,
  ProductQuery,
  ProductWithCompany,
  PublicStats,
  RegisterPayload,
  Review,
  Rfq,
  ScheduleDay,
  SellerDashboard,
  User,
} from '@/types';

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Suggestions {
  products: { id: ID; name: string; categorySlug: string; price: number; unit: Product['unit'] }[];
  categories: { slug: string; name: string }[];
  companies: { id: ID; name: string; verified: boolean }[];
}

export type ReviewsPage = Paginated<Review> & { distribution: { star: number; count: number }[] };
export type AiChatSummary = Omit<AiChat, 'messages'> & { messagesCount: number };
export type ListQuery = { page?: number; pageSize?: number; q?: string; status?: string; [k: string]: string | number | boolean | undefined };

export const authApi = {
  login: (email: string, password: string) => http.post<AuthResponse>('/auth/login', { email, password }),
  register: (payload: RegisterPayload) => http.post<AuthResponse>('/auth/register', payload),
  logout: () => http.post<{ ok: true }>('/auth/logout'),
  me: () => http.get<User>('/auth/me'),
  forgotPassword: (email: string) => http.post<{ ok: true }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => http.post<{ ok: true }>('/auth/reset-password', { token, password }),
  sendPhoneCode: () => http.post<{ ok: true; channel?: string; devCode?: string; alreadyVerified?: boolean }>('/users/me/phone/send-code'),
  verifyPhone: (code: string) => http.post<User>('/users/me/phone/verify', { code }),
  updateMe: (patch: Partial<User>) => http.patch<User>('/users/me', patch),
  changePassword: (currentPassword: string, newPassword: string) => http.post<{ ok: true }>('/users/me/password', { currentPassword, newPassword }),
};

export async function uploadImage(file: File): Promise<string> {
  if (USE_MOCK) {
    const dataUrl = await compressImage(file, 900, 0.78);
    return (await http.post<{ url: string }>('/uploads', { dataUrl })).url;
  }
  const form = new FormData();
  form.append('file', file);
  return (await http.post<{ url: string }>('/uploads', form)).url;
}

export const catalogApi = {
  categories: () => http.get<Category[]>('/categories'),
  stats: () => http.get<PublicStats>('/stats/public'),
  activity: () => http.get<ActivityItem[]>('/stats/activity'),
  products: (q: ProductQuery) => http.get<Paginated<ProductWithCompany>>('/products', q as Record<string, string | number | boolean | undefined>),
  productsByIds: (ids: ID[]) => http.post<ProductWithCompany[]>('/products/batch', { ids }),
  suggest: (q: string) => http.get<Suggestions>('/products/suggest', { q }),
  product: (id: ID) => http.get<ProductWithCompany>(`/products/${id}`),
  similar: (id: ID) => http.get<ProductWithCompany[]>(`/products/${id}/similar`),
  reviews: (id: ID, page = 1) => http.get<ReviewsPage>(`/products/${id}/reviews`, { page }),
  canReview: (id: ID) => http.get<{ canReview: boolean; reason?: string }>(`/products/${id}/can-review`),
  addReview: (id: ID, rating: number, comment: string) => http.post<{ ok: true }>(`/products/${id}/reviews`, { rating, comment }),
  companies: (q: ListQuery) => http.get<Paginated<Company>>('/companies', q),
  company: (id: ID) => http.get<Company>(`/companies/${id}`),
};

export const favoritesApi = {
  list: () => http.get<ProductWithCompany[]>('/favorites'),
  ids: () => http.get<ID[]>('/favorites/ids'),
  toggle: (productId: ID) => http.post<{ favorited: boolean; ids: ID[] }>(`/favorites/${productId}`),
};

export const ordersApi = {
  checkout: (payload: CheckoutPayload) => http.post<Order[]>('/orders/checkout', payload),
  list: (q: ListQuery) => http.get<Paginated<Order>>('/orders', q),
  get: (id: ID) => http.get<Order>(`/orders/${id}`),
  cancel: (id: ID, reason?: string) => http.post<Order>(`/orders/${id}/cancel`, { reason }),
  setStatus: (id: ID, status: OrderStatus, note?: string) => http.post<Order>(`/orders/${id}/status`, { status, note }),
  markPaid: (id: ID) => http.post<Order>(`/orders/${id}/mark-paid`),
  assign: (id: ID) => http.post<Order>(`/orders/${id}/assign`),
  tracking: (id: ID) => http.get<OrderTracking>(`/orders/${id}/tracking`),
};

export type PaymentProvider = 'payme' | 'click';
export interface PaymentInfo {
  id: ID;
  provider: PaymentProvider;
  amount: number;
  status: 'created' | 'pending' | 'paid' | 'cancelled' | 'failed';
  orders: Order[];
}

export const paymentsApi = {
  /** Starts a card payment; redirect the browser to `url` (Payme / Click checkout or the local simulator). */
  create: (orderIds: ID[], provider: PaymentProvider) => http.post<{ id: ID; url: string; amount: number }>('/payments', { orderIds, provider }),
  get: (id: ID) => http.get<PaymentInfo>(`/payments/${id}`),
};

/** Sends the browser to the payment page (absolute URL) or navigates in-app (mock mode). */
export function goToPayment(url: string, navigate: (to: string) => void) {
  if (/^https?:\/\//.test(url)) window.location.assign(url);
  else navigate(url);
}

export const rfqApi = {
  create: (payload: Partial<Rfq> & { companyId: ID; quantity: number; message: string }) => http.post<Rfq>('/rfqs', payload),
  list: (q: ListQuery) => http.get<Paginated<Rfq>>('/rfqs', q),
  respond: (id: ID, payload: { unitPrice: number; message: string; validUntil: string }) => http.post<Rfq>(`/rfqs/${id}/respond`, payload),
  decide: (id: ID, decision: 'accept' | 'reject' | 'close') => http.post<Rfq>(`/rfqs/${id}/${decision}`),
};

export const courierApi = {
  dashboard: () => http.get<CourierDashboard>('/courier/dashboard'),
  available: () => http.get<Order[]>('/courier/available'),
  schedule: () => http.get<ScheduleDay[]>('/courier/schedule'),
  saveSchedule: (days: ScheduleDay[]) => http.put<ScheduleDay[]>('/courier/schedule', { days }),
  sendLocation: (loc: Omit<CourierLocation, 'at'>) => http.post<{ ok: true; activeOrders: number }>('/courier/location', loc),
};

export const sellerApi = {
  dashboard: (range: number) => http.get<SellerDashboard>('/seller/dashboard', { range }),
  products: (q: ListQuery) => http.get<Paginated<Product>>('/seller/products', q),
  product: (id: ID) => http.get<Product>(`/seller/products/${id}`),
  createProduct: (input: ProductInput) => http.post<Product>('/seller/products', input),
  updateProduct: (id: ID, patch: Partial<ProductInput>) => http.patch<Product>(`/seller/products/${id}`, patch),
  deleteProduct: (id: ID) => http.delete<{ ok: true }>(`/seller/products/${id}`),
  company: () => http.get<Company>('/seller/company'),
  updateCompany: (patch: Partial<Company>) => http.patch<Company>('/seller/company', patch),
};

export const notificationsApi = {
  list: () => http.get<{ items: AppNotification[]; unread: number }>('/notifications'),
  read: (id: ID) => http.post<{ ok: true }>(`/notifications/${id}/read`),
  readAll: () => http.post<{ ok: true }>('/notifications/read-all'),
};

export const messagesApi = {
  conversations: () => http.get<Conversation[]>('/conversations'),
  unread: () => http.get<{ count: number }>('/conversations/unread'),
  start: (payload: { recipientId?: ID; companyId?: ID; productId?: ID; text?: string }) => http.post<Conversation>('/conversations', payload),
  messages: (id: ID) => http.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}/messages`),
  send: (id: ID, text: string) => http.post<Message>(`/conversations/${id}/messages`, { text }),
};

export const aiApi = {
  chats: () => http.get<AiChatSummary[]>('/ai/chats'),
  create: () => http.post<AiChat>('/ai/chats', {}),
  get: (id: ID) => http.get<AiChat>(`/ai/chats/${id}`),
  rename: (id: ID, title: string) => http.patch<AiChat>(`/ai/chats/${id}`, { title }),
  remove: (id: ID) => http.delete<{ ok: true }>(`/ai/chats/${id}`),
  send: (id: ID, content: string) => http.post<{ userMessage: AiMessage; assistantMessage: AiMessage; chat: AiChat }>(`/ai/chats/${id}/messages`, { content }),
};

export const adminApi = {
  dashboard: () => http.get<AdminDashboard>('/admin/dashboard'),
  users: (q: ListQuery) => http.get<Paginated<User>>('/admin/users', q),
  updateUser: (id: ID, patch: Partial<User>) => http.patch<User>(`/admin/users/${id}`, patch),
  companies: (q: ListQuery) => http.get<Paginated<Company>>('/admin/companies', q),
  updateCompany: (id: ID, patch: Partial<Company>) => http.patch<Company>(`/admin/companies/${id}`, patch),
  products: (q: ListQuery) => http.get<Paginated<ProductWithCompany>>('/admin/products', q),
  updateProduct: (id: ID, patch: { status: Product['status']; reason?: string }) => http.patch<ProductWithCompany>(`/admin/products/${id}`, patch),
};

export const miscApi = {
  contact: (payload: { name: string; email: string; subject?: string; message: string }) => http.post<{ ok: true }>('/contact', payload),
  newsletter: (email: string) => http.post<{ ok: true }>('/newsletter', { email }),
  resetDemo: () => http.post<{ ok: true }>('/dev/reset'),
};
