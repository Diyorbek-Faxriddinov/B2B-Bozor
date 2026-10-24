/**
 * Motion primitives built on `motion/react`. All of them respect the OS
 * "reduce motion" setting through <MotionConfig reducedMotion="user"> in main.tsx.
 */
import { Children, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { animate, AnimatePresence, motion, useInView, useReducedMotion, useScroll, useSpring, type Variants } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const EASE = [0.21, 0.8, 0.27, 1] as const;

/* ---------- Reveal on scroll ---------- */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  x = 0,
  scale = 1,
  once = true,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
  scale?: number;
  once?: boolean;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y, x, scale }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once, amount: 0.15, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/* ---------- Staggered children ---------- */
const containerV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const itemV: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function Stagger({ children, className, stagger = 0.06, as = 'div', immediate }: { children: ReactNode; className?: string; stagger?: number; as?: 'div' | 'ul'; immediate?: boolean }) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      initial="hidden"
      {...(immediate ? { animate: 'show' } : { whileInView: 'show', viewport: { once: true, amount: 0.1 } })}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp className={className} variants={itemV}>
      {children}
    </Comp>
  );
}
export { containerV as staggerContainer, itemV as staggerItem };

/* ---------- Animated number ---------- */
const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');

export function CountUp({ to, duration = 1.4, format = defaultFormat, className, from = 0 }: { to: number; duration?: number; format?: (n: number) => string; className?: string; from?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(from);
  const prev = useRef(from);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setValue(to);
      prev.current = to;
      return;
    }
    const controls = animate(prev.current, to, { duration, ease: EASE, onUpdate: setValue });
    prev.current = to;
    return () => controls.stop();
  }, [inView, to, duration, reduce]);
  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(value)}
    </span>
  );
}

/* ---------- Infinite marquee ---------- */
export function Marquee({ children, duration = 40, reverse, className, gap = '1rem' }: { children: ReactNode; duration?: number; reverse?: boolean; className?: string; gap?: string }) {
  const items = Children.toArray(children);
  return (
    <div className={cn('group/marquee marquee-mask overflow-hidden', className)}>
      <div className={cn('marquee', reverse && 'marquee-reverse')} style={{ '--marquee-duration': `${duration}s`, '--marquee-gap': gap } as CSSProperties}>
        {items}
        {/* duplicate for a seamless loop */}
        {items.map((c, i) => (
          <div key={`dup-${i}`} aria-hidden className="contents">
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Cursor spotlight ---------- */
export function Spotlight({ as: Comp = 'div', className, color, children, ...rest }: { as?: ElementType; className?: string; color?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Comp
      className={cn('spotlight', className)}
      style={color ? ({ '--spot-color': color } as CSSProperties) : undefined}
      onMouseMove={(e: React.MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
      }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/* ---------- Animated border ---------- */
export function BorderBeam({ duration = 6, width = 1.5, from, to, className }: { duration?: number; width?: number; from?: string; to?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('border-beam', className)}
      style={{ '--beam-duration': `${duration}s`, '--beam-width': `${width}px`, ...(from && { '--beam-from': from }), ...(to && { '--beam-to': to }) } as CSSProperties}
    />
  );
}

/* ---------- Rotating headline words ---------- */
export function RotatingWords({ words, interval = 2600, className }: { words: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval, reduce]);
  return (
    <span className="relative inline-grid max-w-full align-bottom">
      {/* every word sits invisibly in the same cell, so the box always fits the widest/tallest one — no layout jumps */}
      {words.map((w) => (
        <span key={w} aria-hidden className={cn('invisible col-start-1 row-start-1', className)}>
          {w}
        </span>
      ))}
      {/* "wait": the old word fully leaves before the next one enters, so they never overlap */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[i]}
          className={cn('col-start-1 row-start-1', className)}
          initial={{ y: '0.35em', opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)', transition: { duration: 0.38, ease: EASE } }}
          exit={{ y: '-0.35em', opacity: 0, filter: 'blur(4px)', transition: { duration: 0.22, ease: 'easeIn' } }}
        >
          {words[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ---------- Backgrounds ---------- */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('aurora', className)}>
      <span />
      <span />
      <span />
    </div>
  );
}

export function GridBackdrop({ className, dots }: { className?: string; dots?: boolean }) {
  return <div aria-hidden className={cn('pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_72%)]', dots ? 'bg-dots' : 'bg-grid', className)} />;
}

/* ---------- Page chrome ---------- */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return <motion.div aria-hidden className={cn('fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-primary via-[#7c3aed] to-accent', className)} style={{ scaleX }} />;
}

export function BackToTop({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed right-4 bottom-24 z-40 flex size-11 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-(--shadow-pop) md:right-6 md:bottom-6"
          aria-label={label}
        >
          <ArrowUp className="size-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** Animated SVG check — for success states. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <motion.svg viewBox="0 0 52 52" className={cn('size-16', className)} initial="hidden" animate="show">
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { duration: 0.6, ease: EASE } } }}
      />
      <motion.path
        d="M15 27l7 7 15-15"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { delay: 0.45, duration: 0.4, ease: EASE } } }}
      />
    </motion.svg>
  );
}

/** One-shot confetti burst (CSS-free, motion-driven). */
export function Confetti({ count = 36 }: { count?: number }) {
  const reduce = useReducedMotion();
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 520,
      y: -Math.random() * 260 - 80,
      r: Math.random() * 540 - 270,
      color: ['#1d4ed8', '#f59e0b', '#16a34a', '#db2777', '#7c3aed', '#0ea5e9'][i % 6],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 0.15,
    })),
  );
  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{ width: p.size, height: p.size * 0.6, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 420], opacity: [1, 1, 0], rotate: p.r }}
          transition={{ duration: 2.2, delay: p.delay, ease: 'easeOut', times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  );
}
