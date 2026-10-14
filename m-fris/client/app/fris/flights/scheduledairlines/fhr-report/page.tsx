'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const FhrReportScreenDynamic = dynamic(
  () => import('./FhrReportScreen'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function FHRReportPage() {
  return <FhrReportScreenDynamic />;
}
