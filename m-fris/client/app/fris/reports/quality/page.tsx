'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const QualityReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/QualityReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function QualityReportPage() {
  return <QualityReportContentDynamic />;
}
