'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { loadFileSaverSaveAs } from '@/lib/lazy-client-deps';
import { getExcelJSModule } from '@/lib/dynamic-imports';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ScheduledAirlineCreateForm, {
  docToGatewayScheduledAirlineForm,
  EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM,
  type GatewayScheduledAirlineFormValues,
} from '@/components/fris/advance/ScheduledAirlineCreateForm';
import { toast } from 'sonner';
import {
  advanceDelete,
  advanceDocId,
  advanceList,
  ADVANCE_PATHS,
  deleteAdvanceScheduleSetupMaster,
  fetchAdvanceScheduleSetupMasters,
} from '@/lib/api';
import { getScheduleMasterFlightNo } from '@/components/fris/advance/scheduleAirlineViewModel';
import {
  GATEWAY_PAGE_ROOT,
  GATEWAY_TABLE_SECTION,
  GATEWAY_CONTROL,
  GATEWAY_GET_BTN,
  GATEWAY_SECONDARY_BTN,
  GATEWAY_LABEL,
} from '@/components/fris/advance/gatewayPageLayout';
import { GatewayStationMark } from '@/components/fris/advance/GatewayStationMark';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';

const GATEWAY_PATH = ADVANCE_PATHS.gatewayScheduledAirline;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_BADGE_STYLES: Record<string, string> = {
  Mon: 'bg-emerald-500',
  Tue: 'bg-emerald-500',
  Wed: 'bg-emerald-500',
  Thu: 'bg-emerald-500',
  Fri: 'bg-emerald-500',
  Sat: 'bg-emerald-500',
  Sun: 'bg-emerald-500',
};

