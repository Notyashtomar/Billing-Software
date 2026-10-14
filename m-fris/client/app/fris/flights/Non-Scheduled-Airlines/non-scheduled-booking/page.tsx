'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledBookingContentDynamic = dynamic(
  () =>
    import('@/features/fris/flights/non-scheduled/NonScheduledBookingScreen').then((m) => ({
      default: m.NonScheduledBookingContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledBookingPage() {
  return <NonScheduledBookingContentDynamic />;
}
