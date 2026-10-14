'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const CleaningServicesReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/CleaningServicesReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function CleaningServicesReportPage() {
  return <CleaningServicesReportContentDynamic />;
}
