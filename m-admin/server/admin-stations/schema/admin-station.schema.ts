import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminStationDocument = AdminStation & Document;

@Schema({ _id: false })
export class StationNavigationPermissions {
  @Prop({ type: [String], default: [] })
  accessTabs: string[];

  @Prop({ type: Object, default: {} })
  accessSubPages: Record<string, string[]>;
}

export const StationNavigationPermissionsSchema =
  SchemaFactory.createForClass(StationNavigationPermissions);

@Schema({ timestamps: true, collection: 'admin-stations' })
export class AdminStation {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  code: string;

  /**
   * Canonical clean IATA station code (e.g. `DEL`, `IXC`, `MAA`) used as the
   * `stationCode` data-segregation key across all station-owned collections.
   * Distinct from `code`, which is the suffixed registry label (e.g. `DEL-01`).
   */
  @Prop({ trim: true, uppercase: true, index: true })
  stationCode?: string;

  @Prop({ required: true, trim: true })
  company: string;

  @Prop({ required: true })
  region: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ trim: true })
  state?: string;

  /** Registered / billing street address (may differ from ops airport site). */
  @Prop({ trim: true })
  street?: string;

  /** Registered / billing city from legal address (e.g. New Delhi HQ). */
  @Prop({ trim: true })
  addressCity?: string;

  @Prop({ trim: true, default: 'India' })
  country?: string;

  @Prop({ trim: true })
  pincode?: string;

  /** Station GSTIN for invoices / compliance. */
  @Prop({ trim: true, uppercase: true })
  gstNumber?: string;

  @Prop({ default: '' })
  zone: string;

  @Prop({ type: [String], default: [] })
  terminals?: string[];

  @Prop({ default: '' })
  photoUrl?: string;

  @Prop({ type: Number, default: 0 })
  departmentCount?: number;

  @Prop({ default: 'Airport' })
  type: string;

  @Prop({ required: true })
  manager: string;

  @Prop({ type: Number, default: 0 })
  capacity: number;

  @Prop({ default: 'Active' })
  status: string;

  @Prop({ default: '' })
  notes?: string;

  @Prop({ type: StationNavigationPermissionsSchema, default: {} })
  permissions?: StationNavigationPermissions;

  @Prop({ type: Number, default: 0 })
  dailyOps: number;

  @Prop({ type: Number, default: 0 })
  activeStaff: number;

  @Prop({ type: Number, default: 0 })
  efficiencyPct: number;

  @Prop({ type: Number, default: 0 })
  delayedOps: number;

  @Prop({ type: [Number], default: [] })
  weeklyPerf: number[];

  @Prop({ type: [Number], default: [] })
  throughputMonth: number[];

  @Prop({ default: '' })
  insight: string;
}

export const AdminStationSchema = SchemaFactory.createForClass(AdminStation);
