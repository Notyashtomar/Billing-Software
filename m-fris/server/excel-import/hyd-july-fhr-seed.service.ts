import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';
import { MainDetailsService } from 'src/main-details/services/main-details.service';
import { TerminalDetailsService } from 'src/terminal-details/services/terminal-details.service';
import { RampDetails1Service } from 'src/ramp-details-1/services/ramp-details-1.service';
import { LoadControlDetailsService } from 'src/load-control-details/services/load-control-details.service';
import { RemarksService } from 'src/remarks/services/remarks.service';
import { AttachmentsService } from 'src/attachments/services/attachments.service';
import { FhrCollectionService } from 'src/fhr-collection/services/fhr-collection.service';
import {
  FhrCollection,
  FhrCollectionDocument,
} from 'src/fhr-collection/schema/fhr-collection.schema';
import {
  StationScope,
  fixedStationScope,
  type StationScopeContext,
} from '../common/station/station-scope';
import { normalizeStationCode } from '../common/station/station.constants';
import { mapHydJulyRow, staDateToIsoYmd } from './hyd-july-skd-mapping';

export type HydJulySeedOptions = {
  dryRun?: boolean;
  fromYmd?: string | null;
  toYmd?: string | null;
  sheetName?: string;
  /**
   * Station stamped on form collections + `fhr_collection`.
   * Default `HYD` (Hyderabad July seed). Pass `MAA` for Chennai SKD exports.
   */
  stationCode?: string;
  /** Override `lastSnapshotReason` prefix (default derives from station). */
  seedReason?: string;
};

export type HydJulySeedSummary = {
  dryRun: boolean;
  stationCode: string;
  sheetName: string;
  totalRowsRead: number;
  flightsProcessed: number;
  inserted: number;
  updated: number;
  skippedRows: number;
  skippedOutsideWindow: number;
  collisionRows: number;
  unmappedHeaders: string[];
  rowErrors: { rowIndex: number; slNo?: string; message: string }[];
  notes: string[];
};

@Injectable()
export class HydJulyFhrSeedService {
  private readonly log = new Logger(HydJulyFhrSeedService.name);

  constructor(
    private readonly mainDetailsService: MainDetailsService,
    private readonly terminalDetailsService: TerminalDetailsService,
    private readonly rampDetails1Service: RampDetails1Service,
    private readonly loadControlDetailsService: LoadControlDetailsService,
    private readonly remarksService: RemarksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly fhrCollectionService: FhrCollectionService,
    @InjectModel(FhrCollection.name)
    private readonly fhrModel: Model<FhrCollectionDocument>,
  ) {}

  async importFromFilePath(
    absolutePath: string,
    opts: HydJulySeedOptions = {},
  ): Promise<HydJulySeedSummary> {
    const wb = XLSX.readFile(absolutePath, { cellDates: false, raw: true });
    return this.importWorkbook(wb, opts);
  }

