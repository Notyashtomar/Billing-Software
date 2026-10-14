'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledAirlinesContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/non-scheduled/NonScheduledAirlinesScreen').then(
      (m) => ({ default: m.NonScheduledAirlinesContent }),
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledAirlinesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NonScheduledAirlinesContentDynamic />
    </Suspense>
  );
}
