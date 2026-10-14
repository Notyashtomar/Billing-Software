import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';
import { LEGACY_STATION_CODE } from '../../common/station/station.constants';
import {
  buildFhrEquipmentDetailItem,
  dedupeEquipmentDetailItems,
  normalizeScheduledEquipmentRow,
  scheduledEquipmentHeaderMap,
  scheduledEquipmentRowSerialNo,
  textCell,
  unmappedScheduledEquipmentHeaders,
  type ScheduledEquipmentCanonicalRow,
} from '../../excel-import/scheduled-equipment-import.util';
import { UpsertFhrCollectionDto } from '../../fhr-collection/dto/upsert-fhr-collection.dto';
import { toBillingTrackableFullName } from 'src/common/billing-trackable-equipment-name';
import { NsFhrCollectionService } from './ns-fhr-collection.service';
import {
  loadNsEquipmentFullNameLookup,
  resolveNsEquipmentFullName,
} from './maa-ns-equipment-name-map';

export type MaaNsEquipmentImportOptions = {
  dryRun?: boolean;
  sheetName?: string;
  /** Merge onto existing equipmentDetails instead of replacing per flight. */
  append?: boolean;
  /**
   * Create a bare `ns_fhr_collection` doc when Serial Number has no flight yet.
   * Off by default — run `seed:maa-ns-fhr:import` first.
   */
  allowCreateFlight?: boolean;
  station?: string;
  onlySerials?: number[] | null;
};

export type MaaNsEquipmentImportSummary = {
  dryRun: boolean;
  sheetName: string;
  totalRowsRead: number;
  distinctFlightsInWorkbook: number;
  flightsProcessed: number;
  flightsSkippedNotFound: number;
  equipmentLinesWritten: number;
  skippedRows: number;
  unresolvedEquipmentCodes: string[];
  rowErrors: { rowIndex: number; serialNo?: string; message: string }[];
  unmappedHeaders: string[];
  notes: string[];
};

type RowEntry = { rowIndex: number; row: ScheduledEquipmentCanonicalRow };

/**
 * Seed Non-Scheduled GSE lines from `Non-skd-equipment-data-maa.xlsx` into
 * `ns_fhr_collection.equipmentDetails[]` (grouped by `Serial Number`).
 * Expands `Equipment No` short codes to full names before write.
 */
@Injectable()
export class MaaNsEquipmentExcelSeedService {
  private readonly log = new Logger(MaaNsEquipmentExcelSeedService.name);

  constructor(private readonly nsFhrCollectionService: NsFhrCollectionService) {}

  async importFromFilePath(
    absolutePath: string,
    opts: MaaNsEquipmentImportOptions = {},
  ): Promise<MaaNsEquipmentImportSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  private async importWorkbook(
    wb: XLSX.WorkBook,
    opts: MaaNsEquipmentImportOptions,
  ): Promise<MaaNsEquipmentImportSummary> {
    const dryRun = !!opts.dryRun;
    const append = !!opts.append;
    const allowCreateFlight = !!opts.allowCreateFlight;
    const onlySerials =
      opts.onlySerials && opts.onlySerials.length > 0
        ? new Set(opts.onlySerials)
        : null;

    const lookupScope: StationScopeContext = CROSS_STATION_SYSTEM_SCOPE;
    const insertScope: StationScopeContext = fixedStationScope(
      opts.station?.trim() || LEGACY_STATION_CODE,
    );

    const sheetName =
      opts.sheetName?.trim() ||
      wb.SheetNames.find((n) => /^sheet1$/i.test(n.trim())) ||
      wb.SheetNames[0];

    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error(
        `Worksheet not found${opts.sheetName ? `: ${opts.sheetName}` : ''}. Available: ${wb.SheetNames.join(', ')}`,
      );
    }

