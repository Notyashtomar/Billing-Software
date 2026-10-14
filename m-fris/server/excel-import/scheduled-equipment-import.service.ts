import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  StationScopeContext,
} from '../common/station/station-scope';
import { LEGACY_STATION_CODE } from '../common/station/station.constants';
import { staDateToIsoYmd } from './maa-flat-import.util';
import {
  buildFhrEquipmentDetailItem,
  dedupeEquipmentDetailItems,
  excelCellToDdMmYyyy,
  scheduledEquipmentHeaderMap,
  scheduledEquipmentRowSerialNo,
  ScheduledEquipmentCanonicalRow,
  normalizeScheduledEquipmentRow,
  textCell,
  unmappedScheduledEquipmentHeaders,
  valuesLooselyMatch,
} from './scheduled-equipment-import.util';

export type ScheduledEquipmentImportOptions = {
  /** Validate and build lines only — no MongoDB writes. */
  dryRun?: boolean;
  /** Defaults to `Sheet1` (or the first worksheet). */
  sheetName?: string;
  /** Merge onto whatever `equipmentDetails` already exists instead of replacing it per flight. */
  append?: boolean;
  /** Skip (instead of just warning on) rows whose Customer/Flight/Date/Route/Type Craft/Category mismatch the existing flight. */
  strict?: boolean;
  /**
   * Allow stamping a brand-new `fhr_collection` doc when `Serial Number` has no existing
   * flight. Off by default — this seed expects the flight/FHR data to already exist.
   */
  allowCreateFlight?: boolean;
  /**
   * Station stamped when `allowCreateFlight` inserts a brand-new doc.
   * Also used as the lookup station when `lookupStation` is omitted.
   * Defaults to MAA.
   */
  station?: string;
  /**
   * Confine Serial Number lookups to this station (e.g. `IXC`).
   * Defaults to cross-station when omitted (legacy MAA behaviour).
   */
  lookupStation?: string;
  /** Inclusive STD Date filter (`YYYY-MM-DD`). */
  fromYmd?: string | null;
  /** Inclusive STD Date filter (`YYYY-MM-DD`). */
  toYmd?: string | null;
  /**
   * Expand Excel `Equipment No` short codes to billing-trackable full names before write.
   * Defaults to {@link toBillingTrackableFullName} for every station.
   */
  resolveEquipmentName?: (equipmentNo: string) => string;
  /** Only import these `Serial Number` values (comma-free list of numbers). */
  onlySerials?: number[] | null;
  /**
   * STD / ATD / From / To cells whose cached display text is `dd/mm/yyyy`
   * win over the numeric serial. Some DEL exports label the format `m/d/yy`
   * but the visible text is day/month (e.g. `30/09/2026`).
   */
  preferDisplayedDmyDates?: boolean;
};

export type ScheduledEquipmentMismatchWarning = {
  serialNo: number;
  field: string;
  excelValue: string;
  existingValue: string;
};

export type ScheduledEquipmentImportSummary = {
  dryRun: boolean;
  sheetName: string;
  totalRowsRead: number;
  distinctFlightsInWorkbook: number;
  flightsProcessed: number;
  flightsSkippedNotFound: number;
  equipmentLinesWritten: number;
  skippedRows: number;
  rowsSkippedOutOfRange: number;
  unresolvedEquipmentCodes: string[];
  rowErrors: { rowIndex: number; serialNo?: string; message: string }[];
  mismatchWarnings: ScheduledEquipmentMismatchWarning[];
  unmappedHeaders: string[];
  notes: string[];
};

const DMY_DISPLAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Date columns whose Excel display text is day/month/year even when the serial is not. */
const DISPLAY_DMY_HEADERS = new Set([
  'stddate',
  'atddate',
  'fromdate',
  'todate',
]);

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function applyDisplayedDmyDates(sheet: XLSX.WorkSheet): void {
  const ref = sheet['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const dateCols: number[] = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    const header = textCell(headerCell?.v);
    if (header && DISPLAY_DMY_HEADERS.has(headerKey(header))) dateCols.push(c);
  }
  for (const c of dateCols) {
    for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) continue;
      const shown = textCell(cell.w);
      const match = DMY_DISPLAY.exec(shown);
      if (!match) continue;
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      cell.t = 's';
      cell.v = `${day}/${month}/${match[3]}`;
    }
  }
}

