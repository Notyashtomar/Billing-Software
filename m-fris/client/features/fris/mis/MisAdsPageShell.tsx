'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const MisAdsPage = dynamic(
  () => import('@/features/fris/mis/MisAdsPage').then((m) => m.MisAdsPage),
  { ssr: false },
);

export function MisAdsPageShell() {
  return (
    <Suspense fallback={null}>
      <MisAdsPage />
    </Suspense>
  );
}
