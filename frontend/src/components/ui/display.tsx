import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CountUp } from '../motion';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, ChevronRight as Sep, Loader2, Minus, Plus, Star, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import type { Tone } from '@/lib/constants';
import { Button } from './button';
import { useT } from '@/i18n';

/* ---------- Badge ---------- */
const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  primary: 'bg-primary-soft text-primary-soft-fg border-primary/15',
  success: 'bg-success-soft text-success border-success/15',
  warning: 'bg-warning-soft text-warning border-warning/15',
  danger: 'bg-danger-soft text-danger border-danger/15',
  info: 'bg-info-soft text-info border-info/15',
  accent: 'bg-accent-soft text-accent-soft-fg border-accent/20',
};

export function Badge({ tone = 'neutral', children, className, dot, icon }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {icon}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string; size?: number; className?: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return src ? (
    <img src={src} alt={name} width={size} height={size} className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 55% 45%)` }}
    >
      {initials(name) || '?'}
    </span>
  );
}

/* ---------- Loading / empty ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-primary', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-lg', className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      {icon && (
        <motion.div
          initial={{ scale: 0.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
          className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-fg-subtle [&_svg]:size-7"
        >
          {icon}
        </motion.div>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const t = useT();
  return (
    <EmptyState
      icon={<AlertCircle />}
      title={t('errors.loadFailed')}
      description={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, onChange, className }: { page: number; totalPages: number; onChange: (p: number) => void; className?: string }) {
  if (totalPages <= 1) return null;
  const pages: (number | '…')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  return (
    <nav className={cn('flex items-center justify-center gap-1', className)} aria-label="Pagination">
      <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous">
        <ChevronLeft />
      </Button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1.5 text-fg-subtle">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'tabular h-8 min-w-8 rounded-lg px-2 text-sm font-medium transition-colors',
              p === page ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface-2',
            )}
          >
            {p}
          </button>
        ),
      )}
      <Button variant="ghost" size="icon-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next">
        <ChevronRight />
      </Button>
    </nav>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
  variant = 'underline',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  variant?: 'underline' | 'pill';
}) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      className={cn(
        'scrollbar-none flex gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-border' : 'w-fit max-w-full rounded-xl bg-surface-2 p-1',
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              variant === 'underline' ? cn('px-3 py-2.5', active ? 'text-primary' : 'text-fg-muted hover:text-fg') : cn('rounded-lg px-3 py-1.5', active ? 'text-fg' : 'text-fg-muted hover:text-fg'),
            )}
          >
            {active &&
              (variant === 'underline' ? (
                <motion.span layoutId={layoutId} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
              ) : (
                <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
              ))}
            <span className="relative z-10 flex items-center gap-1.5">
              {it.label}
              {it.count !== undefined && (
                <span className={cn('tabular rounded-full px-1.5 text-xs', active ? 'bg-primary-soft text-primary-soft-fg' : 'bg-surface-3 text-fg-muted')}>{it.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Stat card ---------- */
export function StatCard({
  label,
  value,
  icon,
  change,
  hint,
  tone = 'primary',
  className,
  countTo,
  format,
}: {
  label: ReactNode;
  value?: ReactNode;
  /** Animate the value from 0 to this number when scrolled into view. */
  countTo?: number;
  format?: (n: number) => string;
  icon?: ReactNode;
  change?: number;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn('group p-4 transition-shadow hover:shadow-(--shadow-pop) sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        {icon && (
          <span className={cn('flex size-9 items-center justify-center rounded-lg border transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 [&_svg]:size-4.5', toneClasses[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-fg">{countTo !== undefined ? <CountUp to={countTo} format={format} /> : value}</p>
      {(change !== undefined || hint) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {change !== undefined && (
            <span className={cn('inline-flex items-center gap-0.5 font-semibold', change >= 0 ? 'text-success' : 'text-danger')}>
              {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {change > 0 ? '+' : ''}
              {change}%
            </span>
          )}
          {hint && <span className="text-fg-subtle">{hint}</span>}
        </div>
      )}
    </Card>
  );
}

/* ---------- Rating ---------- */
export function Rating({ value, size = 14, showValue, count, className }: { value: number; size?: number; showValue?: boolean; count?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="inline-flex" aria-label={`${value} / 5`}>
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, value - i + 1));
          return (
            <span key={i} className="relative" style={{ width: size, height: size }}>
              <Star className="absolute inset-0 text-surface-3" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="text-accent" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
              </span>
            </span>
          );
        })}
      </span>
      {showValue && <span className="text-sm font-semibold text-fg">{value.toFixed(1)}</span>}
      {count !== undefined && <span className="text-xs text-fg-subtle">({count})</span>}
    </span>
  );
}

export function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)} className="p-0.5 transition-transform hover:scale-110">
          <Star className={cn('size-7', i <= value ? 'text-accent' : 'text-surface-3')} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  );
}

/* ---------- Quantity input ---------- */
export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = Infinity,
  step = 1,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md';
}) {
  const clampV = (v: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min));
  const h = size === 'sm' ? 'h-8' : 'h-10';
  return (
    <div className={cn('inline-flex items-center rounded-lg border border-border-strong bg-surface', h)}>
      <button type="button" className={cn('flex aspect-square items-center justify-center text-fg-muted hover:text-fg disabled:opacity-40', h)} onClick={() => onChange(clampV(value - step))} disabled={value <= min} aria-label="Decrease">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="tabular h-full w-16 border-x border-border bg-transparent text-center text-sm font-semibold text-fg focus:outline-none"
        value={value}
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={(e) => onChange(clampV(Number(e.target.value)))}
      />
      <button type="button" className={cn('flex aspect-square items-center justify-center text-fg-muted hover:text-fg disabled:opacity-40', h)} onClick={() => onChange(clampV(value + step))} disabled={value >= max} aria-label="Increase">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/* ---------- Page chrome ---------- */
export function Breadcrumbs({ items, className }: { items: { label: ReactNode; to?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1 text-sm text-fg-subtle', className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && <Sep className="size-3.5 shrink-0" />}
          {it.to ? (
            <Link to={it.to} className="truncate hover:text-fg">
              {it.label}
            </Link>
          ) : (
            <span className="truncate text-fg-muted">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ title, description, actions, className, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; back?: ReactNode }) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2 text-sm', className)}>
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-medium text-fg">{children}</span>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-border', className)} />;
}
