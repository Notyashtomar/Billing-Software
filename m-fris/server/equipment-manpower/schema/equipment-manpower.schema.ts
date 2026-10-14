import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  EquipmentManpowerCatalogItem,
  EquipmentManpowerCatalogItemSchema,
} from './equipment-manpower-catalog-item.schema';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

/** Reserved `serialNo` for the single master-catalog document (not a flight). */
export const EQUIPMENT_MANPOWER_CATALOG_SERIAL = 900_000_001;

export type EquipmentManpowerDocument = EquipmentManpower & Document;

@Schema({ _id: false })
export class EquipmentManpowerEntry {
  /**
   * Legacy encoded label (`EQ:`/`MP:` prefixed, `|`-separated). Kept for backward
   * compatibility with old documents and NAV/Excel exporters. New writes also populate
   * the structured fields below, which are the source of truth.
   */
  @Prop({ default: '' })
  name: string;

  /** `equipment` | `manpower` — discriminates the entry type. */
  @Prop({ default: '' })
  entryType: string;

  // Equipment-specific fields.
  @Prop({ default: '' })
  equipmentName: string;

  @Prop({ default: '' })
  equipmentSerialNo: string;

  // Shared / manpower fields.
  @Prop({ default: '' })
  employeeName: string;

  @Prop({ default: '' })
  employeeId: string;

  @Prop({ default: '' })
  designation: string;

  /** Manpower placement: `terminal` | `ramp`. */
  @Prop({ default: '' })
  place: string;

  @Prop({ default: '' })
  fromDate: string;

  @Prop({ default: '' })
  fromTime: string;

  @Prop({ default: '' })
  toDate: string;

  @Prop({ default: '' })
  toTime: string;

  @Prop({ default: '' })
  remarks: string;

  @Prop({ default: 'N' })
  exportedInNav: string;
}
const EquipmentManpowerEntrySchema = SchemaFactory.createForClass(
  EquipmentManpowerEntry,
);

@Schema({ timestamps: true, collection: 'equipmentManpower' })
export class EquipmentManpower {
  @Prop({ required: true })
  serialNo: number;

  @Prop({ default: '' })
  airlinesOperator: string;

  @Prop({ default: '' })
  flightNo: string;

  @Prop({ default: '' })
  routing: string;

  @Prop({ default: '' })
  operations: string;

  @Prop({ default: '' })
  acType: string;

  @Prop({ default: '' })
  sta: string;

  @Prop({ default: '' })
  staDate: string;

  @Prop({ default: '' })
  std: string;

  @Prop({ default: '' })
  stdDate: string;

  @Prop({ default: '' })
  atdDate: string;

  /** Select List: Equipment | Manpower | Other Services */
  @Prop({ default: 'Equipment' })
  listType: string;

  /**
   * When true, this document is the shared master list (`catalogItems`), not a flight form.
   * Stored in the same collection per product convention; uses `EQUIPMENT_MANPOWER_CATALOG_SERIAL`.
   */
  @Prop({ default: false })
  isEquipmentManpowerCatalog: boolean;

  @Prop({ type: [EquipmentManpowerCatalogItemSchema], default: [] })
  catalogItems: EquipmentManpowerCatalogItem[];

  @Prop({ type: [EquipmentManpowerEntrySchema], default: [] })
  entries: EquipmentManpowerEntry[];

  @Prop({ default: '' })
  verifiedBy: string;

  @Prop({ default: '' })
  verifiedByCode: string;

  @Prop({ default: '' })
  verifiedAt: string;

  /**
   * Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA.
   * The master-catalog singleton is per-station (one catalog doc per station).
   */
  stationCode: string;
}

export const EquipmentManpowerSchema =
  SchemaFactory.createForClass(EquipmentManpower);

EquipmentManpowerSchema.plugin(stationAwarePlugin, { required: false });
