'use client';

import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export type CountUpFormat = 'int' | 'inr' | 'pct' | 'plain';

function formatCount(n: number, format: CountUpFormat, decimals: number): string {
  if (format === 'inr') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  }
  if (format === 'pct') {
    return `${n.toFixed(decimals)}%`;
  }
  if (format === 'int') {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  }
  return n.toFixed(decimals);
}

type Props = {
  to: number;
  format?: CountUpFormat;
  decimals?: number;
  durationMs?: number;
  className?: string;
  /** Static fallback before mount / reduced motion */
  fallback?: string;
};

/**
 * Animates a number from 0 → target on mount (count series).
 * Respects prefers-reduced-motion.
 */
export function InsightsCountUp({
  to,
  format = 'int',
  decimals = 0,
  durationMs = 1100,
  className,
  fallback,
}: Props) {
  const [display, setDisplay] = useState(() =>
    fallback ?? formatCount(0, format, decimals),
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (prefersReducedMotion()) {
      setDisplay(fallback ?? formatCount(to, format, decimals));
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(formatCount(to * eased, format, decimals));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(fallback ?? formatCount(to, format, decimals));
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, format, decimals, durationMs, fallback]);

  return (
    <span className={className} aria-label={fallback ?? formatCount(to, format, decimals)}>
      {display}
    </span>
  );
}