function DayBadges({ value }: { value: string }) {
  const days = value
    .split(/,\s*/)
    .map((d) => d.trim())
    .filter(Boolean);
  if (days.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex items-center gap-1">
      {days.map((d) => (
        <span
          key={d}
          title={d}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-white ${
            DAY_BADGE_STYLES[d] ?? 'bg-gray-400'
          }`}
        >
          {d.charAt(0)}
        </span>
      ))}
    </div>
  );
}

function getStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function getBoolText(v: unknown): 'Yes' | 'No' {
  if (v === true) return 'Yes';
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
  return 'No';
}

function getDaysText(obj: Record<string, unknown>): string {
  const days = obj?.scheduleDays;
  if (!days || typeof days !== 'object' || Array.isArray(days)) return '';
  const picked = DAYS.filter((d) => {
    const v = (days as Record<string, unknown>)[d];
    const s = String(v ?? '').trim().toLowerCase();
    return v === true || s === 'true' || s === 'yes' || s === '1';
  });
  return picked.join(', ');
}

function masterDocId(doc: Record<string, unknown>): string {
  const rawId = doc._id ?? doc.id;
  if (!rawId) return '';
  if (typeof rawId === 'string') return rawId;
  if (typeof rawId === 'object' && rawId !== null && '$oid' in rawId)
    return String((rawId as { $oid: string }).$oid);
  if (typeof rawId === 'object' && rawId !== null && 'toString' in rawId)
    return String((rawId as { toString: () => string }).toString());
  return String(rawId);
}

export type ScheduledAirlineRow = {
  id: string;
  serialNo: string;
  airlineName: string;
  airlineCode: string;
  day: string;
  flightNo: string;
  freighter: string;
  sta: string;
  std: string;
  route: string;
  aircraft: string;
  aircraftBody: string;
  typeOfFlight: string;
  nextDay: string;
  validFrom: string;
  validTo: string;
  flightType: string;
  isSplit: 'Yes' | 'No';
  arrivalFltNo: string;
  departureFltNo: string;
  active: 'Yes' | 'No';
  stationCode?: string;
  /** Gateway master only — no schedule setup flight row yet. */
  isGatewayOnly?: boolean;
};

function mapScheduleDocToRow(doc: Record<string, unknown>): ScheduledAirlineRow | null {
  const id = masterDocId(doc);
  const serialNoRaw = doc?.serialNo != null ? String(doc.serialNo) : '';
  const data = (doc?.data && typeof doc.data === 'object' ? doc.data : {}) as Record<string, unknown>;
  if (!id && !serialNoRaw) return null;

  const serialNo = getStr(data, 'serialNo', 'SlNo', 'Serial No') || serialNoRaw || '--';
  const airlineName = getStr(data, 'airline', 'Airline');
  const airlineCode = getStr(data, 'Airline Code', 'airlineCode', 'code');

  return {
    id: id || serialNoRaw,
    serialNo,
    airlineName,
    airlineCode,
    day: getDaysText(data),
    flightNo: getScheduleMasterFlightNo(data),
    freighter: getStr(data, 'freighter', 'Freighter'),
    sta: getStr(data, 'staTime', 'STA Time'),
    std: getStr(data, 'stdTime', 'STD Time'),
    route: getStr(data, 'routing', 'Routing', 'route'),
    aircraft: getStr(data, 'aircraft', 'Aircraft', 'TypeCraft'),
    aircraftBody: getStr(data, 'aircraftBody', 'Aircraft Body'),
    typeOfFlight: getStr(data, 'Type of flight', 'flightType', 'Flight Type', 'flight'),
    nextDay: getStr(data, 'nextDay', 'Next Day'),
    validFrom: getStr(data, 'validFrom', 'Valid From', 'STA Date', 'staDate'),
    validTo: getStr(data, 'validTo', 'Valid To', 'STD Date', 'stdDate'),
    flightType: getStr(data, 'Flight Type', 'flightType', 'Type of flight', 'flight'),
    isSplit: getBoolText(data.ifOperationSplit ?? data['Operation Split']),
    arrivalFltNo: getStr(data, 'arrivalFlightNo', 'Arrival Flight No'),
    departureFltNo: getStr(data, 'departureFlightNo', 'Departure Flight No'),
    active: getBoolText(data.active ?? data.Active),
    stationCode: String(doc.stationCode ?? '').trim().toUpperCase(),
  };
}

function scheduleRowMatchesGateway(
  row: ScheduledAirlineRow,
  gatewayName: string,
  gatewayCode: string,
): boolean {
  const nameKey = gatewayName.trim().toLowerCase();
  const codeKey = gatewayCode.trim().toUpperCase();
  const rowName = row.airlineName.trim().toLowerCase();
  const rowCode = row.airlineCode.trim().toUpperCase();
  if (nameKey && rowName === nameKey) return true;
  if (codeKey && rowCode === codeKey) return true;
  return false;
}

function mapGatewayDocToRow(doc: Record<string, unknown>): ScheduledAirlineRow | null {
  const g = advanceDocId(doc);
  const airlineName = String(g.airlines ?? '').trim();
  const airlineCode = String(g.code ?? '').trim().toUpperCase();
  if (!g.id || (!airlineName && !airlineCode)) return null;

  const status = String(g.type ?? 'Active').trim();
  return {
    id: g.id,
    serialNo: '—',
    airlineName,
    airlineCode,
    day: '',
    flightNo: '',
    freighter: '',
    sta: '',
    std: '',
    route: '',
    aircraft: '',
    aircraftBody: '',
    typeOfFlight: String(g.typeOfAirline ?? ''),
    nextDay: '',
    validFrom: String(g.agreementValidFrom ?? ''),
    validTo: String(g.agreementValidTo ?? ''),
    flightType: String(g.typeOfAirline ?? ''),
    isSplit: 'No',
    arrivalFltNo: '',
    departureFltNo: '',
    active: status.toLowerCase() === 'inactive' ? 'No' : 'Yes',
    stationCode: String(g.stationCode ?? '').trim().toUpperCase(),
    isGatewayOnly: true,
  };
}

function mergeGatewayOnlyRows(
  scheduleRows: ScheduledAirlineRow[],
  gatewayDocs: Record<string, unknown>[],
): ScheduledAirlineRow[] {
  const gatewayOnlyRows = gatewayDocs
    .map((doc) => mapGatewayDocToRow(doc))
    .filter((row): row is ScheduledAirlineRow => row != null)
    .filter((gatewayRow) => {
      return !scheduleRows.some((scheduleRow) =>
        scheduleRowMatchesGateway(scheduleRow, gatewayRow.airlineName, gatewayRow.airlineCode),
      );
    });

  return [...scheduleRows, ...gatewayOnlyRows];
}

function findGatewayDocForRow(
  row: ScheduledAirlineRow,
  gatewayDocs: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (row.isGatewayOnly) {
    return gatewayDocs.find((doc) => advanceDocId(doc).id === row.id);
  }
  const nameKey = row.airlineName.trim().toLowerCase();
  const codeKey = row.airlineCode.trim().toUpperCase();
  return gatewayDocs.find((doc) => {
    const g = advanceDocId(doc);
    const gwName = String(g.airlines ?? '').trim().toLowerCase();
    const gwCode = String(g.code ?? '').trim().toUpperCase();
    if (nameKey && gwName === nameKey) return true;
    if (codeKey && gwCode === codeKey) return true;
    return false;
  });
}

const EDIT_COL_HEAD_CLASS =
  'sticky right-0 z-20 min-w-[7rem] border-l border-gray-200 bg-gray-50/95 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-700 whitespace-nowrap backdrop-blur-sm shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.35)]';
const EDIT_COL_CELL_CLASS =
  'sticky right-0 z-10 min-w-[7rem] border-l border-gray-100 bg-white px-3 py-2 text-right shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.18)] group-hover:bg-[#f7f8fa]';

const GATEWAY_EXPORT_HEADERS = [
  'Airlines',
  'Code',
  'Type Of Airline',
  'Address',
  'Address 2',
  'Reminder For Invoicing',
  'Agreement Valid From',
  'Agreement Valid To',
  'Email ID',
  'Change Scheduled Enable',
  'Type',
  'Link Aircraft Registration With Type',
  'Engineer Report',
  'Deep Cleaning',
  'Night Halt Cleaning',
  'Exterior Cleaning',
  'DCS Name',
  'Handling Type',
  'Wheelchair Service',
] as const;

const GATEWAY_EXPORT_HEADER_FILL = 'FF87CEEB';

function xlsxArrayBufferToBlob(buffer: ArrayBuffer | ArrayBufferView): Blob {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const plainBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([plainBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function gatewayFormToExportRow(
  f: GatewayScheduledAirlineFormValues,
): (string | number)[] {
  return [
    f.airlines,
    f.code,
    f.typeOfAirline,
    f.address,
    f.address2,
    f.reminderForInvoicing,
    f.agreementValidFrom,
    f.agreementValidTo,
    f.emailId,
    f.changeScheduledEnable ? 'Yes' : 'No',
    f.type,
    f.linkAircraftRegistrationWithType ? 'Yes' : 'No',
    f.engineerReport ? 'Yes' : 'No',
    f.deepCleaning ? 'Yes' : 'No',
    f.nightHaltCleaning ? 'Yes' : 'No',
    f.exteriorCleaning ? 'Yes' : 'No',
    f.dcsName,
    f.handlingType,
    f.wheelchairService ? 'Yes' : 'No',
  ];
}

function columnWidthForExport(header: string, values: string[]): number {
  const longestValue = values.reduce((max, value) => Math.max(max, value.length), 0);
  return Math.min(Math.max(header.length + 3, longestValue + 2, 14), 48);
}

function customerFilterKey(row: ScheduledAirlineRow): string {
  return row.airlineCode.trim().toUpperCase() || row.airlineName.trim().toUpperCase();
}

function rowMatchesCustomerFilter(row: ScheduledAirlineRow, customerKey: string): boolean {
  if (!customerKey) return true;
  return customerFilterKey(row) === customerKey;
}

function rowMatchesFlightNoFilter(row: ScheduledAirlineRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qNorm = normalizeSearchToken(q);
  const fields = [row.flightNo, row.arrivalFltNo, row.departureFltNo];
  return fields.some((field) => {
    const raw = String(field ?? '');
    if (!raw) return false;
    if (raw.toLowerCase().includes(qLower)) return true;
    return Boolean(qNorm && normalizeSearchToken(raw).includes(qNorm));
  });
}

/** Loose match: ignore spaces, dashes, slashes (e.g. GF0011 matches GF-0011). */
function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[\s\-_/.,]+/g, '');
}

function rowMatchesScheduleSearch(row: ScheduledAirlineRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qNorm = normalizeSearchToken(query);
  const haystacks = [
    row.serialNo,
    row.airlineName,
    row.airlineCode,
    row.stationCode,
    row.route,
    row.day,
    row.aircraft,
  ];
  return haystacks.some((field) => {
    const raw = String(field ?? '').toLowerCase();
    if (!raw) return false;
    if (raw.includes(q)) return true;
    if (qNorm && normalizeSearchToken(raw).includes(qNorm)) return true;
    return false;
  });
}

const TABLE_HEADERS = [
  'S No',
  'Airline',
  'Day',
  'Flight No',
  'Freighter',
  'STA',
  'STD',
  'Route',
  'Aircraft',
  'Aircraft Body',
  'Next Day',
  'Valid From',
  'Valid To',
  'Flight Type',
  'IsSplit',
  'Arrival Flt No',
  'Departure Flt No',
  'Active',
] as const;

export default function ScheduledAirlinesPage() {
  const [filter, setFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [flightNoFilter, setFlightNoFilter] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [rows, setRows] = useState<ScheduledAirlineRow[]>([]);
  const [gatewayDocs, setGatewayDocs] = useState<Record<string, unknown>[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<GatewayScheduledAirlineFormValues | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const [scheduleRaw, gatewayRaw] = await Promise.all([
        fetchAdvanceScheduleSetupMasters() as Promise<Record<string, unknown>[]>,
        advanceList(GATEWAY_PATH) as Promise<Record<string, unknown>[]>,
      ]);
      const mapped = scheduleRaw
        .map((doc) => mapScheduleDocToRow(doc))
        .filter((r): r is ScheduledAirlineRow => r != null);
      setRows(mergeGatewayOnlyRows(mapped, gatewayRaw));
      setGatewayDocs(gatewayRaw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule setup');
      setRows([]);
      setGatewayDocs([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const key = customerFilterKey(row);
      if (!key) continue;
      const label =
        row.airlineCode.trim() && row.airlineName.trim()
          ? `${row.airlineCode.trim().toUpperCase()} — ${row.airlineName.trim()}`
          : row.airlineCode.trim().toUpperCase() || row.airlineName.trim();
      map.set(key, label);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(
      (r) =>
        rowMatchesCustomerFilter(r, customerFilter) &&
        rowMatchesFlightNoFilter(r, flightNoFilter) &&
        rowMatchesScheduleSearch(r, filter),
    );
  }, [rows, customerFilter, flightNoFilter, filter]);

  const hasActiveFilters = Boolean(
    filter.trim() || customerFilter || flightNoFilter.trim(),
  );

  const clearFilters = () => {
    setCustomerFilter('');
    setFlightNoFilter('');
    setFilter('');
  };

  const resetFormState = () => {
    setEditingId(null);
    setEditingValues(null);
  };

  const handleOpenCreate = () => {
    resetFormState();
    setFormOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) {
      resetFormState();
    }
  };

  const handleEdit = (row: ScheduledAirlineRow) => {
    const gatewayDoc = findGatewayDocForRow(row, gatewayDocs);
    if (gatewayDoc) {
      const id = advanceDocId(gatewayDoc).id;
      setEditingId(id);
      setEditingValues(docToGatewayScheduledAirlineForm(gatewayDoc));
    } else {
      setEditingId(null);
      setEditingValues({
        ...EMPTY_GATEWAY_SCHEDULED_AIRLINE_FORM,
        airlines: row.airlineName,
        code: row.airlineCode,
      });
      toast.info(
        'No gateway record for this airline yet. Fill the form and save to create one.',
      );
    }
    setFormOpen(true);
  };

  const handleDelete = async (row: ScheduledAirlineRow) => {
    const label =
      [row.airlineName, row.flightNo].filter(Boolean).join(' · ') || 'this record';
    const deletePrompt = row.isGatewayOnly
      ? `Delete gateway airline “${label}”? This removes the gateway master record and cannot be undone.`
      : `Delete scheduled airline record “${label}”? This removes it from the database and cannot be undone.`;
    if (!window.confirm(deletePrompt)) {
      return;
    }

    setDeletingId(row.id);
    try {
      if (row.isGatewayOnly) {
        await advanceDelete(GATEWAY_PATH, row.id);
        toast.success('Gateway airline deleted');
      } else {
        await deleteAdvanceScheduleSetupMaster(row.id);
        toast.success('Scheduled airline deleted');
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportExcel = async () => {
    const q = filter.trim().toLowerCase();
    const exportDocs = gatewayDocs
      .filter((doc) => {
        const g = advanceDocId(doc);
        const airlines = String(g.airlines ?? '').trim().toLowerCase();
        const code = String(g.code ?? '').trim().toLowerCase();
        if (!airlines && !code) return false;
        if (!q) return true;
        return airlines.includes(q) || code.includes(q);
      })
      .sort((a, b) =>
        String(advanceDocId(a).airlines ?? '')
          .trim()
          .localeCompare(String(advanceDocId(b).airlines ?? '').trim(), undefined, {
            sensitivity: 'base',
          }),
      );

    if (exportDocs.length === 0) {
      toast.error('No gateway scheduled airline records to export.');
      return;
    }

    try {
      const exportRows = exportDocs.map((doc) =>
        gatewayFormToExportRow(docToGatewayScheduledAirlineForm(doc)),
      );

      const ExcelJS = await getExcelJSModule();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Gateway Scheduled Airlines', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.addRow([...GATEWAY_EXPORT_HEADERS]);
      exportRows.forEach((row) => {
        worksheet.addRow(row);
      });

      const headerRow = worksheet.getRow(1);
      headerRow.height = 34;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF0F172A' }, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GATEWAY_EXPORT_HEADER_FILL },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF7AB8D9' } },
          left: { style: 'thin', color: { argb: 'FF7AB8D9' } },
          bottom: { style: 'thin', color: { argb: 'FF7AB8D9' } },
          right: { style: 'thin', color: { argb: 'FF7AB8D9' } },
        };
      });

      GATEWAY_EXPORT_HEADERS.forEach((header, index) => {
        const columnValues = exportRows.map((row) => String(row[index] ?? ''));
        worksheet.getColumn(index + 1).width = columnWidthForExport(header, columnValues);
      });

      exportRows.forEach((_, rowIndex) => {
        const dataRow = worksheet.getRow(rowIndex + 2);
        dataRow.eachCell((cell) => {
          cell.alignment = { vertical: 'top', wrapText: true };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const saveAs = await loadFileSaverSaveAs();
      saveAs(
        xlsxArrayBufferToBlob(buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBufferView)),
        'gateway-scheduled-airlines.xlsx',
      );
      toast.success(`Exported ${exportDocs.length} airline(s) from gateway master.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed.');
    }
  };

  return (
    <div className={`${GATEWAY_PAGE_ROOT} min-w-0 max-w-full`}>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <motion.button
          type="button"
          onClick={handleOpenCreate}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`${GATEWAY_GET_BTN} inline-flex items-center gap-2`}
        >
          <Plus className="h-4 w-4" />
          Create New
        </motion.button>
      </div>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent
          instantOpen
          className="max-h-[92vh] w-[min(96vw,72rem)] max-w-none overflow-y-auto overflow-x-hidden border-gray-200 bg-white p-0"
        >
          <DialogHeader className="border-b border-gray-100 bg-gray-50/80 px-6 py-4 text-left">
            <DialogTitle className="text-base font-semibold text-gray-900">
              {editingId ? 'Edit Scheduled Airline' : 'Add Scheduled Airline'}
            </DialogTitle>
            <p className="mt-0.5 text-sm text-gray-500">
              Gateway master — saved to{' '}
              <span className="font-mono">advance_gateway_scheduled_airline</span> only.
            </p>
          </DialogHeader>
          <div className="overflow-visible px-6 py-5">
            <ScheduledAirlineCreateForm
              key={editingId ?? `create-${editingValues?.airlines ?? 'new'}`}
              editingId={editingId}
              initialValues={editingValues}
              onCancel={() => handleFormOpenChange(false)}
              onSaved={load}
            />
          </div>
        </DialogContent>
      </Dialog>

      <section className={`${GATEWAY_TABLE_SECTION} w-full min-w-0 max-w-full`}>
        <div className="grid w-full min-w-0 max-w-full shrink-0 grid-cols-1 gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="min-w-0">
              <label htmlFor="scheduled-airlines-customer-filter" className={GATEWAY_LABEL}>
                Customer
              </label>
              <AdminRadioDropdown
                id="scheduled-airlines-customer-filter"
                value={customerFilter}
                onChange={setCustomerFilter}
                placeholder="All customers"
                options={[
                  { value: '', label: 'All customers' },
                  ...customerOptions,
                ]}
                className="box-border h-10 min-h-10 max-h-10 w-full rounded-lg border-gray-200 px-3 py-0"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="scheduled-airlines-flight-filter" className={GATEWAY_LABEL}>
                Flight number
              </label>
              <input
                id="scheduled-airlines-flight-filter"
                type="text"
                value={flightNoFilter}
                onChange={(e) => setFlightNoFilter(e.target.value)}
                placeholder="e.g. GF2052 or 2052/2053"
                className={GATEWAY_CONTROL}
                aria-label="Filter by flight number"
              />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <label htmlFor="scheduled-airlines-search-filter" className={GATEWAY_LABEL}>
                Search
              </label>
              <div className="relative min-w-0">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden
                />
                <input
                  id="scheduled-airlines-search-filter"
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Serial, route, aircraft, day…"
                  className={`${GATEWAY_CONTROL} pl-9`}
                  aria-label="Search serial, route, aircraft"
                />
              </div>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:justify-end">
          {hasActiveFilters && (
            <span className="whitespace-nowrap text-sm text-gray-600">
              <span className="font-semibold text-emerald-600">{filteredRows.length}</span>
              {' '}
              of {rows.length}
            </span>
          )}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className={`${GATEWAY_SECONDARY_BTN} shrink-0`}
            >
              Clear filters
            </button>
          ) : null}
          <motion.button
            type="button"
            onClick={() => void load()}
            disabled={listLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`${GATEWAY_GET_BTN} w-full shrink-0 justify-center sm:w-auto`}
          >
            <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
            {listLoading ? 'Loading…' : 'Refresh'}
          </motion.button>
          <motion.button
            type="button"
            onClick={() => void handleExportExcel()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`${GATEWAY_SECONDARY_BTN} w-full shrink-0 justify-center sm:w-auto`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </motion.button>
          </div>
        </div>
        <div className="w-full min-w-0 max-w-full flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-sm text-left min-w-[1900px]">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm">
              <tr>
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 font-semibold text-gray-700 whitespace-nowrap text-xs uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
                <th className={EDIT_COL_HEAD_CLASS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-gray-500">
                    Loading schedule records…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={19} className="px-4 py-10 text-center text-gray-500">
                    {rows.length === 0
                      ? 'No scheduled airlines or gateway records yet. Use Create New to add a gateway airline.'
                      : 'No rows match your search.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} className="group border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums">{index + 1}</td>
                    <td className="px-3 py-2 text-gray-900 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <GatewayStationMark code={row.stationCode} />
                        {row.airlineName}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><DayBadges value={row.day} /></td>
                    <td className="px-3 py-2 text-gray-800 whitespace-nowrap font-medium">{row.flightNo || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.freighter}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.sta}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.std}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.route}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.aircraft}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.aircraftBody}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.nextDay}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.validFrom}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.validTo}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.flightType}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.isSplit}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.arrivalFltNo}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{row.departureFltNo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.active === 'Yes' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {row.active}
                      </span>
                    </td>
                    <td className={EDIT_COL_CELL_CLASS}>
                      <div className="inline-flex items-center justify-end gap-1">
                        <motion.button
                          type="button"
                          onClick={() => handleEdit(row)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="Edit gateway airline"
                        >
                          <Pencil className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          disabled={deletingId === row.id}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete scheduled airline"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
