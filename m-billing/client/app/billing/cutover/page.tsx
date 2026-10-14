'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () => import('@/components/billing/cutover/CutoverPage').then((m) => m.CutoverPage),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
        <PageComponent api={billingApi} />
      </Suspense>
  );
}
