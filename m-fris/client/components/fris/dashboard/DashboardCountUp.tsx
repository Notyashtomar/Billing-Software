'use client';

import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { cn } from '@/lib/utils';

/** Skip CountUp during SSR — `react-countup` is stubbed out of the Worker graph. */
function useClientReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}

/** Slightly snappier than card flips so numbers finish before attention wanders. */
export const DASH_COUNT_DURATION_SEC = 1;

/** Em dash for “no value / zero” on dashboard cards. */
const DASH_PLACEHOLDER = '\u2014';

function isZeroish(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return Math.abs(n) < 1e-12;
}

type BaseProps = {
  className?: string;
  duration?: number;
};

export function DashCountInt({ end, className, duration = DASH_COUNT_DURATION_SEC }: BaseProps & { end: number }) {
  const client = useClientReady();
  // No data (non-finite) or an empty/zero count both render as a dash so a
  // station with no data yet shows "—" everywhere and fills in as data arrives.
  if (!Number.isFinite(end) || end === 0) {
    return <span className={cn('tabular-nums', className)}>{DASH_PLACEHOLDER}</span>;
  }
  if (!client) {
    return <span className={cn('tabular-nums', className)}>{end.toLocaleString()}</span>;
  }
  return (
    <CountUp
      end={end}
      duration={duration}
      separator=","
      preserveValue
      useEasing
      className={cn('tabular-nums', className)}
    />
  );
}

/** Matches `pct()` display (one decimal). Renders the numeric part only; append `%` via `suffix` or sibling. */
export function DashCountPct({ end, className, duration = DASH_COUNT_DURATION_SEC }: BaseProps & { end: number }) {
  const client = useClientReady();
  if (isZeroish(end)) {
    return <span className={cn('tabular-nums', className)}>{DASH_PLACEHOLDER}</span>;
  }
  if (!client) {
    return <span className={cn('tabular-nums', className)}>{end.toFixed(1)}%</span>;
  }
  return (
    <span className={cn('tabular-nums', className)}>
      <CountUp end={end} duration={duration} decimals={1} preserveValue useEasing />
      %
    </span>
  );
}

export function DashCountFixed({
  end,
  decimals,
  className,
  duration = DASH_COUNT_DURATION_SEC,
}: BaseProps & { end: number; decimals: number }) {
  const client = useClientReady();
  if (isZeroish(end)) {
    return <span className={cn('tabular-nums', className)}>{DASH_PLACEHOLDER}</span>;
  }
  if (!client) {
    return (
      <span className={cn('tabular-nums', className)}>{end.toFixed(decimals)}</span>
    );
  }
  return (
    <CountUp
      end={end}
      duration={duration}
      decimals={decimals}
      decimal="."
      preserveValue
      useEasing
      className={cn('tabular-nums', className)}
    />
  );
}

/** `a / b` with both integers animated (e.g. cancellations / total). */
export function DashIntSlashPair({
  left,
  right,
  className,
  duration = DASH_COUNT_DURATION_SEC,
}: BaseProps & { left: number; right: number }) {
  const client = useClientReady();
  const leftNode =
    left === 0 ? (
      DASH_PLACEHOLDER
    ) : !client ? (
      left.toLocaleString()
    ) : (
      <CountUp end={left} duration={duration} separator="," preserveValue useEasing />
    );
  const rightNode =
    right === 0 ? (
      DASH_PLACEHOLDER
    ) : !client ? (
      right.toLocaleString()
    ) : (
      <CountUp end={right} duration={duration} separator="," preserveValue useEasing />
    );
  return (
    <span className={cn('tabular-nums', className)}>
      {leftNode}
      <span className="mx-0.5 opacity-70">/</span>
      {rightNode}
    </span>
  );
}
