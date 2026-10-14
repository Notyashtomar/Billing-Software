'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { PageLoading } from '@/components/ui/PageLoading';

const ScheduleAirlineViewDynamic = dynamic(
  () => import('@/components/fris/advance/ScheduleAirlineView'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ScheduleAirlineViewPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScheduleAirlineViewDynamic />
    </Suspense>
  );
}
