import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import type { PaxShiftFlightDetailsRecord } from '../constants/pax-shift-field-types';
import {
  PAX_SHIFT_REPORT_KIND,
  type PaxShiftReportKind,
} from '../constants/reports-pax-shift-report.constants';

export type ReportsPaxShiftReportDocument =
  HydratedDocument<ReportsPaxShiftReport>;

/** One employee row (staff-on-duty, sick leave, CHK-in-staff-D, etc.). */
@Schema({ _id: false })
export class PaxShiftEmployeeRow {
  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;

  @Prop({ default: '' })
  trainingName: string;

  @Prop({ default: '' })
  trainingDate: string;
}

const PaxShiftEmployeeRowSchema =
  SchemaFactory.createForClass(PaxShiftEmployeeRow);

/** Saved block for a single Open-sidebar employee section. */
@Schema({ _id: false })
export class PaxShiftEmployeeSectionBlock {
  @Prop({ type: [PaxShiftEmployeeRowSchema], default: [] })
  rows: PaxShiftEmployeeRow[];
}

const PaxShiftEmployeeSectionBlockSchema = SchemaFactory.createForClass(
  PaxShiftEmployeeSectionBlock,
);

/** Short shipped bag line (sidebar or top-level report). */
@Schema({ _id: false })
export class PaxShiftShortShippedBagRow {
  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ default: '' })
  optionSection: string;

  @Prop({ default: '' })
  remarks: string;
}

const PaxShiftShortShippedBagRowSchema = SchemaFactory.createForClass(
  PaxShiftShortShippedBagRow,
);

@Schema({ _id: false })
export class PaxShiftShortShippedBagsPayload {
  /** Total short-shipped bag count (non-negative integer). */
  @Prop({ type: Number })
  noOfBags?: number;

  @Prop({ type: [PaxShiftShortShippedBagRowSchema], default: [] })
  rows: PaxShiftShortShippedBagRow[];
}

const PaxShiftShortShippedBagsPayloadSchema = SchemaFactory.createForClass(
  PaxShiftShortShippedBagsPayload,
);

/** Duty allocation staff line. */
@Schema({ _id: false })
export class PaxShiftDutyStaffAssignment {
  @Prop({ default: '' })
  staff: string;

  @Prop({ default: '' })
  employeeCode: string;

  @Prop({ default: '' })
  employeeName: string;

  @Prop({ type: [String], default: [] })
  dutyAllocations: string[];
}

const PaxShiftDutyStaffAssignmentSchema = SchemaFactory.createForClass(
  PaxShiftDutyStaffAssignment,
);

/** Optional schedule snapshot for list/report views (denormalized from Main Details). */
@Schema({ _id: false })
export class PaxShiftFlightSnapshot {
  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ default: '' })
  aircraft: string;

  @Prop({ default: '' })
  staDate: string;

  @Prop({ default: '' })
  staTime: string;

  @Prop({ default: '' })
  stdDate: string;

  @Prop({ default: '' })
  stdTime: string;
}

const PaxShiftFlightSnapshotSchema =
  SchemaFactory.createForClass(PaxShiftFlightSnapshot);

/** One flight's bag data inside the singleton `short_shipped_bags` document. */
@Schema({ _id: false })
export class PaxShiftShortShippedBagFlightEntry {
  @Prop({ type: PaxShiftShortShippedBagsPayloadSchema, default: {} })
  shortShippedBags: PaxShiftShortShippedBagsPayload;

  @Prop({ type: PaxShiftFlightSnapshotSchema })
  flightSnapshot?: PaxShiftFlightSnapshot;
}

const PaxShiftShortShippedBagFlightEntrySchema = SchemaFactory.createForClass(
  PaxShiftShortShippedBagFlightEntry,
);

/** One saved duty allocation report (Create new form). */
@Schema({ _id: false })
export class PaxShiftDutyAllocationEntry {
  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ default: '' })
  shift: string;

  @Prop({ default: '' })
  flight: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ type: [PaxShiftDutyStaffAssignmentSchema], default: [] })
  staffAssignments: PaxShiftDutyStaffAssignment[];
}

const PaxShiftDutyAllocationEntrySchema = SchemaFactory.createForClass(
  PaxShiftDutyAllocationEntry,
);

/**
 * Single MongoDB collection for all Pax Shift Report persisted forms.
 *
 * Use `reportKind` to interpret fields:
 * - flight_report: `flightSerial` + `sections` + `flightDetails`
 * - short_shipped_bags: singleton + `shortShippedBagsByFlight` map (key = schedule serial)
 * - duty_allocation: singleton + `dutyAllocationEntries` map (key = entry id)
 */
