import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Check, FileText, MessageSquare, Reply, Target, X } from 'lucide-react';
import { messagesApi, rfqApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useFormat, useT, useTd } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import type { Rfq, RfqStatus } from '@/types';
import { Card, EmptyState, ErrorState, Pagination, Skeleton, Tabs } from './ui/display';
import { Button } from './ui/button';
import { Field, Input, Textarea } from './ui/form';
import { Modal, useConfirm } from './ui/overlay';
import { RfqStatusBadge } from './orders';

function RespondDialog({ rfq, onClose }: { rfq: Rfq | null; onClose: () => void }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const m = useMutation({
    mutationFn: () => rfqApi.respond(rfq!.id, { unitPrice: Number(price), message, validUntil: new Date(validUntil).toISOString() }),
    onSuccess: () => {
      toast.success(t('rfq.responded'));
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      qc.invalidateQueries({ queryKey: ['seller'] });
      onClose();
      setPrice('');
      setMessage('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const total = Number(price) * (rfq?.quantity ?? 0);
  return (
    <Modal
      open={!!rfq}
      onClose={onClose}
      title={t('rfq.respondTitle', { number: rfq?.number ?? '' })}
      description={rfq ? `${rfq.productName} × ${f.number(rfq.quantity)} ${td(`units.${rfq.unit}`)}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={m.isPending} disabled={!(Number(price) > 0)} onClick={() => m.mutate()}>
            {t('rfq.sendOffer')}
          </Button>
        </>
      }
    >
      {rfq && (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-2 p-3 text-sm">
            <div className="text-fg-muted">{rfq.message}</div>
            {rfq.targetPrice && (
              <div className="mt-2 text-xs">
                {t('rfq.targetPrice')}: <b>{f.money(rfq.targetPrice)}</b>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('rfq.unitPrice')} required hint={total > 0 ? `${t('cart.total')}: ${f.uzs(total)}` : undefined}>
              {(id) => <Input id={id} type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />}
            </Field>
            <Field label={t('rfq.validUntil')}>{(id) => <Input id={id} type="date" value={validUntil} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setValidUntil(e.target.value)} />}</Field>
          </div>
          <Field label={t('rfq.message')}>{(id) => <Textarea id={id} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('rfq.offerPlaceholder')} />}</Field>
        </div>
      )}
    </Modal>
  );
}

export function RfqList({ mode }: { mode: 'buyer' | 'seller' }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [status, setStatus] = useState<'all' | RfqStatus>('all');
  const [page, setPage] = useState(1);
  const [responding, setResponding] = useState<Rfq | null>(null);
  const query = { status: status === 'all' ? undefined : status, page };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: qk.rfqs(query), queryFn: () => rfqApi.list(query), placeholderData: keepPreviousData });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'accept' | 'reject' | 'close' }) => rfqApi.decide(id, decision),
    onSuccess: (r) => {
      toast.success(td(`rfq.status.${r.status}`));
      qc.invalidateQueries({ queryKey: ['rfqs'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const chat = useMutation({
    mutationFn: (r: Rfq) => messagesApi.start(mode === 'buyer' ? { companyId: r.companyId, productId: r.productId } : { recipientId: r.buyerId, productId: r.productId }),
    onSuccess: (c) => navigate(`/messages/${c.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const statuses: ('all' | RfqStatus)[] = ['all', 'open', 'answered', 'accepted', 'rejected', 'closed'];

  return (
    <div>
      <Tabs
        className="mb-4"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        items={statuses.map((s) => ({ value: s, label: s === 'all' ? t('orders.tabs.all') : td(`rfq.status.${s}`) }))}
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState icon={<FileText />} title={t('rfq.empty')} description={mode === 'buyer' ? t('rfq.emptyBuyer') : t('rfq.emptySeller')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-fg-subtle">{r.number}</span>
                    <RfqStatusBadge status={r.status} />
                    <span className="text-xs text-fg-subtle">{f.relative(r.createdAt)}</span>
                  </div>
                  <h3 className="mt-1 font-semibold">
                    {r.productId ? (
                      <Link to={`/products/${r.productId}`} className="hover:text-primary">
                        {r.productName}
                      </Link>
                    ) : (
                      r.productName
                    )}
                  </h3>
                  <div className="text-sm text-fg-muted">
                    {mode === 'buyer' ? (
                      <Link to={`/suppliers/${r.companyId}`} className="hover:text-fg">
                        {r.companyName}
                      </Link>
                    ) : (
                      <>
                        {r.buyerName}
                        {r.buyerOrganization && ` · ${r.buyerOrganization}`}
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    {f.number(r.quantity)} {td(`units.${r.unit}`)}
                  </div>
                  <div className="flex flex-wrap justify-end gap-x-3 text-xs text-fg-muted">
                    {r.targetPrice && (
                      <span className="inline-flex items-center gap-1">
                        <Target className="size-3" /> {f.money(r.targetPrice)}
                      </span>
                    )}
                    {r.deadline && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" /> {f.date(r.deadline)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg">{r.message}</p>

              {r.response && (
                <div className="mt-3 rounded-xl border border-primary/25 bg-primary-soft/50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-primary-soft-fg">{t('rfq.offer')}</span>
                    <span className="text-xs text-fg-muted">
                      {t('rfq.validUntil')}: {f.date(r.response.validUntil)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                    <span className="text-2xl font-extrabold text-fg">{f.money(r.response.unitPrice)}</span>
                    <span className="text-sm text-fg-muted">/ {td(`units.${r.unit}`)}</span>
                    <span className="text-sm text-fg-muted">
                      · {t('cart.total')}: <b className="text-fg">{f.money(r.response.unitPrice * r.quantity)}</b>
                    </span>
                  </div>
                  {r.response.message && <p className="mt-1.5 text-sm text-fg-muted">{r.response.message}</p>}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {mode === 'buyer' && r.status === 'answered' && (
                  <>
                    <Button size="sm" variant="success" leftIcon={<Check />} loading={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: 'accept' })}>
                      {t('rfq.accept')}
                    </Button>
                    <Button size="sm" variant="outline" leftIcon={<X />} onClick={() => decide.mutate({ id: r.id, decision: 'reject' })}>
                      {t('rfq.reject')}
                    </Button>
                  </>
                )}
                {mode === 'seller' && ['open', 'answered'].includes(r.status) && (
                  <Button size="sm" leftIcon={<Reply />} onClick={() => setResponding(r)}>
                    {r.status === 'answered' ? t('rfq.updateOffer') : t('rfq.respond')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" leftIcon={<MessageSquare />} loading={chat.isPending} onClick={() => chat.mutate(r)}>
                  {mode === 'buyer' ? t('order.messageSeller') : t('order.message')}
                </Button>
                {['open', 'answered'].includes(r.status) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-fg-subtle"
                    onClick={async () => {
                      if (await confirm({ title: mode === 'buyer' ? t('rfq.closeConfirm') : t('rfq.declineConfirm'), danger: true })) decide.mutate({ id: r.id, decision: 'close' });
                    }}
                  >
                    {mode === 'buyer' ? t('rfq.close') : t('rfq.decline')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}
      <RespondDialog rfq={responding} onClose={() => setResponding(null)} />
    </div>
  );
}
