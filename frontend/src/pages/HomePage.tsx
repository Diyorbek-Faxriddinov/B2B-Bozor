import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  MessageSquareQuote,
  PackageCheck,
  PackagePlus,
  Percent,
  Quote,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { catalogApi } from '@/api/endpoints';
import { qk, useCategories, useProducts, useProductsByIds } from '@/api/hooks';
import { useRecentlyViewed } from '@/stores/cart';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ActivityItem, ProductQuery } from '@/types';
import { SearchBox } from '@/components/layout/SearchBox';
import { CATEGORY_COLORS, CategoryIcon, ProductCard, ProductCardSkeleton, VerifiedBadge } from '@/components/catalog';
import { Avatar, Badge, Rating, Skeleton, Tabs } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import { Aurora, BorderBeam, CountUp, GridBackdrop, Marquee, Reveal, RotatingWords, Spotlight, Stagger, StaggerItem } from '@/components/motion';

const EASE = [0.21, 0.8, 0.27, 1] as const;

function SectionHeading({ eyebrow, title, subtitle, action, center }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode; center?: boolean }) {
  return (
    <Reveal className={cn('mb-8 flex flex-wrap items-end justify-between gap-4', center && 'flex-col items-center text-center')}>
      <div className={cn(center && 'mx-auto max-w-2xl')}>
        {eyebrow && <div className="mb-2 text-xs font-bold tracking-[0.16em] text-primary uppercase">{eyebrow}</div>}
        <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-[2.1rem]">{title}</h2>
        {subtitle && <p className="mt-2 text-fg-muted sm:text-lg">{subtitle}</p>}
      </div>
      {action}
    </Reveal>
  );
}

function ViewAll({ to }: { to: string }) {
  const t = useT();
  return (
    <Link to={to} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary">
      {t('common.viewAll')} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

/* ======================================================================
   Hero
   ====================================================================== */
function LiveOrderToast({ items }: { items: ActivityItem[] }) {
  const f = useFormat();
  const td = useTd();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % items.length), 3200);
    return () => clearInterval(id);
  }, [items.length]);
  const it = items[i];
  if (!it) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={it.id}
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="card flex w-80 items-center gap-3 p-3.5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${CATEGORY_COLORS[it.categorySlug]} 15%, transparent)`, color: CATEGORY_COLORS[it.categorySlug] }}>
          <CategoryIcon slug={it.categorySlug} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{it.productName}</div>
          <div className="truncate text-xs text-fg-subtle">
            {f.number(it.quantity)} {td(`units.${it.unit}`)} · {it.area}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-fg-subtle">{f.relative(it.at)}</span>
      </motion.div>
    </AnimatePresence>
  );
}

