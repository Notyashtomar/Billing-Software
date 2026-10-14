import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type TerminalDetailsDocument = TerminalDetails & Document;

@Schema({ timestamps: true, collection: 'terminalDetails' })
export class TerminalDetails {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ required: true, default: '' })
  airlinesOperator: string;

  @Prop({ required: true, default: '' })
  FlightNo: string;

  @Prop({ default: '' })
  routing: string;

  @Prop({ default: '' })
  Typeofflight: string;

  @Prop({ default: '' })
  TypeCraft: string;

  @Prop({ default: '' })
  STATime: string;

  @Prop({ default: '' })
  STADate: string;

  @Prop({ default: '' })
  STDTime: string;

  @Prop({ default: '' })
  STDDate: string;

  @Prop({ default: '' })
  IGMNo: string;

  @Prop({ default: '' })
  EGMNo: string;

  @Prop({ default: '' })
  dpr: string;

  @Prop({ default: '' })
  ohd: string;

  @Prop({ default: '' })
  offLoadPax: string;

  @Prop({ default: '' })
  ahl: string;

  @Prop({ default: '' })
  GatePlanned: string;

  @Prop({ default: '' })
  GateFinal: string;

  @Prop({ default: '' })
  cntclose: string;

  @Prop({ default: '' })
  cntopen: string;

  @Prop({ default: '' })
  SystemBagCount: string;

  @Prop({ default: '' })
  brdopen: string;

  @Prop({ default: '' })
  brdclose: string;

  @Prop({ default: '' })
  beltNo: string;

  @Prop({ default: '' })
  arrivalpax: string;

  @Prop({ default: '' })
  deppax: string;

  @Prop({ default: '' })
  transit: string;

  @Prop({ default: '' })
  CabincnfF: string;

  @Prop({ default: '' })
  CabincnfC: string;

  @Prop({ default: '' })
  CabincnfY: string;

  @Prop({ default: '' })
  wcr: string;

  @Prop({ default: '' })
  wcs: string;

  @Prop({ default: '' })
  wcc: string;

  @Prop({ default: '' })
  Departure_wcr: string;

  @Prop({ default: '' })
  Departure_wcs: string;

  @Prop({ default: '' })
  Departure_wcc: string;

  /** True when saved from Terminal Details form (not Excel/FHR seed). */
  @Prop({ default: false })
  enteredFromForm: boolean;
}

export const TerminalDetailsSchema =
  SchemaFactory.createForClass(TerminalDetails);

// Station segregation (rollout: required:false). No legacy unique index existed.
TerminalDetailsSchema.plugin(stationAwarePlugin, { required: false });
TerminalDetailsSchema.index({ stationCode: 1, serialNo: 1 });
