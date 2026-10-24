import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { ChevronDown, LifeBuoy, MessageCircle, Search } from 'lucide-react';
import { FAQ } from '@/content/faq';
import { useLocale, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { SUPPORT } from '@/lib/constants';
import { Breadcrumbs, Card, EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { AnimatePresence, motion } from 'motion/react';

export default function HelpPage() {
  const t = useT();
  const locale = useLocale();
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FAQ[locale]
      .map((g) => ({ ...g, items: needle ? g.items.filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(needle)) : g.items }))
      .filter((g) => g.items.length);
  }, [locale, q]);

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [hash]);

  return (
    <div>
      <section className="border-b border-border bg-surface">
        <div className="container-page py-10 text-center">
          <Breadcrumbs className="justify-center" items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.help') }]} />
          <span className="mx-auto mt-5 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg">
            <LifeBuoy className="size-7" />
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t('help.title')}</h1>
          <p className="mt-2 text-fg-muted">{t('help.subtitle')}</p>
          <div className="mx-auto mt-6 max-w-xl">
            <Input inputSize="lg" leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('help.search')} />
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {FAQ[locale].map((g) => (
              <a key={g.id} href={`#${g.id}`} className="rounded-full border border-border px-3 py-1 text-sm text-fg-muted hover:border-primary hover:text-primary">
                {g.title}
              </a>
            ))}
          </div>
        </div>
      </section>
      <div className="container-page grid max-w-5xl gap-8 py-10 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {!groups.length && <EmptyState icon={<Search />} title={t('help.noResults')} />}
          {groups.map((g) => (
            <section key={g.id} id={g.id} className="scroll-mt-40">
              <h2 className="mb-3 text-lg font-semibold">{g.title}</h2>
              <Card className="divide-y divide-border overflow-hidden">
                {g.items.map((it) => {
                  const key = `${g.id}:${it.q}`;
                  const isOpen = open === key || !!q;
                  return (
                    <div key={key}>
                      <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium hover:bg-surface-2/50" onClick={() => setOpen(isOpen && !q ? null : key)} aria-expanded={isOpen}>
                        {it.q}
                        <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform', isOpen && 'rotate-180')} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.21, 0.8, 0.27, 1] }}
                            className="overflow-hidden"
                          >
                            <p className="px-5 pb-4 text-sm leading-relaxed text-fg-muted">{it.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
        <aside className="lg:sticky lg:top-40 lg:self-start">
          <Card className="p-5">
            <MessageCircle className="size-8 text-primary" />
            <h3 className="mt-3 font-semibold">{t('help.stillNeed')}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t('help.stillNeedText')}</p>
            <ButtonLink to="/contact" className="mt-4 w-full">
              {t('nav.contact')}
            </ButtonLink>
            <a href={SUPPORT.phoneHref} className="mt-3 block text-center text-sm font-semibold text-fg hover:text-primary">
              {SUPPORT.phone}
            </a>
          </Card>
        </aside>
      </div>
    </div>
  );
}
