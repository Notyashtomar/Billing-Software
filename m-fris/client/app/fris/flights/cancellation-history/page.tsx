'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CancellationHistoryContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/cancellations/CancellationHistoryScreen').then(
      (m) => ({ default: m.CancellationHistoryContent }),
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function CancellationHistoryPage() {
  return <CancellationHistoryContentDynamic />;
}
