import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Read-only FHR — mirrors fhr_collection */
export type FhrCollectionReadDocument = FhrCollectionRead & Document;

@Schema({ collection: 'fhr_collection', strict: false, timestamps: true })
export class FhrCollectionRead {
  @Prop()
  SerialNo: number;

  @Prop()
  stationCode: string;

  @Prop({ type: Object })
  mainDetails: Record<string, unknown>;

  @Prop({ type: Object })
  terminalDetails: Record<string, unknown>;

  @Prop({ type: Object })
  rampDetails1: Record<string, unknown>;

  @Prop({ type: Object })
  equipmentManpower: Record<string, unknown>;

  @Prop({ type: Object })
  remarks: Record<string, unknown>;

  @Prop({ type: [String] })
  staDates: string[];

  /** Ramp Assistance Forms cleaning services (Deep / Night Halt / Exterior). */
  @Prop({ type: Object })
  rafCleaningServices?: Record<string, unknown> | null;

  @Prop({ type: Object })
  rafAdhocDetails?: Record<string, unknown> | null;
}

export const FhrCollectionReadSchema = SchemaFactory.createForClass(FhrCollectionRead);
FhrCollectionReadSchema.index({ SerialNo: 1 });
FhrCollectionReadSchema.index({ stationCode: 1 });
// ADS / cleaning date discovery matches staDates under station scope.
FhrCollectionReadSchema.index({ stationCode: 1, staDates: 1 });

export type RawFlightDataReadDocument = RawFlightDataRead & Document;

@Schema({ collection: 'raw_flight_data', strict: false, timestamps: true })
export class RawFlightDataRead {
  @Prop({ type: Object })
  data: Record<string, unknown>;

  @Prop()
  stationCode: string;
}

export const RawFlightDataReadSchema = SchemaFactory.createForClass(RawFlightDataRead);

export type AdsUsageDataDocument = AdsUsageData & Document;

@Schema({ collection: 'ads_usage_data', strict: false, timestamps: true })
export class AdsUsageData {
  @Prop()
  flightNo: string;

  @Prop()
  serviceCode: string;

  @Prop()
  serviceType: string;

  @Prop()
  equipment: string;

  @Prop()
  customerName: string;

  @Prop()
  station: string;

  @Prop()
  date: string;

  @Prop()
  dateKey: string;

  @Prop()
  startTime: string;

  @Prop()
  endTime: string;

  @Prop()
  usageDuration: string;

  @Prop()
  qty: number;

  @Prop()
  chargeableUnits: number;

  @Prop()
  rateINR: number;

  @Prop()
  rateUSD: number;

  @Prop()
  state: string;

  @Prop()
  category: string;
}

export const AdsUsageDataSchema = SchemaFactory.createForClass(AdsUsageData);
AdsUsageDataSchema.index({ station: 1, dateKey: 1 });
AdsUsageDataSchema.index({ flightNo: 1 });

export type RafUsageDataDocument = RafUsageData & Document;

@Schema({ collection: 'raf_usage_data', strict: false, timestamps: true })
export class RafUsageData {
  @Prop()
  serialNumber: string;

  @Prop()
  flightNo: string;

  @Prop()
  serviceCode: string;

  @Prop()
  station: string;

  @Prop()
  stdDateKey: string;

  @Prop()
  handlingUsd: number;

  @Prop()
  handlingInr: number;

  @Prop()
  min: number;

  @Prop()
  chargeableUnits: number;

  @Prop()
  state: string;
}

export const RafUsageDataSchema = SchemaFactory.createForClass(RafUsageData);
RafUsageDataSchema.index({ station: 1, stdDateKey: 1 });

export type NsRawFlightDataDocument = NsRawFlightData & Document;

@Schema({ collection: 'ns_raw_flight_data', strict: false, timestamps: true })
export class NsRawFlightData {
  @Prop({ type: Object })
  data: Record<string, unknown>;

  @Prop()
  stationCode: string;
}

export const NsRawFlightDataSchema = SchemaFactory.createForClass(NsRawFlightData);

/** Read-only advance-airline — mirrors ops customer master */
export type AdvanceAirlineReadDocument = AdvanceAirlineRead & Document;

