'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Scroll the nearest scroll container so validation/API errors stay visible. */
export function useScrollToError(error: string | null | undefined) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const message = String(error ?? '').trim();
    if (!message) return;

    const frame = window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [error]);

  return ref;
}

type ScrollToErrorProps = {
  error: string | null | undefined;
  className?: string;
  children: ReactNode;
};

/** Wrap existing error markup; scrolls into view when `error` is set. */
export function ScrollToError({ error, className, children }: ScrollToErrorProps) {
  const ref = useScrollToError(error);
  const message = String(error ?? '').trim();
  if (!message) return null;

  return (
    <div ref={ref} role="alert" className={className}>
      {children}
    </div>
  );
}

type FormErrorAlertProps = {
  error: string | null | undefined;
  className?: string;
  isDark?: boolean;
};

export function FormErrorAlert({ error, className, isDark }: FormErrorAlertProps) {
  const ref = useScrollToError(error);
  const message = String(error ?? '').trim();
  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'rounded-xl border p-3 text-sm',
        isDark
          ? 'border-rose-400/20 bg-rose-500/10 text-rose-200'
          : 'border-rose-200 bg-rose-50 text-rose-800',
        className,
      )}
    >
      {message}
    </div>
  );
}
