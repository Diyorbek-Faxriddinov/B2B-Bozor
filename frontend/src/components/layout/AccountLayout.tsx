import { NavLink, Outlet } from 'react-router';
import { motion } from 'motion/react';
import { Bell, ClipboardList, FileText, Heart, LayoutDashboard, MessageSquare, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useNotifications, useUnreadMessages } from '@/api/hooks';
import { useT, useTd } from '@/i18n';
import { cn } from '@/lib/utils';
import { Avatar } from '../ui/display';

export function AccountLayout() {
  const t = useT();
  const td = useTd();
  const user = useAuth((s) => s.user)!;
  const { data: notif } = useNotifications();
  const { data: unread } = useUnreadMessages();
  const isBuyer = user.role === 'buyer';

  const items = [
    ...(isBuyer
      ? [
          { to: '/account', label: t('account.nav.overview'), icon: <LayoutDashboard />, end: true },
          { to: '/account/orders', label: t('account.nav.orders'), icon: <ClipboardList /> },
          { to: '/account/rfqs', label: t('account.nav.rfqs'), icon: <FileText /> },
          { to: '/account/favorites', label: t('account.nav.favorites'), icon: <Heart /> },
        ]
      : []),
    { to: '/messages', label: t('account.nav.messages'), icon: <MessageSquare />, badge: unread?.count },
    { to: '/notifications', label: t('notifications.title'), icon: <Bell />, badge: notif?.unread },
    { to: '/account/profile', label: t('account.nav.profile'), icon: <UserIcon /> },
    { to: '/account/settings', label: t('account.nav.settings'), icon: <Settings /> },
  ];

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-40 lg:self-start">
          <div className="card hidden items-center gap-3 p-4 lg:flex">
            <Avatar name={user.fullName} src={user.avatar} size={44} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.fullName}</div>
              <div className="truncate text-xs text-fg-subtle">{user.organization ?? td(`roles.${user.role}`)}</div>
            </div>
          </div>
          <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:card lg:mx-0 lg:mt-3 lg:flex-col lg:p-2">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors lg:border-0 [&_svg]:size-4',
                    isActive ? 'border-transparent text-primary-soft-fg' : 'border-border text-fg-muted hover:bg-surface-2 hover:text-fg max-lg:bg-surface',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="account-nav" className="absolute inset-0 rounded-lg bg-primary-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <span className="relative z-10 flex flex-1 items-center gap-2.5">
                      {it.icon}
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && <span className="rounded-full bg-danger px-1.5 text-[10px] leading-4 font-bold text-white">{it.badge}</span>}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
