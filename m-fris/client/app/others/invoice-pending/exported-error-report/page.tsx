'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const ExportedErrorReportContentDynamic = dynamic(
  () =>
    import('@/components/fris/others/ExportedErrorReportContent').then((m) => ({
      default: m.default,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ExportedErrorReportPage() {
  return <ExportedErrorReportContentDynamic />;
}
