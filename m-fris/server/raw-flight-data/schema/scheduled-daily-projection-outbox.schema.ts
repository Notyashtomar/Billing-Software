import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type ScheduledDailyProjectionOutboxDocument =
  ScheduledDailyProjectionOutbox & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const SCHEDULED_DAILY_OUTBOX_EVENT_TYPES = [
  'rebuild_day',
] as const;

export type ScheduledDailyOutboxEventType =
  (typeof SCHEDULED_DAILY_OUTBOX_EVENT_TYPES)[number];

export const SCHEDULED_DAILY_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'done',
  'failed',
  'dead',
] as const;

export type ScheduledDailyOutboxStatus =
  (typeof SCHEDULED_DAILY_OUTBOX_STATUSES)[number];

/**
 * Durable projection queue for CP-01 `scheduled_daily_rows`.
 * Coalesce key = station + staYmd + eventType so burst writes collapse to one day rebuild.
 */
@Schema({
  timestamps: true,
  collection: 'scheduled_daily_projection_outbox',
  versionKey: false,
  minimize: false,
})
export class ScheduledDailyProjectionOutbox {
  stationCode: string;

  @Prop({ type: String, required: true, trim: true, match: YMD_PATTERN })
  staYmd: string;

  @Prop({
    type: String,
    required: true,
    enum: SCHEDULED_DAILY_OUTBOX_EVENT_TYPES,
  })
  eventType: ScheduledDailyOutboxEventType;

  /** Unique coalescing identity while status is pending/processing. */
  @Prop({ type: String, required: true, trim: true })
  coalesceKey: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  payload: Record<string, unknown>;

  @Prop({
    type: String,
    required: true,
    enum: SCHEDULED_DAILY_OUTBOX_STATUSES,
    default: 'pending',
  })
  status: ScheduledDailyOutboxStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: String, default: '' })
  lastError: string;

  /** Worker must not claim before this time (backoff). */
  @Prop({ type: Date, default: (): Date => new Date() })
  availableAt: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ type: String, default: '' })
  idempotencyKey: string;
}

export const ScheduledDailyProjectionOutboxSchema = SchemaFactory.createForClass(
  ScheduledDailyProjectionOutbox,
);

ScheduledDailyProjectionOutboxSchema.plugin(stationAwarePlugin, {
  required: true,
});

ScheduledDailyProjectionOutboxSchema.index(
  { status: 1, availableAt: 1 },
  { name: 'status_availableAt' },
);

ScheduledDailyProjectionOutboxSchema.index(
  { coalesceKey: 1, status: 1 },
  { name: 'coalesceKey_status' },
);

ScheduledDailyProjectionOutboxSchema.index(
  { stationCode: 1, staYmd: 1, eventType: 1 },
  { name: 'station_staYmd_event' },
);
