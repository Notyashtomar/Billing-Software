import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type DelayReportSummaryDocument = DelayReportSummary & Document;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Schema({ _id: false, versionKey: false })
export class DelayReportCodeAggregate {
  @Prop({ type: String, required: true, trim: true })
  code: string;

  @Prop({ type: Number, required: true, min: 0 })
  flightCount: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalMinutes: number;
}

export const DelayReportCodeAggregateSchema = SchemaFactory.createForClass(
  DelayReportCodeAggregate,
);

@Schema({ _id: false, versionKey: false })
export class DelayReportPairBucket {
  @Prop({ type: String, default: '', trim: true })
  airline: string;

  @Prop({ type: String, default: '', trim: true })
  airlineCode: string;

  @Prop({ type: String, default: '—', trim: true })
  station: string;

  @Prop({ type: Number, required: true, min: 0 })
  delayedFlights: number;

  @Prop({ type: Number, required: true, min: 0 })
  totalDelayMinutes: number;

  /** 24-hour delayed-flight counts for this airline+station pair. */
  @Prop({ type: [Number], default: [] })
  hourCounts: number[];

  @Prop({ type: [DelayReportCodeAggregateSchema], default: [] })
  codes: DelayReportCodeAggregate[];
}

export const DelayReportPairBucketSchema = SchemaFactory.createForClass(
  DelayReportPairBucket,
);

@Schema({
  timestamps: true,
  collection: 'delay_reports',
  versionKey: false,
  minimize: false,
})
export class DelayReportSummary {
  /** Daily materialized shard (`yyyy-MM-dd`) used to compose arbitrary ranges quickly. */
  @Prop({
    type: String,
    required: true,
    trim: true,
    match: YMD_PATTERN,
  })
  summaryDate: string;

  @Prop({
    type: Date,
    required: true,
    default: (): Date => new Date(),
  })
  generatedAt: Date;

  /**
   * Pre-aggregated delay metrics by airline+station pair.
   * This preserves exact airline/station filtering without rescanning `fhr_collection`.
   */
  @Prop({ type: [DelayReportPairBucketSchema], default: [] })
  pairBuckets: DelayReportPairBucket[];

  @Prop({
    type: MongooseSchema.Types.Mixed,
    required: true,
  })
  perf: Record<string, unknown>;
}

export const DelayReportSummarySchema =
  SchemaFactory.createForClass(DelayReportSummary);

DelayReportSummarySchema.index(
  { summaryDate: 1 },
  { unique: true, name: 'uniq_delay_report_day' },
);

DelayReportSummarySchema.index(
  { generatedAt: -1 },
  { name: 'delay_report_generated_desc' },
);
