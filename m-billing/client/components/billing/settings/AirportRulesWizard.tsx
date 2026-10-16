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

function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function workbookServices(rates: CeilingRate[]): string[] {
  const extras = rates
    .map((rate) => rate.serviceType.trim())
    .filter((service) => service && !(TEMPLATE_SERVICES as readonly string[]).includes(service));
  return [...TEMPLATE_SERVICES, ...Array.from(new Set(extras))];
}

function workbookAircraft(rates: CeilingRate[]): string[] {
  const known = new Set<string>(AIRCRAFT_CODES);
  const extras = rates
    .map((rate) => rate.aircraftCode.trim().toUpperCase())
    .filter((code) => code && !known.has(code));
  return [...AIRCRAFT_CODES, ...Array.from(new Set(extras))];
}

export async function downloadMagRatesWorkbook(
  rates: CeilingRate[] = [],
  fileName = 'airport-mag-rates.xlsx',
) {
  const ExcelJS = await getExcelJSModule();
  const services = workbookServices(rates);
  const aircraft = workbookAircraft(rates);
  const amounts = new Map(
    rates.map((rate) => [`${rate.aircraftCode.trim().toUpperCase()}|${rate.serviceType.trim()}`, rate.amount]),
  );
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  const sheet = workbook.addWorksheet('MAG rates', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }],
    properties: { tabColor: { argb: 'FF1E3A5F' } },
  });
  sheet.columns = [
    { header: 'Aircraft code', key: 'aircraft', width: 18 },
    ...services.map((header, index) => ({
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
  aircraft.forEach((code) => {
    const row = sheet.addRow([
      code,
      ...services.map((service) => amounts.get(`${code}|${service}`) ?? null),
    ]);
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
  const lastColumn = columnLetter(services.length + 1);
  const lastRow = aircraft.length + 1;
  sheet.autoFilter = `A1:${lastColumn}${lastRow}`;
  sheet.addConditionalFormatting({
    ref: `B2:${lastColumn}${lastRow}`,
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
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadTemplate() {
  await downloadMagRatesWorkbook([], 'airport-mag-rates-template.xlsx');
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
    throw new Error('Enter at least one MAG amount in the workbook.');
  }
  return rates;
}

export function AirportRulesWizard({ api, initial, onClose, onSaved }: Props) {
  const [step, setStep] = useState(0);
  const [ownership, setOwnership] = useState<'private' | 'aai'>(initial?.ownership ?? 'private');
  const [minShare, setMinShare] = useState(initial?.minRevenueShareApplicable ?? false);
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
      setMinShare(Boolean(commercial.minRevenueShareApplicable));
      setCeilingRates(commercial.ceilingRates ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [api, initial]);

  const needsWorkbook = ownership === 'private' && minShare;
  const steps: { id: 'ownership' | 'minimum' | 'mag'; label: string }[] =
    ownership === 'aai'
      ? [{ id: 'ownership', label: 'Ownership' }]
      : [
          { id: 'ownership', label: 'Ownership' },
          { id: 'minimum', label: 'Minimum share' },
          { id: 'mag', label: 'MAG rates' },
        ];
  const stepIndex = Math.min(step, steps.length - 1);
  const currentStep = steps[stepIndex];
  const onMagStep = currentStep.id === 'mag';
  const canSaveNow = ownership === 'aai' || onMagStep || (currentStep.id === 'minimum' && !minShare);

  const chooseOwnership = (next: 'private' | 'aai') => {
    setOwnership(next);
    if (next === 'aai') {
      setMinShare(false);
      setStep(0);
    }
  };

  const goNext = () => {
    setError('');
    if (currentStep.id === 'ownership' && ownership === 'aai') return;
    if (currentStep.id === 'minimum' && !minShare) return;
    setStep(stepIndex + 1);
  };

  const save = async () => {
    setError('');
    if (needsWorkbook && ceilingRates.length === 0) {
      setError('Upload the MAG rates workbook before saving.');
      return;
    }
    setSaving(true);
    try {
      await api.updateSettings({
        airportCommercial: {
          ownership,
          minRevenueShareApplicable: needsWorkbook,
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
              Step {stepIndex + 1} of {steps.length}: {currentStep.label}
            </p>
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {steps.map((item, index) => (
                <li
                  key={item.id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    index === stepIndex
                      ? 'bg-[color:var(--billing-primary)] text-white'
                      : item.id === 'mag' && !needsWorkbook
                        ? 'bg-[color:var(--billing-border)] text-[color:var(--billing-text-muted)] opacity-50'
                        : 'bg-[color:var(--billing-border)] text-[color:var(--billing-text-muted)]'
                  }`}
                >
                  {index + 1}. {item.label}
                </li>
              ))}
            </ol>
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

        {currentStep.id === 'ownership' ? (
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

        {currentStep.id === 'minimum' ? (
          <fieldset className="mt-4 grid gap-2">
            <legend className="text-sm font-medium text-[color:var(--billing-heading)]">
              Does this station have a minimum revenue share?
            </legend>
            {(
              [
                [true, 'Yes — (MAG rates applicable)'],
                [false, 'No'],
              ] as const
            ).map(([value, label]) => (
              <label key={String(value)} className="flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--billing-border)] px-3 text-sm">
                <input
                  type="radio"
                  name="minShare"
                  value={value ? 'yes' : 'no'}
                  checked={minShare === value}
                  onChange={() => {
                    setMinShare(value);
                    if (value) {
                      const magIndex = steps.findIndex((item) => item.id === 'mag');
                      if (magIndex >= 0) setStep(magIndex);
                    }
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
        ) : null}

        {currentStep.id === 'mag' ? (
          <div className="mt-4 grid gap-3">
              <div className="grid gap-2 rounded-lg border border-[color:var(--billing-border)] p-3">
                <p className="text-sm font-medium text-[color:var(--billing-heading)]">Upload MAG rates</p>
                <p className="text-sm text-[color:var(--billing-text-muted)]">
                  The header row is the service type. The first column is the aircraft code (B–F).
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
                    {fileName}: {ceilingRates.length} MAG rate{ceilingRates.length === 1 ? '' : 's'}
                  </p>
                ) : ceilingRates.length > 0 ? (
                  <p className="text-xs text-[color:var(--billing-text-muted)]">
                    {ceilingRates.length} MAG rate{ceilingRates.length === 1 ? '' : 's'} already uploaded. Upload again to replace them.
                  </p>
                ) : null}
              </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {stepIndex > 0 ? (
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
          {!canSaveNow ? (
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
