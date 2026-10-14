'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const PeakFlightsContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/peak/PeakFlightsScreen').then((m) => ({
      default: m.PeakFlightsContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PeakFlightsPage() {
  return <PeakFlightsContentDynamic />;
}
