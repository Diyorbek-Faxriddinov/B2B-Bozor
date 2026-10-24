import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M9 8.5h7.5a4 4 0 0 1 0 8H9zM9 16.5h8.5a4 4 0 0 1 0 8H9z" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24.5" cy="8.5" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('flex shrink-0 items-center gap-2', className)} aria-label="B2B Bozor">
      <LogoMark />
      <span className="text-lg leading-none font-extrabold tracking-tight text-fg">
        B2B<span className="text-primary">Bozor</span>
      </span>
    </Link>
  );
}
