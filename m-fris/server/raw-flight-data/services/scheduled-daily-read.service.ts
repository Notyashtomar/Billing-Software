import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeStationCode } from '../../common/station/station.constants';
import {
  SCHEDULED_DAILY_ROW_LIST_PROJECTION,
  ScheduledDailyRow,
  ScheduledDailyRowDocument,
} from '../schema/scheduled-daily-row.schema';
import { SCHEDULED_DAILY_PARITY_DATA_FIELDS } from '../constants/scheduled-daily-parity.constants';
import {
  eachYmdInclusive,
  identityKeyFromDailyData,
  parseYmd,
} from '../utils/scheduled-daily-row.util';

export type DailyListRow = { data: Record<string, unknown> };

export interface ScheduledDailyParityReport {
  stationCode: string;
  fromYmd: string;
  toYmd: string;
  legacyCount: number;
  projectedCount: number;
  missingInProjected: number;
  extraInProjected: number;
  fieldMismatches: number;
  sampleMissing: string[];
  sampleExtra: string[];
  sampleFieldDiffs: Array<{
    identityKey: string;
    field: string;
    legacy: string;
    projected: string;
  }>;
}

/**
 * Indexed reads from `scheduled_daily_rows` (CP-01 Phase 3).
 * Does not call the legacy universe assembler.
 */
@Injectable()
export class ScheduledDailyReadService {
  private readonly logger = new Logger(ScheduledDailyReadService.name);

  constructor(
    @InjectModel(ScheduledDailyRow.name)
    private readonly rowModel: Model<ScheduledDailyRowDocument>,
  ) {}

  /**
   * O(log n + k) range read: station + staYmd ∈ [from, to].
   * Returns the same wire shape as `listDailyFromAdvance`.
   */
  async listDailyRows(params: {
    stationCode: string;
    fromYmd: string;
    toYmd: string;
  }): Promise<DailyListRow[]> {
    const stationCode = normalizeStationCode(params.stationCode);
    if (!stationCode) return [];
    if (!parseYmd(params.fromYmd) || !parseYmd(params.toYmd)) return [];
    const days = eachYmdInclusive(params.fromYmd, params.toYmd);
    if (days.length === 0) return [];

    const wallStart = Date.now();
    const docs = await this.rowModel
      .find(
        {
          stationCode,
          staYmd: { $gte: params.fromYmd, $lte: params.toYmd },
        },
        SCHEDULED_DAILY_ROW_LIST_PROJECTION,
      )
      .lean()
      .exec();

    const rows: DailyListRow[] = docs.map((doc) => ({
      data: {
        ...((doc.data ?? {}) as Record<string, unknown>),
      },
    }));

    this.logger.debug(
      `[scheduled_daily_read] list station=${stationCode} from=${params.fromYmd} to=${params.toYmd} rows=${rows.length} wallMs=${Date.now() - wallStart}`,
    );
    return rows;
  }

  compareParity(
    stationCode: string,
    fromYmd: string,
    toYmd: string,
    legacy: DailyListRow[],
    projected: DailyListRow[],
  ): ScheduledDailyParityReport {
    const legacyMap = new Map<string, Record<string, unknown>>();
    for (const row of legacy) {
      const data = row.data ?? {};
      legacyMap.set(identityKeyFromDailyData(data), data);
    }
    const projectedMap = new Map<string, Record<string, unknown>>();
    for (const row of projected) {
      const data = row.data ?? {};
      projectedMap.set(identityKeyFromDailyData(data), data);
    }

    const sampleMissing: string[] = [];
    const sampleExtra: string[] = [];
    const sampleFieldDiffs: ScheduledDailyParityReport['sampleFieldDiffs'] = [];
    let missingInProjected = 0;
    let extraInProjected = 0;
    let fieldMismatches = 0;

    for (const [key, legacyData] of legacyMap) {
      const proj = projectedMap.get(key);
      if (!proj) {
        missingInProjected += 1;
        if (sampleMissing.length < 10) sampleMissing.push(key);
        continue;
      }
      for (const field of SCHEDULED_DAILY_PARITY_DATA_FIELDS) {
        const a = normalizeParityValue(legacyData[field]);
        const b = normalizeParityValue(proj[field]);
        if (a === b) continue;
        // Prefer serial/slNo equivalence: ignore empty alternate aliases if one side set.
        if (isAliasField(field) && (a === '' || b === '')) continue;
        fieldMismatches += 1;
        if (sampleFieldDiffs.length < 20) {
          sampleFieldDiffs.push({
            identityKey: key,
            field,
            legacy: a,
            projected: b,
          });
        }
      }
    }
    for (const key of projectedMap.keys()) {
      if (legacyMap.has(key)) continue;
      extraInProjected += 1;
      if (sampleExtra.length < 10) sampleExtra.push(key);
    }

    return {
      stationCode,
      fromYmd,
      toYmd,
      legacyCount: legacyMap.size,
      projectedCount: projectedMap.size,
      missingInProjected,
      extraInProjected,
      fieldMismatches,
      sampleMissing,
      sampleExtra,
      sampleFieldDiffs,
    };
  }

  logParityReport(report: ScheduledDailyParityReport): void {
    const ok =
      report.missingInProjected === 0 &&
      report.extraInProjected === 0 &&
      report.fieldMismatches === 0;
    const payload = JSON.stringify(report);
    if (ok) {
      this.logger.debug(`[scheduled_daily_parity] ok ${payload}`);
    } else {
      this.logger.warn(`[scheduled_daily_parity] mismatch ${payload}`);
    }
  }
}

function normalizeParityValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v).trim();
}

function isAliasField(field: string): boolean {
  return (
    field === 'SlNo' ||
    field === 'slNo' ||
    field === 'serialNo' ||
    field === 'SerialNo' ||
    field === 'Airline' ||
    field === 'airline' ||
    field === 'FlightNo' ||
    field === 'flightNo' ||
    field === 'STADate' ||
    field === 'staDate' ||
    field === 'STDDate' ||
    field === 'stdDate' ||
    field === 'STATime' ||
    field === 'staTime' ||
    field === 'STDTime' ||
    field === 'stdTime' ||
    field === 'Exported NAV' ||
    field === 'exportedNAV' ||
    field === 'status' ||
    field === 'rowStatus'
  );
}
