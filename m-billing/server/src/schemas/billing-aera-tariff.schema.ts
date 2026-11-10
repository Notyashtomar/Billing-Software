import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { BillingDocType } from './billing-collection.constants';

export type BillingAeraTariffDocument = BillingAeraTariff & Document;

export const AERA_FLIGHT_CLASSES = [
  'DomesticPassenger',
  'InternationalPassenger',
  'DomesticCargo',
  'InternationalCargo',
] as const;
export type AeraFlightClass = (typeof AERA_FLIGHT_CLASSES)[number];

/** One scheduled-flight row of Annexure I: aircraft code × Pax/Ramp/Full, one value per FY. */
export type AeraScheduledRow = {
  flightClass: AeraFlightClass;
  /** ICAO aerodrome reference code B–F. */
  aircraftCode: string;
  /** Aligned with `financialYears`; null where the order prints N/A. */
  pax: Array<number | null> | null;
  ramp: Array<number | null> | null;
  full: Array<number | null> | null;
  notApplicable?: boolean;
};

/** One MTOW band of Annexure II (international non-scheduled & GA). */
export type AeraMtowRow = {
  mtowFromKg: number;
  /** null = open ended ("and above"). */
  mtowToKg: number | null;
  rates: Array<number | null>;
};

/** One item-wise row of Annexure III/IV (additional services), Dom / Intl per FY. */
export type AeraItemRow = {
  itemCode: string;
  description: string;
  uom: string;
  domestic: Array<number | null> | null;
  international: Array<number | null> | null;
  verified?: boolean;
};

/**
 * AERA tariff order for a ground handler at one major airport.
 * Every figure is a *maximum* (ceiling) rate in INR, exclusive of GST.
 */
@Schema()
export class BillingAeraTariff {
  @Prop({ required: true, trim: true, uppercase: true })
  stationCode: string;

  @Prop({ required: true, trim: true })
  orderNumber: string;

  @Prop()
  orderDate?: Date;

  @Prop({ trim: true })
  isp?: string;

  @Prop({ trim: true })
  airport?: string;

  @Prop({ trim: true })
  airportOperator?: string;

  @Prop({ trim: true })
  controlPeriodLabel?: string;

  @Prop({ required: true })
  controlPeriodFrom: Date;

  @Prop({ required: true })
  controlPeriodTo: Date;

  /** Date the card applies from (can be inside the control period). */
  @Prop({ required: true })
  effectiveFrom: Date;

  @Prop({ default: 'INR', trim: true, uppercase: true })
  currency: string;

  /** e.g. ["2023-24", "2024-25", ...]; every rate array is aligned with this. */
  @Prop({ type: [String], required: true })
  financialYears: string[];

  /** Column that carries the cargo ceiling in the printed order ("ramp" or "full"). */
  @Prop({ enum: ['ramp', 'full'], default: 'ramp' })
  cargoRateColumn: 'ramp' | 'full';

  @Prop({ type: Array, default: [] })
  scheduled: AeraScheduledRow[];

  @Prop({ type: Array, default: [] })
  internationalNonScheduled: AeraMtowRow[];

  @Prop({ type: Array, default: [] })
  itemWise: AeraItemRow[];

  @Prop({ type: [String], default: [] })
  rules: string[];

  @Prop({ type: [String], default: [] })
  anomalies: string[];

  @Prop({ trim: true })
  verification?: string;

  @Prop({ type: Object })
  sourcePages?: Record<string, unknown>;

  @Prop({ trim: true })
  sourceFile?: string;

  @Prop({ default: true })
  active: boolean;
}

export const BillingAeraTariffSchema = SchemaFactory.createForClass(BillingAeraTariff);
BillingAeraTariffSchema.index(
  { stationCode: 1, orderNumber: 1 },
  { unique: true, partialFilterExpression: { docType: BillingDocType.AeraTariff } },
);
BillingAeraTariffSchema.index(
  { stationCode: 1, active: 1, effectiveFrom: -1 },
  { partialFilterExpression: { docType: BillingDocType.AeraTariff } },
);