type RowEntry = { rowIndex: number; row: ScheduledEquipmentCanonicalRow };

/** Fields on the workbook that only serve as match/sanity-check keys against the already-seeded flight. */
const MATCH_KEY_FIELDS: {
  field: string;
  excel: (row: ScheduledEquipmentCanonicalRow) => string;
  existing: (existing: Record<string, unknown>) => string;
}[] = [
  {
    field: 'Customer Name',
    excel: (r) => textCell(r.customerName),
    existing: (e) => textCell((e.mainDetails as Record<string, unknown>)?.Airline),
  },
  {
    field: 'Customer Code',
    excel: (r) => textCell(r.customerCode),
    existing: (e) => textCell((e.mainDetails as Record<string, unknown>)?.Arline_Code),
  },
  {
    field: 'Flight No',
    excel: (r) => textCell(r.flightNo),
    existing: (e) => {
      const md = (e.mainDetails as Record<string, unknown>) ?? {};
      const td = (e.terminalDetails as Record<string, unknown>) ?? {};
      return textCell(td.FlightNo) || textCell(md.ArrivalFltNo) || textCell(md.DepartureFltNo);
    },
  },
  {
    field: 'STD Date',
    excel: (r) => excelCellToDdMmYyyy(r.stdDate),
    existing: (e) => {
      const td = (e.terminalDetails as Record<string, unknown>) ?? {};
      const rd = (e.rampDetails1 as Record<string, unknown>) ?? {};
      return textCell(td.STDDate) || textCell(rd.STDDate);
    },
  },
  {
    field: 'ATD Date',
    excel: (r) => excelCellToDdMmYyyy(r.atdDate),
    existing: (e) => textCell((e.mainDetails as Record<string, unknown>)?.ATDDate),
  },
  {
    field: 'Route',
    excel: (r) => textCell(r.route),
    existing: (e) => {
      const md = (e.mainDetails as Record<string, unknown>) ?? {};
      const rd = (e.rampDetails1 as Record<string, unknown>) ?? {};
      const td = (e.terminalDetails as Record<string, unknown>) ?? {};
      return textCell(md.Route) || textCell(rd.Route) || textCell(td.routing);
    },
  },
  {
    field: 'Type Craft',
    excel: (r) => textCell(r.typeCraft),
    existing: (e) => {
      const md = (e.mainDetails as Record<string, unknown>) ?? {};
      const td = (e.terminalDetails as Record<string, unknown>) ?? {};
      return textCell(md.TypeCraft) || textCell(td.TypeCraft);
    },
  },
  {
    field: 'Category Of Flight',
    excel: (r) => textCell(r.categoryOfFlight),
    existing: (e) => textCell((e.mainDetails as Record<string, unknown>)?.Cate_of_Flight),
  },
];

@Injectable()
export class ScheduledEquipmentImportService {
  private readonly log = new Logger(ScheduledEquipmentImportService.name);

  constructor(private readonly fhrCollectionService: FhrCollectionService) {}

