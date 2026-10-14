'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { BillingApi } from '@/lib/billing-api';

type LinePreview = {
  lineNo: number;
  description: string;
  quantity: number;
  uom: string;
  lineAmountInclTax: number;
};

type CacheEntry = {
  lines: LinePreview[];
  currencyCode: string;
};

const particularsCache = new Map<string, CacheEntry>();

function formatAmount(amount: number, currencyCode: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode === 'USD' ? 'USD' : 'INR',
  }).format(amount);
}

type Props = {
  api: BillingApi;
  draftId: string;
  draftNumber?: string;
  currencyCode?: string;
};

export function InvoiceDraftParticularsHover({
  api,
  draftId,
  draftNumber,
  currencyCode = 'INR',
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<CacheEntry | null>(
    () => particularsCache.get(draftId) ?? null,
  );
  const fetchGen = useRef(0);

  const loadParticulars = useCallback(async () => {
    const cached = particularsCache.get(draftId);
    if (cached) {
      setEntry(cached);
      setError('');
      return;
    }

    const gen = ++fetchGen.current;
    setLoading(true);
    setError('');
    try {
      const res = await api.getInvoiceDraft(draftId);
      if (gen !== fetchGen.current) return;
      const data = (res as {
        data?: {
          header?: { currencyCode?: string };
          lines?: Array<Record<string, unknown>>;
        };
      }).data;
      const next: CacheEntry = {
        currencyCode: String(data?.header?.currencyCode ?? currencyCode),
        lines: (data?.lines ?? []).map((line) => ({
          lineNo: Number(line.lineNo) || 0,
          description: String(line.description ?? '').trim() || '—',
          quantity: Number(line.quantity) || 0,
          uom: String(line.uom ?? '').trim(),
          lineAmountInclTax: Number(line.lineAmountInclTax) || 0,
        })),
      };
      particularsCache.set(draftId, next);
      setEntry(next);
    } catch (e) {
      if (gen !== fetchGen.current) return;
      setError(e instanceof Error ? e.message : 'Could not load particulars');
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [api, currencyCode, draftId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadParticulars();
  };

  const lines = entry?.lines ?? [];
  const currency = entry?.currencyCode ?? currencyCode;
  const label = draftNumber ?? draftId;

  return (
    <HoverCard open={open} onOpenChange={handleOpenChange} openDelay={160} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          href={`/billing/invoices/${draftId}`}
          className="font-medium text-[color:var(--billing-accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--billing-accent)]/40"
        >
          {label}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        collisionPadding={16}
        sideOffset={8}
        className="w-[min(28rem,calc(100vw-2rem))] max-w-[28rem] p-0"
      >
        <div className="border-b border-gray-100 px-3 py-2.5 sm:px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Particulars
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{label}</p>
        </div>

        {loading && !entry ? (
          <p className="px-3 py-4 text-sm text-gray-500 sm:px-4" role="status">
            Loading particulars…
          </p>
        ) : null}

        {error && !entry ? (
          <p className="px-3 py-4 text-sm text-red-700 sm:px-4" role="alert">
            {error}
          </p>
        ) : null}

        {entry && lines.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-500 sm:px-4">No line particulars on this draft.</p>
        ) : null}

        {lines.length > 0 ? (
          <div className="max-h-64 overflow-auto sm:max-h-80">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 font-medium sm:px-4">#</th>
                  <th className="px-3 py-2 font-medium sm:px-4">Particular</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Qty</th>
                  <th className="px-3 py-2 text-right font-medium sm:px-4">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((line) => (
                  <tr key={line.lineNo} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500 sm:px-4">
                      {line.lineNo}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900 sm:px-4">
                      {line.description}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700 sm:px-4">
                      {line.quantity}
                      {line.uom ? ` ${line.uom}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900 sm:px-4">
                      {formatAmount(line.lineAmountInclTax, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
