import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ArrowUpRight, Menu, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { useT } from '@/i18n';
import { useUnreadMessages } from '@/api/hooks';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { NotificationsBell, PreferencesMenu, ThemeToggle, UserMenu } from './HeaderControls';
import { Drawer } from '../ui/overlay';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
}

function SidebarNav({ items, title }: { items: NavItem[]; title: string }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-2 pb-3 text-xs font-semibold tracking-wider text-fg-subtle uppercase">{title}</div>
      <nav className="flex-1 space-y-0.5 px-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4.5',
                isActive ? 'text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId={`side-${title}`} className="absolute inset-0 rounded-lg bg-primary-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative z-10 flex flex-1 items-center gap-3">
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {!!it.badge && <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">{it.badge}</span>}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <Link to="/" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
          {t('dashboard.toMarketplace')}
          <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function DashboardLayout({ items, title }: { items: NavItem[]; title: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { data: unread } = useUnreadMessages();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <SidebarNav items={items} title={title} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button className="-ml-2 flex size-10 items-center justify-center rounded-lg hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t('header.menu')}>
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden text-fg-muted sm:block">
              <PreferencesMenu />
            </span>
            <ThemeToggle />
            <Link to="/messages" className="relative flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={t('account.nav.messages')}>
              <MessageSquare className="size-5" />
              {!!unread?.count && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" />}
            </Link>
            <NotificationsBell />
            <div className="ml-1">
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <motion.div key={location.pathname} className="mx-auto max-w-7xl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title={<Logo />}>
        <div className="py-3">
          <SidebarNav items={items} title={title} />
        </div>
      </Drawer>
    </div>
  );
}
