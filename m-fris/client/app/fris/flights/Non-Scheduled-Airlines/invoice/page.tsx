'use client';

import dynamic from 'next/dynamic';
import { PageLoading } from '@/components/ui/PageLoading';

const NonScheduledAdvanceInvoiceScreenDynamic = dynamic(
  () =>
    import(
      '@/components/fris/flights/non-scheduled-booking/NonScheduledAdvanceInvoiceScreen'
    ),
  { ssr: false, loading: () => <PageLoading /> },
);

export default function NonScheduledAdvanceInvoicePage() {
  return <NonScheduledAdvanceInvoiceScreenDynamic />;
}
