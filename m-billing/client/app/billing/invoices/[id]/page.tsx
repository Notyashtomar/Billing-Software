'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () =>
    import('@/components/billing/invoices/InvoiceWorkflowPages').then((m) => m.InvoiceDetailPage),
  { ssr: false },
);

export default function InvoiceDetailRoutePage() {
  const params = useParams();
  const id = String(params.id ?? '');

  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading invoice…</div>}>
      <PageComponent api={billingApi} id={id} />
    </Suspense>
  );
}
