import { Home, Search } from 'lucide-react';
import { useT } from '@/i18n';
import { ButtonLink } from '@/components/ui/button';
import { motion } from 'motion/react';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
        className="text-[7rem] leading-none font-black tracking-tighter sm:text-[9rem]"
      >
        <span className="float-slow text-gradient inline-block">404</span>
      </motion.div>
      <h1 className="mt-4 text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 max-w-md text-fg-muted">{t('notFound.text')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <ButtonLink to="/" leftIcon={<Home />}>
          {t('notFound.home')}
        </ButtonLink>
        <ButtonLink to="/catalog" variant="outline" leftIcon={<Search />}>
          {t('header.catalog')}
        </ButtonLink>
      </div>
    </div>
  );
}
