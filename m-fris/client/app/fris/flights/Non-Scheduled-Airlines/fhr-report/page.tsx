'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

/** Same FHR preview as Scheduled Airlines — Download PDF lives on that screen. */
const FhrReportScreenDynamic = dynamic(
  () => import('../../scheduledairlines/fhr-report/FhrReportScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledFhrReportPage() {
  return <FhrReportScreenDynamic />;
}
