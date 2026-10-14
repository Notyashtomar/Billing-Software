'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () => import('@/components/billing/contracts/ContractsPage').then((m) => m.ContractsPage),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
      <div className="w-full min-w-0">
        <PageComponent api={billingApi} />
      </div>
    </Suspense>
  );
}
