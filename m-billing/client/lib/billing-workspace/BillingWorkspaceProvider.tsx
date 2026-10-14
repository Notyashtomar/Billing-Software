'use client';

import { useEffect, type ReactNode } from 'react';
import { FRIS_SESSION_UPDATED_EVENT } from '@/lib/fris-session';
import { bindBillingWorkspaceIdentity } from './store';

type Props = {
  children: ReactNode;
};

/**
 * Survives Billing page unmounts. Binds identity after mount so the first
 * paint matches the server, then restores this user's saved filters.
 */
export function BillingWorkspaceProvider({ children }: Props) {
  useEffect(() => {
    bindBillingWorkspaceIdentity();

    const onUpdated = () => {
      bindBillingWorkspaceIdentity();
    };

    window.addEventListener(FRIS_SESSION_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(FRIS_SESSION_UPDATED_EVENT, onUpdated);
    };
  }, []);

  return children;
}
