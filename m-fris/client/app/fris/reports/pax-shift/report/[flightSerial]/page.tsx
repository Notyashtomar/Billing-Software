'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { PageLoading } from '@/components/ui/PageLoading';

const PaxShiftReportViewContentDynamic = dynamic(
  () => import('@/components/fris/reports/PaxShiftReportViewContent'),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function PaxShiftReportViewPage() {
  const params = useParams();
  const raw = params?.flightSerial;
  const encoded = Array.isArray(raw) ? raw[0] : raw;
  const flightSerial = encoded != null ? decodeURIComponent(String(encoded)) : '';

  return <PaxShiftReportViewContentDynamic flightSerial={flightSerial} />;
}
