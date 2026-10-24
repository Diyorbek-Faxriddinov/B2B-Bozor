import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Mail, MapPin, Phone, Send } from 'lucide-react';
import { miscApi } from '@/api/endpoints';
import { useT } from '@/i18n';
import { SUPPORT } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { Logo } from './Logo';
import { Button } from '../ui/button';
import { Input } from '../ui/form';

function Social({ href, label, path }: { href: string; label: string; path: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-fg-muted transition-colors hover:bg-primary hover:text-primary-fg">
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
        <path d={path} />
      </svg>
    </a>
  );
}

export function Footer() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await miscApi.newsletter(email);
      toast.success(t('footer.subscribed'));
      setEmail('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const col = 'space-y-2.5 text-sm';
  const a = 'text-fg-muted transition-colors hover:text-fg';
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-fg-muted">{t('footer.about')}</p>
          <div className="mt-5 flex gap-2">
            <Social href={SUPPORT.telegram} label="Telegram" path="M9.04 15.6 8.9 19.5c.43 0 .62-.18.84-.4l2-1.92 4.16 3.04c.76.42 1.3.2 1.5-.7l2.72-12.76c.25-1.12-.4-1.56-1.14-1.28L3.3 9.8c-1.08.42-1.06 1.02-.18 1.3l4.08 1.27 9.46-5.96c.45-.28.86-.12.52.17z" />
            <Social href="https://instagram.com" label="Instagram" path="M12 2.2c3.2 0 3.58 0 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s0-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zm0 4.86a4.94 4.94 0 1 0 0 9.88 4.94 4.94 0 0 0 0-9.88zm0 8.15a3.21 3.21 0 1 1 0-6.42 3.21 3.21 0 0 1 0 6.42zm5.14-9.5a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z" />
            <Social href="https://facebook.com" label="Facebook" path="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
            <Social href="https://youtube.com" label="YouTube" path="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
          </div>
        </div>
        <div>
          <h4 className="mb-3.5 text-sm font-semibold text-fg">{t('footer.buyers')}</h4>
          <ul className={col}>
            <li><Link to="/catalog" className={a}>{t('header.catalog')}</Link></li>
            <li><Link to="/suppliers" className={a}>{t('nav.suppliers')}</Link></li>
            <li><Link to="/account/rfqs" className={a}>{t('footer.rfq')}</Link></li>
            <li><Link to="/help#delivery" className={a}>{t('footer.delivery')}</Link></li>
            <li><Link to="/help#payment" className={a}>{t('footer.payment')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3.5 text-sm font-semibold text-fg">{t('footer.sellers')}</h4>
          <ul className={col}>
            <li><Link to="/register?role=seller" className={a}>{t('header.becomeSeller')}</Link></li>
            <li><Link to="/seller" className={a}>{t('footer.sellerPanel')}</Link></li>
            <li><Link to="/register?role=courier" className={a}>{t('footer.becomeCourier')}</Link></li>
            <li><Link to="/help#sellers" className={a}>{t('footer.sellerGuide')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3.5 text-sm font-semibold text-fg">{t('footer.company')}</h4>
          <ul className={col}>
            <li><Link to="/about" className={a}>{t('nav.about')}</Link></li>
            <li><Link to="/contact" className={a}>{t('nav.contact')}</Link></li>
            <li><Link to="/help" className={a}>{t('nav.help')}</Link></li>
            <li><Link to="/terms" className={a}>{t('footer.terms')}</Link></li>
            <li><Link to="/privacy" className={a}>{t('footer.privacy')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3.5 text-sm font-semibold text-fg">{t('footer.newsletter')}</h4>
          <p className="mb-3 text-sm text-fg-muted">{t('footer.newsletterText')}</p>
          <form onSubmit={subscribe} className="flex gap-2">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@kompaniya.uz" aria-label="Email" />
            <Button type="submit" size="icon" loading={loading} aria-label={t('footer.subscribe')}>
              {!loading && <Send />}
            </Button>
          </form>
          <ul className="mt-5 space-y-2 text-sm text-fg-muted">
            <li className="flex items-center gap-2"><Phone className="size-4 shrink-0" /><a href={SUPPORT.phoneHref} className="hover:text-fg">{SUPPORT.phone}</a></li>
            <li className="flex items-center gap-2"><Mail className="size-4 shrink-0" /><a href={`mailto:${SUPPORT.email}`} className="hover:text-fg">{SUPPORT.email}</a></li>
            <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" />{SUPPORT.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-fg-subtle sm:flex-row">
          <p>© {new Date().getFullYear()} B2B Bozor. {t('footer.rights')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {['Uzcard', 'Humo', 'Visa', 'Mastercard', 'Click', 'Payme'].map((p) => (
              <span key={p} className="rounded-md border border-border px-2 py-1 font-semibold text-fg-muted">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
