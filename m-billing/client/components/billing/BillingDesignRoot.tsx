'use client';

import type { ReactNode } from 'react';
import './billing-design-system.css';
import './billing-responsive.css';

/** Applies Calm Ledger Light tokens to the billing shell (excludes /billing/login). */
export function BillingDesignRoot({ children }: { children: ReactNode }) {
  return <div className="billing-app w-full min-w-0">{children}</div>;
}
