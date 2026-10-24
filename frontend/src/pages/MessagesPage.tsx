import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, MessageSquare, Package, Search, Send } from 'lucide-react';
import { messagesApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT, useTd } from '@/i18n';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import type { Message } from '@/types';
import { Avatar, Card, EmptyState, Skeleton, Spinner } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

function ConversationList({ activeId }: { activeId?: string }) {
  const t = useT();
  const f = useFormat();
  const me = useAuth((s) => s.user)!;
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: qk.conversations, queryFn: messagesApi.conversations, refetchInterval: 10_000 });
  const list = (data ?? []).filter((c) => {
    const other = c.participants.find((p) => p.id !== me.id);
    return !q || `${other?.name} ${other?.companyName} ${c.productName}`.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <Input inputSize="sm" leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('messages.search')} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !list.length ? (
          <p className="p-6 text-center text-sm text-fg-muted">{t('messages.empty')}</p>
        ) : (
          list.map((c) => {
            const other = c.participants.find((p) => p.id !== me.id)!;
            return (
              <Link
                key={c.id}
                to={`/messages/${c.id}`}
                className={cn('flex gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-surface-2', c.id === activeId && 'bg-primary-soft/50')}
              >
                <Avatar name={other.companyName ?? other.name} src={other.avatar} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{other.companyName ?? other.name}</span>
                    {c.lastMessage && <span className="shrink-0 text-[11px] text-fg-subtle">{f.relative(c.lastMessage.at)}</span>}
                  </div>
                  <div className="truncate text-xs text-fg-subtle">{other.companyName ? other.name : c.productName}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn('truncate text-sm', c.unread ? 'font-medium text-fg' : 'text-fg-muted')}>
                      {c.lastMessage ? `${c.lastMessage.senderId === me.id ? `${t('messages.you')}: ` : ''}${c.lastMessage.text}` : '—'}
                    </span>
                    {!!c.unread && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-fg">{c.unread}</span>}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatPane({ id }: { id: string }) {
  const t = useT();
  const td = useTd();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user)!;
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: qk.conversation(id), queryFn: () => messagesApi.messages(id), refetchInterval: 4000 });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);
  useEffect(() => {
    qc.invalidateQueries({ queryKey: qk.unreadMessages });
    qc.invalidateQueries({ queryKey: qk.conversations, exact: true });
  }, [data?.messages.length, qc]);

  const send = useMutation({
    mutationFn: (body: string) => messagesApi.send(id, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.conversation(id) });
      const prev = qc.getQueryData<typeof data>(qk.conversation(id));
      if (prev) {
        const optimistic: Message = { id: `tmp-${Date.now()}`, conversationId: id, senderId: me.id, text: body, createdAt: new Date().toISOString() };
        qc.setQueryData(qk.conversation(id), { ...prev, messages: [...prev.messages, optimistic] });
      }
      setText('');
      return { prev };
    },
    onError: (e, body, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.conversation(id), ctx.prev);
      setText(body);
      toast.error(errorMessage(e));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.conversation(id) });
      qc.invalidateQueries({ queryKey: qk.conversations, exact: true });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) return <EmptyState title={t('messages.notFound')} />;
  const other = data.conversation.participants.find((p) => p.id !== me.id)!;

  // group by day
  let lastDay = '';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={() => navigate('/messages')} className="-ml-1 rounded-md p-1 text-fg-muted hover:bg-surface-2 lg:hidden" aria-label={t('common.back')}>
          <ArrowLeft className="size-5" />
        </button>
        <Avatar name={other.companyName ?? other.name} src={other.avatar} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{other.companyName ?? other.name}</div>
          <div className="truncate text-xs text-fg-subtle">
            {other.companyName ? `${other.name} · ` : ''}
            {td(`roles.${other.role}`)}
          </div>
        </div>
      </div>
      {data.conversation.productId && (
        <Link to={`/products/${data.conversation.productId}`} className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2 text-xs text-fg-muted hover:text-primary">
          <Package className="size-3.5" /> {data.conversation.productName}
        </Link>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto bg-bg/50 px-4 py-4">
        {data.messages.map((m) => {
          const mine = m.senderId === me.id;
          const day = f.date(m.createdAt, { day: 'numeric', month: 'long' });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-medium text-fg-subtle">{day}</span>
                </div>
              )}
              <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                    mine ? 'rounded-br-md bg-primary text-primary-fg' : 'rounded-bl-md border border-border bg-surface text-fg',
                    m.id.startsWith('tmp-') && 'opacity-70',
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{m.text}</p>
                  <div className={cn('mt-0.5 text-right text-[10px]', mine ? 'text-primary-fg/70' : 'text-fg-subtle')}>{f.time(m.createdAt)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate(text.trim());
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) send.mutate(text.trim());
            }
          }}
          rows={1}
          placeholder={t('messages.placeholder')}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-sm focus:border-primary focus:ring-3 focus:ring-primary/15 focus:outline-none"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} aria-label={t('messages.send')}>
          <Send />
        </Button>
      </form>
    </div>
  );
}

export default function MessagesPage() {
  const { id } = useParams();
  const t = useT();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t('account.nav.messages')}</h1>
      <Card className="grid h-[calc(100vh-15rem)] min-h-[480px] overflow-hidden lg:grid-cols-[320px_1fr]">
        <div className={cn('border-r border-border', id ? 'hidden lg:block' : 'block')}>
          <ConversationList activeId={id} />
        </div>
        <div className={cn(!id && 'hidden lg:block')}>
          {id ? <ChatPane key={id} id={id} /> : <EmptyState icon={<MessageSquare />} title={t('messages.select')} description={t('messages.selectText')} className="h-full" />}
        </div>
      </Card>
    </div>
  );
}
