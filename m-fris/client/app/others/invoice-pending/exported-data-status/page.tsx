'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const ExportedDataStatusContentDynamic = dynamic(
  () =>
    import('@/components/fris/others/ExportedDataStatusContent').then((m) => ({
      default: m.default,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ExportedDataStatusPage() {
  return <ExportedDataStatusContentDynamic />;
}
