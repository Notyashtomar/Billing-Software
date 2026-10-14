'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const InvoicePendingContentDynamic = dynamic(
  () =>
    import('@/components/fris/others/InvoicePendingContent').then((m) => ({
      default: m.default,
    })),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function InvoicePendingPage() {
  return <InvoicePendingContentDynamic />;
}
