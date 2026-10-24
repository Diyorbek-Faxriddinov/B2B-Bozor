import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Currency, Locale } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indicative exchange rates (UZS per 1 unit). The backend will serve live CBU rates. */
export const EXCHANGE_RATES: Record<Currency, number> = {
  UZS: 1,
  USD: 12_750,
  RUB: 158,
};

const INTL_LOCALE: Record<Locale, string> = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' };
const UZS_SUFFIX: Record<Locale, string> = { uz: "so'm", ru: 'сум', en: 'UZS' };

export function intlLocale(locale: Locale) {
  return INTL_LOCALE[locale];
}

export function formatNumber(value: number, locale: Locale = 'uz', maxFraction = 0) {
  const s = new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFraction }).format(value);
  return locale === 'en' ? s : s.replace(/,/g, ' ').replace('.', ',');
}

export function formatMoney(uzs: number, currency: Currency = 'UZS', locale: Locale = 'uz', opts: { compact?: boolean } = {}) {
  const value = uzs / EXCHANGE_RATES[currency];
  if (opts.compact) {
    const compact = new Intl.NumberFormat(INTL_LOCALE[locale], { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    if (currency === 'UZS') return `${compact} ${UZS_SUFFIX[locale]}`;
    return currency === 'USD' ? `$${compact}` : `${compact} ₽`;
  }
  if (currency === 'UZS') return `${formatNumber(Math.round(value), locale)} ${UZS_SUFFIX[locale]}`;
  if (currency === 'USD') return `$${formatNumber(value, locale, 2)}`;
  return `${formatNumber(value, locale, 0)} ₽`;
}

export function formatDate(
  iso: string,
  locale: Locale = 'uz',
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], opts).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: Locale = 'uz') {
  return formatDate(iso, locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso: string, locale: Locale = 'uz') {
  return formatDate(iso, locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(iso: string, locale: Locale = 'uz') {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso, locale);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Resize + re-encode an image file to a JPEG data URL (used for uploads). */
export function compressImage(file: File, maxSize = 1000, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unsupported'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
