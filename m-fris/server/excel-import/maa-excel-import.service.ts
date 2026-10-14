import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { MainDetailsService } from 'src/main-details/services/main-details.service';
import { TerminalDetailsService } from 'src/terminal-details/services/terminal-details.service';
import { RampDetails1Service } from 'src/ramp-details-1/services/ramp-details-1.service';
import { LoadControlDetailsService } from 'src/load-control-details/services/load-control-details.service';
import { RemarksService } from 'src/remarks/services/remarks.service';
import { CreateMainDetailsDto } from 'src/main-details/dto/create-main-details.dto';
import { CreateTerminalDetailsDto } from 'src/terminal-details/dto/create-terminal-details.dto';
import { CreateRampDetails1Dto } from 'src/ramp-details-1/dto/create-ramp-details-1.dto';
import { CreateLoadControlDetailsDto } from 'src/load-control-details/dto/create-load-control-details.dto';
import {
  augmentKeyToModulesForSheet1,
  buildKeyToModulesFromSheet2,
  ImportTarget,
  schemaWhitelistFor,
} from './maa-excel-mapping';
import {
  buildKeyToModulesFromFlatHeaders,
  flatHeadersWithoutMapping,
} from './maa-flat-sheet-mapping';
import {
  applyDelayFieldsFromFlatRow,
  applyEmbedScheduleAliases,
  collectFlatWorkbookExtras,
  enrichMainDtoFromFlatRow,
  matrixToFlatImportRows,
  normalizeFlatImportRow,
  parseFlatImportSerial,
  peelDroppedFlatKeys,
  remapFlatPickedFields,
  resolveFlatRowAirline,
  compactFlightNo,
  resolveFlatRowFlightNo,
  rowStaDateInRange,
} from './maa-flat-import.util';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import {
  fixedStationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import {
  LEGACY_STATION_CODE,
  normalizeStationCode,
} from '../common/station/station.constants';

/**
 * Default workbook importer stamps MAA (Chennai). Flat-sheet callers may override
 * via `MaaFlatImportOptions.stationCode` (e.g. IXC Chandigarh seed).
 */
const MAA_IMPORT_SCOPE = fixedStationScope(LEGACY_STATION_CODE);

export type MaaFlatImportOptions = {
  dryRun?: boolean;
  /** Defaults to first worksheet (or Sheet1 when present). */
  sheetName?: string;
  /** Inclusive STA window filter (`yyyy-MM-dd`), e.g. 2026-04-01 … 2026-06-30. */
  fromYmd?: string | null;
  toYmd?: string | null;
  /**
   * Restrict the import to these `slNo` values only (e.g. re-seeding rows that were
   * previously skipped by the STA date window). When set, the STA date window filter
   * is bypassed for these rows — they are imported regardless of `fromYmd`/`toYmd`,
   * and every other row is skipped.
   */
  onlySerials?: number[] | null;
  /**
   * Station stamped on form collections + `fhr_collection` (default MAA).
   * Use `IXC` for Chandigarh so rows only appear when logged into that station.
   */
  stationCode?: string;
  /**
   * 1-based row with canonical schema keys. When set with `dataStartRow`, the
   * sheet is parsed as a multi-header workbook (Chandigarh Sheet1 layout).
   */
  schemaKeyRow?: number;
  /** 1-based first data row (required with `schemaKeyRow`). */
  dataStartRow?: number;
  /**
   * 1-based display-header row used when a schema-key cell is blank
   * (default: `schemaKeyRow` when multi-header mode is on).
   */
  displayHeaderRow?: number;
  /**
   * When true, skip rows whose `fhr_collection` doc already has complete
   * spreadsheet operational embeds for this serial + station.
   */
  skipIfFhrComplete?: boolean;
};

export type MaaImportSummary = {
  dryRun: boolean;
  stationCode: string;
  totalRowsRead: number;
  flightsProcessed: number;
  inserted: {
    main: number;
    terminal: number;
    ramp: number;
    loadControl: number;
    remarks: number;
  };
  updated: {
    main: number;
    terminal: number;
    ramp: number;
    loadControl: number;
    remarks: number;
  };
  skippedRows: number;
  /** Rows skipped because fhr_collection already had complete operational embeds. */
  skippedCompleteRows: number;
  rowErrors: { rowIndex: number; slNo?: string; message: string }[];
  unmappedSheet1Headers: string[];
  unmappedSchemaKeysFromSheet2: string[];
  fhrKeysSkipped: string[];
  notes: string[];
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return '';
    // Excel time-only fraction (exclude 0 so cabin/count zeros stay "0").
    if (v > 0 && v < 1) {
      try {
        const d = XLSX.SSF.parse_date_code(v);
        if (d && typeof d.H === 'number') {
          return `${pad2(d.H)}:${pad2(d.M ?? 0)}`;
        }
      } catch {
        /* ignore */
      }
    }
    // Excel date / datetime serial.
    if (v > 20000 && v < 100000) {
      try {
        const d = XLSX.SSF.parse_date_code(v);
        if (d && d.y && d.m && d.d) {
          const date = `${pad2(d.d)}/${pad2(d.m)}/${d.y}`;
          if (!Number.isInteger(v) && typeof d.H === 'number') {
            return `${date} ${pad2(d.H)}:${pad2(d.M ?? 0)}`;
          }
          return date;
        }
      } catch {
        /* ignore */
      }
    }
    return String(v);
  }
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return '';
  }
  return s;
}

