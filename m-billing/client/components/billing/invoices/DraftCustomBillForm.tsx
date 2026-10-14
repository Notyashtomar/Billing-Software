'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { BillingApi } from '@/lib/billing-api';
import type { BillingInvoiceHeader } from '@/lib/billing-shared/types';

type CustomerMaster = {
  name?: string;
  address?: string;
  gstRegistrationNo?: string;
};

type StandardLine = {
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  uom: string;
};

type CustomLine = {
  lineNo: number;
  particular: string;
  used: number;
  charged: number;
  aircraftType: string;
  unit: string;
  ratePerUnit: number;
};

type Props = {
  api: BillingApi;
  draftId: string;
  header: BillingInvoiceHeader;
  invoiceLines: Array<Record<string, unknown>>;
  customerMaster?: CustomerMaster;
  isCustomCategory: boolean;
  onSaved: (message: string) => void;
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[color:var(--billing-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--billing-accent)]/30';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

function gstStateFromGstin(gstin: string): string {
  const trimmed = gstin.trim();
  return trimmed.length >= 2 ? trimmed.slice(0, 2) : '';
}

function seedStandardLines(lines: Array<Record<string, unknown>>): StandardLine[] {
  return lines
    .filter((l) => String(l.lineType ?? 'service') === 'service')
    .map((l) => ({
      lineNo: Number(l.lineNo ?? 0),
      description: String(l.description ?? ''),
      quantity: Number(l.quantity ?? 0),
      unitPrice: Number(l.unitPrice ?? 0),
      uom: String(l.uom ?? 'Per Flight'),
    }))
    .filter((l) => l.lineNo > 0)
    .sort((a, b) => a.lineNo - b.lineNo);
}

function seedCustomLines(lines: Array<Record<string, unknown>>): CustomLine[] {
  return lines
    .filter((l) => String(l.lineType ?? 'service') === 'service')
    .map((l) => {
      const sourceRef = (l.sourceRef ?? {}) as Record<string, unknown>;
      return {
        lineNo: Number(l.lineNo ?? 0),
        particular: String(l.description ?? ''),
        used: Number(sourceRef.usedQuantity ?? l.quantity ?? 1),
        charged: Number(sourceRef.chargedQuantity ?? l.quantity ?? 1),
        aircraftType: String(sourceRef.aircraftType ?? '').trim().toUpperCase(),
        unit: String(l.uom ?? 'Per Service'),
        ratePerUnit: Number(sourceRef.ratePerUnit ?? l.unitPrice ?? 0),
      };
    })
    .filter((l) => l.lineNo > 0)
    .sort((a, b) => a.lineNo - b.lineNo);
}

export function DraftCustomBillForm({
  api,
  draftId,
  header,
  invoiceLines,
  customerMaster,
  isCustomCategory,
  onSaved,
}: Props) {
  const overrides = header.customBillOverrides ?? {};
  const seedKey = `${draftId}:${header.customBillOverrides?.updatedAt ?? ''}:${invoiceLines.length}`;

  const [billToName, setBillToName] = useState(header.customerName ?? '');
  const [billToAddress, setBillToAddress] = useState(
    header.customerAddress?.trim() || customerMaster?.address?.trim() || '',
  );
  const [billToGstin, setBillToGstin] = useState(
    overrides.billToGstin?.trim() || customerMaster?.gstRegistrationNo?.trim() || '',
  );
  const [billToPan, setBillToPan] = useState(overrides.billToPan?.trim() || '');
  const [billToStateCode, setBillToStateCode] = useState(
    overrides.billToStateCode?.trim() || gstStateFromGstin(billToGstin),
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(overrides.placeOfSupply?.trim() || '');
  const [serviceStation, setServiceStation] = useState(
    overrides.serviceStation?.trim() || header.stationCode || '',
  );
  const [serviceTableTitle, setServiceTableTitle] = useState(
    overrides.serviceTableTitle?.trim() ||
      String(invoiceLines[0]?.description ?? '').trim() ||
      '',
  );
  const [standardLines, setStandardLines] = useState<StandardLine[]>(() =>
    seedStandardLines(invoiceLines),
  );
  const [customLines, setCustomLines] = useState<CustomLine[]>(() => seedCustomLines(invoiceLines));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBillToName(header.customerName ?? '');
    setBillToAddress(
      header.customerAddress?.trim() || customerMaster?.address?.trim() || '',
    );
    const gst =
      header.customBillOverrides?.billToGstin?.trim() ||
      customerMaster?.gstRegistrationNo?.trim() ||
      '';
    setBillToGstin(gst);
    setBillToPan(header.customBillOverrides?.billToPan?.trim() || '');
    setBillToStateCode(
      header.customBillOverrides?.billToStateCode?.trim() || gstStateFromGstin(gst),
    );
    setPlaceOfSupply(header.customBillOverrides?.placeOfSupply?.trim() || '');
    setServiceStation(
      header.customBillOverrides?.serviceStation?.trim() || header.stationCode || '',
    );
    setServiceTableTitle(
      header.customBillOverrides?.serviceTableTitle?.trim() ||
        String(invoiceLines[0]?.description ?? '').trim() ||
        '',
    );
    setStandardLines(seedStandardLines(invoiceLines));
    setCustomLines(seedCustomLines(invoiceLines));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reseed when draft identity changes
  }, [seedKey]);

  const hasOverrides = useMemo(
    () => Boolean(header.customBillOverrides?.updatedAt),
    [header.customBillOverrides?.updatedAt],
  );

  const updateStandardLine = (lineNo: number, patch: Partial<StandardLine>) => {
    setStandardLines((prev) =>
      prev.map((line) => (line.lineNo === lineNo ? { ...line, ...patch } : line)),
    );
  };

  const updateCustomLine = (lineNo: number, patch: Partial<CustomLine>) => {
    setCustomLines((prev) =>
      prev.map((line) => (line.lineNo === lineNo ? { ...line, ...patch } : line)),
    );
  };

  const handleSave = async () => {
    if (!billToName.trim()) {
      setError('Bill-to name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const linesPayload = isCustomCategory
        ? customLines.map((line) => ({
            lineNo: line.lineNo,
            particular: line.particular.trim(),
            used: line.used,
            charged: line.charged,
            aircraftType: line.aircraftType.trim() || undefined,
            uom: line.unit.trim() || 'Per Service',
            ratePerUnit: line.ratePerUnit,
          }))
        : standardLines.map((line) => ({
            lineNo: line.lineNo,
            description: line.description.trim(),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            uom: line.uom.trim() || 'Per Flight',
          }));

      await api.updateCustomBillDraft(draftId, {
        billToName: billToName.trim(),
        billToAddress: billToAddress.trim(),
        billToGstin: billToGstin.trim() || undefined,
        billToPan: billToPan.trim() || undefined,
        billToStateCode: billToStateCode.trim() || undefined,
        placeOfSupply: placeOfSupply.trim() || undefined,
        serviceStation: serviceStation.trim() || undefined,
        serviceTableTitle: serviceTableTitle.trim() || undefined,
        lines: linesPayload,
      });
      onSaved('Custom bill corrections saved. Regenerate PDF to preview changes.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save custom bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Custom bill corrections</h2>
        <p className="mt-1 text-sm text-gray-600">
          Fix bill-to address, GSTIN/PAN/state, location, and line particulars on this draft before
          PDF or approval. Changes apply to this invoice only — not the customer master.
        </p>
        {hasOverrides ? (
          <p className="mt-2 text-xs font-medium text-amber-900">
            Custom overrides active
            {header.customBillOverrides?.updatedBy
              ? ` · last saved by ${header.customBillOverrides.updatedBy}`
              : ''}
          </p>
        ) : null}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Bill-to</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="custom-bill-name">
              Bill-to name
            </label>
            <input
              id="custom-bill-name"
              className={inputClass}
              value={billToName}
              onChange={(e) => setBillToName(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="custom-bill-address">
              Bill-to address
            </label>
            <textarea
              id="custom-bill-address"
              rows={4}
              className={inputClass}
              value={billToAddress}
              onChange={(e) => setBillToAddress(e.target.value)}
              placeholder="Street, city, state, PIN — as printed on the tax invoice"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">GSTIN / UIN and state</h3>
        <p className="mt-1 text-xs text-gray-500">
          Printed below the bill-to block on the PDF (GSTIN/UIN, PAN, State Code).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="custom-bill-gstin">
              GSTIN / UIN
            </label>
            <input
              id="custom-bill-gstin"
              className={inputClass}
              value={billToGstin}
              onChange={(e) => {
                setBillToGstin(e.target.value.toUpperCase());
                if (!billToStateCode.trim()) {
                  setBillToStateCode(gstStateFromGstin(e.target.value));
                }
              }}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="custom-bill-pan">
              PAN No.
            </label>
            <input
              id="custom-bill-pan"
              className={inputClass}
              value={billToPan}
              onChange={(e) => setBillToPan(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="custom-bill-state">
              State Code
            </label>
            <input
              id="custom-bill-state"
              className={inputClass}
              value={billToStateCode}
              onChange={(e) => setBillToStateCode(e.target.value)}
              maxLength={2}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Location on invoice</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="custom-bill-place">
              Place of supply
            </label>
            <input
              id="custom-bill-place"
              className={inputClass}
              value={placeOfSupply}
              onChange={(e) => setPlaceOfSupply(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="custom-bill-station">
              Service station / location
            </label>
            <input
              id="custom-bill-station"
              className={inputClass}
              value={serviceStation}
              onChange={(e) => setServiceStation(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="custom-bill-title">
              Service / particulars title
            </label>
            <input
              id="custom-bill-title"
              className={inputClass}
              value={serviceTableTitle}
              onChange={(e) => setServiceTableTitle(e.target.value)}
              placeholder="Heading above the line items table on the PDF"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Line particulars</h3>
        <div className="mt-4 overflow-x-auto">
          {isCustomCategory ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Particular</th>
                  <th className="px-2 py-2">Used</th>
                  <th className="px-2 py-2">Charged</th>
                  <th className="px-2 py-2">A/C</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2">Rate/Unit</th>
                </tr>
              </thead>
              <tbody>
                {customLines.map((line) => (
                  <tr key={line.lineNo} className="border-b border-gray-100">
                    <td className="px-2 py-2 tabular-nums">{line.lineNo}</td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={line.particular}
                        onChange={(e) =>
                          updateCustomLine(line.lineNo, { particular: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className={inputClass}
                        value={line.used}
                        onChange={(e) =>
                          updateCustomLine(line.lineNo, { used: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className={inputClass}
                        value={line.charged}
                        onChange={(e) =>
                          updateCustomLine(line.lineNo, { charged: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={line.aircraftType}
                        onChange={(e) =>
                          updateCustomLine(line.lineNo, {
                            aircraftType: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={line.unit}
                        onChange={(e) => updateCustomLine(line.lineNo, { unit: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={line.ratePerUnit}
                        onChange={(e) =>
                          updateCustomLine(line.lineNo, { ratePerUnit: Number(e.target.value) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Description / particular</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2">Rate/Unit</th>
                </tr>
              </thead>
              <tbody>
                {standardLines.map((line) => (
                  <tr key={line.lineNo} className="border-b border-gray-100">
                    <td className="px-2 py-2 tabular-nums">{line.lineNo}</td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={line.description}
                        onChange={(e) =>
                          updateStandardLine(line.lineNo, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className={inputClass}
                        value={line.quantity}
                        onChange={(e) =>
                          updateStandardLine(line.lineNo, { quantity: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={inputClass}
                        value={line.uom}
                        onChange={(e) => updateStandardLine(line.lineNo, { uom: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass}
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateStandardLine(line.lineNo, { unitPrice: Number(e.target.value) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {saving ? 'Saving…' : 'Save custom bill'}
        </button>
        <p className="text-xs text-gray-500">
          After saving, use <strong>Generate PDF</strong> or <strong>View PDF</strong> to verify the
          corrected bill.
        </p>
      </div>
    </div>
  );
}
