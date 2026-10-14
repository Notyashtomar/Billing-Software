'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const EquipmentReportScreenDynamic = dynamic(
  () => import('./EquipmentReportScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function EquipmentReportPage() {
  return (
    <ErrorBoundary featureName="Equipment report">
      <EquipmentReportScreenDynamic />
    </ErrorBoundary>
  );
}
