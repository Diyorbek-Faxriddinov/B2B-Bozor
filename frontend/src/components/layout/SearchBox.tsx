import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Clock, Loader2, Search, X } from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { CategoryIcon } from '../catalog';
import { cn } from '@/lib/utils';
import { useFormat, useT } from '@/i18n';

const HISTORY_KEY = 'b2b-search-history';

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const t = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>(readHistory);
  const ref = useRef<HTMLDivElement>(null);
  const q = useDebounced(value.trim(), 250);

  const { data, isFetching } = useQuery({
    queryKey: ['suggest', q],
    queryFn: () => catalogApi.suggest(q),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    setValue(params.get('q') ?? '');
  }, [params]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    onDone?.();
    navigate(path);
  };

  const submit = (term = value.trim()) => {
    if (term) {
      const next = [term, ...history.filter((h) => h !== term)].slice(0, 6);
      setHistory(next);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    }
    go(term ? `/catalog?q=${encodeURIComponent(term)}` : '/catalog');
  };

  const hasResults = !!data && (data.products.length > 0 || data.categories.length > 0 || data.companies.length > 0);
  const showHistory = open && q.length < 2 && history.length > 0;

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex h-11 items-center rounded-xl border-2 border-primary bg-surface pr-1 pl-3 transition-shadow focus-within:ring-4 focus-within:ring-primary/15"
      >
        <Search className="size-4.5 shrink-0 text-fg-subtle" />
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={t('header.searchPlaceholder')}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          aria-label={t('header.searchPlaceholder')}
        />
        {isFetching && <Loader2 className="mr-2 size-4 animate-spin text-fg-subtle" />}
        {value && (
          <button type="button" onClick={() => setValue('')} className="mr-1 rounded-md p-1 text-fg-subtle hover:text-fg" aria-label={t('common.clear')}>
            <X className="size-4" />
          </button>
        )}
        <button type="submit" className="h-8 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
          {t('header.search')}
        </button>
      </form>

      {open && (hasResults || showHistory) && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 animate-slide-up overflow-hidden rounded-xl border border-border bg-surface shadow-(--shadow-pop)">
          {showHistory && (
            <div className="p-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-fg-subtle uppercase">{t('header.recentSearches')}</span>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem(HISTORY_KEY);
                  }}
                >
                  {t('common.clear')}
                </button>
              </div>
              {history.map((h) => (
                <button key={h} onClick={() => submit(h)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                  <Clock className="size-4 text-fg-subtle" />
                  {h}
                </button>
              ))}
            </div>
          )}
          {hasResults && q.length >= 2 && (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {data!.categories.map((c) => (
                <button key={c.slug} onClick={() => go(`/catalog?category=${c.slug}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                  <CategoryIcon slug={c.slug} className="size-4 text-fg-subtle" />
                  <span>{c.name}</span>
                  <span className="ml-auto text-xs text-fg-subtle">{t('header.category')}</span>
                </button>
              ))}
              {data!.products.map((p) => (
                <button key={p.id} onClick={() => go(`/products/${p.id}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                  <CategoryIcon slug={p.categorySlug} className="size-4 shrink-0 text-fg-subtle" />
                  <span className="line-clamp-1 flex-1">{p.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-fg">{f.money(p.price)}</span>
                </button>
              ))}
              {data!.companies.map((c) => (
                <button key={c.id} onClick={() => go(`/suppliers/${c.id}`)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                  <Building2 className="size-4 text-fg-subtle" />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-fg-subtle">{t('header.supplier')}</span>
                </button>
              ))}
              <button onClick={() => submit()} className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-primary hover:bg-primary-soft">
                {t('header.allResults', { q })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
