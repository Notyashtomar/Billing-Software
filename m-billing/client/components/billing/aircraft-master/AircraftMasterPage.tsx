'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { BillingDataTable } from '../BillingDataTable';
import { billingUi } from '../billingUi';
import { getExcelJSModule, getXLSXModule } from '@/lib/dynamic-imports';
import { formatBillingDate } from '@/lib/billing-shared/billing-date-format';
import type { BillingApi } from '@/lib/billing-api';

type AircraftMasterRow = {
  _id: string;
  serialNo: string;
  aircraftType: string;
  icaoCode: string;
  mtowKg: string;
  passengerCapacity: string;
  manufacturer: string;
  aircraftBody: string;
  wingspanM: string;
  description: string;
  active: string;
  category: string;
  activeSecondary: string;
  ceilingRate: string;
  arrayRate: string;
  validTill: string;
};

const COLUMN_LABELS = [
  'S_No_',
  'Aircraft Type',
  'Description',
  'Manufacturer',
  'Category',
  'Ceiling rate',
  'Aera rates',
  'Valid till',
  'ICAO Code',
  'MTOW (kg)',
  'Passenger Capacity',
  'Aircraft Body',
  'Wingspan (m)',
  'Status',
  'Status',
] as const;

const FIELD_BY_HEADER: Record<string, keyof Omit<AircraftMasterRow, '_id'> | 'activeSecondary'> = {
  's_no_': 'serialNo',
  'aircraft type': 'aircraftType',
  'icao code': 'icaoCode',
  'mtow (kg)': 'mtowKg',
  'passenger capacity': 'passengerCapacity',
  manufacturer: 'manufacturer',
  'aircraft body': 'aircraftBody',
  'wingspan (m)': 'wingspanM',
  description: 'description',
  category: 'category',
  'valid till': 'validTill',
  'ceiling rate': 'ceilingRate',
  'array rate': 'arrayRate',
  'aera rate': 'arrayRate',
  'aera rates': 'arrayRate',
};

function normalizeHeader(value: unknown): string {
  const key = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (key === 'array rate' || key === 'aera rate') return 'aera rates';
  if (key === 'active') return 'status';
  if (key === 'valid until' || key === 'valid to' || key === 'validity') return 'valid till';
  return key;
}

function missingHeaders(headers: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const required = new Map<string, { label: string; count: number }>();
  for (const label of COLUMN_LABELS) {
    const key = normalizeHeader(label);
    const current = required.get(key);
    if (current) current.count += 1;
    else required.set(key, { label, count: 1 });
  }
  const missing: string[] = [];
  for (const { label, count } of required.values()) {
    if ((counts.get(normalizeHeader(label)) ?? 0) < count) {
      missing.push(count > 1 ? `${label} (must appear ${count} times)` : label);
    }
  }
  return missing;
}

async function downloadAircraftMasterTemplate() {
  const ExcelJS = await getExcelJSModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRIS Billing';
  const sheet = workbook.addWorksheet('Aircraft master', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF1E3A5F' } },
  });
  sheet.columns = COLUMN_LABELS.map((header) => ({
    header,
    key: header,
    width: Math.max(16, header.length + 4),
  }));
  const header = sheet.getRow(1);
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  const validTillColumn = COLUMN_LABELS.indexOf('Valid till') + 1;
  if (validTillColumn > 0) sheet.getColumn(validTillColumn).numFmt = 'dd-mm-yyyy';
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'aircraft-master-template.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

function textCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

const TABLE_COLUMNS: Array<{ key: keyof AircraftMasterRow; header: string }> = [
  { key: 'serialNo', header: 'S_No_' },
  { key: 'aircraftType', header: 'Aircraft Type' },
  { key: 'description', header: 'Description' },
  { key: 'manufacturer', header: 'Manufacturer' },
  { key: 'category', header: 'Category' },
  { key: 'ceilingRate', header: 'Ceiling rate' },
  { key: 'arrayRate', header: 'Aera rates' },
  { key: 'validTill', header: 'Valid till' },
  { key: 'icaoCode', header: 'ICAO Code' },
  { key: 'mtowKg', header: 'MTOW (kg)' },
  { key: 'passengerCapacity', header: 'Passenger Capacity' },
  { key: 'aircraftBody', header: 'Aircraft Body' },
  { key: 'wingspanM', header: 'Wingspan (m)' },
  { key: 'active', header: 'Status' },
  { key: 'activeSecondary', header: 'Status' },
];

