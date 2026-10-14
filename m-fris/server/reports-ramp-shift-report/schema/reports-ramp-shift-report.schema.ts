import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RAMP_SHIFT_REPORT_KIND } from '../constants/reports-ramp-shift-report.constants';

export type ReportsRampShiftReportDocument =
  HydratedDocument<ReportsRampShiftReport>;

@Schema({ _id: false })
export class RampScheduledAirlineRow {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  serialNo: string;

  @Prop({ default: false })
  checked: boolean;

  @Prop({ default: false })
  authorized: boolean;

  @Prop({ default: '' })
  airline: string;

  @Prop({ default: '' })
  fltNo: string;

  @Prop({ default: '' })
  reportNo: string;

  @Prop({ default: '' })
  bayArr: string;

  @Prop({ default: '' })
  bayDep: string;

  @Prop({ default: '' })
  arrivalSta: string;

  @Prop({ default: '' })
  arrivalEta: string;

  @Prop({ default: '' })
  arrivalAta: string;

  @Prop({ default: '' })
  holdOpen: string;

  @Prop({ default: '' })
  holdClose: string;

  @Prop({ default: '' })
  diffAta1stBag: string;

  @Prop({ default: '' })
  diff1stBag: string;

  @Prop({ default: '' })
  diffLastBag: string;

  @Prop({ default: '' })
  diffLbAta: string;

  @Prop({ default: '' })
  depStd: string;

  @Prop({ default: '' })
  depEtd: string;

  @Prop({ default: '' })
  depAtd: string;

  @Prop({ default: '' })
  delay1: string;

  @Prop({ default: '' })
  delay1Mins: string;

  @Prop({ default: '' })
  delay2: string;

  @Prop({ default: '' })
  delay2Mins: string;

  @Prop({ default: '' })
  supvrName: string;

  @Prop({ default: '' })
  teamAtBay: string;

  @Prop({ default: '' })
  lastCargoLot: string;

  @Prop({ default: '' })
  brs: string;

  @Prop({ default: '' })
  chk: string;

  @Prop({ default: '' })
  flightStatus: string;

  @Prop({ default: '' })
  aircraft: string;

  @Prop({ default: false })
  isUpcoming: boolean;
}

const RampScheduledAirlineRowSchema = SchemaFactory.createForClass(
  RampScheduledAirlineRow,
);

@Schema({ _id: false })
export class RampShiftOperationalIndicators {
  @Prop({ default: '' })
  totalArrivals: string;

  @Prop({ default: '' })
  totalDepartures: string;

  @Prop({ default: '' })
  paxFlts: string;

  @Prop({ default: '' })
  cargoFlts: string;

  @Prop({ default: '' })
  unschedPax: string;

  @Prop({ default: '' })
  unschedCargo: string;

  @Prop({ default: '' })
  delayAccountable: string;

  @Prop({ default: '' })
  delayUnAccountable: string;

  @Prop({ default: '' })
  otpTarget: string;

  @Prop({ default: '' })
  otpActual: string;
}

const RampShiftOperationalIndicatorsSchema = SchemaFactory.createForClass(
  RampShiftOperationalIndicators,
);

@Schema({ timestamps: true, collection: 'reports-ramp-shift-report' })
export class ReportsRampShiftReport {
  @Prop({ required: true, default: RAMP_SHIFT_REPORT_KIND })
  reportKind: string;

  @Prop({ required: true, trim: true })
  reportId: string;

  @Prop({ required: true, trim: true })
  reportDateYmd: string;

  @Prop({ required: true, enum: ['day', 'night'] })
  shift: 'day' | 'night';

  @Prop({ default: '' })
  manager: string;

  @Prop({ default: '' })
  reportBy: string;

  @Prop({ type: RampShiftOperationalIndicatorsSchema, default: {} })
  operationalIndicators: RampShiftOperationalIndicators;

  @Prop({ type: [[String]], default: [] })
  resourceValues: string[][];

  @Prop({ type: [RampScheduledAirlineRowSchema], default: [] })
  scheduledRows: RampScheduledAirlineRow[];

  @Prop({ type: [Object], default: [] })
  nonScheduledRows: Record<string, unknown>[];

  @Prop({ default: '' })
  operationalNotes: string;

  @Prop({ default: '' })
  irregularitiesNotes: string;

  @Prop({ default: '' })
  createdBy: string;

  @Prop({ default: '' })
  modifiedBy: string;

  @Prop({ default: false })
  mailSent: boolean;
}

export const ReportsRampShiftReportSchema = SchemaFactory.createForClass(
  ReportsRampShiftReport,
);

ReportsRampShiftReportSchema.index(
  { reportId: 1 },
  { unique: true, name: 'ramp_shift_report_id_unique' },
);

ReportsRampShiftReportSchema.index(
  { reportDateYmd: 1, shift: 1, updatedAt: -1 },
  { name: 'ramp_shift_report_date_shift' },
);