  private async importWorkbook(
    wb: XLSX.WorkBook,
    opts: HydJulySeedOptions,
  ): Promise<HydJulySeedSummary> {
    const dryRun = !!opts.dryRun;
    const stationCode =
      normalizeStationCode(opts.stationCode) ?? 'HYD';
    const scope = fixedStationScope(stationCode);
    const seedReason =
      opts.seedReason?.trim() ||
      `${stationCode.toLowerCase()}_skd_display_header_seed`;
    const sheetName =
      opts.sheetName?.trim() ||
      wb.SheetNames.find((n) => /^sheet1$/i.test(n.trim())) ||
      wb.SheetNames[0];

    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error(
        `Worksheet not found${opts.sheetName ? `: ${opts.sheetName}` : ''}. Available: ${wb.SheetNames.join(', ')}`,
      );
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });
    const headers = matrix[0] ?? [];
    const dataRows = matrix.slice(1);

    const summary: HydJulySeedSummary = {
      dryRun,
      stationCode,
      sheetName,
      totalRowsRead: dataRows.length,
      flightsProcessed: 0,
      inserted: 0,
      updated: 0,
      skippedRows: 0,
      skippedOutsideWindow: 0,
      collisionRows: 0,
      unmappedHeaders: [],
      rowErrors: [],
      notes: [
        `${stationCode} scheduled SKD seed → mainDetails, terminalDetails, rampDetails1, loadControlDetails, remarks, attachments → fhr_collection (stationCode=${stationCode}).`,
        'STA/ATA/STD/ATD stored as separate Date + Time fields (schema). Combined export timestamps → lastSnapshotAt / workbookExtras.',
        'No complete-FHR skip — every valid workbook row is upserted.',
      ],
    };

    const unmappedSeen = new Set<string>();

    for (let idx = 0; idx < dataRows.length; idx++) {
      const rowIndex = idx + 2;
      const line = dataRows[idx] ?? [];
      const hasAny = line.some((v) => String(v ?? '').trim() !== '');
      if (!hasAny) {
        summary.skippedRows += 1;
        continue;
      }

      const mapped = mapHydJulyRow(headers, line);
      if ('error' in mapped) {
        summary.skippedRows += 1;
        summary.rowErrors.push({ rowIndex, message: mapped.error });
        continue;
      }

      for (const h of mapped.headersUnmapped) unmappedSeen.add(h);

      const ymds = [
        staDateToIsoYmd(mapped.main.STADate ?? ''),
        staDateToIsoYmd(mapped.main.STDDate ?? ''),
        staDateToIsoYmd(mapped.main.ATDDate ?? ''),
      ].filter((v): v is string => Boolean(v));
      const inWindow =
        !opts.fromYmd && !opts.toYmd
          ? true
          : ymds.some((ymd) => {
              if (opts.fromYmd && ymd < opts.fromYmd) return false;
              if (opts.toYmd && ymd > opts.toYmd) return false;
              return true;
            });
      if (!inWindow) {
        summary.skippedOutsideWindow += 1;
        summary.skippedRows += 1;
        continue;
      }

      const existing = await this.fhrModel
        .findOne({ SerialNo: mapped.serial })
        .select({ SerialNo: 1, stationCode: 1 })
        .lean()
        .exec();
      if (
        existing &&
        existing.stationCode &&
        String(existing.stationCode).toUpperCase() !== stationCode
      ) {
        summary.collisionRows += 1;
        summary.skippedRows += 1;
        summary.rowErrors.push({
          rowIndex,
          slNo: String(mapped.serial),
          message: `SerialNo ${mapped.serial} already exists for station ${existing.stationCode} — not overwriting`,
        });
        continue;
      }

      summary.flightsProcessed += 1;
      if (dryRun) continue;

      try {
        await this.writeRow(mapped, scope, seedReason);
        if (existing) summary.updated += 1;
        else summary.inserted += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        summary.rowErrors.push({
          rowIndex,
          slNo: String(mapped.serial),
          message,
        });
        this.log.warn(`Row ${rowIndex} serial ${mapped.serial} failed: ${message}`);
      }
    }

    summary.unmappedHeaders = [...unmappedSeen];
    if (summary.unmappedHeaders.length > 0) {
      summary.notes.push(
        `Unmapped headers (not written): ${summary.unmappedHeaders.join(', ')}`,
      );
    }

    if (!dryRun && summary.flightsProcessed > 0) {
      const reindexed =
        await this.fhrCollectionService.reindexStaDatesFromEmbeds(scope);
      summary.notes.push(
        `Reindexed staDates on ${reindexed} fhr_collection document(s) for ${stationCode}.`,
      );
    }

    return summary;
  }

  private async writeRow(
    mapped: Exclude<ReturnType<typeof mapHydJulyRow>, { error: string }>,
    scope: StationScopeContext,
    seedReason: string,
  ): Promise<void> {
    await this.mainDetailsService.upsertBySerial(mapped.serial, mapped.main, scope);
    await this.terminalDetailsService.upsertBySerial(
      mapped.serial,
      mapped.terminal,
      scope,
    );
    await this.rampDetails1Service.upsertBySerial(
      mapped.serial,
      mapped.ramp,
      scope,
    );
    await this.loadControlDetailsService.upsertBySerial(
      mapped.serial,
      mapped.load,
      scope,
    );
    await this.remarksService.mergeForSpreadsheetImport(
      mapped.serial,
      mapped.remarks,
      { flightStaDateIso: mapped.staIso },
      scope,
    );
    if ((mapped.attachments.reports ?? []).length > 0) {
      await this.attachmentsService.upsertBySerial(
        mapped.serial,
        mapped.attachments,
        scope,
      );
    }

    const stationCode = StationScope.require(scope);
    const reasonTail = mapped.lastSnapshotReason.replace(
      /^hyd_july_skd_seed\s*/,
      '',
    );
    const extrasSet: Record<string, unknown> = {
      stationCode,
      lastSnapshotReason: [seedReason, reasonTail].filter(Boolean).join(' '),
    };
    if (mapped.lastSnapshotAt) extrasSet.lastSnapshotAt = mapped.lastSnapshotAt;
    if (Object.keys(mapped.workbookExtras).length > 0) {
      extrasSet.workbookExtras = mapped.workbookExtras;
    }
    await this.fhrModel
      .updateOne({ SerialNo: mapped.serial }, { $set: extrasSet })
      .exec();
  }
}
