'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledCancellationHistoryContentDynamic = dynamic(
  () =>
    import(
      '@/features/fris/flights/cancellations/NonScheduledCancellationHistoryScreen'
    ).then((m) => ({ default: m.NonScheduledCancellationHistoryContent })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledCancellationHistoryPage() {
  return <NonScheduledCancellationHistoryContentDynamic />;
}
