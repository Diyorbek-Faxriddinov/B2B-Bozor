import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Search, Users } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import type { Role } from '@/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { useConfirm } from '@/components/ui/overlay';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';

export default function AdminUsersPage() {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const me = useAuth((s) => s.user)!;
  const [role, setRole] = useState<'all' | Role>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = { role: role === 'all' ? undefined : role, q: search || undefined, page };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.admin('users', query), queryFn: () => adminApi.users(query), placeholderData: keepPreviousData });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) => adminApi.updateUser(id, { status }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success(u.status === 'blocked' ? t('admin.users.blocked') : t('admin.users.unblocked'));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader title={t('admin.nav.users')} description={data ? t('admin.users.count', { n: data.total }) : undefined} />
      <form
        className="mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
          setPage(1);
        }}
      >
        <Input leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.users.search')} />
      </form>
      <Tabs
        className="mb-4"
        value={role}
        onChange={(v) => {
          setRole(v);
          setPage(1);
        }}
        items={(['all', 'buyer', 'seller', 'courier', 'admin'] as const).map((r) => ({ value: r, label: r === 'all' ? t('orders.tabs.all') : td(`roles.${r}`) }))}
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-96" />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<Users />} title={t('admin.users.empty')} />
        </Card>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>{t('admin.users.col.user')}</TH>
                <TH>{t('admin.users.col.role')}</TH>
                <TH>{t('auth.phone')}</TH>
                <TH>{t('admin.users.col.joined')}</TH>
                <TH>{t('orders.col.status')}</TH>
                <TH />
              </tr>
            </THead>
            <tbody>
              {data.items.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex min-w-56 items-center gap-3">
                      <Avatar name={u.fullName} src={u.avatar} size={36} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.fullName}</div>
                        <div className="truncate text-xs text-fg-subtle">{u.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={u.role === 'admin' ? 'accent' : u.role === 'seller' ? 'primary' : u.role === 'courier' ? 'info' : 'neutral'}>{td(`roles.${u.role}`)}</Badge>
                    {u.organization && <div className="mt-0.5 max-w-40 truncate text-xs text-fg-subtle">{u.organization}</div>}
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted">{u.phone}</TD>
                  <TD className="whitespace-nowrap text-fg-muted">{f.date(u.createdAt)}</TD>
                  <TD>
                    <Badge tone={u.status === 'active' ? 'success' : 'danger'} dot>
                      {td(`admin.users.status.${u.status}`)}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {u.id !== me.id &&
                      (u.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          leftIcon={<Ban />}
                          onClick={async () => {
                            if (await confirm({ title: t('admin.users.blockConfirm', { name: u.fullName }), description: t('admin.users.blockText'), danger: true })) update.mutate({ id: u.id, status: 'blocked' });
                          }}
                        >
                          {t('admin.users.block')}
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-success" leftIcon={<CheckCircle2 />} onClick={() => update.mutate({ id: u.id, status: 'active' })}>
                          {t('admin.users.unblock')}
                        </Button>
                      ))}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="border-t border-border p-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        </Card>
      )}
    </div>
  );
}