  async importFromFilePath(
    absolutePath: string,
    opts: ScheduledEquipmentImportOptions = {},
  ): Promise<ScheduledEquipmentImportSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  async importFromBuffer(
    buffer: Buffer,
    opts: ScheduledEquipmentImportOptions = {},
  ): Promise<ScheduledEquipmentImportSummary> {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  private async importWorkbook(
    wb: XLSX.WorkBook,
    opts: ScheduledEquipmentImportOptions,
  ): Promise<ScheduledEquipmentImportSummary> {
    const dryRun = !!opts.dryRun;
    const append = !!opts.append;
    const strict = !!opts.strict;
    const allowCreateFlight = !!opts.allowCreateFlight;
    const fromYmd = opts.fromYmd?.trim() || null;
    const toYmd = opts.toYmd?.trim() || null;
    const resolveEquipmentName =
      opts.resolveEquipmentName ?? toBillingTrackableFullName;
    const onlySerials =
      opts.onlySerials && opts.onlySerials.length > 0 ? new Set(opts.onlySerials) : null;

    const stationCode =
      opts.station?.trim() || opts.lookupStation?.trim() || LEGACY_STATION_CODE;
    const insertScope: StationScopeContext = fixedStationScope(stationCode);
    const lookupScope: StationScopeContext = opts.lookupStation?.trim()
      ? fixedStationScope(opts.lookupStation.trim())
      : CROSS_STATION_SYSTEM_SCOPE;

    const sheetName =
      opts.sheetName?.trim() ||
      wb.SheetNames.find((n) => /^sheet1$/i.test(n.trim())) ||
      wb.SheetNames.find((n) => /^sheet2$/i.test(n.trim())) ||
      wb.SheetNames[0];

    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error(
        `Worksheet not found${opts.sheetName ? `: ${opts.sheetName}` : ''}. Available: ${wb.SheetNames.join(', ')}`,
      );
    }

    if (opts.preferDisplayedDmyDates) {
      applyDisplayedDmyDates(wb.Sheets[sheetName]);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
      defval: '',
    });
    const headers =
      rows.length > 0
        ? Object.keys(rows[0])
            .map((h) => h.trim())
            .filter(Boolean)
        : [];
    const headerMap = scheduledEquipmentHeaderMap(headers);
    const unmappedHeaders = unmappedScheduledEquipmentHeaders(headers);
    const unresolvedCodes = new Set<string>();

    const summary: ScheduledEquipmentImportSummary = {
      dryRun,
      sheetName,
      totalRowsRead: rows.length,
      distinctFlightsInWorkbook: 0,
      flightsProcessed: 0,
      flightsSkippedNotFound: 0,
      equipmentLinesWritten: 0,
      skippedRows: 0,
      rowsSkippedOutOfRange: 0,
      unresolvedEquipmentCodes: [],
      rowErrors: [],
      mismatchWarnings: [],
      unmappedHeaders,
      notes: [
        `Sheet: ${sheetName}.`,
        `Lookup station: ${lookupScope.crossStation ? 'cross-station' : (lookupScope.stationCode ?? LEGACY_STATION_CODE)}.`,
        `Create station (only if a flight doc must be created): ${insertScope.stationCode ?? LEGACY_STATION_CODE}.`,
        append
          ? 'Mode: append (merged onto existing equipmentDetails, de-duplicated).'
          : 'Mode: replace (equipmentDetails fully re-set per flight from this workbook).',
        strict
          ? 'Strict mode: flights with a Customer/Flight/Date/Route/Type Craft/Category mismatch are skipped entirely.'
          : 'Non-strict: mismatches are recorded as warnings only; equipment lines are still written.',
        allowCreateFlight
          ? 'allowCreateFlight is ON: serials with no existing fhr_collection doc will get a bare one.'
          : 'allowCreateFlight is OFF (default): serials with no existing fhr_collection doc are skipped — seed flights/FHR first.',
        fromYmd || toYmd
          ? `STD Date filter: ${fromYmd ?? '…'} to ${toYmd ?? '…'} (inclusive).`
          : 'No STD Date filter — all workbook dates considered.',
        'Equipment No short codes expanded to billing-trackable full names before write.',
        onlySerials
          ? `Serial whitelist: only Serial Number ∈ {${[...onlySerials].join(', ')}}.`
          : 'No serial whitelist — all rows considered.',
        dryRun ? 'Dry-run only — no MongoDB writes.' : 'Writes enabled.',
      ],
    };

    const bySerial = new Map<number, RowEntry[]>();
    rows.forEach((rowObj, idx) => {
      const rowIndex = idx + 2;
      const row = normalizeScheduledEquipmentRow(rowObj, headerMap);
      const serial = scheduledEquipmentRowSerialNo(row);

      if (!Number.isFinite(serial) || serial <= 0) {
        summary.skippedRows += 1;
        summary.rowErrors.push({ rowIndex, message: 'Missing or invalid Serial Number' });
        return;
      }
      if (onlySerials && !onlySerials.has(serial)) {
        summary.skippedRows += 1;
        return;
      }
      if (!this.rowStdDateInRange(row, fromYmd, toYmd)) {
        summary.rowsSkippedOutOfRange += 1;
        summary.skippedRows += 1;
        return;
      }

      if (!bySerial.has(serial)) bySerial.set(serial, []);
      bySerial.get(serial)!.push({ rowIndex, row });
    });

