import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bot,
  Check,
  ClipboardList,
  FileText,
  Globe,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Package,
  Settings,
  Star,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { notificationsApi, authApi } from '@/api/endpoints';
import { qk, useNotifications } from '@/api/hooks';
import { useAuth, homePathFor } from '@/stores/auth';
import { useSettings, type Theme } from '@/stores/settings';
import { useCart } from '@/stores/cart';
import { LOCALES, useFormat, useT, useTd } from '@/i18n';
import { cn } from '@/lib/utils';
import { Dropdown, MenuItem } from '../ui/overlay';
import { Avatar } from '../ui/display';
import { Button } from '../ui/button';
import type { Currency, NotificationType } from '@/types';

export function useLogout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    authApi.logout().catch(() => undefined);
    useAuth.getState().logout();
    useCart.getState().clear();
    qc.clear();
    navigate('/');
  };
}

const NOTIF_ICON: Record<NotificationType, typeof Bell> = {
  order: Package,
  rfq: FileText,
  message: MessageSquare,
  system: Bell,
  review: Star,
};

export function NotificationsBell() {
  const t = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useNotifications();
  const readAll = useMutation({ mutationFn: notificationsApi.readAll, onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }) });
  const unread = data?.unread ?? 0;

  return (
    <Dropdown
      className="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('notifications.title')} className="relative">
          <Bell className="size-5!" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-semibold">{t('notifications.title')}</span>
            {unread > 0 && (
              <button className="text-xs font-medium text-primary hover:underline" onClick={() => readAll.mutate()}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-1.5">
            {!data?.items.length && <p className="px-3 py-8 text-center text-sm text-fg-muted">{t('notifications.empty')}</p>}
            {data?.items.slice(0, 8).map((n) => {
              const Icon = NOTIF_ICON[n.type];
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    close();
                    if (!n.read) notificationsApi.read(n.id).then(() => qc.invalidateQueries({ queryKey: qk.notifications }));
                    if (n.link) navigate(n.link);
                  }}
                  className={cn('flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-surface-2', !n.read && 'bg-primary-soft/40')}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      {n.title}
                      {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="line-clamp-2 text-xs text-fg-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-fg-subtle">{f.relative(n.createdAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Link to="/notifications" onClick={close} className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-surface-2">
            {t('notifications.viewAll')}
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

export function UserMenu() {
  const t = useT();
  const td = useTd();
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  const logout = useLogout();
  const isBuyer = user.role === 'buyer';
  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-full p-0.5 hover:bg-surface-2 lg:rounded-xl lg:py-1 lg:pr-2.5 lg:pl-1" aria-label={t('header.account')}>
          <Avatar name={user.fullName} src={user.avatar} size={34} />
          <span className="hidden text-left lg:block">
            <span className="block max-w-32 truncate text-sm leading-tight font-semibold text-fg">{user.fullName.split(' ')[0]}</span>
            <span className="block text-xs leading-tight text-fg-subtle">{td(`roles.${user.role}`)}</span>
          </span>
        </button>
      )}
    >
      {(close) => {
        const go = (to: string) => {
          close();
          navigate(to);
        };
        return (
          <>
            <div className="mb-1 border-b border-border px-2.5 pt-1 pb-2.5">
              <div className="truncate text-sm font-semibold">{user.fullName}</div>
              <div className="truncate text-xs text-fg-subtle">{user.email}</div>
            </div>
            {!isBuyer && (
              <MenuItem icon={<LayoutDashboard />} onClick={() => go(homePathFor(user))}>
                {t('header.dashboard')}
              </MenuItem>
            )}
            {isBuyer && (
              <>
                <MenuItem icon={<ClipboardList />} onClick={() => go('/account/orders')}>
                  {t('account.nav.orders')}
                </MenuItem>
                <MenuItem icon={<FileText />} onClick={() => go('/account/rfqs')}>
                  {t('account.nav.rfqs')}
                </MenuItem>
                <MenuItem icon={<Heart />} onClick={() => go('/account/favorites')}>
                  {t('account.nav.favorites')}
                </MenuItem>
              </>
            )}
            <MenuItem icon={<MessageSquare />} onClick={() => go('/messages')}>
              {t('account.nav.messages')}
            </MenuItem>
            <MenuItem icon={<Bot />} onClick={() => go('/assistant')}>
              {t('header.assistant')}
            </MenuItem>
            <MenuItem icon={<UserIcon />} onClick={() => go('/account/profile')}>
              {t('account.nav.profile')}
            </MenuItem>
            <MenuItem icon={<Settings />} onClick={() => go('/account/settings')}>
              {t('account.nav.settings')}
            </MenuItem>
            <div className="my-1 border-t border-border" />
            <MenuItem
              icon={<LogOut />}
              danger
              onClick={() => {
                close();
                logout();
              }}
            >
              {t('auth.logout')}
            </MenuItem>
          </>
        );
      }}
    </Dropdown>
  );
}

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];
const CURRENCIES: Currency[] = ['UZS', 'USD', 'RUB'];

export function PreferencesMenu({ compact }: { compact?: boolean }) {
  const t = useT();
  const { locale, currency, theme, setLocale, setCurrency, setTheme } = useSettings();
  return (
    <Dropdown
      className="w-64"
      trigger={({ toggle }) => (
        <button onClick={toggle} className={cn('inline-flex items-center gap-1.5 rounded-md text-xs font-medium hover:text-fg', compact ? 'px-1' : 'px-2 py-1')} aria-label={t('settings.preferences')}>
          <Globe className="size-3.5" />
          {LOCALES.find((l) => l.code === locale)?.short} · {currency}
        </button>
      )}
    >
      <div className="space-y-3 p-1.5">
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-subtle uppercase">{t('settings.language')}</div>
          {LOCALES.map((l) => (
            <MenuItem key={l.code} active={l.code === locale} onClick={() => setLocale(l.code)} icon={l.code === locale ? <Check /> : <span className="size-4" />}>
              {l.label}
            </MenuItem>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-subtle uppercase">{t('settings.currency')}</div>
          <div className="grid grid-cols-3 gap-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn('rounded-lg py-1.5 text-xs font-semibold', c === currency ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted hover:text-fg')}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-fg-subtle uppercase">{t('settings.theme')}</div>
          <div className="grid grid-cols-3 gap-1">
            {THEMES.map(({ value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium',
                  value === theme ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-4" />
                {t(`settings.themes.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dropdown>
  );
}

export function ThemeToggle() {
  const t = useT();
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const isDark = document.documentElement.classList.contains('dark');
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={t('settings.theme')} data-theme={theme}>
      {isDark ? <Sun className="size-5!" /> : <Moon className="size-5!" />}
    </Button>
  );
}
