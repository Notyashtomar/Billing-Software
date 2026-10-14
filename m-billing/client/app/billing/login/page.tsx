'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const BillingLogin = dynamic(
  () => import('@/components/billing/auth/BillingLogin'),
  {
    ssr: false,
    loading: () => <PageLoading />,
  },
);

export default function BillingLoginPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingLogin />
    </Suspense>
  );
}
