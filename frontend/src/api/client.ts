import { useAuth } from '@/stores/auth';
import { useSettings } from '@/stores/settings';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false' || !API_URL;

export type Query = Record<string, string | number | boolean | undefined | null>;

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

function buildQuery(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = useAuth.getState().token;
  const locale = useSettings.getState().locale;

  try {
    if (USE_MOCK) {
      const { handleMockRequest } = await import('./mock/server');
      return (await handleMockRequest(method, path, { query: opts.query, body: opts.body, token, locale })) as T;
    }

    const res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
      method,
      signal: opts.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': locale,
        ...(opts.body !== undefined && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body),
    });

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError(res.status, data?.error?.code ?? 'HTTP_ERROR', data?.error?.message ?? res.statusText, data?.error?.fields);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token) {
      useAuth.getState().logout();
    }
    if (err instanceof ApiError || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', (err as Error)?.message || 'Network error');
  }
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
