'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const ScheduledDataExportContentDynamic = dynamic(
  () =>
    import('./ScheduledDataExportContent').then((m) => ({
      default: m.ScheduledDataExportContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ScheduledDataExportPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScheduledDataExportContentDynamic />
    </Suspense>
  );
}
