import { randomBytes } from 'node:crypto';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Page window from query params — same clamping rules as the mock server. */
export function pageParams(query: Record<string, unknown>, defaultSize = 12) {
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaultSize));
  const page = Math.max(1, Number(query.page) || 1);
  return { page, pageSize };
}

/** Builds a page from a total count; `page` is clamped to the last page. */
export function pageMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(totalPages, page);
  return { page: p, pageSize, total, totalPages, skip: (p - 1) * pageSize };
}

export function paginateArray<T>(items: T[], query: Record<string, unknown>, defaultSize = 12): Paginated<T> {
  const { page, pageSize } = pageParams(query, defaultSize);
  const m = pageMeta(items.length, page, pageSize);
  return { items: items.slice(m.skip, m.skip + pageSize), total: m.total, page: m.page, pageSize, totalPages: m.totalPages };
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`ʻʼ']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Every word of `q` occurs in `text` (case/apostrophe-insensitive). */
export function matches(text: string, q: string) {
  const n = normalize(text);
  return normalize(q)
    .split(' ')
    .every((w) => n.includes(w));
}

/** Words for SQL LIKE search (normalised, deduplicated). */
export function searchWords(q: string) {
  return [...new Set(normalize(q).split(' ').filter(Boolean))].slice(0, 8);
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

export function within(at: Date | string, fromDaysAgo: number, toDaysAgo = 0) {
  const t = new Date(at).getTime();
  return t >= Date.now() - fromDaysAgo * 86400000 && t < Date.now() - toDaysAgo * 86400000;
}

export function pctChange(cur: number, prev: number) {
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export interface SeriesPoint {
  date: string;
  value: number;
  count: number;
}

/** One point per day for the last `days` days (local midnight buckets, like the mock). */
export function daySeries(days: number, entries: { at: Date | string; value: number }[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    out.push({ date: d.toISOString().slice(0, 10), value: 0, count: 0 });
  }
  const index = new Map(out.map((p, i) => [p.date, i]));
  for (const e of entries) {
    const d = new Date(e.at);
    d.setHours(0, 0, 0, 0);
    const i = index.get(d.toISOString().slice(0, 10));
    if (i !== undefined) {
      out[i].value += e.value;
      out[i].count += 1;
    }
  }
  return out;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’`ʻʼ']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** JSON column → typed value (Prisma returns `JsonValue`). */
export const json = <T>(v: unknown, fallback: T): T => (v === null || v === undefined ? fallback : (v as T));
