import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Currency, Locale } from '@/types';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
  locale: Locale;
  currency: Currency;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  setCurrency: (currency: Currency) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'uz',
      currency: 'UZS',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setCurrency: (currency) => set({ currency }),
    }),
    { name: 'b2b-settings' },
  ),
);

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveDark(theme: Theme) {
  return theme === 'dark' || (theme === 'system' && !!media?.matches);
}

/** Keeps <html class="dark"> and lang in sync with settings. Call once at startup. */
export function bindSettingsToDocument() {
  const apply = () => {
    const { theme, locale } = useSettings.getState();
    document.documentElement.classList.toggle('dark', resolveDark(theme));
    document.documentElement.lang = locale;
  };
  apply();
  useSettings.subscribe(apply);
  media?.addEventListener('change', apply);
}