    const nameLookup = loadNsEquipmentFullNameLookup();
    const unresolvedCodes = new Set<string>();

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheetName],
      { defval: '' },
    );
    const headers =
      rows.length > 0
        ? Object.keys(rows[0])
            .map((h) => h.trim())
            .filter(Boolean)
        : [];
    const headerMap = scheduledEquipmentHeaderMap(headers);
    const unmappedHeaders = unmappedScheduledEquipmentHeaders(headers);

    const summary: MaaNsEquipmentImportSummary = {
      dryRun,
      sheetName,
      totalRowsRead: rows.length,
      distinctFlightsInWorkbook: 0,
      flightsProcessed: 0,
      flightsSkippedNotFound: 0,
      equipmentLinesWritten: 0,
      skippedRows: 0,
      unresolvedEquipmentCodes: [],
      rowErrors: [],
      unmappedHeaders,
      notes: [
        `Sheet: ${sheetName}.`,
        `Target: ns_fhr_collection.equipmentDetails (station ${insertScope.stationCode ?? LEGACY_STATION_CODE}).`,
        append
          ? 'Mode: append (merged onto existing equipmentDetails, de-duplicated).'
          : 'Mode: replace (equipmentDetails fully re-set per flight from this workbook).',
        allowCreateFlight
          ? 'allowCreateFlight is ON: missing ns_fhr docs get a bare shell.'
          : 'allowCreateFlight is OFF: serials without ns_fhr_collection are skipped (seed NS FHR first).',
        'Equipment No short codes are expanded to full names via Equipment Master + MAA March map.',
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
        summary.rowErrors.push({
          rowIndex,
          message: 'Missing or invalid Serial Number',
        });
        return;
      }
      if (onlySerials && !onlySerials.has(serial)) {
        summary.skippedRows += 1;
        return;
      }

      if (!bySerial.has(serial)) bySerial.set(serial, []);
      bySerial.get(serial)!.push({ rowIndex, row });
    });

    summary.distinctFlightsInWorkbook = bySerial.size;

    for (const [serial, entries] of bySerial) {
      try {
        const existing = await this.nsFhrCollectionService.getLeanBySerial(
          serial,
          lookupScope,
        );

        if (!existing && !allowCreateFlight) {
          summary.flightsSkippedNotFound += 1;
          summary.skippedRows += entries.length;
          summary.rowErrors.push({
            rowIndex: entries[0].rowIndex,
            serialNo: String(serial),
            message: `No ns_fhr_collection document for Serial Number ${serial} — seed NS FHR first, or pass --allow-create-flight.`,
          });
          continue;
        }

        const newItems = entries.map((e) => {
          const abbr = textCell(e.row.equipmentNo);
          const billed = toBillingTrackableFullName(abbr);
          const fullName =
            billed !== abbr ? billed : resolveNsEquipmentFullName(abbr, nameLookup);
          if (abbr && fullName === abbr) unresolvedCodes.add(abbr);

          const item = buildFhrEquipmentDetailItem({
            ...e.row,
            equipmentNo: fullName || abbr,
          });
          // Keep original short code in remarks prefix when remarks empty? No —
          // user asked for full names only. Abbr remains recoverable via catalog if needed.
          return item;
        });

        // Also build equipmentManpower.entries so Open → Equipment form hydrates.
        const manpowerEntries = entries.map((e) => {
          const abbr = textCell(e.row.equipmentNo);
          const billed = toBillingTrackableFullName(abbr);
          const fullName =
            billed !== abbr ? billed : resolveNsEquipmentFullName(abbr, nameLookup);
          const item = buildFhrEquipmentDetailItem({
            ...e.row,
            equipmentNo: fullName || abbr,
          });
          const fromDate = String(item.from_date ?? '');
          const fromTime = String(item.from_time ?? '');
          const toDate = String(item.to_date ?? '');
          const toTime = String(item.to_time ?? '');
          return {
            entryType: 'equipment',
            equipmentName: fullName || abbr,
            equipmentSerialNo: abbr,
            name: `EQ:${fullName || abbr}|${abbr}|${fromDate}|${fromTime}|${toDate}|${toTime}`,
            employeeName: '',
            employeeId: '',
            designation: '',
            place: '',
            fromDate,
            fromTime,
            toDate,
            toTime,
            remarks: String(item.remarks ?? ''),
            exportedInNav: 'N',
          };
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

        const existingEm =
          existing?.equipmentManpower &&
          typeof existing.equipmentManpower === 'object' &&
          !Array.isArray(existing.equipmentManpower)
            ? (existing.equipmentManpower as Record<string, unknown>)
            : {};

        const dto: UpsertFhrCollectionDto = {
          equipmentDetails: finalItems,
          equipmentManpower: {
            ...existingEm,
            serialNo: serial,
            entries: append
              ? [
                  ...((Array.isArray(existingEm.entries)
                    ? existingEm.entries
                    : []) as unknown[]),
                  ...manpowerEntries,
                ]
              : manpowerEntries,
          } as UpsertFhrCollectionDto['equipmentManpower'],
        };
        await this.nsFhrCollectionService.upsertMerge(
          serial,
          dto,
          'MAA NS equipment Excel seed',
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
    if (summary.unresolvedEquipmentCodes.length > 0) {
      summary.notes.push(
        `Unresolved Equipment No codes left as-is: ${summary.unresolvedEquipmentCodes.join(', ')}.`,
      );
    }

    return summary;
  }
}
