'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';
import { retryDynamicChunkImport } from '@/lib/retry-dynamic-chunk-import';

const ScheduledAirlinesContentDynamic = dynamic(
  () =>
    retryDynamicChunkImport(() =>
      import('@/features/fris/flights/scheduled/ScheduledAirlinesScreen').then(
        (m) => ({ default: m.ScheduledAirlinesContent }),
      ),
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ScheduledAirlinesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScheduledAirlinesContentDynamic />
    </Suspense>
  );
}
