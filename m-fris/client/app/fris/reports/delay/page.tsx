'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const DelayReportContentDynamic = dynamic(
  () => import('@/components/fris/reports/DelayReportContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function DelayReportPage() {
  return <DelayReportContentDynamic />;
}
