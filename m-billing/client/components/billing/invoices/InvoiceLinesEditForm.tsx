'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';

export type InvoiceEditLine = {
  lineNo: number;
  description: string;
  used: number;
  charged: number;
  uom: string;
  unitPrice: number;
  showUsed: boolean;
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

export function linesToInvoiceEditLines(
  lines: Array<{
    lineNo: number;
    description: string;
    quantity: number;
    uom: string;
    unitPrice: number;
    sourceType?: string;
    sourceRef?: Record<string, unknown>;
  }>,
): InvoiceEditLine[] {
  const anyUsed = lines.some((line) => {
    const ref = line.sourceRef ?? {};
    return (
      String(line.sourceType ?? '').toLowerCase() === 'ads' ||
      ref.usedQuantity != null ||
      ref.chargedQuantity != null
    );
  });

  return lines
    .filter((line) => String(line.lineNo) && line.lineNo > 0)
    .map((line) => {
      const ref = line.sourceRef ?? {};
      const used = Number(ref.usedQuantity ?? line.quantity ?? 0);
      const charged = Number(ref.chargedQuantity ?? line.quantity ?? 0);
      return {
        lineNo: line.lineNo,
        description: String(line.description ?? '').trim(),
        used: Number.isFinite(used) ? used : 0,
        charged: Number.isFinite(charged) && charged > 0 ? charged : line.quantity,
        uom: String(line.uom ?? 'Per Service').trim() || 'Per Service',
        unitPrice: Number(line.unitPrice ?? 0),
        showUsed: anyUsed,
      };
    });
}

export function InvoiceLinesEditForm({ api, draftId, currencyCode, lines: seedLines, onSaved }: Props) {
  const seedKey = `${draftId}:${seedLines.map((l) => l.lineNo).join(',')}`;
  const [lines, setLines] = useState<InvoiceEditLine[]>(seedLines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLines(seedLines);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed when line identity changes
  }, [seedKey]);

  const updateLine = (index: number, patch: Partial<InvoiceEditLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const validate = (): string | null => {
    if (lines.length === 0) return 'No invoice lines to edit.';
    for (const line of lines) {
      if (!line.description.trim()) return `Line ${line.lineNo}: particulars are required.`;
      if (!(Number(line.unitPrice) > 0)) return `Line ${line.lineNo}: Rate/Unit must be greater than zero.`;
      if (!(Number(line.charged) > 0)) return `Line ${line.lineNo}: Charged must be greater than zero.`;
      if (line.showUsed && Number(line.used) < 0) {
        return `Line ${line.lineNo}: Used cannot be negative.`;
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
          description: line.description.trim(),
          quantity: Number(line.charged),
          unitPrice: Number(line.unitPrice),
          uom: line.uom.trim() || 'Per Service',
          usedQuantity: line.showUsed ? Number(line.used) : undefined,
        })),
      });
      onSaved('Invoice particulars updated and totals recalculated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-sky-200/80 bg-sky-50/40 p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Edit invoice particulars</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Adjust particulars, quantities, and rates. Tax and invoice totals update on save.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-sky-200/80 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2 font-medium">Line</th>
              <th className="px-2 py-2 font-medium">Particulars</th>
              {lines.some((l) => l.showUsed) ? (
                <th className="px-2 py-2 font-medium">Used</th>
              ) : null}
              <th className="px-2 py-2 font-medium">Charged</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 font-medium">Rate/Unit</th>
              <th className="px-2 py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.lineNo} className="border-b border-sky-100/80 align-top">
                <td className="px-2 py-2 text-gray-500">{line.lineNo}</td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                    className="min-w-[12rem] rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={saving}
                    aria-label={`Particulars line ${line.lineNo}`}
                  />
                </td>
                {line.showUsed ? (
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={line.used}
                      onChange={(e) => updateLine(index, { used: Number(e.target.value) })}
                      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      disabled={saving}
                      aria-label={`Used line ${line.lineNo}`}
                    />
                  </td>
                ) : null}
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
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={line.uom}
                    onChange={(e) => updateLine(index, { uom: e.target.value })}
                    className="min-w-[8rem] rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={saving}
                    aria-label={`Unit line ${line.lineNo}`}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                    disabled={saving}
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
        Save invoice changes
      </button>
    </div>
  );
}
