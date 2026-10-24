import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Copy } from 'lucide-react';
import { courierApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { ScheduleDay } from '@/types';
import { Card, ErrorState, PageHeader, PageLoader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input, Switch } from '@/components/ui/form';

function hours(d: ScheduleDay) {
  if (!d.active) return 0;
  const [fh, fm] = d.from.split(':').map(Number);
  const [th, tm] = d.to.split(':').map(Number);
  return Math.max(0, th + tm / 60 - (fh + fm / 60));
}

export default function SchedulePage() {
  const t = useT();
  const td = useTd();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: qk.courier('schedule'), queryFn: courierApi.schedule });
  const [days, setDays] = useState<ScheduleDay[]>([]);
  useEffect(() => {
    if (data) setDays(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => courierApi.saveSchedule(days),
    onSuccess: (d) => {
      qc.setQueryData(qk.courier('schedule'), d);
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState />;

  const setDay = (i: number, patch: Partial<ScheduleDay>) => setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const total = days.reduce((s, d) => s + hours(d), 0);
  const invalid = days.some((d) => d.active && d.from >= d.to);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('courier.nav.schedule')}
        description={t('courier.scheduleText')}
        actions={
          <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        }
      />
      <Card className="mb-4 flex items-center gap-4 p-5">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
          <CalendarClock className="size-5" />
        </span>
        <div>
          <div className="text-2xl font-bold">{t('courier.hoursPerWeek', { n: Math.round(total * 10) / 10 })}</div>
          <div className="text-sm text-fg-muted">{t('courier.workDays', { n: days.filter((d) => d.active).length })}</div>
        </div>
      </Card>
      <Card className="divide-y divide-border">
        {days.map((d, i) => (
          <div key={d.day} className={cn('flex flex-wrap items-center gap-4 px-5 py-4', i === todayIdx && 'bg-primary-soft/30')}>
            <div className="w-32">
              <div className="font-medium">{td(`days.${d.day}`)}</div>
              {i === todayIdx && <div className="text-xs font-medium text-primary">{t('courier.today')}</div>}
            </div>
            <Switch checked={d.active} onChange={(v) => setDay(i, { active: v })} />
            <div className={cn('flex items-center gap-2', !d.active && 'pointer-events-none opacity-40')}>
              <Input type="time" inputSize="sm" className="w-28" value={d.from} onChange={(e) => setDay(i, { from: e.target.value })} aria-label={t('courier.from')} />
              <span className="text-fg-subtle">—</span>
              <Input type="time" inputSize="sm" className="w-28" value={d.to} onChange={(e) => setDay(i, { to: e.target.value })} aria-label={t('courier.to')} invalid={d.active && d.from >= d.to} />
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm text-fg-muted">
              {d.active ? t('courier.hoursShort', { n: Math.round(hours(d) * 10) / 10 }) : t('courier.dayOff')}
              {i === 0 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t('courier.copyToWeekdays')}
                  onClick={() => setDays((prev) => prev.map((x, j) => (j > 0 && j < 5 ? { ...x, active: d.active, from: d.from, to: d.to } : x)))}
                >
                  <Copy />
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
      {invalid && <p className="mt-3 text-sm text-danger">{t('courier.invalidRange')}</p>}
    </div>
  );
}
