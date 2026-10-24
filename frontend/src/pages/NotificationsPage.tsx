import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, FileText, MessageSquare, Package, Star } from 'lucide-react';
import { notificationsApi } from '@/api/endpoints';
import { qk, useNotifications } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/types';
import { Card, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui/display';
import { Button } from '@/components/ui/button';

const ICON: Record<NotificationType, typeof Bell> = { order: Package, rfq: FileText, message: MessageSquare, system: Bell, review: Star };

export default function NotificationsPage() {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data, isLoading } = useNotifications();
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }) });
  const items = (data?.items ?? []).filter((n) => filter === 'all' || !n.read);

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        actions={
          !!data?.unread && (
            <Button variant="outline" leftIcon={<CheckCheck />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t('notifications.markAllRead')}
            </Button>
          )
        }
      />
      <Tabs
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: t('orders.tabs.all') },
          { value: 'unread', label: t('notifications.unread'), count: data?.unread },
        ]}
      />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState icon={<Bell />} title={t('notifications.empty')} />
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {items.map((n) => {
            const Icon = ICON[n.type];
            return (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.read) {
                    await notificationsApi.read(n.id);
                    qc.invalidateQueries({ queryKey: qk.notifications });
                  }
                  if (n.link) navigate(n.link);
                }}
                className={cn('flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60', !n.read && 'bg-primary-soft/30')}
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', n.read ? 'bg-surface-2 text-fg-muted' : 'bg-primary text-primary-fg')}>
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-fg-subtle">{f.relative(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-fg-muted">{n.body}</p>
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </>
  );
}
