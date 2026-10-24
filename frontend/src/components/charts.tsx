import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ReactNode } from 'react';
import type { SeriesPoint } from '@/types';
import { cn } from '@/lib/utils';
import { useFormat } from '@/i18n';

/**
 * Single-series trend (area) chart. Follows the dataviz reference palette:
 * one hue, 2px line, recessive grid, crosshair + tooltip on hover.
 */
export function TrendChart({
  data,
  format,
  height = 260,
  color = 'var(--chart-1)',
  name,
  countLabel,
}: {
  data: SeriesPoint[];
  format: (v: number) => string;
  height?: number;
  color?: string;
  name: string;
  countLabel?: string;
}) {
  const f = useFormat();
  const id = `grad-${name.replace(/\W/g, '')}`;
  const tickEvery = Math.max(1, Math.ceil(data.length / 7));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-grid)' }}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            interval={tickEvery - 1}
            tickFormatter={(d: string) => f.date(d, { day: 'numeric', month: 'short' })}
            minTickGap={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
            tickFormatter={(v: number) => (v === 0 ? '0' : f.money(v, { compact: true }).replace(/ (so'm|сум|UZS)$/, ''))}
          />
          <Tooltip
            cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1, strokeDasharray: '4 4' }}
            content={(p) => <ChartTooltip active={p.active} payload={p.payload as TooltipPayload} label={p.label} format={format} name={name} countLabel={countLabel} />}
          />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipPayload = readonly { payload: unknown }[] | undefined;

function ChartTooltip({
  active,
  payload,
  label,
  format,
  name,
  countLabel,
}: {
  active?: boolean;
  payload: TooltipPayload;
  label?: unknown;
  format: (v: number) => string;
  name: string;
  countLabel?: string;
}) {
  const f = useFormat();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as SeriesPoint;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-(--shadow-pop)">
      <div className="mb-1 font-medium text-fg-muted">{f.date(String(label), { weekday: 'short', day: 'numeric', month: 'long' })}</div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: 'var(--chart-1)' }} />
        <span className="text-fg-muted">{name}:</span>
        <span className="font-semibold text-fg">{format(point.value)}</span>
      </div>
      {countLabel && point.count !== undefined && (
        <div className="mt-0.5 pl-4 text-fg-muted">
          {countLabel}: <span className="font-semibold text-fg">{point.count}</span>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars rendered in HTML — readable labels, values in text ink. */
export function BarList({
  items,
  format = (v) => String(v),
  color = 'var(--chart-1)',
  className,
}: {
  items: { key: string; label: ReactNode; value: number; color?: string; icon?: ReactNode }[];
  format?: (v: number) => string;
  color?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((it) => (
        <li key={it.key} className="group" title={`${format(it.value)}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-fg">
              {it.icon}
              <span className="truncate">{it.label}</span>
            </span>
            <span className="tabular shrink-0 font-semibold text-fg">{format(it.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-all duration-500 group-hover:brightness-110" style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
