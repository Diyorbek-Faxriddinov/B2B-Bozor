import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Check, MessageSquarePlus, PanelLeft, Pencil, Search, Send, Sparkles, Trash2, X } from 'lucide-react';
import { aiApi, catalogApi } from '@/api/endpoints';
import { qk } from '@/api/hooks';
import { useAuth } from '@/stores/auth';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { unitPriceFor } from '@/lib/pricing';
import type { AiChat, AiMessage, ID } from '@/types';
import { Avatar } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Drawer, useConfirm } from '@/components/ui/overlay';
import { Markdown } from '@/components/Markdown';
import { ProductImage } from '@/components/catalog';

function ProductChips({ ids }: { ids: ID[] }) {
  const f = useFormat();
  const { data } = useQuery({ queryKey: qk.productsByIds(ids), queryFn: () => catalogApi.productsByIds(ids) });
  if (!data?.length) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {data.map((p) => (
        <Link key={p.id} to={`/products/${p.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:border-primary">
          <div className="size-12 shrink-0 overflow-hidden rounded-lg">
            <ProductImage product={p} />
          </div>
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
            <div className="truncate text-xs text-fg-subtle">{p.company.name}</div>
            <div className="text-sm font-bold text-primary">{f.money(unitPriceFor(p, p.moq))}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ChatList({ activeId, onSelect, onNew }: { activeId?: ID; onSelect: (id: ID) => void; onNew: () => void }) {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: ID; title: string } | null>(null);
  const { data } = useQuery({ queryKey: qk.aiChats, queryFn: aiApi.chats });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: ID; title: string }) => aiApi.rename(id, title),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: qk.aiChats });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: aiApi.remove,
    onSuccess: (_r, id) => {
      qc.invalidateQueries({ queryKey: qk.aiChats });
      if (id === activeId) onNew();
    },
  });
  const list = (data ?? []).filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <Button className="w-full" leftIcon={<MessageSquarePlus />} onClick={onNew}>
          {t('ai.newChat')}
        </Button>
        <Input inputSize="sm" leftIcon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ai.searchChats')} />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {!list.length && <p className="px-3 py-6 text-center text-xs text-fg-subtle">{t('ai.noChats')}</p>}
        {list.map((c) =>
          editing?.id === c.id ? (
            <form
              key={c.id}
              className="flex items-center gap-1 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (editing.title.trim()) rename.mutate({ id: c.id, title: editing.title.trim() });
              }}
            >
              <Input inputSize="sm" autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <Button type="submit" size="icon-sm" variant="ghost" aria-label={t('common.save')}>
                <Check />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label={t('common.cancel')}>
                <X />
              </Button>
            </form>
          ) : (
            <div key={c.id} className={cn('group flex items-center rounded-lg', c.id === activeId ? 'bg-primary-soft text-primary-soft-fg' : 'hover:bg-surface-2')}>
              <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="text-[11px] opacity-60">{f.relative(c.updatedAt)}</div>
              </button>
              <div className="flex pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button className="rounded p-1.5 hover:bg-surface-3" onClick={() => setEditing({ id: c.id, title: c.title })} aria-label={t('ai.rename')}>
                  <Pencil className="size-3.5" />
                </button>
                <button
                  className="rounded p-1.5 hover:bg-danger-soft hover:text-danger"
                  onClick={async () => {
                    if (await confirm({ title: t('ai.deleteConfirm'), danger: true, confirmText: t('common.delete') })) remove.mutate(c.id);
                  }}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const t = useT();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const [chatId, setChatId] = useState<ID | undefined>();
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<AiMessage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: chat } = useQuery({ queryKey: qk.aiChat(chatId ?? ''), queryFn: () => aiApi.get(chatId!), enabled: !!chatId });

  const send = useMutation({
    mutationFn: async (content: string) => {
      const id = chatId ?? (await aiApi.create()).id;
      if (!chatId) setChatId(id);
      return aiApi.send(id, content);
    },
    onMutate: (content) => {
      setPending({ id: 'pending', role: 'user', content, createdAt: new Date().toISOString() });
      setInput('');
    },
    onSuccess: (res) => {
      qc.setQueryData<AiChat>(qk.aiChat(res.chat.id), res.chat);
      qc.invalidateQueries({ queryKey: qk.aiChats, exact: true });
    },
    onError: (e, content) => {
      setInput(content);
      toast.error(errorMessage(e));
    },
    onSettled: () => setPending(null),
  });

  const messages = [...(chat?.messages ?? []), ...(pending ? [pending] : [])];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, send.isPending]);

  const submit = (text = input) => {
    const v = text.trim();
    if (!v || send.isPending) return;
    send.mutate(v);
  };
  const newChat = () => {
    setChatId(undefined);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const starters = [t('ai.starters.s1'), t('ai.starters.s2'), t('ai.starters.s3'), t('ai.starters.s4')];

  return (
    <div className="container-page py-4 lg:py-6">
      <div className="card grid h-[calc(100vh-12rem)] min-h-[520px] overflow-hidden lg:h-[calc(100vh-14rem)] lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-border bg-surface-2/40 lg:block">
          <ChatList activeId={chatId} onSelect={setChatId} onNew={newChat} />
        </aside>
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label={t('ai.history')}>
              <PanelLeft />
            </Button>
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#7c3aed] text-white">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{chat?.title ?? t('ai.title')}</div>
              <div className="flex items-center gap-1.5 text-xs text-success">
                <span className="size-1.5 rounded-full bg-success" /> {t('ai.online')}
              </div>
            </div>
            <Button variant="ghost" size="sm" leftIcon={<MessageSquarePlus />} onClick={newChat} className="lg:hidden">
              {t('ai.newChat')}
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            {!messages.length ? (
              <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#7c3aed] text-white shadow-(--shadow-pop)">
                  <Sparkles className="size-8" />
                </span>
                <h1 className="mt-5 text-2xl font-bold">{t('ai.welcome', { name: user.fullName.split(' ')[0] })}</h1>
                <p className="mt-2 text-fg-muted">{t('ai.welcomeText')}</p>
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {starters.map((s) => (
                    <button key={s} onClick={() => submit(s)} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary-soft/40">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                {messages.map((m, i) => (
                  <div key={m.id} className={cn('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                    {m.role === 'user' ? (
                      <Avatar name={user.fullName} src={user.avatar} size={32} />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#7c3aed] text-white">
                        <Bot className="size-4" />
                      </span>
                    )}
                    <div className={cn('max-w-[85%] min-w-0', m.role === 'user' && 'text-right')}>
                      <div className={cn('inline-block rounded-2xl px-4 py-2.5 text-left text-sm', m.role === 'user' ? 'rounded-tr-md bg-primary text-primary-fg' : 'rounded-tl-md bg-surface-2 text-fg')}>
                        {m.role === 'assistant' ? <Markdown text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                      </div>
                      {m.productIds && m.productIds.length > 0 && <ProductChips ids={m.productIds} />}
                      {m.suggestions && i === messages.length - 1 && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {m.suggestions.map((s) => (
                            <button key={s} onClick={() => submit(s)} className="rounded-full border border-border bg-surface px-3 py-1 text-xs hover:border-primary hover:text-primary">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {send.isPending && (
                  <div className="flex gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#7c3aed] text-white">
                      <Bot className="size-4" />
                    </span>
                    <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3.5">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="size-1.5 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: `${d * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form
            className="border-t border-border p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border-strong bg-surface p-1.5 pl-4 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder={t('ai.placeholder')}
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm focus:outline-none"
              />
              <Button type="submit" size="icon" disabled={!input.trim() || send.isPending} aria-label={t('messages.send')}>
                <Send />
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-fg-subtle">{t('ai.disclaimer')}</p>
          </form>
        </section>
      </div>
      <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} side="left" title={t('ai.history')}>
        <ChatList
          activeId={chatId}
          onSelect={(id) => {
            setChatId(id);
            setSidebarOpen(false);
          }}
          onNew={newChat}
        />
      </Drawer>
    </div>
  );
}
