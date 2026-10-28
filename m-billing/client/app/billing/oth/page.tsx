'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PageComponent = dynamic(
  () => import('@/components/billing/sources/PlaceholderSourcePage').then((m) => m.PlaceholderSourcePage),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageComponent title="OTH" description="Other billed services" />
    </Suspense>
  );
}
