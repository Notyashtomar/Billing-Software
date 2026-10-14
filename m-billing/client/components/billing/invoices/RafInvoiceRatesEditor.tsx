'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingRafAdhocRate } from '@/lib/billing-shared/types';
import type { InvoiceEditLine } from './InvoiceLinesEditForm';

type RateSource = 'custom' | 'adhoc';

type RafEditLine = InvoiceEditLine & {
  rateSource: RateSource;
  adhocId: string;
};

type Props = {
  api: BillingApi;
  draftId: string;
  currencyCode: string;
  lines: InvoiceEditLine[];
  onSaved: (message: string) => void;
};

function formatPreview(amount: number, currencyCode: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode === 'USD' ? 'USD' : 'INR',
  }).format(amount);
}

function adhocUnitPrice(row: BillingRafAdhocRate, currencyCode: string): number {
  const usd = Number(row.unitPriceUSD ?? 0);
  const inr = Number(row.unitPriceINR ?? 0);
  if (currencyCode === 'USD' && usd > 0) return usd;
  if (inr > 0) return inr;
  if (usd > 0) return usd;
  return 0;
}

function seedRafLines(seed: InvoiceEditLine[]): RafEditLine[] {
  return seed.map((line) => ({
    ...line,
    showUsed: true,
    rateSource: line.unitPrice > 0 ? 'adhoc' : 'custom',
    adhocId: '',
  }));
}

export function rafLinesNeedRates(
  lines: Array<{ unitPrice?: number }>,
): boolean {
  return lines.some((line) => !(Number(line.unitPrice) > 0));
}

export function RafInvoiceRatesEditor({
  api,
  draftId,
  currencyCode,
  lines: seedLines,
  onSaved,
}: Props) {
  const seedKey = `${draftId}:${seedLines.map((l) => `${l.lineNo}:${l.unitPrice}`).join(',')}`;
  const [lines, setLines] = useState<RafEditLine[]>(() => seedRafLines(seedLines));
  const [adhocRates, setAdhocRates] = useState<BillingRafAdhocRate[]>([]);
  const [loadingAdhoc, setLoadingAdhoc] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLines(seedRafLines(seedLines));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed when line identity / saved rates change
  }, [seedKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAdhoc(true);
      try {
        const res = await api.listRafAdhocRates();
        const items =
          ((res as { data?: { items?: BillingRafAdhocRate[] } }).data?.items ?? []);
        if (!cancelled) setAdhocRates(items);
      } catch {
        if (!cancelled) setAdhocRates([]);
      } finally {
        if (!cancelled) setLoadingAdhoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const pricedAdhoc = useMemo(
    () =>
      adhocRates.filter((row) => adhocUnitPrice(row, currencyCode) > 0),
    [adhocRates, currencyCode],
  );

  const updateLine = (index: number, patch: Partial<RafEditLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const applyAdhoc = (index: number, adhocId: string) => {
    const row = pricedAdhoc.find((item) => item._id === adhocId);
    if (!row) {
      updateLine(index, { adhocId: '', unitPrice: 0 });
      return;
    }
    updateLine(index, {
      adhocId,
      rateSource: 'adhoc',
      unitPrice: adhocUnitPrice(row, currencyCode),
      uom: row.uom || lines[index]?.uom || 'Per Service',
    });
  };

  const validate = (): string | null => {
    if (lines.length === 0) return 'No RAF particulars on this invoice.';
    for (const line of lines) {
      if (!(Number(line.unitPrice) > 0)) {
        return `Line ${line.lineNo} (${line.description}): set a custom rate or pick an adhoc rate.`;
      }
      if (!(Number(line.charged) > 0)) {
        return `Line ${line.lineNo}: Charged must be greater than zero.`;
      }
    }
    return null;
  };

  const save = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updateInvoiceDraftLines(draftId, {
        lines: lines.map((line) => ({
          lineNo: line.lineNo,
          quantity: Number(line.charged),
          unitPrice: Number(line.unitPrice),
          uom: line.uom.trim() || 'Per Service',
          usedQuantity: Number(line.used),
          pricingBasis: line.rateSource,
        })),
      });
      onSaved('RAF rates saved. Invoice PDF now uses these Rate/Unit and charged quantities.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save RAF rates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200/80 bg-violet-50/30 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">RAF rates and charged quantities</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Used is filled from RAF usage. Edit Charged if needed. Set Rate/Unit as a custom amount
          or pick from RAF adhoc rates. Save every particular before View / Generate PDF.
        </p>
      </div>

      {loadingAdhoc ? (
        <p className="text-xs text-gray-500">Loading adhoc rate catalog…</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-violet-200/80 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2 font-medium">Line</th>
              <th className="px-2 py-2 font-medium">Particular</th>
              <th className="px-2 py-2 font-medium">Used</th>
              <th className="px-2 py-2 font-medium">Charged</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Rate source</th>
              <th className="px-2 py-2 font-medium">Rate/Unit</th>
              <th className="px-2 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.lineNo} className="border-b border-violet-100/80 align-top">
                <td className="px-2 py-2 text-gray-500">{line.lineNo}</td>
                <td className="px-2 py-2 text-gray-900">{line.description}</td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={line.used}
                    readOnly
                    className="w-20 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-700"
                    aria-label={`Used line ${line.lineNo}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.charged}
                    onChange={(e) => updateLine(index, { charged: Number(e.target.value) })}
                    className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={saving}
                    aria-label={`Charged line ${line.lineNo}`}
                  />
                </td>
                <td className="px-2 py-2 text-gray-700">{line.uom}</td>
                <td className="px-2 py-2">
                  <div className="flex min-w-[12rem] flex-col gap-1.5">
                    <select
                      value={line.rateSource}
                      onChange={(e) => {
                        const rateSource = e.target.value as RateSource;
                        updateLine(index, {
                          rateSource,
                          adhocId: rateSource === 'custom' ? '' : line.adhocId,
                        });
                      }}
                      className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={saving}
                      aria-label={`Rate source line ${line.lineNo}`}
                    >
                      <option value="custom">Custom rate</option>
                      <option value="adhoc">Adhoc catalog</option>
                    </select>
                    {line.rateSource === 'adhoc' ? (
                      <select
                        value={line.adhocId}
                        onChange={(e) => applyAdhoc(index, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                        disabled={saving || pricedAdhoc.length === 0}
                        aria-label={`Adhoc rate line ${line.lineNo}`}
                      >
                        <option value="">Select adhoc rate…</option>
                        {pricedAdhoc.map((row) => (
                          <option key={row._id} value={row._id}>
                            {row.itemKind}: {row.label} ({adhocUnitPrice(row, currencyCode)} /{' '}
                            {row.uom})
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitPrice || ''}
                    onChange={(e) =>
                      updateLine(index, {
                        unitPrice: Number(e.target.value),
                        rateSource: 'custom',
                        adhocId: '',
                      })
                    }
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={saving || line.rateSource === 'adhoc'}
                    aria-label={`Rate per unit line ${line.lineNo}`}
                  />
                </td>
                <td className="px-2 py-2 text-gray-700">
                  {formatPreview(line.charged * line.unitPrice, currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--billing-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--billing-primary-hover)] disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save RAF rates
      </button>
    </div>
  );
}
