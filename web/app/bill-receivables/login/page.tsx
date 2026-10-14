'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const BillReceivablesLogin = dynamic(
  () => import('@/features/bill-receivables/BillReceivablesLogin'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function BillReceivablesLoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillReceivablesLogin />
    </Suspense>
  );
}
