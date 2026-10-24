import type {
  AiChat,
  AppNotification,
  Category,
  Company,
  Conversation,
  ID,
  Message,
  Order,
  Product,
  Review,
  Rfq,
  RouteGeometry,
  ScheduleDay,
  User,
} from '@/types';
import { createSeed } from './seed';

/**
 * In-browser mock database persisted to localStorage.
 * Mirrors the tables the real backend will have.
 */
export type DbUser = User & { passwordHash: string };
export type DbConversation = Omit<Conversation, 'participants' | 'unread'> & { unreadBy: Record<ID, number> };

export interface DB {
  version: number;
  users: DbUser[];
  companies: Company[];
  categories: Omit<Category, 'productsCount'>[];
  products: Product[];
  reviews: Review[];
  orders: Order[];
  rfqs: Rfq[];
  notifications: AppNotification[];
  conversations: DbConversation[];
  messages: Message[];
  favorites: Record<ID, ID[]>;
  schedules: Record<ID, ScheduleDay[]>;
  aiChats: AiChat[];
  sessions: Record<string, ID>;
  contactMessages: { id: ID; name: string; email: string; subject: string; message: string; createdAt: string }[];
  counters: { order: number; rfq: number };
  /** Cached road geometry per order (pickup → destination). */
  routes: Record<ID, RouteGeometry>;
  /** Card payment attempts (mock: paid instantly). */
  payments?: Record<ID, { id: ID; userId: ID; provider: 'payme' | 'click'; orderIds: ID[]; amount: number; status: 'paid' | 'cancelled'; createdAt: string }>;
}

const KEY = 'b2b-mock-db';
const VERSION = 6;

let cache: DB | null = null;

export function db(): DB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* corrupted — reseed */
  }
  cache = createSeed(VERSION);
  persist();
  return cache;
}

export function persist() {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Quota exceeded (large images). Keep working in memory.
    console.warn('[mock-db] localStorage quota exceeded; changes kept in memory only');
  }
}

export function resetDb() {
  cache = createSeed(VERSION);
  persist();
}

export function uid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** NOT secure — demo-only hashing. The real backend uses argon2/bcrypt. */
export function mockHash(password: string) {
  let h = 2166136261;
  const s = `b2b::${password}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a$${(h >>> 0).toString(16)}`;
}
