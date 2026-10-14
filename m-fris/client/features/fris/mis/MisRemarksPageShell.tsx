'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const MisRemarksPage = dynamic(
  () => import('@/features/fris/mis/MisRemarksPage').then((m) => m.MisRemarksPage),
  { ssr: false },
);

export function MisRemarksPageShell() {
  return (
    <Suspense fallback={null}>
      <MisRemarksPage />
    </Suspense>
  );
}
