'use client';

import { useEffect, type ReactNode } from 'react';
import './billing-design-system.css';
import './billing-responsive.css';

/** Applies Calm Ledger tokens to the billing shell (excludes /billing/login). */
export function BillingDesignRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const night = localStorage.getItem('billing-night') === '1';
    document.documentElement.toggleAttribute('data-billing-night', night);
  }, []);
  return <div className="billing-app w-full min-w-0">{children}</div>;
}
