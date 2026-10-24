import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Textarea } from './form';
import { useT } from '@/i18n';

function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onClose]);
}

function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = el.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not([data-close])');
    (focusable ?? el).focus();
    return () => prev?.focus?.();
  }, [active]);
  return ref;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-(--shadow-pop) outline-none sm:rounded-2xl', width)}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
                </div>
                <Button data-close variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                  <X />
                </Button>
              </div>
            )}
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  const offset = side === 'right' ? '100%' : '-100%';
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000]">
          <motion.div className="absolute inset-0 bg-black/50" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ x: offset }}
            animate={{ x: 0 }}
            exit={{ x: offset }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className={cn('absolute top-0 flex h-full w-[88%] max-w-sm flex-col bg-surface shadow-(--shadow-pop) outline-none', side === 'right' ? 'right-0' : 'left-0', className)}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="font-semibold">{title}</div>
              <Button data-close variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------- Confirm dialog (promise based) ---------- */
interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** Ask for a free-text reason; resolves with the text. */
  withReason?: boolean;
  reasonPlaceholder?: string;
}
type ConfirmFn = (opts: ConfirmOptions) => Promise<false | { reason: string }>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: false | { reason: string }) => void }) | null>(null);
  const [reason, setReason] = useState('');

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise((resolve) => {
        setReason('');
        setState({ ...opts, resolve });
      }),
    [],
  );

  const close = (v: false | { reason: string }) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.cancelText ?? t('common.cancel')}
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close({ reason: reason.trim() })}>
              {state?.confirmText ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex gap-3.5">
          {state?.danger && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-fg">{state?.title}</h3>
            {state?.description && <p className="mt-1 text-sm text-fg-muted">{state.description}</p>}
            {state?.withReason && (
              <Textarea
                className="mt-3 min-h-20"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={state.reasonPlaceholder}
                autoFocus
              />
            )}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

/* ---------- Popover / dropdown ---------- */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = !!pos;
  const close = useCallback(() => setPos(null), []);

  const toggle = () => {
    if (pos) return setPos(null);
    const r = ref.current!.getBoundingClientRect();
    const top = r.bottom + 8;
    setPos({
      top,
      maxHeight: Math.max(200, window.innerHeight - top - 12),
      ...(align === 'end' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
    });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onScroll = (e: Event) => !menuRef.current?.contains(e.target as Node) && close();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle })}
      {pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right, maxHeight: pos.maxHeight }}
            className={cn('z-[900] min-w-52 animate-slide-up overflow-y-auto rounded-xl border border-border bg-surface p-1.5 text-fg shadow-(--shadow-pop)', className)}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  active,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
        danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-surface-2',
        active && 'bg-surface-2 font-medium',
        className,
      )}
    >
      {icon && <span className={danger ? '' : 'text-fg-subtle'}>{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
}
