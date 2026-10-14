import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isScheduledDailyReadModelEnabledForStation,
  readScheduledDailyReadModelEnv,
} from '../config/scheduled-daily-read-model.env';
import { eachYmdInclusive, parseYmd } from '../utils/scheduled-daily-row.util';
import { ScheduledDailyProjectionOutboxService } from './scheduled-daily-projection-outbox.service';
import { ScheduledDailyProjectorService } from './scheduled-daily-projector.service';
import { ScheduledDailyParityService } from './scheduled-daily-parity.service';
import type { ScheduledDailyParityReport } from './scheduled-daily-read.service';

export interface ScheduledDailyCanaryStatus {
  stationCode: string;
  fromYmd: string;
  toYmd: string;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  coverage: {
    rowCount: number;
    distinctDays: number;
    expectedDays: number;
    missingDays: string[];
  };
  outbox: Record<string, number>;
  readModel: {
    mode: string;
    stationAllowlist: string[];
    enabledForThisStation: boolean;
    projectorEnabled: boolean;
  };
  parity?: ScheduledDailyParityReport;
  recommendedEnv: {
    shadow: string[];
    canaryOn: string[];
    rollback: string[];
  };
}

/**
 * Phase 6 — canary readiness checks before flipping READ_MODEL=on.
 */
@Injectable()
export class ScheduledDailyCanaryService {
  constructor(
    private readonly projector: ScheduledDailyProjectorService,
    private readonly outbox: ScheduledDailyProjectionOutboxService,
    private readonly parity: ScheduledDailyParityService,
  ) {}

  async getStatus(params: {
    stationCode: string;
    fromYmd: string;
    toYmd: string;
    runParity?: boolean;
  }): Promise<ScheduledDailyCanaryStatus> {
    const stationCode = String(params.stationCode ?? '')
      .trim()
      .toUpperCase();
    if (!stationCode) {
      throw new BadRequestException('stationCode is required');
    }
    if (!parseYmd(params.fromYmd) || !parseYmd(params.toYmd)) {
      throw new BadRequestException('fromYmd/toYmd must be yyyy-MM-dd');
    }
    const expectedDays = eachYmdInclusive(params.fromYmd, params.toYmd);
    if (expectedDays.length === 0) {
      throw new BadRequestException('empty date range');
    }
    if (expectedDays.length > 31) {
      throw new BadRequestException('canary window limited to 31 days');
    }

    const env = readScheduledDailyReadModelEnv();
    const [coverage, outboxByStatus] = await Promise.all([
      this.projector.coverageForStation(
        stationCode,
        params.fromYmd,
        params.toYmd,
      ),
      this.outbox.countByStatus(stationCode),
    ]);

    const covered = new Set(coverage.days);
    const missingDays = expectedDays.filter((d) => !covered.has(d));
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (coverage.rowCount === 0) {
      blockers.push('No projected rows in window — run /backfill first');
    }
    if (missingDays.length > 0) {
      blockers.push(
        `Missing projection days (${missingDays.length}): ${missingDays.slice(0, 5).join(', ')}${missingDays.length > 5 ? '…' : ''}`,
      );
    }
    const pending = Number(outboxByStatus.pending ?? 0);
    const processing = Number(outboxByStatus.processing ?? 0);
    const dead = Number(outboxByStatus.dead ?? 0);
    if (pending > 0 || processing > 0) {
      warnings.push(
        `Outbox not idle (pending=${pending}, processing=${processing}) — drain before canary on`,
      );
    }
    if (dead > 0) {
      blockers.push(`Outbox has dead letters (${dead}) — inspect / fix before on`);
    }

    let parity: ScheduledDailyParityReport | undefined;
    if (params.runParity === true) {
      if (expectedDays.length > 7) {
        warnings.push(
          'Parity skipped for windows >7 days in canary status; call /parity on a 1–7 day slice',
        );
      } else {
        parity = await this.parity.runParity({
          stationCode,
          fromYmd: params.fromYmd,
          toYmd: params.toYmd,
        });
        if (
          parity.missingInProjected > 0 ||
          parity.extraInProjected > 0 ||
          parity.fieldMismatches > 0
        ) {
          blockers.push(
            `Parity mismatch (missing=${parity.missingInProjected}, extra=${parity.extraInProjected}, fields=${parity.fieldMismatches})`,
          );
        }
      }
    } else {
      warnings.push(
        'Parity not run — pass runParity=1 for a ≤7 day window before canary on',
      );
    }

    const enabledForThisStation = isScheduledDailyReadModelEnabledForStation(
      stationCode,
      env.mode,
    );
    if (env.mode === 'on' && !enabledForThisStation) {
      warnings.push(
        'READ_MODEL=on but this station is outside SCHEDULED_DAILY_READ_MODEL_STATIONS allowlist',
      );
    }

    const ready = blockers.length === 0;

    return {
      stationCode,
      fromYmd: params.fromYmd,
      toYmd: params.toYmd,
      ready,
      blockers,
      warnings,
      coverage: {
        rowCount: coverage.rowCount,
        distinctDays: coverage.distinctDays,
        expectedDays: expectedDays.length,
        missingDays,
      },
      outbox: outboxByStatus,
      readModel: {
        mode: env.mode,
        stationAllowlist: env.stationAllowlist,
        enabledForThisStation,
        projectorEnabled: env.projectorEnabled,
      },
      parity,
      recommendedEnv: {
        shadow: [
          'SCHEDULED_DAILY_READ_MODEL=shadow',
          `SCHEDULED_DAILY_READ_MODEL_STATIONS=${stationCode}`,
        ],
        canaryOn: [
          'SCHEDULED_DAILY_READ_MODEL=on',
          `SCHEDULED_DAILY_READ_MODEL_STATIONS=${stationCode}`,
        ],
        rollback: ['SCHEDULED_DAILY_READ_MODEL=off'],
      },
    };
  }
}
