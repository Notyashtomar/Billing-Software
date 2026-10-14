import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type MainDetailsDocument = MainDetails & Document;

/** Single delay entry (Departure/Arrival section) — names per `correct version` sheet row 2. */
@Schema({ _id: false })
export class DelayEntry {
  @Prop({ default: '' })
  Delay: string;

  @Prop({ default: '' })
  ReasonofDelay: string;

  @Prop({ default: false })
  gh: boolean;

  @Prop({ default: false })
  oth: boolean;
}
const DelayEntrySchema = SchemaFactory.createForClass(DelayEntry);

@Schema({ timestamps: true, collection: 'mainDetails' })
export class MainDetails {
  /** Was `SerialNo`; sheet `slNo` → `SerialNo`. Unique index is on `mainDetails` collection only — see `MainDetailsCollectionSchema` (not on FHR embed, or null embeds would violate Mongo unique). */
  @Prop({ required: true })
  SerialNo: number;

  /** Alias of `SerialNo` for dashboard / FHR JSON payloads. */
  @Prop()
  flightSerialNumber: number;

  @Prop({ required: true })
  Airline: string;

  /** Parent / operating company (non-scheduled booking). Shown inside FHR header box. */
  @Prop({ default: '' })
  CompanyName: string;

  @Prop({ required: true })
  Arline_Code: string;

  @Prop({ default: false })
  ifOperationSplit: boolean;

  @Prop({ default: '' })
  ArrivalFltNo: string;

  @Prop({ default: '' })
  DepartureFltNo: string;

  /** Scheduled times (NS Excel / FHR). Distinct from ATA/ATD actuals. */
  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ default: '' })
  FlightNo: string;

  @Prop()
  ATADate: string;

  @Prop()
  ATATime: string;

  @Prop()
  ATDDate: string;

  @Prop()
  ATDTime: string;

  @Prop()
  IPosDate: string;

  @Prop()
  IPosTime: string;

  @Prop()
  etdDate: string;

  @Prop()
  ETDtime: string;

  @Prop({ default: '' })
  Regn: string;

  @Prop({ default: '' })
  Terminal: string;

  @Prop({ default: '' })
  Route: string;

  @Prop({ default: '' })
  Typeofflight: string;

  /** Type of handling (Excel / schedule setup; e.g. Turnaround, Transit). */
  @Prop({ default: '' })
  TypeofHandling: string;

  @Prop({ default: '' })
  Cate_of_Flight: string;

  @Prop({ default: false })
  stationBaseNightHalt: boolean;

  @Prop({ default: '' })
  TypeCraft: string;

  @Prop({ default: '' })
  aircraftBody: string;

  @Prop({ default: false })
  returnToRamp: boolean;

  @Prop({ default: false })
  stdLessThanSta: boolean;

  /** Max takeoff weight (from FHR / aircraft data sheets). */
  @Prop({ default: '' })
  MTOW: string;

  @Prop({ default: false })
  freighter: boolean;

  @Prop({ default: false })
  medicalPassenger: boolean;

  @Prop({ default: '' })
  ActualDelay: string;

  @Prop({ default: '' })
  departureStatus: string;

  @Prop({ default: '' })
  departureDelay: string;

  @Prop({ type: [DelayEntrySchema], default: [] })
  departureDelays: DelayEntry[];

  @Prop({ type: [DelayEntrySchema], default: [] })
  arrivalDelays: DelayEntry[];

  @Prop({ default: '' })
  PAX_Airline_SignByDate: string;

  @Prop({ default: '' })
  airrep: string;

  @Prop({ default: false })
  flightCancelled: boolean;

  /** User opted to email FHR to the airline when all operational locks are complete. */
  @Prop({ default: false })
  shareFhrToAirline: boolean;

  /** User opted to email FHR + GSE + Team to the GH representative when all locks are complete. */
  @Prop({ default: false })
  shareReportsToGhRep: boolean;

  /** Non-scheduled booking document number (promoted from ns-non-scheduled-booking). */
  @Prop({ default: '' })
  bookingNo: string;

  /** Non-scheduled challan document number (promoted from ns-non-scheduled-booking). */
  @Prop({ default: '' })
  challanNo: string;
}
/** Use for FHR and other embeds. Do not add a unique index on `SerialNo` here — it would create `fhr_collection.mainDetails.SerialNo_1` and E11000 when many docs have null/missing embeds. */
export const MainDetailsSchema = SchemaFactory.createForClass(MainDetails);

/** `mainDetails` collection only: station-scoped uniqueness by flight `SerialNo`. */
export const MainDetailsCollectionSchema = MainDetailsSchema.clone();

// Station segregation applies ONLY to the standalone collection, never the FHR
// embed. Rollout uses `required:false` so legacy MAA docs (no stationCode yet)
// and their updates never fail validation before the manual backfill runs.
MainDetailsCollectionSchema.plugin(stationAwarePlugin, { required: false });

// A flight serial is unique within a station. The legacy global `SerialNo_1`
// unique index is dropped by the manual index-swap migration (never in code).
MainDetailsCollectionSchema.index(
  { stationCode: 1, SerialNo: 1 },
  { unique: true },
);