export function AircraftMasterPage({ api }: { api: BillingApi }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AircraftMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.listAircraftMaster();
      setRows((result.data ?? []) as AircraftMasterRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load aircraft master.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File) {
    setImporting(true);
    setError('');
    try {
      const XLSX = await getXLSXModule();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) {
        const message = 'Import was not added. The workbook has no sheet.';
        setError(message);
        window.alert(message);
        return;
      }
      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][];
      const headers = (matrix[0] ?? []).map((cell) => textCell(cell));
      const missing = missingHeaders(headers);
      if (missing.length > 0) {
        const message = `Import was not added. These columns are missing: ${missing.join(', ')}.`;
        setError(message);
        window.alert(message);
        return;
      }

      const headerIndexes = headers.map((header, index) => ({ header, index, key: normalizeHeader(header) }));
      let activeSeen = 0;
      const mapped = matrix.slice(1).map((line) => {
        const row: Record<string, string> = {};
        activeSeen = 0;
        for (const column of headerIndexes) {
          if (!column.key) continue;
          const field =
            column.key === 'status'
              ? activeSeen++ === 0
                ? 'active'
                : 'activeSecondary'
              : FIELD_BY_HEADER[column.key];
          if (!field || field in row) continue;
          row[field] = textCell(line?.[column.index]);
        }
        return row;
      });

      const result = await api.importAircraftMaster({ headers, rows: mapped });
      setRows((result.data ?? []) as AircraftMasterRow[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import was not added.';
      setError(message);
      window.alert(message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <BillingPageHeader
        title="Aircraft Master"
        description="Import an Excel sheet with the aircraft master column names. Blank cell values are allowed. Missing column names are rejected. Invoices and Regenerate invoice do not read this page."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={billingUi.btnSecondary}
              onClick={() => setTemplateOpen(true)}
            >
              Excel template
            </button>
            <label className={billingUi.btnPrimary}>
              {importing ? 'Importing…' : 'Import Excel'}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
            </label>
          </div>
        }
      />
      {templateOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setTemplateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="aircraft-template-title"
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[color:var(--billing-border)] bg-[color:var(--billing-surface)] p-4 shadow-lg sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="aircraft-template-title" className="text-base font-semibold text-[color:var(--billing-heading)]">
                  Aircraft master template
                </h2>
                <p className="mt-1 text-xs text-[color:var(--billing-text-muted)]">
                  Use this header row. Cell values may be blank. Both Status columns are required. Valid till is a date.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingTemplate}
                  className={billingUi.btnSecondary}
                  onClick={() => {
                    setDownloadingTemplate(true);
                    void downloadAircraftMasterTemplate().finally(() => setDownloadingTemplate(false));
                  }}
                >
                  {downloadingTemplate ? 'Downloading…' : 'Download'}
                </button>
                <button type="button" className="text-sm text-[color:var(--billing-text-muted)]" onClick={() => setTemplateOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[color:var(--billing-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[color:var(--billing-surface-muted)] text-[color:var(--billing-text-muted)]">
                  <tr>
                    {COLUMN_LABELS.map((label, index) => (
                      <th key={`${label}-${index}`} className="whitespace-nowrap px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[color:var(--billing-border)]">
                    {COLUMN_LABELS.map((label, index) => (
                      <td key={`${label}-blank-${index}`} className="px-3 py-3 text-[color:var(--billing-text-muted)]">
                        {label === 'Valid till' ? 'dd-mm-yyyy' : ''}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-[var(--billing-radius)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <BillingDataTable
        columns={TABLE_COLUMNS.map((column) => ({
          key: column.key,
          header: column.header,
          render: (row: AircraftMasterRow) => {
            const value = row[column.key];
            if (!value) return '—';
            if (column.key === 'validTill') return formatBillingDate(value, value);
            return value;
          },
        }))}
        rows={rows}
        loading={loading}
        emptyMessage="No aircraft master records yet. Import an Excel file to add them."
        getRowKey={(row) => row._id}
        footer={
          <p className="px-3 py-2 text-xs text-[color:var(--billing-text-muted)] sm:px-4">
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </p>
        }
      />
    </div>
  );
}
