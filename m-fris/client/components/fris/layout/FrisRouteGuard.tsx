'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SessionGateShell } from '@/components/ui/SessionGateShell';
import { getApiBase } from '@/lib/api';
import {
  clearFrisSession,
  hasCachedFrisSession,
  validateFrisSession,
  type FrisSessionValidation,
} from '@/lib/fris-session';
import type { SessionFailureReason } from '@/lib/session-fetch';

type Props = {
  children: React.ReactNode;
};

type GateStatus = 'checking' | 'allowed' | 'redirecting' | 'error';

function buildLoginRedirectUrl(
  pathname: string | null,
  reason?: SessionFailureReason,
): string {
  const params = new URLSearchParams();
  const isBilling = pathname?.startsWith('/billing') === true;
  // Billing has its own login UI; keep FRIS routes on /login.
  if (pathname?.startsWith('/fris')) {
    params.set('next', pathname);
  } else if (isBilling && pathname !== '/billing/login') {
    params.set('next', pathname);
  }
  if (reason === 'expired' || reason === 'forbidden') {
    params.set('reason', reason);
  }

  if (typeof window !== 'undefined') {
    const stationCode = localStorage.getItem('userStationCode')?.trim();
    const stationCity = localStorage.getItem('userStationCity')?.trim();
    if (stationCode) params.set('stationCode', stationCode);
    if (stationCity) params.set('stationCity', stationCity);
  }

  const query = params.toString();
  if (isBilling) {
    return query ? `/billing/login?${query}` : '/billing/login';
  }
  return query ? `/login?${query}` : '/login';
}

async function validateWithRetry(): Promise<FrisSessionValidation> {
  const first = await validateFrisSession();
  if (first.ok) return first;
  if (first.reason === 'timeout' || first.reason === 'network') {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  return validateFrisSession();
}

/**
 * Blocks FRIS routes until a valid FRIS session is confirmed (FRIS cookie only).
 */
export function FrisRouteGuard({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<GateStatus>('checking');
  const [errorReason, setErrorReason] = useState<SessionFailureReason>('network');
  const [retryKey, setRetryKey] = useState(0);

  const goToLogin = useCallback(
    (reason?: SessionFailureReason) => {
      const url = buildLoginRedirectUrl(pathname, reason);
      clearFrisSession({ keepAppAccess: true, keepLoginStation: true });
      setStatus('redirecting');
      const logout = fetch(`${getApiBase()}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => undefined);
      void logout.finally(() => {
        router.replace(url);
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    let cancelled = false;
    if (hasCachedFrisSession()) {
      setStatus('allowed');
    } else {
      setStatus('checking');
    }

    const run = async () => {
      const result = await validateWithRetry();
      if (cancelled) return;

      if (result.ok) {
        setStatus('allowed');
        return;
      }

      if (result.reason === 'timeout' || result.reason === 'network') {
        // Long billing work (MIS ADS export) can stall Nest. Keep the page if
        // this browser already signed in — do not replace it with the timeout shell.
        if (hasCachedFrisSession()) {
          setStatus('allowed');
          return;
        }
        setErrorReason(result.reason);
        setStatus('error');
        return;
      }

      goToLogin(result.reason);
    };

    void run();

    const onFocus = () => {
      void validateFrisSession()
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setStatus('allowed');
            return;
          }
          if (result.reason === 'timeout' || result.reason === 'network') {
            if (hasCachedFrisSession()) {
              setStatus('allowed');
              return;
            }
            setErrorReason(result.reason);
            setStatus('error');
            return;
          }
          goToLogin(result.reason);
        })
        .catch(() => {
          /* validateFrisSession should not reject — ignore stray parse/network throws */
        });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [pathname, goToLogin, retryKey]);

  if (status === 'checking' || status === 'redirecting') {
    return (
      <SessionGateShell phase="checking" label="Checking your FRIS session…" />
    );
  }

  if (status === 'error') {
    return (
      <SessionGateShell
        phase="error"
        reason={errorReason}
        onRetry={() => setRetryKey((k) => k + 1)}
        onSignIn={() => goToLogin(errorReason)}
        signInLabel={
          pathname?.startsWith('/billing')
            ? 'Go to Billing sign in'
            : 'Go to FRIS sign in'
        }
      />
    );
  }

  return <>{children}</>;
}