function Hero() {
  const t = useT();
  const f = useFormat();
  const { data: stats } = useQuery({ queryKey: qk.stats, queryFn: catalogApi.stats });
  const { data: activity } = useQuery({ queryKey: qk.activity, queryFn: catalogApi.activity, refetchInterval: 60_000 });
  const words = t('home.hero.words').split('|');
  const popular = ['un', 'sement', 'guruch', 'noutbuk', 'paxta kalava', 'paket'];

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      <Aurora />
      <GridBackdrop />
      <div className="container-page relative grid grid-cols-1 items-center gap-12 py-14 lg:grid-cols-[1.15fr_1fr] lg:py-24">
        <motion.div className="min-w-0" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
          <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="mb-6 flex flex-wrap items-center gap-2">
            <Badge tone="primary" className="px-3 py-1 text-xs" icon={<Sparkles />}>
              {t('home.hero.badge')}
            </Badge>
            {!!stats?.ordersToday && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-fg-muted backdrop-blur">
                <span className="live-dot" /> {t('home.hero.live', { n: stats.ordersToday })}
              </span>
            )}
          </motion.div>
          <motion.h1
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
            className="text-[2.4rem] leading-[1.06] font-extrabold tracking-tight text-fg sm:text-[3.25rem] lg:text-[3.1rem] xl:text-[3.75rem]"
          >
            {t('home.hero.title1')}
            <br />
            <RotatingWords words={words} className="text-gradient" />
            <br />
            <span className="text-fg">{t('home.hero.titleEnd')}</span>
          </motion.h1>
          <motion.p variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }} className="mt-6 max-w-xl text-base text-fg-muted sm:text-lg">
            {t('home.hero.subtitle')}
          </motion.p>
          <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }} className="mt-8 max-w-xl">
            <div className="rounded-xl shadow-(--shadow-pop)">
              <SearchBox />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-fg-subtle">{t('home.hero.popular')}:</span>
              {popular.map((p, i) => (
                <motion.span key={p} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 + i * 0.05 }}>
                  <Link
                    to={`/catalog?q=${encodeURIComponent(p)}`}
                    className="inline-block rounded-full border border-border bg-surface/80 px-3 py-1 text-fg-muted backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary"
                  >
                    {p}
                  </Link>
                </motion.span>
              ))}
            </div>
          </motion.div>
          <motion.dl variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }} className="mt-10 grid max-w-lg grid-cols-3 gap-6">
            {[
              { label: t('home.stats.products'), to: stats?.products, suffix: '+' },
              { label: t('home.stats.suppliers'), to: stats?.companies, suffix: '+' },
              { label: t('home.stats.response'), to: stats?.avgResponseHours, suffix: t('home.stats.hoursSuffix'), frac: 1 },
            ].map((s) => (
              <div key={s.label} className="border-l-2 border-primary/30 pl-4">
                <dt className="text-xs text-fg-subtle sm:text-sm">{s.label}</dt>
                <dd className="mt-1 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                  {s.to !== undefined ? <CountUp to={s.to} format={(n) => `${f.number(n, s.frac ?? 0)}${s.suffix}`} /> : '—'}
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        {/* visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="relative mx-auto hidden h-[480px] w-full max-w-md lg:block"
          aria-hidden
        >
          <div className="absolute inset-x-8 top-8 bottom-16 rotate-3 rounded-[2rem] bg-gradient-to-br from-primary via-[#4338ca] to-[#7c3aed] shadow-(--shadow-pop)">
            <div className="bg-dots absolute inset-0 rounded-[2rem] opacity-20" />
          </div>
          <div className="card float-slow absolute top-0 left-0 w-72 -rotate-2 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#eb6834]/15 text-[#eb6834]">
                <CategoryIcon slug="food" className="size-5" />
              </span>
              <div>
                <div className="text-sm font-semibold">Bug'doy uni, oliy nav</div>
                <div className="text-xs text-fg-subtle">Toshkent Oziq-ovqat Savdo</div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              {[
                ['10+', f.money(385000), 100],
                ['50+', f.money(366000), 78],
                ['200+', f.money(347000), 56],
              ].map(([q, p, w], i) => (
                <div key={String(q)} className="relative overflow-hidden rounded-lg bg-surface-2 px-2.5 py-1.5">
                  <motion.span
                    className={cn('absolute inset-y-0 left-0', i === 2 ? 'bg-success-soft' : 'bg-primary-soft/60')}
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ duration: 1, delay: 0.8 + i * 0.15, ease: EASE }}
                  />
                  <span className={cn('relative flex justify-between', i === 2 && 'font-semibold text-success')}>
                    <span>{q}</span>
                    <span>{p}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card float-slower absolute top-44 right-0 w-64 rotate-1 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-muted">RFQ-301</span>
              <Badge tone="info" dot>
                {t('rfq.status.answered')}
              </Badge>
            </div>
            <div className="mt-2 text-sm font-semibold">{t('home.hero.cardOffer')}</div>
            <div className="mt-1 text-2xl font-extrabold text-primary">
              <CountUp to={362000} format={(n) => f.money(Math.round(n / 1000) * 1000)} duration={1.8} />
            </div>
            <div className="mt-1 text-xs text-fg-subtle">300 × qop · {t('home.hero.cardFreeDelivery')}</div>
          </div>
          <div className="absolute bottom-0 left-4">{activity?.length ? <LiveOrderToast items={activity} /> : null}</div>
        </motion.div>
      </div>
    </section>
  );
}

/* ======================================================================
   Trusted companies marquee
   ====================================================================== */
function TrustedBy() {
  const t = useT();
  const { data } = useQuery({ queryKey: qk.companies({ pageSize: 40 }), queryFn: () => catalogApi.companies({ pageSize: 40 }) });
  if (!data?.items.length) return null;
  return (
    <section className="border-b border-border bg-surface py-8">
      <p className="container-page mb-5 text-center text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">{t('home.trusted.title')}</p>
      <Marquee duration={45} gap="0.75rem">
        {data.items.map((c) => (
          <Link
            key={c.id}
            to={`/suppliers/${c.id}`}
            className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
          >
            <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${CATEGORY_COLORS[c.mainCategories[0]] ?? '#64748b'} 15%, transparent)`, color: CATEGORY_COLORS[c.mainCategories[0]] }}>
              <CategoryIcon slug={c.mainCategories[0] ?? 'food'} className="size-4" />
            </span>
            {c.name}
            {c.verified && <VerifiedBadge className="[&_svg]:size-3.5" />}
          </Link>
        ))}
      </Marquee>
    </section>
  );
}

/* ======================================================================
   Categories (bento)
   ====================================================================== */
function Categories() {
  const t = useT();
  const f = useFormat();
  const { data, isLoading } = useCategories();
  const sorted = useMemo(() => [...(data ?? [])].sort((a, b) => b.productsCount - a.productsCount), [data]);
  const featured = sorted.slice(0, 2);
  const rest = sorted.slice(2);

  return (
    <section className="container-page py-16">
      <SectionHeading eyebrow={t('home.categories.eyebrow')} title={t('home.categories.title')} subtitle={t('home.categories.subtitle')} action={<ViewAll to="/catalog" />} />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-6 lg:grid-cols-10" stagger={0.04}>
          {featured.map((c) => (
            <StaggerItem key={c.slug} className="col-span-2 sm:col-span-3 lg:col-span-5">
              <Spotlight as={Link} to={`/catalog?category=${c.slug}`} color={c.color} className="card group flex h-full min-h-44 items-end overflow-hidden p-6 transition-all hover:-translate-y-1 hover:shadow-(--shadow-pop)">
                <div className="absolute -top-10 -right-10 size-48 rounded-full opacity-15 transition-transform duration-700 group-hover:scale-125" style={{ background: c.color }} />
                <span className="absolute top-6 right-6" style={{ color: c.color }}>
                  <CategoryIcon slug={c.slug} className="size-16 opacity-90 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
                </span>
                <div className="relative" style={{ color: c.color }}>
                  <div className="text-xs font-bold tracking-wider uppercase opacity-80">{t('home.categories.top')}</div>
                  <div className="mt-1 text-2xl font-extrabold text-fg">{f.text(c.name)}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-fg-muted">
                    {t('catalog.productsCount', { n: c.productsCount })} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Spotlight>
            </StaggerItem>
          ))}
          {rest.map((c) => (
            <StaggerItem key={c.slug} className="sm:col-span-2">
              <Spotlight as={Link} to={`/catalog?category=${c.slug}`} color={c.color} className="card group flex h-full flex-col items-start gap-3 p-4 transition-all hover:-translate-y-1 hover:shadow-(--shadow-pop)">
                <span
                  className="flex size-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
                  style={{ background: `color-mix(in oklab, ${c.color} 14%, transparent)`, color: c.color }}
                >
                  <CategoryIcon slug={c.slug} className="size-5.5" />
                </span>
                <span>
                  <span className="block text-sm leading-tight font-semibold text-fg">{f.text(c.name)}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">{t('catalog.productsCount', { n: c.productsCount })}</span>
                </span>
              </Spotlight>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

/* ======================================================================
   Feature bento
   ====================================================================== */
function BentoTile({ className, icon, title, text, children, color = 'var(--primary)' }: { className?: string; icon: React.ReactNode; title: string; text: string; children?: React.ReactNode; color?: string }) {
  return (
    <StaggerItem className={className}>
      <Spotlight color={color} className="card group flex h-full flex-col overflow-hidden p-6 transition-shadow hover:shadow-(--shadow-pop)">
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl [&_svg]:size-5" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>
          {icon}
        </span>
        <h3 className="text-lg font-bold text-fg">{title}</h3>
        <p className="mt-1.5 text-sm text-fg-muted">{text}</p>
        {children && <div className="mt-6 flex flex-1 items-end">{children}</div>}
      </Spotlight>
    </StaggerItem>
  );
}

function Bento() {
  const t = useT();
  const f = useFormat();
  const tiers = [
    { q: '10+', p: 385000, h: 100 },
    { q: '50+', p: 366000, h: 82 },
    { q: '200+', p: 347000, h: 64 },
    { q: '500+', p: 331000, h: 50 },
  ];
  return (
    <section className="bg-surface py-16">
      <div className="container-page">
        <SectionHeading center eyebrow={t('home.bento.eyebrow')} title={t('home.bento.title')} subtitle={t('home.bento.subtitle')} />
        <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-3" stagger={0.08}>
          <BentoTile className="md:col-span-2" icon={<Percent />} title={t('home.values.tiers')} text={t('home.values.tiersText')}>
            <div className="flex w-full items-end gap-3">
              {tiers.map((tier, i) => (
                <div key={tier.q} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-[11px] font-semibold text-fg-muted sm:text-xs">{f.money(tier.p, { compact: true })}</span>
                  <motion.div
                    className={cn('w-full rounded-t-lg', i === tiers.length - 1 ? 'bg-success' : 'bg-primary/70')}
                    initial={{ height: 0 }}
                    whileInView={{ height: tier.h }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease: EASE }}
                  />
                  <span className="text-xs text-fg-subtle">{tier.q}</span>
                </div>
              ))}
            </div>
          </BentoTile>
          <BentoTile icon={<ShieldCheck />} title={t('home.values.verified')} text={t('home.values.verifiedText')} color="#16a34a">
            <div className="w-full space-y-2">
              {['Samarqand Tekstil Group', "Farg'ona Qurilish Invest", 'TechnoMart Distribution'].map((n, i) => (
                <motion.div
                  key={n}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="truncate">{n}</span>
                  <BadgeCheck className="size-4 shrink-0 text-primary" />
                </motion.div>
              ))}
            </div>
          </BentoTile>
          <BentoTile icon={<Truck />} title={t('home.values.delivery')} text={t('home.values.deliveryText')} color="#ea580c">
            <svg viewBox="0 0 240 110" className="h-28 w-full">
              <path d="M10 95 C 60 95, 50 40, 110 45 S 170 15, 228 18" fill="none" stroke="var(--border-strong)" strokeWidth="6" strokeLinecap="round" />
              <motion.path
                d="M10 95 C 60 95, 50 40, 110 45 S 170 15, 228 18"
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.8, ease: 'easeInOut', delay: 0.3 }}
              />
              <circle cx="10" cy="95" r="7" fill="#ea580c" stroke="white" strokeWidth="2.5" />
              <motion.g initial={{ scale: 0, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 2, type: 'spring' }} style={{ transformOrigin: '228px 18px' }}>
                <circle cx="228" cy="18" r="8" fill="#16a34a" stroke="white" strokeWidth="2.5" />
              </motion.g>
            </svg>
          </BentoTile>
          <BentoTile icon={<Wallet />} title={t('home.values.payment')} text={t('home.values.paymentText')} color="#7c3aed">
            <div className="grid w-full grid-cols-3 gap-2">
              {['Payme', 'Click', 'Uzcard', 'Humo', 'Visa', t('checkout.payment.transfer')].map((p, i) => (
                <motion.span
                  key={p}
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className="truncate rounded-lg border border-border bg-surface-2 px-2 py-2 text-center text-xs font-semibold text-fg-muted"
                >
                  {p}
                </motion.span>
              ))}
            </div>
          </BentoTile>
          <BentoTile icon={<FileText />} title={t('home.bento.rfq')} text={t('home.bento.rfqText')} color="#0ea5e9">
            <div className="w-full space-y-2 text-sm">
              <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-fg">
                {t('home.bento.rfqBuyer')}
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 1 }} className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2">
                {t('home.bento.rfqSeller')}
              </motion.div>
            </div>
          </BentoTile>
          <StaggerItem className="md:col-span-3">
            <Spotlight className="card relative flex flex-col items-start gap-5 overflow-hidden p-6 sm:flex-row sm:items-center">
              <BorderBeam duration={8} />
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#7c3aed] text-white">
                <Bot className="size-6" />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-bold">{t('home.bento.ai')}</h3>
                <p className="mt-1 text-sm text-fg-muted">{t('home.bento.aiText')}</p>
              </div>
              <div className="w-full max-w-sm space-y-2 text-sm sm:w-auto">
                <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-fg">{t('home.bento.aiQuestion')}</div>
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8 }}
                  className="w-fit rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2"
                >
                  {t('home.bento.aiAnswer')}
                </motion.div>
              </div>
              <ButtonLink to="/assistant" variant="soft" rightIcon={<ArrowRight />}>
                {t('home.bento.aiCta')}
              </ButtonLink>
            </Spotlight>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}

/* ======================================================================
   Products with category filter
   ====================================================================== */
function PopularProducts() {
  const t = useT();
  const f = useFormat();
  const { data: categories } = useCategories();
  const [cat, setCat] = useState('all');
  const top = useMemo(() => [...(categories ?? [])].sort((a, b) => b.productsCount - a.productsCount).slice(0, 5), [categories]);
  const query: ProductQuery = { sort: 'popular', pageSize: 8, category: cat === 'all' ? undefined : cat };
  const { data, isLoading, isPlaceholderData } = useProducts(query);
  return (
    <section className="container-page py-16">
      <SectionHeading eyebrow={t('home.popular.eyebrow')} title={t('home.popular.title')} subtitle={t('home.popular.subtitle')} action={<ViewAll to={cat === 'all' ? '/catalog?sort=popular' : `/catalog?category=${cat}`} />} />
      <Tabs
        variant="pill"
        className="mb-6"
        value={cat}
        onChange={setCat}
        items={[{ value: 'all', label: t('home.popular.all') }, ...top.map((c) => ({ value: c.slug, label: f.text(c.name) }))]}
      />
      <div className={cn('transition-opacity', isPlaceholderData && 'opacity-50')}>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <Stagger key={cat} immediate className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
            {data?.items.map((p) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </section>
  );
}

function Deals() {
  const t = useT();
  const { data, isLoading } = useProducts({ discount: true, sort: 'popular', pageSize: 4 });
  return (
    <section className="container-page pb-16">
      <SectionHeading eyebrow={t('home.deals.eyebrow')} title={t('home.deals.title')} subtitle={t('home.deals.subtitle')} action={<ViewAll to="/catalog?discount=true" />} />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : data?.items.map((p) => (
              <StaggerItem key={p.id}>
                <ProductCard product={p} />
              </StaggerItem>
            ))}
      </Stagger>
    </section>
  );
}

/* ======================================================================
   Live activity
   ====================================================================== */
function LiveActivity() {
  const t = useT();
  const f = useFormat();
  const td = useTd();
  const { data } = useQuery({ queryKey: qk.activity, queryFn: catalogApi.activity, refetchInterval: 60_000 });
  if (!data?.length) return null;
  return (
    <section className="border-y border-border bg-surface py-10">
      <div className="container-page mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="live-dot" />
          <div>
            <h2 className="text-lg font-bold">{t('home.activity.title')}</h2>
            <p className="text-sm text-fg-muted">{t('home.activity.subtitle')}</p>
          </div>
        </div>
      </div>
      <Marquee duration={60} gap="0.75rem">
        {data.map((it) => (
          <div key={it.id} className="flex w-80 shrink-0 items-center gap-3 rounded-xl border border-border bg-bg p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${CATEGORY_COLORS[it.categorySlug]} 14%, transparent)`, color: CATEGORY_COLORS[it.categorySlug] }}>
              <CategoryIcon slug={it.categorySlug} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{it.productName}</div>
              <div className="truncate text-xs text-fg-muted">
                {f.number(it.quantity)} {td(`units.${it.unit}`)} · {it.companyName}
              </div>
              <div className="flex items-center gap-1 truncate text-[11px] text-fg-subtle">
                <MapPin className="size-3" /> {it.area} · {f.relative(it.at)}
              </div>
            </div>
          </div>
        ))}
      </Marquee>
    </section>
  );
}

/* ======================================================================
   RFQ banner
   ====================================================================== */
function RfqBanner() {
  const t = useT();
  const user = useAuth((s) => s.user);
  return (
    <section className="container-page py-16">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b1739] via-[#1e3a8a] to-[#312e81] p-8 text-white sm:p-12">
          <BorderBeam duration={7} from="#93c5fd" to="#fbbf24" width={2} />
          <div className="bg-dots pointer-events-none absolute inset-0 opacity-10" />
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-[#f59e0b]/25 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <Badge className="border-white/20 bg-white/10 text-white" icon={<MessageSquareQuote />}>
                RFQ
              </Badge>
              <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">{t('home.rfq.title')}</h2>
              <p className="mt-3 max-w-xl text-white/75">{t('home.rfq.text')}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <ButtonLink shine to={user ? '/account/rfqs?new=1' : '/login?next=/account/rfqs?new=1'} size="lg" className="bg-white text-[#0f172a] hover:bg-white/90">
                  {t('home.rfq.cta')}
                </ButtonLink>
                <ButtonLink to="/help#rfq" size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                  {t('home.rfq.how')}
                </ButtonLink>
              </div>
            </div>
            <Stagger as="ul" className="space-y-3" stagger={0.15}>
              {[t('home.rfq.point1'), t('home.rfq.point2'), t('home.rfq.point3')].map((p) => (
                <StaggerItem as="li" key={p} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm backdrop-blur">
                  <CheckCircle2 className="size-5 shrink-0 text-[#fbbf24]" />
                  {p}
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ======================================================================
   How it works
   ====================================================================== */
function HowItWorks() {
  const t = useT();
  const [tab, setTab] = useState<'buyer' | 'seller' | 'courier'>('buyer');
  const steps = {
    buyer: [
      { icon: <Search />, title: t('home.how.buyer1'), text: t('home.how.buyer1Text') },
      { icon: <FileText />, title: t('home.how.buyer2'), text: t('home.how.buyer2Text') },
      { icon: <ShoppingCart />, title: t('home.how.buyer3'), text: t('home.how.buyer3Text') },
    ],
    seller: [
      { icon: <Store />, title: t('home.how.seller1'), text: t('home.how.seller1Text') },
      { icon: <PackagePlus />, title: t('home.how.seller2'), text: t('home.how.seller2Text') },
      { icon: <ClipboardCheck />, title: t('home.how.seller3'), text: t('home.how.seller3Text') },
    ],
    courier: [
      { icon: <Bike />, title: t('home.how.courier1'), text: t('home.how.courier1Text') },
      { icon: <MapPin />, title: t('home.how.courier2'), text: t('home.how.courier2Text') },
      { icon: <Wallet />, title: t('home.how.courier3'), text: t('home.how.courier3Text') },
    ],
  }[tab];
  return (
    <section className="relative overflow-hidden bg-surface py-16">
      <GridBackdrop dots />
      <div className="container-page relative">
        <SectionHeading center eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} subtitle={t('home.how.subtitle')} />
        <div className="flex justify-center">
          <Tabs
            variant="pill"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'buyer', label: t('roles.buyer') },
              { value: 'seller', label: t('roles.seller') },
              { value: 'courier', label: t('roles.courier') },
            ]}
          />
        </div>
        <div className="relative mt-12">
          {/* connecting line */}
          <div className="absolute top-7 right-[16%] left-[16%] hidden h-0.5 overflow-hidden rounded-full bg-border md:block">
            <motion.div key={tab} className="h-full bg-gradient-to-r from-primary to-[#7c3aed]" initial={{ width: 0 }} whileInView={{ width: '100%' }} viewport={{ once: true }} transition={{ duration: 1.2, ease: EASE }} />
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="grid gap-8 md:grid-cols-3" initial="hidden" animate="show" exit="hidden" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}>
              {steps.map((s, i) => (
                <motion.div
                  key={s.title}
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
                  className="relative flex flex-col items-center text-center"
                >
                  <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-(--shadow-pop) ring-8 ring-surface [&_svg]:size-6">
                    {s.icon}
                    <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-[#0f172a]">{i + 1}</span>
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1.5 max-w-xs text-sm text-fg-muted">{s.text}</p>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
        <Reveal className="mt-12 text-center">
          <ButtonLink shine to={tab === 'buyer' ? '/register' : `/register?role=${tab}`} size="lg" rightIcon={<ArrowRight />}>
            {t(`home.how.cta.${tab}`)}
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

/* ======================================================================
   Suppliers, testimonials, CTA
   ====================================================================== */
function TopSuppliers() {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: qk.companies({ verified: true, pageSize: 6 }), queryFn: () => catalogApi.companies({ verified: true, pageSize: 6 }) });
  return (
    <section className="container-page py-16">
      <SectionHeading eyebrow={t('home.suppliers.eyebrow')} title={t('home.suppliers.title')} subtitle={t('home.suppliers.subtitle')} action={<ViewAll to="/suppliers" />} />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((c) => (
            <StaggerItem key={c.id}>
              <Spotlight as={Link} to={`/suppliers/${c.id}`} color={CATEGORY_COLORS[c.mainCategories[0]]} className="card group block h-full p-5 transition-all hover:-translate-y-1 hover:shadow-(--shadow-pop)">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `color-mix(in oklab, ${CATEGORY_COLORS[c.mainCategories[0]] ?? '#64748b'} 14%, transparent)`, color: CATEGORY_COLORS[c.mainCategories[0]] }}
                  >
                    <CategoryIcon slug={c.mainCategories[0]} className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold group-hover:text-primary">{c.name}</span>
                      {c.verified && <VerifiedBadge />}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-fg-subtle">
                      <MapPin className="size-3" /> {c.region} · {t('company.since', { year: c.foundedYear })}
                    </div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-fg-muted">{c.description}</p>
                <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-fg-muted">
                  <Rating value={c.rating} size={12} showValue />
                  <span>{t('company.productsN', { n: c.productsCount })}</span>
                  <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    {t('company.visitStore')} <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </Spotlight>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

function RecentlyViewed() {
  const t = useT();
  const ids = useRecentlyViewed((s) => s.ids);
  const { data } = useProductsByIds(ids.slice(0, 4));
  if (!ids.length || !data?.length) return null;
  return (
    <section className="container-page pb-16">
      <SectionHeading title={t('home.recent')} />
      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {data.map((p) => (
          <StaggerItem key={p.id}>
            <ProductCard product={p} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function Testimonials() {
  const t = useT();
  const items = [
    { name: 'Malika Yusupova', org: 'Malika Kafe, Toshkent', text: t('home.testimonials.t1') },
    { name: 'Bekzod Sobirov', org: 'BS Qurilish, Samarqand', text: t('home.testimonials.t2') },
    { name: 'Nilufar Rashidova', org: 'Samarqand Tekstil Group', text: t('home.testimonials.t3') },
    { name: 'Aziz Tursunov', org: 'Tursunov Market, Andijon', text: t('home.testimonials.t4') },
    { name: 'Otabek Ergashev', org: 'Ergashev Avto, Toshkent', text: t('home.testimonials.t5') },
    { name: 'Sardor Rahimov', org: t('roles.courier'), text: t('home.testimonials.t6') },
  ];
  const card = (it: (typeof items)[number]) => (
    <figure key={it.name} className="card flex w-[22rem] shrink-0 flex-col p-6">
      <Quote className="size-7 text-primary/30" />
      <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-fg">{it.text}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <Avatar name={it.name} size={40} />
        <div>
          <div className="text-sm font-semibold">{it.name}</div>
          <div className="text-xs text-fg-subtle">{it.org}</div>
        </div>
        <Rating value={5} size={12} className="ml-auto" />
      </figcaption>
    </figure>
  );
  return (
    <section className="py-16">
      <div className="container-page">
        <SectionHeading center eyebrow={t('home.testimonials.eyebrow')} title={t('home.testimonials.title')} />
      </div>
      <div className="space-y-4">
        <Marquee duration={55}>{items.map(card)}</Marquee>
        <Marquee duration={65} reverse>
          {items
            .slice()
            .reverse()
            .map(card)}
        </Marquee>
      </div>
    </section>
  );
}

function SellerCta() {
  const t = useT();
  return (
    <section className="container-page pt-4 pb-6">
      <Reveal>
        <div className="card relative grid items-center gap-6 overflow-hidden p-8 md:grid-cols-[auto_1fr_auto] md:p-10">
          <BorderBeam duration={9} />
          <Aurora className="opacity-25!" />
          <span className="relative flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-fg">
            <PackageCheck className="size-8" />
          </span>
          <div className="relative">
            <h2 className="text-xl font-extrabold sm:text-2xl">{t('home.sellerCta.title')}</h2>
            <p className="mt-1.5 text-fg-muted">{t('home.sellerCta.text')}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-success" />
                {t('home.sellerCta.p1')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="size-4 text-success" />
                {t('home.sellerCta.p2')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Truck className="size-4 text-success" />
                {t('home.sellerCta.p3')}
              </span>
            </div>
          </div>
          <ButtonLink shine to="/register?role=seller" size="lg" rightIcon={<ArrowRight />} className="relative">
            {t('header.becomeSeller')}
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustedBy />
      <Categories />
      <Bento />
      <PopularProducts />
      <LiveActivity />
      <RfqBanner />
      <Deals />
      <HowItWorks />
      <TopSuppliers />
      <RecentlyViewed />
      <Testimonials />
      <SellerCta />
    </>
  );
}
