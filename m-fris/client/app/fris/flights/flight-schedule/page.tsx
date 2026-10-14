'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const FlightScheduleContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/schedule/FlightScheduleScreen').then((m) => ({
      default: m.FlightScheduleContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function FlightSchedulePage() {
  return <FlightScheduleContentDynamic />;
}
