import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, Layers, Truck } from 'lucide-react';
import { useT } from '@/i18n';
import { Logo } from '@/components/layout/Logo';
import { PreferencesMenu } from '@/components/layout/HeaderControls';
import { motion } from 'motion/react';
import { Aurora, Stagger, StaggerItem } from '@/components/motion';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-fg-muted">
            <PreferencesMenu />
          </span>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-8">
            {children}
          </motion.div>
          {footer && <div className="mt-8 text-center text-sm text-fg-muted">{footer}</div>}
        </div>
        <p className="text-center text-xs text-fg-subtle">
          © {new Date().getFullYear()} B2B Bozor ·{' '}
          <Link to="/terms" className="hover:text-fg">
            {t('footer.terms')}
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="hover:text-fg">
            {t('footer.privacy')}
          </Link>
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b1739] via-[#1e3a8a] to-[#4338ca] lg:block">
        <Aurora className="opacity-50! mix-blend-screen" />
        <div className="absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.12)_1px,transparent_0)] [background-size:28px_28px]" />
        <div className="relative flex h-full flex-col justify-center p-14 text-white">
          <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-md text-4xl leading-tight font-extrabold">
            {t('auth.side.title')}
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-4 max-w-md text-white/70">
            {t('auth.side.text')}
          </motion.p>
          <Stagger as="ul" immediate stagger={0.12} className="mt-10 space-y-4">
            {[
              { icon: <BadgeCheck />, title: t('auth.side.p1'), text: t('auth.side.p1Text') },
              { icon: <Layers />, title: t('auth.side.p2'), text: t('auth.side.p2Text') },
              { icon: <Truck />, title: t('auth.side.p3'), text: t('auth.side.p3Text') },
            ].map((p) => (
              <StaggerItem as="li" key={p.title} className="flex max-w-md gap-4 rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur transition-colors hover:bg-white/12">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 [&_svg]:size-5">{p.icon}</span>
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-white/65">{p.text}</div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </div>
  );
}
