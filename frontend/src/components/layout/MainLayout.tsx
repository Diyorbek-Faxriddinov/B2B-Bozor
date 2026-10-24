import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
  Bot,
  ChevronRight,
  ClipboardList,
  Heart,
  Home,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  MessageSquare,
  Phone,
  Search,
  ShoppingCart,
  Truck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth, homePathFor } from '@/stores/auth';
import { useCartCount } from '@/stores/cart';
import { useCategories, useUnreadMessages } from '@/api/hooks';
import { useFormat, useT } from '@/i18n';
import { SUPPORT } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { SearchBox } from './SearchBox';
import { NotificationsBell, PreferencesMenu, ThemeToggle, UserMenu } from './HeaderControls';
import { Footer } from './Footer';
import { Button, ButtonLink } from '../ui/button';
import { Drawer } from '../ui/overlay';
import { CategoryIcon } from '../catalog';
import { BackToTop } from '../motion';

function IconLink({ to, label, icon, badge }: { to: string; label: string; icon: React.ReactNode; badge?: number }) {
  return (
    <Link to={to} aria-label={label} title={label} className="relative flex size-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-5">
      {icon}
      {!!badge && (
        <span key={badge} className="bump absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function CategoryMenu() {
  const t = useT();
  const f = useFormat();
  const { data: categories } = useCategories();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <Button variant="primary" className="h-11 rounded-xl" leftIcon={<LayoutGrid />} onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)} aria-expanded={open}>
        {t('header.catalog')}
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-50 pt-2">
          <div className="grid w-[40rem] animate-slide-up grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-2 shadow-(--shadow-pop)">
            {categories?.map((c) => (
              <Link key={c.slug} to={`/catalog?category=${c.slug}`} className="group flex items-center gap-3 rounded-xl p-2.5 hover:bg-surface-2">
                <span className="flex size-10 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${c.color} 14%, transparent)`, color: c.color }}>
                  <CategoryIcon slug={c.slug} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg group-hover:text-primary">{f.text(c.name)}</span>
                  <span className="text-xs text-fg-subtle">{t('catalog.productsCount', { n: c.productsCount })}</span>
                </span>
              </Link>
            ))}
            <Link to="/catalog" className="col-span-2 mt-1 flex items-center justify-center gap-1 rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-primary hover:bg-surface-3">
              {t('header.allCategories')} <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  const t = useT();
  const f = useFormat();
  const user = useAuth((s) => s.user);
  const cartCount = useCartCount();
  const { data: unread } = useUnreadMessages();
  const { data: categories } = useCategories();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const showCart = !user || user.role === 'buyer';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  return (
    <header className={cn('sticky top-0 z-40 border-b transition-[box-shadow,background-color,border-color] duration-300', scrolled ? 'glass border-border shadow-(--shadow-pop)' : 'border-border bg-surface')}>
      {/* top bar — collapses once the page is scrolled */}
      <div className={cn('hidden overflow-hidden border-border bg-surface-2/60 text-xs text-fg-muted transition-[max-height,opacity,border-width] duration-300 md:block', scrolled ? 'max-h-0 border-b-0 opacity-0' : 'max-h-9 border-b opacity-100')}>
        <div className="container-page flex h-9 items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <Truck className="size-3.5" /> {t('header.topDelivery')}
            </span>
            <a href={SUPPORT.phoneHref} className="inline-flex items-center gap-1.5 hover:text-fg">
              <Phone className="size-3.5" /> {SUPPORT.phone}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/suppliers" className="hover:text-fg">
              {t('nav.suppliers')}
            </Link>
            {(!user || user.role !== 'seller') && (
              <Link to="/register?role=seller" className="hover:text-fg">
                {t('header.becomeSeller')}
              </Link>
            )}
            <Link to="/help" className="hover:text-fg">
              {t('nav.help')}
            </Link>
            <PreferencesMenu />
          </div>
        </div>
      </div>

      {/* main bar */}
      <div className={cn('container-page flex items-center gap-3 transition-[height] duration-300 lg:gap-5', scrolled ? 'h-14 lg:h-16' : 'h-16 lg:h-[72px]')}>
        <button className="-ml-2 flex size-10 items-center justify-center rounded-lg text-fg hover:bg-surface-2 lg:hidden" onClick={() => setMenuOpen(true)} aria-label={t('header.menu')}>
          <Menu className="size-5" />
        </button>
        <Logo />
        <div className="hidden lg:block">
          <CategoryMenu />
        </div>
        <SearchBox className="hidden flex-1 md:block" />
        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <button className="flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 md:hidden" onClick={() => setSearchOpen((s) => !s)} aria-label={t('header.search')}>
            <Search className="size-5" />
          </button>
          {user ? (
            <>
              <span className="hidden sm:contents">
                <IconLink to="/assistant" label={t('header.assistant')} icon={<Bot />} />
                <IconLink to="/messages" label={t('account.nav.messages')} icon={<MessageSquare />} badge={unread?.count} />
              </span>
              <NotificationsBell />
              {user.role === 'buyer' && (
                <span className="hidden sm:contents">
                  <IconLink to="/account/favorites" label={t('account.nav.favorites')} icon={<Heart />} />
                </span>
              )}
            </>
          ) : (
            <span className="hidden sm:contents">
              <ThemeToggle />
            </span>
          )}
          {showCart && <IconLink to="/cart" label={t('nav.cart')} icon={<ShoppingCart />} badge={cartCount} />}
          {user && user.role !== 'buyer' && (
            <ButtonLink to={homePathFor(user)} variant="soft" size="sm" className="ml-1 hidden xl:inline-flex" leftIcon={<LayoutDashboard />}>
              {t('header.dashboard')}
            </ButtonLink>
          )}
          <div className="ml-1.5">
            {user ? (
              <UserMenu />
            ) : (
              <div className="flex items-center gap-2">
                <ButtonLink to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  {t('auth.login')}
                </ButtonLink>
                <ButtonLink to="/register" size="sm" className="hidden sm:inline-flex">
                  {t('auth.register')}
                </ButtonLink>
                <ButtonLink to="/login" size="sm" className="sm:hidden">
                  {t('auth.login')}
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="container-page pb-3 md:hidden">
          <SearchBox autoFocus onDone={() => setSearchOpen(false)} />
        </div>
      )}

      {/* category strip */}
      <div className={cn('hidden overflow-hidden border-border transition-[max-height,opacity] duration-300 lg:block', scrolled ? 'max-h-0 opacity-0' : 'max-h-11 border-t opacity-100')}>
        <nav className="container-page scrollbar-none flex h-11 items-center gap-1 overflow-x-auto text-sm">
          {categories?.map((c) => (
            <NavLink
              key={c.slug}
              to={`/catalog?category=${c.slug}`}
              className={() =>
                cn(
                  'shrink-0 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors',
                  location.pathname === '/catalog' && location.search.includes(`category=${c.slug}`) ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              {f.text(c.name)}
            </NavLink>
          ))}
        </nav>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const user = useAuth((s) => s.user);
  const { data: categories } = useCategories();
  const link = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-2 [&_svg]:size-4.5 [&_svg]:text-fg-subtle';
  return (
    <Drawer open={open} onClose={onClose} side="left" title={<Logo />}>
      <div className="space-y-5 p-3">
        {!user && (
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink to="/login" variant="outline">
              {t('auth.login')}
            </ButtonLink>
            <ButtonLink to="/register">{t('auth.register')}</ButtonLink>
          </div>
        )}
        <nav className="space-y-0.5">
          <Link to="/" className={link}>
            <Home /> {t('nav.home')}
          </Link>
          <Link to="/catalog" className={link}>
            <LayoutGrid /> {t('header.catalog')}
          </Link>
          <Link to="/suppliers" className={link}>
            <Truck /> {t('nav.suppliers')}
          </Link>
          {user && user.role !== 'buyer' && (
            <Link to={homePathFor(user)} className={link}>
              <LayoutDashboard /> {t('header.dashboard')}
            </Link>
          )}
          {user && (
            <>
              <Link to="/messages" className={link}>
                <MessageSquare /> {t('account.nav.messages')}
              </Link>
              <Link to="/assistant" className={link}>
                <Bot /> {t('header.assistant')}
              </Link>
            </>
          )}
          {user?.role === 'buyer' && (
            <>
              <Link to="/account/orders" className={link}>
                <ClipboardList /> {t('account.nav.orders')}
              </Link>
              <Link to="/account/favorites" className={link}>
                <Heart /> {t('account.nav.favorites')}
              </Link>
            </>
          )}
        </nav>
        <div>
          <div className="mb-1.5 px-3 text-xs font-semibold text-fg-subtle uppercase">{t('header.categories')}</div>
          {categories?.map((c) => (
            <Link key={c.slug} to={`/catalog?category=${c.slug}`} className={link}>
              <CategoryIcon slug={c.slug} />
              {f.text(c.name)}
            </Link>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          {t('settings.preferences')}
          <PreferencesMenu compact />
        </div>
      </div>
    </Drawer>
  );
}

function TabBarLink({ to, end, icon, label, badge }: { to: string; end?: boolean; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors [&_svg]:size-5', isActive ? 'text-primary' : 'text-fg-subtle')}
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tabbar-indicator" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
          <motion.span animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 28 }}>
            {icon}
          </motion.span>
          {!!badge && (
            <span key={badge} className="bump absolute top-1 left-1/2 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
          {label}
        </>
      )}
    </NavLink>
  );
}

function MobileTabBar() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const cartCount = useCartCount();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      <TabBarLink to="/" end icon={<Home />} label={t('nav.home')} />
      <TabBarLink to="/catalog" icon={<LayoutGrid />} label={t('header.catalog')} />
      {(!user || user.role === 'buyer') && <TabBarLink to="/cart" icon={<ShoppingCart />} label={t('nav.cart')} badge={cartCount} />}
      {user && user.role !== 'buyer' ? (
        <TabBarLink to={homePathFor(user)} icon={<LayoutDashboard />} label={t('header.dashboard')} />
      ) : (
        <TabBarLink to={user ? '/account/orders' : '/login'} icon={<ClipboardList />} label={t('account.nav.orders')} />
      )}
      <TabBarLink to={user ? '/account/profile' : '/login'} icon={<UserIcon />} label={t('header.account')} />
    </nav>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.21, 0.8, 0.27, 1] }}>
      {children}
    </motion.div>
  );
}

export function MainLayout() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 pb-20 md:pb-0">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <BackToTop label={t('common.backToTop')} />
      <Footer />
      <MobileTabBar />
    </div>
  );
}
