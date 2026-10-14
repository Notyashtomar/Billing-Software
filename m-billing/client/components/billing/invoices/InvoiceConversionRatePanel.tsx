'use client';

import Link from 'next/link';
import type { BillingInvoiceHeader } from '@/lib/billing-shared/types';

function billingYearMonth(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})/.exec(raw);
  if (match) return `${match[1]}-${match[2]}`;
  return '';
}

function formatMonthLabel(yearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return yearMonth || '—';
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

type Props = {
  header: BillingInvoiceHeader;
  masterRateToInr?: number | null;
};

export function InvoiceConversionRatePanel({ header, masterRateToInr }: Props) {
  const billingMonth = billingYearMonth(header.billingPeriodStart);
  const appliedRoe = Number(header.currencyFactor) > 0 ? Number(header.currencyFactor) : null;
  const masterRoe =
    masterRateToInr != null && Number(masterRateToInr) > 0 ? Number(masterRateToInr) : null;
  const ratesDiffer =
    appliedRoe != null &&
    masterRoe != null &&
    Math.abs(appliedRoe - masterRoe) > 0.0001;

  return (
    <div className="mt-4 rounded-lg border border-sky-200/80 bg-sky-50/50 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900/80">
          Conversion rates
        </p>
        <Link
          href="/billing/conversion-rates"
          className="text-xs font-medium text-[color:var(--billing-accent-strong)] underline"
        >
          Manage rates
        </Link>
      </div>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-gray-600">Billing month</dt>
          <dd className="font-medium text-gray-900">
            {billingMonth ? formatMonthLabel(billingMonth) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-600">Invoice currency</dt>
          <dd className="font-medium text-gray-900">{header.currencyCode}</dd>
        </div>
        <div>
          <dt className="text-gray-600">ROE on this invoice (USD→INR)</dt>
          <dd className="font-medium text-gray-900">
            {appliedRoe != null ? appliedRoe.toFixed(4) : 'Not set — add under Conversion Rates'}
          </dd>
        </div>
        {masterRoe != null ? (
          <div>
            <dt className="text-gray-600">Master rate for billing month</dt>
            <dd className="font-medium text-gray-900">{masterRoe.toFixed(4)}</dd>
          </div>
        ) : null}
      </dl>
      {ratesDiffer ? (
        <p className="mt-2 text-xs text-amber-800">
          Master rate ({masterRoe?.toFixed(4)}) differs from this invoice (
          {appliedRoe?.toFixed(4)}). Use <strong>Regenerate invoice</strong> to apply the latest rate.
        </p>
      ) : null}
      {header.currencyCode === 'USD' && appliedRoe != null ? (
        <p className="mt-2 text-xs text-gray-600">
          Line amounts are in USD; GST and total receivable use INR gross at ROE {appliedRoe.toFixed(4)}.
        </p>
      ) : appliedRoe != null ? (
        <p className="mt-2 text-xs text-gray-600">
          Stored ROE applies when you convert this draft to USD or for INR tax on USD billing.
        </p>
      ) : null}
    </div>
  );
}
