'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BillingPageHeader } from '../BillingLayout';
import { billingUi } from '../billingUi';

type Props = {
  source: 'ads' | 'raf';
};

const COPY: Record<
  Props['source'],
  { title: string; description: string; body: string }
> = {
  ads: {
    title: 'ADS — MIS Checker',
    description: 'Additional / equipment services bill check',
    body: 'ADS bill check analysis (airline × rate aggregation) is not wired yet. Use BHS for the live RBHS checker today.',
  },
  raf: {
    title: 'RAF — MIS Checker',
    description: 'Ramp Assistance Form bill check',
    body: 'RAF bill check analysis is not wired yet. Use BHS for the live RBHS checker today.',
  },
};

/** Placeholder analysis shell for ADS / RAF until aggregation is implemented. */
export function MisCheckerSourcePlaceholder({ source }: Props) {
  const copy = COPY[source];
  return (
    <div className={billingUi.page}>
      <BillingPageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Link href="/billing/mis-checker" className={billingUi.btnSecondary}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to MIS Checker
          </Link>
        }
      />
      <div className={`${billingUi.card} border-dashed p-8 text-center sm:p-12`}>
        <p className="text-sm text-slate-600">{copy.body}</p>
        <Link
          href="/billing/mis-checker/bhs"
          className={`${billingUi.btnPrimary} mt-6 inline-flex`}
        >
          Open BHS analysis
        </Link>
      </div>
    </div>
  );
}