    summary.distinctFlightsInWorkbook = bySerial.size;

    for (const [serial, entries] of bySerial) {
      try {
        const existing = await this.fhrCollectionService.getLeanFhrBySerial(serial, lookupScope);

        if (!existing && !allowCreateFlight) {
          summary.flightsSkippedNotFound += 1;
          summary.skippedRows += entries.length;
          summary.rowErrors.push({
            rowIndex: entries[0].rowIndex,
            serialNo: String(serial),
            message: `No fhr_collection document found for Serial Number ${serial}${
              lookupScope.stationCode ? ` at station ${lookupScope.stationCode}` : ''
            } — seed the flight/FHR data first, or pass --allow-create-flight.`,
          });
          continue;
        }

        const flightMismatches = existing
          ? this.collectMismatchWarnings(serial, entries[0].row, existing)
          : [];
        summary.mismatchWarnings.push(...flightMismatches);

        if (strict && flightMismatches.length > 0) {
          summary.skippedRows += entries.length;
          continue;
        }

        const newItems = entries.map((e) => {
          const abbr = textCell(e.row.equipmentNo);
          const resolved = resolveEquipmentName(abbr);
          if (abbr && resolved === abbr && !/\s/.test(abbr)) {
            unresolvedCodes.add(abbr);
          }
          return buildFhrEquipmentDetailItem({
            ...e.row,
            equipmentNo: resolved || abbr,
          });
        });

        summary.flightsProcessed += 1;
        summary.equipmentLinesWritten += newItems.length;

        if (dryRun) continue;

        let finalItems: Record<string, unknown>[] = newItems;
        if (append && existing && Array.isArray(existing.equipmentDetails)) {
          finalItems = dedupeEquipmentDetailItems([
            ...(existing.equipmentDetails as Record<string, unknown>[]),
            ...newItems,
          ]);
        }

        await this.fhrCollectionService.upsertMerge(
          serial,
          { equipmentDetails: finalItems },
          'Scheduled equipment Excel seed',
          existing ? lookupScope : insertScope,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        summary.rowErrors.push({
          rowIndex: entries[0].rowIndex,
          serialNo: String(serial),
          message,
        });
        this.log.warn(`Serial ${serial} failed: ${message}`);
      }
    }

    summary.unresolvedEquipmentCodes = [...unresolvedCodes].sort();
    return summary;
  }

  /** Inclusive STD Date window using `YYYY-MM-DD` bounds (same shape as MAA FHR seed). */
  private rowStdDateInRange(
    row: ScheduledEquipmentCanonicalRow,
    fromYmd: string | null,
    toYmd: string | null,
  ): boolean {
    if (!fromYmd && !toYmd) return true;
    const ddMmYyyy = excelCellToDdMmYyyy(row.stdDate);
    const ymd = staDateToIsoYmd(ddMmYyyy);
    if (!ymd) return false;
    if (fromYmd && ymd < fromYmd) return false;
    if (toYmd && ymd > toYmd) return false;
    return true;
  }

  private collectMismatchWarnings(
    serialNo: number,
    row: ScheduledEquipmentCanonicalRow,
    existing: Record<string, unknown>,
  ): ScheduledEquipmentMismatchWarning[] {
    const out: ScheduledEquipmentMismatchWarning[] = [];
    for (const check of MATCH_KEY_FIELDS) {
      const excelValue = check.excel(row);
      if (!excelValue) continue;
      const existingValue = check.existing(existing);
      if (!valuesLooselyMatch(excelValue, existingValue)) {
        out.push({ serialNo, field: check.field, excelValue, existingValue });
      }
    }
    return out;
  }
}
