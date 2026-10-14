'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledBookingDetailsContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/non-scheduled/NonScheduledBookingDetailsScreen').then(
      (m) => ({ default: m.NonScheduledBookingDetailsContent }),
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledBookingDetailsPage() {
  return <NonScheduledBookingDetailsContentDynamic />;
}
