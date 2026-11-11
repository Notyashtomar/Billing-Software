'use client';

import { Suspense } from 'react';
import { billingApi } from '@/lib/billing-api';
import { ContractEditorPage } from '@/components/billing/contracts/ContractEditorPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ContractEditorPage api={billingApi} contractId="new" />
    </Suspense>
  );
}
