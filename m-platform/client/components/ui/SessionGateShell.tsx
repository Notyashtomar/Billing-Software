'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import type { SessionFailureReason } from '@/lib/session-fetch';
import { sessionFailureMessage } from '@/lib/session-fetch';

type Props = {
  phase: 'checking' | 'error';
  label?: string;
  reason?: SessionFailureReason;
  onRetry?: () => void;
  onSignIn?: () => void;
  signInLabel?: string;
  isDark?: boolean;
};

export function SessionGateShell({
  phase,
  label = 'Checking your session…',
  reason,
  onRetry,
  onSignIn,
  signInLabel = 'Go to sign in',
  isDark = false,
}: Props) {
  const bg = isDark ? 'bg-[#07090f]' : 'bg-slate-50';
  const text = isDark ? 'text-slate-200' : 'text-slate-700';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  if (phase === 'checking') {
    return (
      <div
        className={`flex min-h-dvh flex-col items-center justify-center gap-3 px-6 ${bg}`}
        role="status"
        aria-live="polite"
        suppressHydrationWarning
      >
        <Loader2
          className={`size-8 animate-spin ${isDark ? 'text-emerald-400' : 'text-emerald-500'}`}
          aria-hidden
        />
        <p className={`text-sm font-medium ${text}`} suppressHydrationWarning>
          {label}
        </p>
      </div>
    );
  }

  const message = reason ? sessionFailureMessage(reason) : sessionFailureMessage('invalid');

  return (
    <div
      className={`flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center ${bg}`}
      role="alert"
      suppressHydrationWarning
    >
      <p className={`max-w-md text-base font-medium ${text}`}>{message}</p>
      <p className={`max-w-sm text-sm ${muted}`}>
        If an administrator recently changed your account, sign in again to load your new access.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
              isDark
                ? 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
        ) : null}
        {onSignIn ? (
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            {signInLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
