'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';

const RampShiftReportViewContentDynamic = dynamic(
  () => import('@/components/fris/reports/RampShiftReportViewContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function RampShiftReportViewPage() {
  const params = useParams();
  const raw = params?.reportId;
  const encoded = Array.isArray(raw) ? raw[0] : raw;
  const reportId = encoded != null ? decodeURIComponent(String(encoded)) : '';

  return <RampShiftReportViewContentDynamic reportId={reportId} />;
}
