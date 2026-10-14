'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const MisBhsPage = dynamic(
  () => import('@/features/fris/mis/MisBhsPage').then((m) => m.MisBhsPage),
  { ssr: false },
);

export function MisBhsPageShell() {
  return (
    <Suspense fallback={null}>
      <MisBhsPage />
    </Suspense>
  );
}
