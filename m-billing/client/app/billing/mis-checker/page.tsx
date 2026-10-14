'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PageComponent = dynamic(
  () =>
    import('@/components/billing/output/MisCheckerHubPage').then(
      (m) => m.MisCheckerHubPage,
    ),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageComponent />
    </Suspense>
  );
}
