'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const ExportedDataLogContentDynamic = dynamic(
  () =>
    import('@/components/fris/others/ExportedDataLogContent').then((m) => ({
      default: m.default,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function ExportedDataLogPage() {
  return <ExportedDataLogContentDynamic />;
}