@Schema({ timestamps: true, collection: 'reports-pax-shift-report' })
export class ReportsPaxShiftReport {
  @Prop({
    required: true,
    enum: Object.values(PAX_SHIFT_REPORT_KIND),
    type: String,
  })
  reportKind: PaxShiftReportKind;

  /**
   * Schedule flight instance serial (`slNo`). Required for flight_report and
   * short_shipped_bags; omitted for duty_allocation.
   */
  @Prop({ trim: true })
  flightSerial?: string;

  /**
   * Flight Details form from Open sidebar (`PaxShiftFlightHandlingForm`).
   * Counts stored as `number`; text/times/dates as `string`.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  flightDetails: PaxShiftFlightDetailsRecord;

  /**
   * Open-sidebar employee sections keyed by API section id
   * (e.g. `psr-staff-on-duty`, `psr-sick-leave`).
   */
  @Prop({ type: Map, of: PaxShiftEmployeeSectionBlockSchema, default: {} })
  sections: Map<string, PaxShiftEmployeeSectionBlock>;

  /** @deprecated Legacy per-flight doc fields; use `shortShippedBagsByFlight` on singleton doc. */
  @Prop({ type: PaxShiftShortShippedBagsPayloadSchema })
  shortShippedBags?: PaxShiftShortShippedBagsPayload;

  /**
   * All short shipped bag flights in one document (`flightSerial` = `SHORT_SHIPPED_BAGS_SINGLETON_SERIAL`).
   * Keys are schedule flight instance serials (`slNo`).
   */
  @Prop({ type: Map, of: PaxShiftShortShippedBagFlightEntrySchema, default: {} })
  shortShippedBagsByFlight: Map<string, PaxShiftShortShippedBagFlightEntry>;

  /**
   * All duty allocation reports in one document (`flightSerial` = `DUTY_ALLOCATION_SINGLETON_SERIAL`).
   * Map keys are entry ids (UUID or legacy MongoDB `_id`).
   */
  @Prop({ type: Map, of: PaxShiftDutyAllocationEntrySchema, default: {} })
  dutyAllocationEntries: Map<string, PaxShiftDutyAllocationEntry>;

  @Prop({ type: PaxShiftFlightSnapshotSchema })
  flightSnapshot?: PaxShiftFlightSnapshot;

  /** @deprecated Legacy duty_allocation doc fields; use `dutyAllocationEntries` on singleton. */
  @Prop({ trim: true })
  date?: string;

  @Prop({ default: '' })
  shift: string;

  @Prop({ default: '' })
  flight: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ type: [PaxShiftDutyStaffAssignmentSchema], default: [] })
  staffAssignments: PaxShiftDutyStaffAssignment[];

  /**
   * True when any Open-button payload exists (sections, flight details, or
   * embedded short shipped data on the flight doc). Used to list “reported” flights.
   */
  @Prop({ default: false })
  hasOpenFormData: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReportsPaxShiftReportSchema = SchemaFactory.createForClass(
  ReportsPaxShiftReport,
);

/** One flight_report per schedule flight serial. */
ReportsPaxShiftReportSchema.index(
  { reportKind: 1, flightSerial: 1 },
  {
    unique: true,
    name: 'uniq_flight_report_serial',
    partialFilterExpression: {
      flightSerial: { $exists: true, $type: 'string', $ne: '' },
      reportKind: PAX_SHIFT_REPORT_KIND.FLIGHT_REPORT,
    },
  },
);

/** Exactly one short_shipped_bags document for the whole report. */
ReportsPaxShiftReportSchema.index(
  { reportKind: 1 },
  {
    unique: true,
    name: 'uniq_short_shipped_bags_singleton',
    partialFilterExpression: {
      reportKind: PAX_SHIFT_REPORT_KIND.SHORT_SHIPPED_BAGS,
    },
  },
);

/** Exactly one duty_allocation document for the whole report. */
ReportsPaxShiftReportSchema.index(
  { reportKind: 1 },
  {
    unique: true,
    name: 'uniq_duty_allocation_singleton',
    partialFilterExpression: {
      reportKind: PAX_SHIFT_REPORT_KIND.DUTY_ALLOCATION,
    },
  },
);

ReportsPaxShiftReportSchema.index(
  { reportKind: 1, hasOpenFormData: 1, flightSerial: 1 },
  { name: 'idx_flight_reports_with_data' },
);
