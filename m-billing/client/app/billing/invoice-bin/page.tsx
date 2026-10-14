'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () => import('@/components/billing/invoices/InvoiceWorkflowPages').then((m) => m.InvoiceBinPage),
  { ssr: false },
);

export default function InvoiceBinRoutePage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading bin…</div>}>
      <PageComponent api={billingApi} />
    </Suspense>
  );
}
