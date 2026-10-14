'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { billingApi } from '@/lib/billing-api';

const PageComponent = dynamic(
  () => import('@/components/billing/sources/SourcePages').then((m) => m.EquipmentSourcePage),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
        <PageComponent api={billingApi} />
      </Suspense>
  );
}
