'use client';

import type { ReactNode } from 'react';
import { BillingLayout } from './BillingLayout';

/**
 * Persistent billing chrome — mounted once in app/billing/layout.tsx so the
 * sidebar does not remount on route changes.
 */
export function BillingShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0">
      <BillingLayout>{children}</BillingLayout>
    </div>
  );
}
