import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type ScheduledDailyRowDocument = ScheduledDailyRow & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Materialized per-station, per-STA-day flight row for Scheduled Airlines list
 * and other `daily-from-advance` consumers (CP-01 read model).
 *
 * Source of truth for schedule masters remains advance / creation / FHR.
 * This collection is the **read projection** — Apply Filters must eventually
 * query only this (indexed), never rebuild the universe at request time.
 *
 * API compatibility: `data` mirrors one element of
 * `listDailyFromAdvance` → `Array<{ data: Record<string, unknown> }>`.
 */
@Schema({
  timestamps: true,
  collection: 'scheduled_daily_rows',
  versionKey: false,
  minimize: false,
})
export class ScheduledDailyRow {
  /** Owning station (via {@link stationAwarePlugin}). */
  stationCode: string;

  /** Operating / STA calendar day `yyyy-MM-dd`. */
  @Prop({ type: String, required: true, trim: true, match: YMD_PATTERN })
  staYmd: string;

  /**
   * Stable identity within (station, staYmd).
   * Examples: `adv:{scheduleId}`, `fhr:{serial}`, `add:{id}`, `cre:{key}`.
   */
  @Prop({ type: String, required: true, trim: true })
  identityKey: string;

  /** Provenance of the row skeleton. */
  @Prop({
    type: String,
    required: true,
    enum: ['fhr', 'advance', 'creation', 'additional'],
  })
  sourceType: 'fhr' | 'advance' | 'creation' | 'additional';

  @Prop({ type: String, default: '', trim: true })
  scheduleId: string;

  /** Stable instance serial when allocated. */
  @Prop({ type: String, default: '', trim: true, index: true })
  serialNo: string;

  @Prop({ type: String, default: '', trim: true })
  airline: string;

  @Prop({ type: String, default: '', trim: true })
  flightNo: string;

  /** Open | Closed | Cancelled (list status). */
  @Prop({ type: String, default: '', trim: true })
  rowStatus: string;

  /**
   * Full list payload for one table row (same shape as legacy `row.data`).
   * Kept as Mixed for API parity during cutover; later phases may slim this.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: Record<string, unknown>;

  /** When this projection was last written. */
  @Prop({
    type: Date,
    required: true,
    default: (): Date => new Date(),
  })
  projectedAt: Date;

  /** Monotonic / hash version from last applied outbox event (Phase 2+). */
  @Prop({ type: String, default: '0' })
  sourceVersion: string;

  /** Last outbox / event id applied (idempotency audit). */
  @Prop({ type: String, default: '' })
  lastEventId: string;

  /** Optional TTL cursor — set by retention job (Phase 2+). */
  @Prop({ type: Date })
  expireAt?: Date;
}

export const ScheduledDailyRowSchema =
  SchemaFactory.createForClass(ScheduledDailyRow);

ScheduledDailyRowSchema.plugin(stationAwarePlugin, { required: true });

ScheduledDailyRowSchema.index(
  { stationCode: 1, staYmd: 1, identityKey: 1 },
  { unique: true, name: 'uniq_station_staYmd_identity' },
);

/** Primary Apply Filters range scan. */
ScheduledDailyRowSchema.index(
  { stationCode: 1, staYmd: 1 },
  { name: 'station_staYmd' },
);

ScheduledDailyRowSchema.index(
  { stationCode: 1, staYmd: 1, airline: 1 },
  { name: 'station_staYmd_airline' },
);

ScheduledDailyRowSchema.index(
  { stationCode: 1, serialNo: 1 },
  { name: 'station_serialNo' },
);

ScheduledDailyRowSchema.index(
  { expireAt: 1 },
  { name: 'expireAt_ttl', expireAfterSeconds: 0, sparse: true },
);

/** Lean list read — Phase 3+. */
export const SCHEDULED_DAILY_ROW_LIST_PROJECTION = {
  _id: 0,
  stationCode: 1,
  staYmd: 1,
  identityKey: 1,
  sourceType: 1,
  scheduleId: 1,
  serialNo: 1,
  airline: 1,
  flightNo: 1,
  rowStatus: 1,
  data: 1,
  projectedAt: 1,
  sourceVersion: 1,
} as const;
