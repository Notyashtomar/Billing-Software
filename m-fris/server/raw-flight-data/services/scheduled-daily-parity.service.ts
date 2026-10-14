import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { fixedStationScope } from '../../common/station/station-scope';
import { normalizeStationCode } from '../../common/station/station.constants';
import { eachYmdInclusive, parseYmd, ymdToDdMmYyyy } from '../utils/scheduled-daily-row.util';
import { RawFlightDataService } from './raw-flight-data.service';
import {
  ScheduledDailyParityReport,
  ScheduledDailyReadService,
} from './scheduled-daily-read.service';

/**
 * Phase 5 — compare legacy assembler vs `scheduled_daily_rows` for a range.
 */
@Injectable()
export class ScheduledDailyParityService {
  private readonly logger = new Logger(ScheduledDailyParityService.name);

  constructor(
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly scheduledDailyRead: ScheduledDailyReadService,
  ) {}

  async runParity(params: {
    stationCode: string;
    fromYmd: string;
    toYmd: string;
  }): Promise<ScheduledDailyParityReport> {
    const stationCode = normalizeStationCode(params.stationCode);
    if (!stationCode) {
      throw new BadRequestException('stationCode is required');
    }
    if (!parseYmd(params.fromYmd) || !parseYmd(params.toYmd)) {
      throw new BadRequestException('fromYmd/toYmd must be yyyy-MM-dd');
    }
    const days = eachYmdInclusive(params.fromYmd, params.toYmd);
    if (days.length === 0) {
      throw new BadRequestException('empty date range');
    }
    if (days.length > 14) {
      throw new BadRequestException(
        'parity range limited to 14 days (expensive: runs legacy assembler)',
      );
    }

    const fromDd = ymdToDdMmYyyy(params.fromYmd);
    const toDd = ymdToDdMmYyyy(params.toYmd);
    const station = fixedStationScope(stationCode);
    const wallStart = Date.now();

    const legacy = await this.rawFlightDataService.listDailyFromAdvance(
      fromDd,
      toDd,
      true,
      station,
      { forceLegacyAssembler: true },
    );
    const projected = await this.scheduledDailyRead.listDailyRows({
      stationCode,
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
    });
    const report = this.scheduledDailyRead.compareParity(
      stationCode,
      params.fromYmd,
      params.toYmd,
      legacy,
      projected,
    );
    this.scheduledDailyRead.logParityReport(report);
    this.logger.log(
      `[scheduled_daily_parity] wallMs=${Date.now() - wallStart} ${JSON.stringify({
        stationCode,
        fromYmd: params.fromYmd,
        toYmd: params.toYmd,
        legacyCount: report.legacyCount,
        projectedCount: report.projectedCount,
        missingInProjected: report.missingInProjected,
        extraInProjected: report.extraInProjected,
        fieldMismatches: report.fieldMismatches,
      })}`,
    );
    return report;
  }
}
