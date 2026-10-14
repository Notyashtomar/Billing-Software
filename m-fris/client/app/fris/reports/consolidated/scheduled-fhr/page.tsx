'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const ScheduledFhrGseReportContentDynamic = dynamic(
  () =>
    import('@/components/fris/reports/ScheduledFhrGseReportContent').then((m) => ({
      default: m.ScheduledFhrGseReportContent,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ConsolidatedScheduledFhrPage() {
  return (
    <ErrorBoundary featureName="Consolidated FHR / GSE report">
      <ScheduledFhrGseReportContentDynamic />
    </ErrorBoundary>
  );
}
