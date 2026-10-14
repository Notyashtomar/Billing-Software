'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const PageComponent = dynamic(
  () =>
    import('@/components/billing/output/MisCheckerSourcePlaceholder').then(
      (m) => m.MisCheckerSourcePlaceholder,
    ),
  { ssr: false },
);

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageComponent source="raf" />
    </Suspense>
  );
}
