'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const RampShiftReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/RampShiftReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function RampShiftReportPage() {
  return <RampShiftReportContentDynamic />;
}
