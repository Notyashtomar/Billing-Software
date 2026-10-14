'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const GsdReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/GsdReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function GsdShiftReportPage() {
  return <GsdReportContentDynamic />;
}
