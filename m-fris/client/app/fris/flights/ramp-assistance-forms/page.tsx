'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';
import { retryDynamicChunkImport } from '@/lib/retry-dynamic-chunk-import';

const RampAssistanceFormsContentDynamic = dynamic(
  () =>
    retryDynamicChunkImport(() =>
      import('@/features/fris/flights/ramp-assistance/RampAssistanceFormsScreen').then(
        (m) => ({ default: m.RampAssistanceFormsContent }),
      ),
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function RampAssistanceFormsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RampAssistanceFormsContentDynamic />
    </Suspense>
  );
}
