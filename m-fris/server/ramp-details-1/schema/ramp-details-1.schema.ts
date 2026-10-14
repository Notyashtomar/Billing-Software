import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type RampDetails1Document = RampDetails1 & Document;

@Schema({ timestamps: true, collection: 'rampDetails1' })
export class RampDetails1 {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ required: true, default: '' })
  airlinesOperator: string;

  @Prop({ required: true, default: '' })
  FlightNo: string;

  @Prop({ default: '' })
  Route: string;

  @Prop({ default: '' })
  Typeofflight: string;

  @Prop({ default: '' })
  etdDate: string;

  @Prop({ default: '' })
  TypeCraft: string;

  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ default: '' })
  etd: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  ATATime: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  ATADate: string;

  @Prop({ default: '' })
  BayPlanned: string;

  @Prop({ default: '' })
  BayFinal: string;

  @Prop({ default: '' })
  arrivalBaggageCount: string;

  @Prop({ default: '' })
  Fbarr: string;

  @Prop({ default: '' })
  firstBagArrivalHallDate: string;

  @Prop({ default: '' })
  firstBagArrivalHallTime: string;

  @Prop({ default: '' })
  bmaCount: string;

  @Prop({ default: '' })
  Lbarr: string;

  /** Bag reconciliation / departure bag (moved from terminal details). */
  @Prop({ default: '' })
  bagreco: string;

  @Prop({ default: '' })
  lastBagArrivalHallDate: string;

  @Prop({ default: '' })
  lastBagArrivalHallTime: string;

  @Prop({ default: '' })
  bbaBelt: string;

  @Prop({ default: '' })
  Fbmup: string;

  @Prop({ default: '' })
  firstBagInBmaDate: string;

  @Prop({ default: '' })
  firstBagInBmaTime: string;

  @Prop({ default: '' })
  airlinecount: string;

  @Prop({ default: '' })
  Lbmup: string;

  @Prop({ default: '' })
  lastBagInBmaDate: string;

  @Prop({ default: '' })
  lastBagInBmaTime: string;

  @Prop({ default: false })
  xRay: boolean;

  @Prop({ default: '' })
  CleaningFr: string;

  @Prop({ default: '' })
  cleaningStartedTime: string;

  @Prop({ default: false })
  oneSidedBelt: boolean;

  @Prop({ default: false })
  customChecked: boolean;

  @Prop({ default: '' })
  CleaningTo: string;

  @Prop({ default: '' })
  cleaningClosedTime: string;

  @Prop({ default: '' })
  HoldCnfLDC: string;

  @Prop({ default: '' })
  HoldCnfLDP: string;

  @Prop({ default: '' })
  HoldCnfMDP: string;

  @Prop({ default: '' })
  holdConfig: string;

  @Prop({ default: '' })
  cgopcsin: string;

  @Prop({ default: '' })
  cgopcout: string;

  @Prop({ default: '' })
  Courierout: string;

  @Prop({ default: '' })
  Courierin: string;

  @Prop({ default: false })
  ifNightHalt: boolean;

  @Prop({ default: '' })
  Frontopen: string;

  @Prop({ default: '' })
  holdOpenFrontTime: string;

  @Prop({ default: '' })
  Rearopen: string;

  @Prop({ default: '' })
  holdOpenRearTime: string;

  @Prop({ default: '' })
  Bulkopen: string;

  @Prop({ default: '' })
  holdOpenBulkTime: string;

  @Prop({ default: '' })
  MDopen: string;

  @Prop({ default: '' })
  holdOpenMainDeckTime: string;

  @Prop({ default: '' })
  Frontclose: string;

  @Prop({ default: '' })
  holdCloseFrontTime: string;

  @Prop({ default: '' })
  Rearclose: string;

  @Prop({ default: '' })
  holdCloseRearTime: string;

  @Prop({ default: '' })
  Bulkclose: string;

  @Prop({ default: '' })
  holdCloseBulkTime: string;

  @Prop({ default: '' })
  MDclose: string;

  @Prop({ default: '' })
  holdCloseMainDeckTime: string;

  @Prop({ default: '' })
  LasteActivityOnHold: string;

  @Prop({ default: '' })
  lastActivityHoldTime: string;

  @Prop({ default: '' })
  uldarr: string;

  @Prop({ default: '' })
  cgoarr: string;

  @Prop({ default: '' })
  mailarr: string;

  @Prop({ default: '' })
  uldplan: string;

  @Prop({ default: '' })
  cgoactdep: string;

  @Prop({ default: '' })
  mailplan: string;

  @Prop({ default: '' })
  uldatcdep: string;

  @Prop({ default: '' })
  cgoplan: string;

  @Prop({ default: '' })
  mailactdep: string;

  @Prop({ default: '' })
  transitcgo: string;

  @Prop({ default: '' })
  transitCargoWeight: string;

  @Prop({ default: '' })
  transitCargoMail: string;
}

export const RampDetails1Schema = SchemaFactory.createForClass(RampDetails1);

// Station segregation (rollout: required:false so legacy MAA docs never fail
// validation before the manual backfill). No legacy unique index existed on
// serialNo, so none is dropped; this only adds a station-scoped lookup index.
RampDetails1Schema.plugin(stationAwarePlugin, { required: false });
RampDetails1Schema.index({ stationCode: 1, serialNo: 1 });
