'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { billingApi } from '@/lib/billing-api';
import { ContractEditorPage } from '@/components/billing/contracts/ContractEditorPage';

export default function Page() {
  const params = useParams<{ id: string }>();
  const contractId = String(params?.id ?? '');
  return (
    <Suspense fallback={null}>
      <ContractEditorPage api={billingApi} contractId={contractId} />
    </Suspense>
  );
}
