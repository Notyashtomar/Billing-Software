'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingContract } from '@/lib/billing-shared/types';
import { ContractFormDialog } from './ContractFormDialog';

type Props = {
  api: BillingApi;
  contractId: string;
};

export function ContractEditorPage({ api, contractId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = contractId === 'new';
  const [record, setRecord] = useState<BillingContract | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void api
      .getContract(contractId)
      .then((res) => {
        if (cancelled) return;
        const data = res.data as BillingContract | null;
        if (!data || !data._id) {
          setMissing(true);
          return;
        }
        setRecord(data);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, contractId, isNew]);

  if (loading) {
    return <p className="px-6 py-8 text-sm text-slate-500">Loading contract…</p>;
  }
  if (missing) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-slate-700">This contract could not be opened.</p>
        <button
          type="button"
          onClick={() => router.push('/billing/contracts')}
          className="mt-3 text-sm font-semibold text-[#1C0770]"
        >
          Back to contracts
        </button>
      </div>
    );
  }

  return (
    <ContractFormDialog
      api={api}
      presentation="page"
      open
      record={isNew ? null : record}
      focusCondition={searchParams.get('condition')}
      onOpenChange={(open) => {
        if (!open) router.push('/billing/contracts');
      }}
      onSaved={() => router.push('/billing/contracts')}
    />
  );
}