@Schema({ collection: 'advance-airline', strict: false, timestamps: true })
export class AdvanceAirlineRead {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  @Prop()
  parentCompanyName?: string;

  @Prop()
  address?: string;

  @Prop()
  address2?: string;

  @Prop()
  address3?: string;

  @Prop()
  gstRegistrationNo?: string;

  @Prop()
  stationCode?: string;
}

export const AdvanceAirlineReadSchema = SchemaFactory.createForClass(AdvanceAirlineRead);
AdvanceAirlineReadSchema.index({ stationCode: 1, code: 1 });

/** Read-only gateway scheduled airline — Advance → Gateway → Scheduled Airlines */
export type AdvanceGatewayScheduledAirlineReadDocument =
  AdvanceGatewayScheduledAirlineRead & Document;

@Schema({ collection: 'advance_gateway_scheduled_airline', strict: false, timestamps: true })
export class AdvanceGatewayScheduledAirlineRead {
  @Prop()
  airlines?: string;

  @Prop()
  code?: string;

  @Prop()
  stationCode?: string;
}

export const AdvanceGatewayScheduledAirlineReadSchema = SchemaFactory.createForClass(
  AdvanceGatewayScheduledAirlineRead,
);

/** Read-only schedule setup masters — joined on Scheduled Airlines page */
export type AdvanceScheduleSetupReadDocument = AdvanceScheduleSetupRead & Document;

@Schema({ collection: 'advance_schedule_setup', strict: false, timestamps: true })
export class AdvanceScheduleSetupRead {
  @Prop()
  serialNo?: string;

  @Prop({ type: Object })
  data?: Record<string, unknown>;

  @Prop()
  stationCode?: string;
}

export const AdvanceScheduleSetupReadSchema =
  SchemaFactory.createForClass(AdvanceScheduleSetupRead);

/** Read-only Creation → RAF flights (`creation-raf`). */
export type CreationRafReadDocument = CreationRafRead & Document;

@Schema({ collection: 'creation-raf', strict: false, timestamps: true })
export class CreationRafRead {
  @Prop()
  serialNo?: string;

  @Prop()
  airlines?: string;

  @Prop()
  flightNo?: string;

  @Prop()
  acType?: string;

  @Prop()
  airlineCode?: string;

  @Prop()
  date?: string;

  @Prop()
  date2?: string;

  @Prop()
  operationDate?: string;

  @Prop()
  categoryOfFlight?: string;

  @Prop()
  stationCode?: string;
}

export const CreationRafReadSchema = SchemaFactory.createForClass(CreationRafRead);
CreationRafReadSchema.index({ stationCode: 1, operationDate: 1 });

/** Read-only RAF form docs (`raf_collection`) — equipment/cleaning payloads. */
export type RafCollectionReadDocument = RafCollectionRead & Document;

@Schema({ collection: 'raf_collection', strict: false, timestamps: true })
export class RafCollectionRead {
  @Prop()
  SerialNo: number;

  @Prop()
  flightSerialNumber?: number;

  @Prop()
  stationCode?: string;

  @Prop({ type: Object })
  mainDetails?: Record<string, unknown> | null;

  @Prop({ type: Object })
  rafAdhocDetails?: Record<string, unknown> | null;

  @Prop({ type: Object })
  rafCleaningServices?: Record<string, unknown> | null;
}

export const RafCollectionReadSchema =
  SchemaFactory.createForClass(RafCollectionRead);
RafCollectionReadSchema.index({ stationCode: 1, SerialNo: 1 });

/** Read-only Advance → Gateway → RAF Airline master. */
export type AdvanceRafAirlineReadDocument = AdvanceRafAirlineRead & Document;

@Schema({ collection: 'advance-raf-airline', strict: false, timestamps: true })
export class AdvanceRafAirlineRead {
  @Prop()
  airline?: string;

  @Prop()
  airlineCode?: string;

  @Prop()
  deepCleaning?: boolean;

  @Prop()
  nightHaltCleaning?: boolean;

  @Prop()
  exteriorCleaning?: boolean;

  @Prop()
  stationCode?: string;
}

export const AdvanceRafAirlineReadSchema =
  SchemaFactory.createForClass(AdvanceRafAirlineRead);
AdvanceRafAirlineReadSchema.index({ stationCode: 1, airlineCode: 1 });
