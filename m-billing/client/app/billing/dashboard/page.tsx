'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy Command Center — content merged into Payables Insights. */
export default function BillingDashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/billing/insights/payables');
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center text-[color:var(--billing-text-muted)]">
      <p className="text-lg font-medium">Redirecting to Payables Insights…</p>
    </div>
  );
}
