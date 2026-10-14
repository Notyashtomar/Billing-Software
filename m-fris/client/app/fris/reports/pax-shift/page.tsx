'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const PaxShiftReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/PaxShiftReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PaxShiftReportPage() {
  return <PaxShiftReportContentDynamic />;
}
