'use client';

import { useEffect, useState } from 'react';
import { getExcelJSModule, getXLSXModule } from '@/lib/dynamic-imports';
import type { BillingApi } from '@/lib/billing-api';

const AIRCRAFT_CODES = ['B', 'C', 'D', 'E', 'F'] as const;
const TEMPLATE_SERVICES = [
  'Pax Terminal Services',
  'Ramp Services',
  'Full Handling (Pax+Ramp)',
  'Cargo Ramp Handling',
];

export type CeilingRate = {
  aircraftCode: string;
  serviceType: string;
  amount: number;
};

export type AirportCommercial = {
  ownership: 'private' | 'aai';
  revenueShareMechanism: 'gross' | 'net';
  revenueSharePercent: number;
  minRevenueShareApplicable: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  ceilingRates?: CeilingRate[];
};

type Props = {
  api: BillingApi;
  initial?: AirportCommercial | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ConfigureRulesButton({
  api,
  initial,
  onSaved,
}: {
  api: BillingApi;
  initial?: AirportCommercial | null;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="min-h-10 rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white"
        onClick={() => setOpen(true)}
      >
        Configure rules
      </button>
      {open ? (
        <AirportRulesWizard
          api={api}
          initial={initial}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      ) : null}
    </>
  );
}

async function downloadTemplate() {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  const sheet = workbook.addWorksheet('Ceiling rates', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }],
    properties: { tabColor: { argb: 'FF1E3A5F' } },
  });
  sheet.columns = [
    { header: 'Aircraft code', key: 'aircraft', width: 18 },
    ...TEMPLATE_SERVICES.map((header, index) => ({
      header,
      key: `service${index}`,
      width: 28,
    })),
  ];
  const header = sheet.getRow(1);
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      left: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      bottom: { style: 'thin', color: { argb: 'FF1E3A5F' } },
      right: { style: 'thin', color: { argb: 'FF1E3A5F' } },
    };
  });
  AIRCRAFT_CODES.forEach((code) => {
    const row = sheet.addRow([code, null, null, null, null]);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D7E2' } },
        left: { style: 'thin', color: { argb: 'FFD0D7E2' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D7E2' } },
        right: { style: 'thin', color: { argb: 'FFD0D7E2' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'right' };
      if (col === 1) {
        cell.font = { name: 'Calibri', bold: true, size: 12, color: { argb: 'FF1E3A5F' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
      } else {
        cell.numFmt = '#,##0.00';
        cell.font = { name: 'Calibri', size: 11 };
      }
    });
  });
  sheet.autoFilter = 'A1:E6';
  sheet.addConditionalFormatting({
    ref: 'B2:E6',
    rules: [
      {
        type: 'cellIs',
        operator: 'greaterThan',
        formulae: ['0'],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD8F3DC' } },
          font: { color: { argb: 'FF1B4332' }, bold: true },
        },
      },
      {
        type: 'expression',
        formulae: ['LEN(TRIM(B2&""))=0'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF4D6' } },
        },
      },
    ],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'airport-ceiling-rates-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

async function parseCeilingWorkbook(file: File): Promise<CeilingRate[]> {
  const XLSX = await getXLSXModule();
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  if (grid.length < 2) {
    throw new Error('The workbook needs a header row and one row per aircraft code.');
  }
  const headers = grid[0].map((cell) => String(cell ?? '').trim());
  const serviceHeaders = headers.slice(1).filter(Boolean);
  if (serviceHeaders.length === 0) {
    throw new Error('The header row must name each service type after the aircraft column.');
  }
  const rates: CeilingRate[] = [];
  for (const row of grid.slice(1)) {
    const aircraftCode = String(row[0] ?? '').trim().toUpperCase();
    if (!aircraftCode) continue;
    if (!AIRCRAFT_CODES.includes(aircraftCode as (typeof AIRCRAFT_CODES)[number])) {
      throw new Error(`Aircraft code ${aircraftCode} is not B, C, D, E, or F.`);
    }
    headers.slice(1).forEach((serviceType, index) => {
      const label = String(serviceType ?? '').trim();
      if (!label) return;
      const raw = row[index + 1];
      if (raw === '' || raw == null) return;
      const amount = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(amount)) {
        throw new Error(`Amount for ${aircraftCode} / ${label} is not a number.`);
      }
      rates.push({ aircraftCode, serviceType: label, amount });
    });
  }
  if (rates.length === 0) {
    throw new Error('Enter at least one ceiling amount in the workbook.');
  }
  return rates;
}

export function AirportRulesWizard({ api, initial, onClose, onSaved }: Props) {
  const [step, setStep] = useState(0);
  const [ownership, setOwnership] = useState<'private' | 'aai'>(initial?.ownership ?? 'private');
  const [mechanism, setMechanism] = useState<'gross' | 'net'>(
    initial?.revenueShareMechanism ?? 'gross',
  );
  const [percent, setPercent] = useState(
    initial?.revenueSharePercent != null ? String(initial.revenueSharePercent) : '',
  );
  const [minShare, setMinShare] = useState(initial?.minRevenueShareApplicable ?? false);
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom?.slice(0, 10) ?? '');
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo?.slice(0, 10) ?? '');
  const [ceilingRates, setCeilingRates] = useState<CeilingRate[]>(initial?.ceilingRates ?? []);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void api.getSettings().then((res) => {
      const commercial = (res as { data?: { airportCommercial?: AirportCommercial } }).data
        ?.airportCommercial;
      if (cancelled || !commercial) return;
      setOwnership(commercial.ownership ?? 'private');
      setMechanism(commercial.revenueShareMechanism ?? 'gross');
      setPercent(
        commercial.revenueSharePercent != null ? String(commercial.revenueSharePercent) : '',
      );
      setMinShare(Boolean(commercial.minRevenueShareApplicable));
      setEffectiveFrom(commercial.effectiveFrom ? String(commercial.effectiveFrom).slice(0, 10) : '');
      setEffectiveTo(commercial.effectiveTo ? String(commercial.effectiveTo).slice(0, 10) : '');
      setCeilingRates(commercial.ceilingRates ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [api, initial]);

  const needsWorkbook = ownership === 'private' && minShare;
  const steps =
    ownership === 'aai'
      ? ['Ownership', 'Revenue share', 'Period']
      : needsWorkbook
        ? ['Ownership', 'Revenue share', 'Minimum share', 'Ceiling rates']
        : ['Ownership', 'Revenue share', 'Minimum share', 'Period'];

  const chooseOwnership = (next: 'private' | 'aai') => {
    setOwnership(next);
    setMechanism(next === 'private' ? 'gross' : 'net');
    if (next === 'aai') setMinShare(false);
  };

  const goNext = () => {
    setError('');
    if (step === 1) {
      const value = Number(percent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError('Enter a revenue share between 0 and 100.');
        return;
      }
    }
    if (!needsWorkbook && step === steps.length - 1) return;
    if (needsWorkbook && step === 2 && !effectiveFrom) {
      /* dates collected on last step */
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const save = async () => {
    setError('');
    if (!effectiveFrom || !effectiveTo) {
      setError('Enter the effective date and the valid-till date.');
      return;
    }
    if (effectiveTo < effectiveFrom) {
      setError('Valid till must be on or after the effective date.');
      return;
    }
    if (needsWorkbook && ceilingRates.length === 0) {
      setError('Upload the ceiling-rate workbook before saving.');
      return;
    }
    const value = Number(percent);
    setSaving(true);
    try {
      await api.updateSettings({
        airportCommercial: {
          ownership,
          revenueShareMechanism: mechanism,
          revenueSharePercent: value,
          minRevenueShareApplicable: needsWorkbook,
          effectiveFrom,
          effectiveTo,
          ceilingRates: needsWorkbook ? ceilingRates : [],
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="airport-rules-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[color:var(--billing-border)] bg-white p-4 shadow-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="airport-rules-title" className="text-base font-semibold text-[color:var(--billing-heading)]">
              Configure airport rules
            </h2>
            <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
              Step {step + 1} of {steps.length}: {steps[step]}
            </p>
          </div>
          <button type="button" className="text-sm text-[color:var(--billing-text-muted)]" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {step === 0 ? (
          <fieldset className="mt-4 grid gap-2">
            <legend className="text-sm font-medium text-[color:var(--billing-heading)]">Ownership</legend>
            {(
              [
                ['private', 'Private airport'],
                ['aai', 'Airport Authority'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm">
                <input
                  type="radio"
                  name="ownership"
                  checked={ownership === value}
                  onChange={() => chooseOwnership(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}

        {step === 1 ? (
          <div className="mt-4 grid gap-3">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-[color:var(--billing-heading)]">
                Revenue share mechanism
              </legend>
              {(
                [
                  ['gross', 'Share on gross'],
                  ['net', 'Share on net'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mechanism"
                    checked={mechanism === value}
                    onChange={() => setMechanism(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="grid gap-1 text-sm font-medium text-[color:var(--billing-heading)]">
              Revenue share %
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
              />
            </label>
          </div>
        ) : null}

        {ownership === 'private' && step === 2 ? (
          <fieldset className="mt-4 grid gap-2">
            <legend className="text-sm font-medium text-[color:var(--billing-heading)]">
              Does this station have a minimum revenue share?
            </legend>
            {(
              [
                [true, 'Yes — ceiling rates will be uploaded'],
                [false, 'No'],
              ] as const
            ).map(([value, label]) => (
              <label key={String(value)} className="flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm">
                <input
                  type="radio"
                  name="minShare"
                  checked={minShare === value}
                  onChange={() => setMinShare(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}

        {(ownership === 'aai' && step === 2) || (ownership === 'private' && step === 3) ? (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                  className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Valid till
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                  className="min-h-11 rounded-lg border border-[color:var(--billing-border)] px-3 font-normal"
                />
              </label>
            </div>
            {ownership === 'aai' ? (
              <p className="text-sm text-[color:var(--billing-text-muted)]">
                Airport Authority stations do not use a minimum revenue-share table.
              </p>
            ) : null}
            {needsWorkbook ? (
              <div className="grid gap-2 rounded-lg border border-[color:var(--billing-border)] p-3">
                <p className="text-sm text-[color:var(--billing-heading)]">
                  Header row is the service type. The first column is the aircraft code (B–F).
                </p>
                <button
                  type="button"
                  className="min-h-10 w-fit rounded-lg border border-[color:var(--billing-border)] px-3 text-sm font-semibold"
                  onClick={() => void downloadTemplate()}
                >
                  Download template
                </button>
                <label className="text-sm font-medium">
                  Upload workbook
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="mt-1 block w-full text-sm font-normal"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setError('');
                      setFileName(file.name);
                      void parseCeilingWorkbook(file)
                        .then(setCeilingRates)
                        .catch((err: unknown) => {
                          setCeilingRates([]);
                          setError(err instanceof Error ? err.message : 'Could not read the workbook');
                        });
                    }}
                  />
                </label>
                {fileName ? (
                  <p className="text-xs text-[color:var(--billing-text-muted)]">
                    {fileName}: {ceilingRates.length} ceiling amount{ceilingRates.length === 1 ? '' : 's'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {step > 0 ? (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm font-semibold"
              onClick={() => {
                setError('');
                setStep((current) => current - 1);
              }}
            >
              Back
            </button>
          ) : null}
          {step < steps.length - 1 ? (
            <button
              type="button"
              className="min-h-10 rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white"
              onClick={goNext}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              className="min-h-10 rounded-lg bg-[color:var(--billing-primary)] px-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save rules'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