function toStaDateIso(raw: string): string | null {
  const s = normalizeCell(raw);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(
    s,
  );
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }
  return null;
}

@Injectable()
export class MaaExcelImportService {
  private readonly log = new Logger(MaaExcelImportService.name);

  constructor(
    private readonly mainDetailsService: MainDetailsService,
    private readonly terminalDetailsService: TerminalDetailsService,
    private readonly rampDetails1Service: RampDetails1Service,
    private readonly loadControlDetailsService: LoadControlDetailsService,
    private readonly remarksService: RemarksService,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  async importFromFilePath(
    absolutePath: string,
    opts: { dryRun?: boolean } = {},
  ): Promise<MaaImportSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  /**
   * Single-sheet MAA FHR seed (e.g. `seedingof3months.xlsx`): row-1 headers are schema keys,
   * no Sheet2 mapping tab required. Upserts form collections → mirrors `fhr_collection`.
   */
  async importFlatSheetFromFilePath(
    absolutePath: string,
    opts: MaaFlatImportOptions = {},
  ): Promise<MaaImportSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importFlatWorkbook(wb, opts);
  }

  async importFromBuffer(
    buffer: Buffer,
    opts: { dryRun?: boolean } = {},
  ): Promise<MaaImportSummary> {
    const wb = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      raw: true,
    });
    return this.importWorkbook(wb, opts);
  }

  async importFlatSheetFromBuffer(
    buffer: Buffer,
    opts: MaaFlatImportOptions = {},
  ): Promise<MaaImportSummary> {
    const wb = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      raw: true,
    });
    return this.importFlatWorkbook(wb, opts);
  }

  private async importWorkbook(
    wb: XLSX.WorkBook,
    opts: { dryRun?: boolean },
  ): Promise<MaaImportSummary> {
    const dryRun = !!opts.dryRun;
    const notes: string[] = [
      'Operational flight/FHR source data is stored in mainDetails, terminalDetails, rampDetails1, loadControlDetails, and remarks. The reports collection only holds report-view metadata (not this Excel).',
    ];

    const names = wb.SheetNames;
    if (names.length < 2) {
      throw new Error(
        'Workbook must contain Sheet1 (data) and Sheet2 (mapping).',
      );
    }

    const sheet1Name = names[0];
    const sheet2Name = names[1];
    const m1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[sheet1Name],
      {
        defval: '',
      },
    );
    const sheet2Matrix = XLSX.utils.sheet_to_json<string[]>(
      wb.Sheets[sheet2Name],
      { header: 1, defval: '' },
    );

    const keyToModules = buildKeyToModulesFromSheet2(sheet2Matrix);

    const sheet2SchemaKeys = new Set<string>();
    for (let i = 1; i < sheet2Matrix.length; i++) {
      const k = String(sheet2Matrix[i]?.[2] ?? '').trim();
      if (k) sheet2SchemaKeys.add(k);
    }

    const headers =
      m1.length > 0
        ? Object.keys(m1[0])
            .map((h) => h.trim())
            .filter(Boolean)
        : [];

    augmentKeyToModulesForSheet1(headers, keyToModules);

    const unmappedSchemaKeysFromSheet2: string[] = [];
    const fhrKeysSkipped: string[] = [];

    for (const key of sheet2SchemaKeys) {
      const mods = keyToModules.get(key);
      if (!mods || mods.size === 0) {
        unmappedSchemaKeysFromSheet2.push(key);
      } else if (mods.has('fhr') && mods.size === 1) {
        fhrKeysSkipped.push(key);
      }
    }

    const sheet1HeaderSet = new Set(headers);
    const unmappedSheet1Headers = headers.filter(
      (h) =>
        h !== 'slNo' && !sheet2SchemaKeys.has(h) && !this.isAuxiliaryHeader(h),
    );

    const summary: MaaImportSummary = {
      dryRun,
      stationCode: MAA_IMPORT_SCOPE.stationCode ?? LEGACY_STATION_CODE,
      totalRowsRead: m1.length,
      flightsProcessed: 0,
      inserted: {
        main: 0,
        terminal: 0,
        ramp: 0,
        loadControl: 0,
        remarks: 0,
      },
      updated: {
        main: 0,
        terminal: 0,
        ramp: 0,
        loadControl: 0,
        remarks: 0,
      },
      skippedRows: 0,
      skippedCompleteRows: 0,
      rowErrors: [],
      unmappedSheet1Headers,
      unmappedSchemaKeysFromSheet2,
      fhrKeysSkipped,
      notes,
    };

    for (let idx = 0; idx < m1.length; idx++) {
      const rowObj = m1[idx];
      const rowIndex = idx + 2;
      try {
        const raw: Record<string, string> = {};
        for (const [k, v] of Object.entries(rowObj)) {
          raw[k.trim()] = normalizeCell(v);
        }

        const slRaw = raw.slNo ?? raw.SlNo ?? raw['SNO'];
        const serial = Number(
          String(slRaw ?? '')
            .trim()
            .replace(/,/g, ''),
        );
        if (!Number.isFinite(serial) || serial <= 0) {
          summary.skippedRows += 1;
          summary.rowErrors.push({
            rowIndex,
            message: 'Missing or invalid slNo',
          });
          continue;
        }

        const airline = resolveFlatRowAirline(raw);
        const flightNo = resolveFlatRowFlightNo(raw);

        if (!airline || !flightNo) {
          summary.skippedRows += 1;
          summary.rowErrors.push({
            rowIndex,
            slNo: String(serial),
            message: 'airline and flightNo are required',
          });
          continue;
        }

        summary.flightsProcessed += 1;

        const mainDto = this.buildMainDto(raw, keyToModules);
        const terminalDto = this.buildTerminalDto(
          raw,
          keyToModules,
          airline,
          flightNo,
        );
        const rampDto = this.buildRampDto(raw, keyToModules, airline, flightNo);
        const loadDto = this.buildLoadDto(raw, keyToModules, airline, flightNo);
        const remarksPatch = this.buildRemarksPatch(
          raw,
          keyToModules,
          airline,
          flightNo,
        );

        if (dryRun) {
          this.log.debug(
            `Dry-run row ${rowIndex} slNo=${serial} mainKeys=${Object.keys(mainDto).length}`,
          );
          continue;
        }

        const existedMain = await this.safeFindMain(serial);
        await this.mainDetailsService.upsertBySerial(
          serial,
          mainDto,
          MAA_IMPORT_SCOPE,
        );
        summary.inserted.main += existedMain ? 0 : 1;
        summary.updated.main += existedMain ? 1 : 0;

        const existedTerm = await this.safeFindTerminal(serial);
        await this.terminalDetailsService.upsertBySerial(
          serial,
          terminalDto,
          MAA_IMPORT_SCOPE,
        );
        summary.inserted.terminal += existedTerm ? 0 : 1;
        summary.updated.terminal += existedTerm ? 1 : 0;

        const existedRamp = await this.safeFindRamp(serial);
        await this.rampDetails1Service.upsertBySerial(
          serial,
          rampDto,
          MAA_IMPORT_SCOPE,
        );
        summary.inserted.ramp += existedRamp ? 0 : 1;
        summary.updated.ramp += existedRamp ? 1 : 0;

        const existedLoad = await this.safeFindLoad(serial);
        await this.loadControlDetailsService.upsertBySerial(
          serial,
          loadDto,
          MAA_IMPORT_SCOPE,
        );
        summary.inserted.loadControl += existedLoad ? 0 : 1;
        summary.updated.loadControl += existedLoad ? 1 : 0;

        const existedRem = await this.remarksService.findBySerial(
          serial,
          MAA_IMPORT_SCOPE,
        );
        const staIso =
          toStaDateIso(raw.staDate) ||
          toStaDateIso(raw.stdDate) ||
          '1970-01-01';
        await this.remarksService.mergeForSpreadsheetImport(
          serial,
          this.compactRemarksPatch(remarksPatch),
          {
            flightStaDateIso: staIso,
          },
          MAA_IMPORT_SCOPE,
        );
        summary.inserted.remarks += existedRem ? 0 : 1;
        summary.updated.remarks += existedRem ? 1 : 0;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        summary.rowErrors.push({ rowIndex, message });
        this.log.warn(`Row ${rowIndex} failed: ${message}`);
      }
    }

    return summary;
  }

  private async importFlatWorkbook(
    wb: XLSX.WorkBook,
    opts: MaaFlatImportOptions,
  ): Promise<MaaImportSummary> {
    const dryRun = !!opts.dryRun;
    const fromYmd = opts.fromYmd?.trim() || null;
    const toYmd = opts.toYmd?.trim() || null;
    const onlySerials =
      opts.onlySerials && opts.onlySerials.length > 0
        ? new Set(opts.onlySerials)
        : null;
    const skipIfFhrComplete = !!opts.skipIfFhrComplete;
    const stationCode =
      normalizeStationCode(opts.stationCode) ?? LEGACY_STATION_CODE;
    const scope = fixedStationScope(stationCode);
    const sheetName =
      opts.sheetName?.trim() ||
      wb.SheetNames.find((n) => /^sheet1(\s*\(\d+\))?$/i.test(n.trim())) ||
      wb.SheetNames.find((n) => /^sheet1$/i.test(n.trim())) ||
      wb.SheetNames[0];

    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error(
        `Worksheet not found${opts.sheetName ? `: ${opts.sheetName}` : ''}. Available: ${wb.SheetNames.join(', ')}`,
      );
    }

    const multiHeader =
      opts.schemaKeyRow != null &&
      opts.dataStartRow != null &&
      opts.schemaKeyRow > 0 &&
      opts.dataStartRow > 0;

    let headers: string[];
    let m1: Record<string, unknown>[];
    let dataRowOffset: number;

    if (multiHeader) {
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: true,
      });
      const parsed = matrixToFlatImportRows(matrix, {
        schemaKeyRowIndex: opts.schemaKeyRow! - 1,
        dataStartRowIndex: opts.dataStartRow! - 1,
        displayHeaderRowIndex:
          (opts.displayHeaderRow ?? opts.schemaKeyRow)! - 1,
      });
      headers = parsed.headers;
      m1 = parsed.rows;
      dataRowOffset = opts.dataStartRow!;
    } else {
      m1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[sheetName],
        { defval: '', raw: true },
      );
      headers =
        m1.length > 0
          ? Object.keys(m1[0])
              .map((h) => h.trim())
              .filter(Boolean)
          : [];
      dataRowOffset = 2;
    }

    const keyToModules = buildKeyToModulesFromFlatHeaders(headers);
    const unmappedSheet1Headers = flatHeadersWithoutMapping(
      headers,
      keyToModules,
    );

    const summary: MaaImportSummary = {
      dryRun,
      stationCode,
      totalRowsRead: m1.length,
      flightsProcessed: 0,
      inserted: {
        main: 0,
        terminal: 0,
        ramp: 0,
        loadControl: 0,
        remarks: 0,
      },
      updated: {
        main: 0,
        terminal: 0,
        ramp: 0,
        loadControl: 0,
        remarks: 0,
      },
      skippedRows: 0,
      skippedCompleteRows: 0,
      rowErrors: [],
      unmappedSheet1Headers,
      unmappedSchemaKeysFromSheet2: [],
      fhrKeysSkipped: [],
      notes: [
        `Flat single-sheet import (${sheetName}) → mainDetails, terminalDetails, rampDetails1, loadControlDetails, remarks → fhr_collection mirror.`,
        multiHeader
          ? `Multi-header mode: schema keys row ${opts.schemaKeyRow}, display headers row ${opts.displayHeaderRow ?? opts.schemaKeyRow}, data from row ${opts.dataStartRow}.`
          : 'Row-1 schema-key headers.',
        'Delay reasons: `reasonOfDelay` or delay1/delaycode2/delay2/delaycode3/delay3/delaycode31 → departureDelays[].',
        'Header aliases: STATIME→STATime, FlightCancelled→flightCancelled, Freighter→freighter.',
        `Station: ${stationCode}.`,
        skipIfFhrComplete
          ? 'Skip-if-complete: rows with full operational FHR embeds are not re-imported.'
          : 'Skip-if-complete: off.',
        onlySerials
          ? `Serial whitelist: only slNo ∈ {${[...onlySerials].join(', ')}} (STA date filter bypassed for these).`
          : fromYmd || toYmd
            ? `STA date filter: ${fromYmd ?? '…'} to ${toYmd ?? '…'} (inclusive).`
            : 'No STA date filter.',
        dryRun
          ? 'Dry-run only — no MongoDB writes.'
          : 'After import: staDates reindexed for this station (scheduled report date filters).',
      ],
    };

    for (let idx = 0; idx < m1.length; idx++) {
      const rowObj = m1[idx];
      const rowIndex = dataRowOffset + idx;
      try {
        const rawPartial: Record<string, string> = {};
        for (const [k, v] of Object.entries(rowObj)) {
          rawPartial[k.trim()] = normalizeCell(v);
        }
        const peeledDropped = peelDroppedFlatKeys(rawPartial);
        const raw = normalizeFlatImportRow(rawPartial);

        const serial = parseFlatImportSerial(rowObj);
        const slRaw =
          serial != null
            ? String(serial)
            : raw.slNo ?? raw.SlNo ?? raw.SerialNo ?? raw['SNO'];
        const serialFromRaw = Number(
          String(slRaw ?? '')
            .trim()
            .replace(/,/g, ''),
        );
        const resolvedSerial =
          serial ?? (Number.isFinite(serialFromRaw) ? serialFromRaw : NaN);

        if (onlySerials) {
          // Whitelist mode: only the listed serials are imported, and the STA
          // date window filter does not apply to them (that's the whole point
          // of re-seeding rows the window previously excluded).
          if (!Number.isFinite(resolvedSerial) || !onlySerials.has(resolvedSerial)) {
            summary.skippedRows += 1;
            continue;
          }
        } else if (!rowStaDateInRange(raw, fromYmd, toYmd)) {
          summary.skippedRows += 1;
          continue;
        }

        if (!Number.isFinite(resolvedSerial) || resolvedSerial <= 0) {
          summary.skippedRows += 1;
          summary.rowErrors.push({
            rowIndex,
            message: 'Missing or invalid slNo',
          });
          continue;
        }

        const airline = resolveFlatRowAirline(raw);
        const flightNo = resolveFlatRowFlightNo(raw);

        if (!airline || !flightNo) {
          summary.skippedRows += 1;
          summary.rowErrors.push({
            rowIndex,
            slNo: String(resolvedSerial),
            message: 'airline and flightNo are required',
          });
          continue;
        }

        if (skipIfFhrComplete) {
          const complete =
            await this.fhrCollectionService.isSpreadsheetOperationalSeedComplete(
              resolvedSerial,
              scope,
            );
          if (complete) {
            summary.skippedCompleteRows += 1;
            summary.skippedRows += 1;
            continue;
          }
        }

        summary.flightsProcessed += 1;

        const mainDto = this.buildMainDto(raw, keyToModules);
        const terminalDto = this.buildTerminalDto(
          raw,
          keyToModules,
          airline,
          flightNo,
        );
        const rampDto = this.buildRampDto(raw, keyToModules, airline, flightNo);
        const loadDto = this.buildLoadDto(raw, keyToModules, airline, flightNo);
        const remarksPatch = this.buildRemarksPatch(
          raw,
          keyToModules,
          airline,
          flightNo,
        );

        if (dryRun) {
          this.log.debug(
            `Dry-run row ${rowIndex} slNo=${resolvedSerial} mainKeys=${Object.keys(mainDto).length}`,
          );
          continue;
        }

        const existedMain = await this.safeFindMain(resolvedSerial, scope);
        await this.mainDetailsService.upsertBySerial(resolvedSerial, mainDto, scope);
        summary.inserted.main += existedMain ? 0 : 1;
        summary.updated.main += existedMain ? 1 : 0;

        const existedTerm = await this.safeFindTerminal(resolvedSerial, scope);
        await this.terminalDetailsService.upsertBySerial(
          resolvedSerial,
          terminalDto,
          scope,
        );
        summary.inserted.terminal += existedTerm ? 0 : 1;
        summary.updated.terminal += existedTerm ? 1 : 0;

        const existedRamp = await this.safeFindRamp(resolvedSerial, scope);
        await this.rampDetails1Service.upsertBySerial(resolvedSerial, rampDto, scope);
        summary.inserted.ramp += existedRamp ? 0 : 1;
        summary.updated.ramp += existedRamp ? 1 : 0;

        const existedLoad = await this.safeFindLoad(resolvedSerial, scope);
        await this.loadControlDetailsService.upsertBySerial(
          resolvedSerial,
          loadDto,
          scope,
        );
        summary.inserted.loadControl += existedLoad ? 0 : 1;
        summary.updated.loadControl += existedLoad ? 1 : 0;

        const existedRem = await this.remarksService.findBySerial(
          resolvedSerial,
          scope,
        );
        const staIso =
          toStaDateIso(raw.staDate) ||
          toStaDateIso(raw.stdDate) ||
          toStaDateIso(raw.STADate) ||
          '1970-01-01';
        await this.remarksService.mergeForSpreadsheetImport(
          resolvedSerial,
          this.compactRemarksPatch(remarksPatch),
          {
            flightStaDateIso: staIso,
          },
          scope,
        );
        summary.inserted.remarks += existedRem ? 0 : 1;
        summary.updated.remarks += existedRem ? 1 : 0;

        const extras = collectFlatWorkbookExtras(
          raw,
          unmappedSheet1Headers,
          peeledDropped,
        );
        await this.fhrCollectionService.mergeWorkbookExtras(
          resolvedSerial,
          extras,
          scope,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        summary.rowErrors.push({ rowIndex, message });
        this.log.warn(`Row ${rowIndex} failed: ${message}`);
      }
    }

    return this.finalizeFlatImport(summary, dryRun, scope);
  }

  /** Reindex `staDates` after spreadsheet import so scheduled report date filters find rows. */
  private async finalizeFlatImport(
    summary: MaaImportSummary,
    dryRun: boolean,
    scope: StationScopeContext = MAA_IMPORT_SCOPE,
  ): Promise<MaaImportSummary> {
    if (!dryRun && summary.flightsProcessed > 0) {
      const reindexed =
        await this.fhrCollectionService.reindexStaDatesFromEmbeds(scope);
      summary.notes.push(
        `Reindexed staDates on ${reindexed} fhr_collection document(s) for scheduled report queries.`,
      );
    } else if (!dryRun) {
      summary.notes.push(
        'No flights imported — run npm run backfill:staDates if fhr_collection rows already exist.',
      );
    }
    return summary;
  }

  private isAuxiliaryHeader(_h: string): boolean {
    return false;
  }

  private async safeFindMain(serial: number, scope = MAA_IMPORT_SCOPE) {
    try {
      return await this.mainDetailsService.findBySerial(serial, scope);
    } catch {
      return null;
    }
  }

  private async safeFindTerminal(serial: number, scope = MAA_IMPORT_SCOPE) {
    try {
      return await this.terminalDetailsService.findBySerial(serial, scope);
    } catch {
      return null;
    }
  }

  private async safeFindRamp(serial: number, scope = MAA_IMPORT_SCOPE) {
    try {
      return await this.rampDetails1Service.findBySerial(serial, scope);
    } catch {
      return null;
    }
  }

  private async safeFindLoad(serial: number, scope = MAA_IMPORT_SCOPE) {
    try {
      return await this.loadControlDetailsService.findBySerial(serial, scope);
    } catch {
      return null;
    }
  }

  private compactRemarksPatch(
    patch: Partial<{
      Airline: string;
      FlightNo: string;
      PaxGHAirlineRep_Name: string;
      ghRemarks: string;
      AirRepRem: string;
      airrep: string;
      PAX_Airline_SignByDate: string;
    }>,
  ): Partial<{
    Airline: string;
    FlightNo: string;
    PaxGHAirlineRep_Name: string;
    ghRemarks: string;
    AirRepRem: string;
    airrep: string;
    PAX_Airline_SignByDate: string;
  }> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      out[k] = typeof v === 'string' ? v.trim() : String(v);
    }
    return out;
  }

  private pickForTarget(
    raw: Record<string, string>,
    target: ImportTarget,
    keyToModules: Map<string, Set<ImportTarget>>,
  ): Record<string, string> {
    const whitelist = schemaWhitelistFor(target);
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === 'slNo') continue;
      const mods = keyToModules.get(key);
      if (!mods?.has(target)) continue;
      if (whitelist && !whitelist.has(key)) continue;
      if (val === '') continue;
      out[key] = val;
    }
    return out;
  }

  private buildMainDto(
    raw: Record<string, string>,
    keyToModules: Map<string, Set<ImportTarget>>,
  ): CreateMainDetailsDto {
    const picked = this.pickForTarget(raw, 'main', keyToModules);
    const pr = (a: string, b?: string) =>
      (b ? picked[b] : '') ||
      (a ? picked[a] : '') ||
      (b ? raw[b] : '') ||
      (a ? raw[a] : '');

    const Airline =
      normalizeCell(raw.Airline) ||
      normalizeCell(raw.airline) ||
      normalizeCell(raw.airlineName) ||
      pr('airlineName', 'Airline') ||
      'Unknown';
    const Arline_Code =
      normalizeCell(raw.Arline_Code) ||
      pr('flightCode', 'Arline_Code') ||
      normalizeCell(raw.flightCode) ||
      Airline.slice(0, 2).toUpperCase() ||
      'Unknown';

    const dto: CreateMainDetailsDto = {
      Airline,
      Arline_Code,
    };

    const str = (a: string, b?: string) => {
      const v = pr(a, b);
      return v ? String(v).trim() : '';
    };
    if (str('regnNo', 'Regn')) dto.Regn = str('regnNo', 'Regn');
    if (str('route', 'Route')) dto.Route = str('route', 'Route');
    if (str('ops', 'Typeofflight'))
      dto.Typeofflight = str('ops', 'Typeofflight');
    if (str('ataDate', 'ATADate')) dto.ATADate = str('ataDate', 'ATADate');
    if (str('atdDate', 'ATDDate')) dto.ATDDate = str('atdDate', 'ATDDate');
    if (str('atdTime', 'ATDTime')) dto.ATDTime = str('atdTime', 'ATDTime');
    if (str('iposDate', 'IPosDate')) dto.IPosDate = str('iposDate', 'IPosDate');
    if (str('iposTime', 'IPosTime')) dto.IPosTime = str('iposTime', 'IPosTime');
    if (str('etdTime', 'ETDtime')) dto.ETDtime = str('etdTime', 'ETDtime');
    if (str('terminalCode', 'Terminal'))
      dto.Terminal = str('terminalCode', 'Terminal');
    if (str('ArrivalFltNo')) dto.ArrivalFltNo = compactFlightNo(str('ArrivalFltNo'));
    if (str('DepartureFltNo')) dto.DepartureFltNo = compactFlightNo(str('DepartureFltNo'));
    if (str('arrivalFlightNo')) dto.ArrivalFltNo = compactFlightNo(str('arrivalFlightNo'));
    if (str('departureFlightNo')) dto.DepartureFltNo = compactFlightNo(str('departureFlightNo'));
    if (str('flightCategory', 'Cate_of_Flight'))
      dto.Cate_of_Flight = str('flightCategory', 'Cate_of_Flight');
    if (str('ghRep', 'PAX_Airline_SignByDate'))
      dto.PAX_Airline_SignByDate = str('ghRep', 'PAX_Airline_SignByDate');
    if (str('airlineRep', 'airrep')) dto.airrep = str('airlineRep', 'airrep');
    if (str('arrivalDelay', 'ActualDelay'))
      dto.ActualDelay = str('arrivalDelay', 'ActualDelay');
    if (str('departureDelay')) dto.departureDelay = str('departureDelay');
    if (str('etdDate')) (dto as { etdDate?: string }).etdDate = str('etdDate');

    const ataTime =
      normalizeCell(raw.ata) ||
      normalizeCell(raw.ataTime) ||
      pr('ataTime', 'ATATime');
    if (ataTime) dto.ATATime = ataTime;

    const depStatus =
      normalizeCell(raw.departureStatus) ||
      normalizeCell(raw.Delay) ||
      normalizeCell(raw.delay);
    if (depStatus) dto.departureStatus = depStatus;

    const ac = normalizeCell(raw.acType) || str('aircraftType', 'TypeCraft');
    if (ac) dto.TypeCraft = ac;

    applyDelayFieldsFromFlatRow(dto, raw);
    enrichMainDtoFromFlatRow(dto, raw);
    applyEmbedScheduleAliases(dto, raw, picked);

    return dto;
  }

  private buildTerminalDto(
    raw: Record<string, string>,
    keyToModules: Map<string, Set<ImportTarget>>,
    airline: string,
    flightNo: string,
  ): CreateTerminalDetailsDto {
    const picked = this.pickForTarget(raw, 'terminal', keyToModules);
    const dto = {
      airlinesOperator: airline,
      ...remapFlatPickedFields(picked, 'terminal'),
      FlightNo: flightNo,
    } as CreateTerminalDetailsDto;
    const ops = normalizeCell(raw.ops);
    if (ops) dto.Typeofflight = ops;
    const route = normalizeCell(raw.route);
    if (route) dto.routing = route;
    applyEmbedScheduleAliases(dto, raw, picked);
    return dto;
  }

  private buildRampDto(
    raw: Record<string, string>,
    keyToModules: Map<string, Set<ImportTarget>>,
    airline: string,
    flightNo: string,
  ): CreateRampDetails1Dto {
    const picked = this.pickForTarget(raw, 'ramp', keyToModules);
    const dto = {
      airlinesOperator: airline,
      ...remapFlatPickedFields(picked, 'ramp'),
      FlightNo: flightNo,
    } as CreateRampDetails1Dto;
    const ops = normalizeCell(raw.ops);
    if (ops) dto.Typeofflight = ops;
    const route = normalizeCell(raw.route);
    if (route) dto.Route = route;

    const ataTime = normalizeCell(raw.ata);
    if (ataTime) dto.ATATime = ataTime;

    applyEmbedScheduleAliases(dto, raw, picked);
    return dto;
  }

  private buildLoadDto(
    raw: Record<string, string>,
    keyToModules: Map<string, Set<ImportTarget>>,
    airline: string,
    flightNo: string,
  ): CreateLoadControlDetailsDto {
    const picked = this.pickForTarget(raw, 'loadControl', keyToModules);
    const dto = {
      airlinesOperator: airline,
      ...remapFlatPickedFields(picked, 'loadControl'),
      FlightNo: flightNo,
    } as CreateLoadControlDetailsDto;
    const ops = normalizeCell(raw.ops);
    if (ops) dto.Typeofflight = ops;
    const route = normalizeCell(raw.route);
    if (route) dto.routing = route;
    applyEmbedScheduleAliases(dto, raw, picked);
    return dto;
  }

  private buildRemarksPatch(
    raw: Record<string, string>,
    keyToModules: Map<string, Set<ImportTarget>>,
    airline: string,
    flightNo: string,
  ): Partial<{
    Airline: string;
    FlightNo: string;
    PaxGHAirlineRep_Name: string;
    ghRemarks: string;
    AirRepRem: string;
    airrep: string;
    PAX_Airline_SignByDate: string;
  }> {
    const picked = this.pickForTarget(raw, 'remarks', keyToModules);
    const ghRemarks =
      picked.ghRemarks ||
      normalizeCell(raw.ghRemarks) ||
      normalizeCell(raw.CALRem) ||
      normalizeCell(raw.Pax_GHRemarks) ||
      picked.PaxGHAirlineRep_Name;
    return {
      Airline: airline || picked.Airline || picked.airline,
      FlightNo: compactFlightNo(flightNo || picked.FlightNo || picked.flightNo),
      ghRemarks,
      PaxGHAirlineRep_Name:
        picked.PaxGHAirlineRep_Name || ghRemarks,
      AirRepRem:
        picked.AirRepRem ||
        picked.airlineRemarks ||
        normalizeCell(raw.AirRepRem) ||
        normalizeCell(raw.airlineRemarks) ||
        normalizeCell(raw.Pax_AirlineRemarks),
      airrep:
        picked.airrep ||
        picked.airlineRep ||
        normalizeCell(raw.airrep) ||
        normalizeCell(raw.airlineRep),
      PAX_Airline_SignByDate:
        picked.PAX_Airline_SignByDate ||
        picked.ghRep ||
        normalizeCell(raw.PAX_Airline_SignByDate) ||
        normalizeCell(raw.ghRep),
    };
  }
}
