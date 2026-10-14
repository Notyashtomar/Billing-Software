import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Admin rebuild / enqueue for CP-01 scheduled_daily_rows. */
export class RebuildScheduledDailyRowsDto {
  @IsString()
  @Matches(YMD, { message: 'fromYmd must be yyyy-MM-dd' })
  fromYmd!: string;

  @IsString()
  @Matches(YMD, { message: 'toYmd must be yyyy-MM-dd' })
  toYmd!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Phase 4 backfill: sync (≤62 days) or async outbox enqueue (+ optional drain).
 */
export class BackfillScheduledDailyRowsDto extends RebuildScheduledDailyRowsDto {
  /** `sync` = rebuild in-request (≤62 days). `async` = enqueue outbox (default for large ranges). */
  @IsOptional()
  @IsIn(['sync', 'async'])
  mode?: 'sync' | 'async';

  /** After async enqueue, drain outbox until idle or max cycles. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  drain?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxDrainCycles?: number;
}

/** Phase 5 parity compare for a date range. */
export class ParityScheduledDailyRowsDto extends RebuildScheduledDailyRowsDto {}
