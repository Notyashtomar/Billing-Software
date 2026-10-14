'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

/** Same GSE / Team preview as Scheduled Airlines — Download PDF lives on that screen. */
const EquipmentReportScreenDynamic = dynamic(
  () => import('../../scheduledairlines/equipment-report/EquipmentReportScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledEquipmentReportPage() {
  return (
    <ErrorBoundary featureName="Equipment report">
      <EquipmentReportScreenDynamic />
    </ErrorBoundary>
  );
}
