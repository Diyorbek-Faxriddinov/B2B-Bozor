import { useCallback, useMemo } from 'react';
import { useSettings } from '@/stores/settings';
import type { Locale, LocalizedText } from '@/types';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatRelative, formatTime } from '@/lib/utils';
import { uz } from './uz';
import { ru } from './ru';
import { en } from './en';

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
export type Dictionary = DeepString<typeof uz>;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Leaves<typeof uz>;
export type TVars = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = { uz, ru, en };

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'en', label: 'English', short: 'EN' },
];

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in cur) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(locale: Locale, key: TKey | string, vars?: TVars) {
  const raw = lookup(dictionaries[locale], key) ?? lookup(uz, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

/** Returns `t(key, vars)` bound to the current locale. */
export function useT() {
  const locale = useSettings((s) => s.locale);
  return useCallback((key: TKey, vars?: TVars) => translate(locale, key, vars), [locale]);
}

/** Like useT but accepts runtime-built keys (e.g. `order.status.${status}`). */
export function useTd() {
  const locale = useSettings((s) => s.locale);
  return useCallback((key: string, vars?: TVars) => translate(locale, key, vars), [locale]);
}

export function useLocale() {
  return useSettings((s) => s.locale);
}

/** Locale + currency aware formatters. */
export function useFormat() {
  const locale = useSettings((s) => s.locale);
  const currency = useSettings((s) => s.currency);
  return useMemo(
    () => ({
      locale,
      currency,
      money: (uzs: number, opts?: { compact?: boolean }) => formatMoney(uzs, currency, locale, opts),
      uzs: (uzs: number) => formatMoney(uzs, 'UZS', locale),
      number: (n: number, frac = 0) => formatNumber(n, locale, frac),
      date: (iso: string, opts?: Intl.DateTimeFormatOptions) => formatDate(iso, locale, opts),
      dateTime: (iso: string) => formatDateTime(iso, locale),
      time: (iso: string) => formatTime(iso, locale),
      relative: (iso: string) => formatRelative(iso, locale),
      text: (t: LocalizedText) => t[locale] ?? t.uz,
    }),
    [locale, currency],
  );
}
