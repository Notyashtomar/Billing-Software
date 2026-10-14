'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const MissingFhrReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/MissingFhrReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function MissingFhrReportPage() {
  return <MissingFhrReportContentDynamic />;
}
