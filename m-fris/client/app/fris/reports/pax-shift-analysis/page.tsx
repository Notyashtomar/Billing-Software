'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const PaxShiftAnalysisReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/PaxShiftAnalysisReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PaxShiftAnalysisReportPage() {
  return <PaxShiftAnalysisReportContentDynamic />;
}
