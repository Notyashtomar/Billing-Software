'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BillingPageHeader } from '../BillingLayout';
import { BillingDataTable } from '../BillingDataTable';
import { billingUi } from '../billingUi';
import { getXLSXModule } from '@/lib/dynamic-imports';
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
};

const COLUMN_LABELS = [
  'S_No_',
  'Aircraft Type',
  'ICAO Code',
  'MTOW (kg)',
  'Passenger Capacity',
  'Manufacturer',
  'Aircraft Body',
  'Wingspan (m)',
  'Description',
  'Active',
  'Category',
  'Active',
  'Ceiling rate',
  'array rate',
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
  active: 'active',
  category: 'category',
  'ceiling rate': 'ceilingRate',
  'array rate': 'arrayRate',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

function textCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

const TABLE_COLUMNS: Array<{ key: keyof AircraftMasterRow; header: string }> = [
  { key: 'serialNo', header: 'S_No_' },
  { key: 'aircraftType', header: 'Aircraft Type' },
  { key: 'icaoCode', header: 'ICAO Code' },
  { key: 'mtowKg', header: 'MTOW (kg)' },
  { key: 'passengerCapacity', header: 'Passenger Capacity' },
  { key: 'manufacturer', header: 'Manufacturer' },
  { key: 'aircraftBody', header: 'Aircraft Body' },
  { key: 'wingspanM', header: 'Wingspan (m)' },
  { key: 'description', header: 'Description' },
  { key: 'active', header: 'Active' },
  { key: 'category', header: 'Category' },
  { key: 'activeSecondary', header: 'Active' },
  { key: 'ceilingRate', header: 'Ceiling rate' },
  { key: 'arrayRate', header: 'array rate' },
];

export function AircraftMasterPage({ api }: { api: BillingApi }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AircraftMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
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
            column.key === 'active'
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
        description="Import an Excel sheet with the aircraft master column names. Blank cell values are allowed. Missing column names are rejected."
        actions={
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
        }
      />
      {error ? (
        <p className="mb-4 rounded-[var(--billing-radius)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <BillingDataTable
        columns={TABLE_COLUMNS.map((column) => ({
          key: column.key,
          header: column.header,
          render: (row: AircraftMasterRow) => row[column.key] || '—',
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
