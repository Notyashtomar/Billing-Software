'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FRIS_SESSION_UPDATED_EVENT } from '@/lib/fris-session';
import { BILLING_QUERY_DEFAULTS } from './query-config';
import {
  registerBillingWorkspaceResetHook,
  useBillingWorkspaceIdentity,
} from './store';

type Props = {
  children: ReactNode;
};

function identityKey(userId?: string, stationCode?: string): string {
  if (!userId) return '';
  return `${userId}|${stationCode ?? ''}`;
}

/**
 * Billing-scoped React Query client. Cleared on logout / user·station change.
 * Nested under BillingWorkspaceProvider — never reuse FRIS/Admin QueryClient.
 */
export function BillingQueryProvider({ children }: Props) {
  const identity = useBillingWorkspaceIdentity();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: BILLING_QUERY_DEFAULTS,
        },
      }),
  );
  const prevIdentityKeyRef = useRef<string | null>(null);

  // Clear only when identity actually switches — not on first bind (avoids double-fetch).
  useEffect(() => {
    const next = identityKey(identity?.userId, identity?.stationCode);
    if (prevIdentityKeyRef.current === null) {
      prevIdentityKeyRef.current = next;
      return;
    }
    if (prevIdentityKeyRef.current !== next) {
      prevIdentityKeyRef.current = next;
      client.clear();
    }
  }, [client, identity?.userId, identity?.stationCode]);

  useEffect(() => {
    const onUpdated = () => {
      if (!localStorage.getItem('userId')?.trim() && !localStorage.getItem('userid')?.trim()) {
        prevIdentityKeyRef.current = '';
        client.clear();
      }
    };
    window.addEventListener(FRIS_SESSION_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(FRIS_SESSION_UPDATED_EVENT, onUpdated);
    };
  }, [client]);

  useEffect(() => {
    registerBillingWorkspaceResetHook(() => {
      client.clear();
    });
    return () => {
      registerBillingWorkspaceResetHook(null);
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
