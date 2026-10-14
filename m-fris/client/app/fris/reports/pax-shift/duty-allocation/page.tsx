'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const PaxDutyAllocationContentDynamic = dynamic(
  () => import('@/components/fris/reports/PaxDutyAllocationContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PaxDutyAllocationPage() {
  return <PaxDutyAllocationContentDynamic />;
}
