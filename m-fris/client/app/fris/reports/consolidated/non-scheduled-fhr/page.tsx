'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledFhrReportContentDynamic = dynamic(
  () =>
    import('@/components/fris/reports/NonScheduledFhrReportContent').then((m) => ({
      default: m.NonScheduledFhrReportContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ConsolidatedNonScheduledFhrPage() {
  return <NonScheduledFhrReportContentDynamic />;
}
