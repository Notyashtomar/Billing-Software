import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  MainDetails,
  MainDetailsSchema,
} from 'src/main-details/schema/main-details.schema';
import {
  TerminalDetails,
  TerminalDetailsSchema,
} from 'src/terminal-details/schema/terminal-details.schema';
import {
  LoadControlDetails,
  LoadControlDetailsSchema,
} from 'src/load-control-details/schema/load-control-details.schema';
import {
  RampDetails1,
  RampDetails1Schema,
} from 'src/ramp-details-1/schema/ramp-details-1.schema';
import {
  RampDetails2,
  RampDetails2Schema,
} from 'src/ramp-details-2/schema/ramp-details-2.schema';
import {
  RampDetails3,
  RampDetails3Schema,
} from 'src/ramp-details-3/schema/ramp-details-3.schema';
import { Remarks, RemarksSchema } from 'src/remarks/schema/remarks.schema';
import {
  EquipmentManpower,
  EquipmentManpowerSchema,
} from 'src/equipment-manpower/schema/equipment-manpower.schema';
import {
  Attachments,
  AttachmentsSchema,
} from 'src/attachments/schema/attachments.schema';
import { Report, ReportSchema } from 'src/reports/schema/reports.schema';
import {
  FhrEquipmentDetailItem,
  FhrEquipmentDetailItemSchema,
} from 'src/fhr-collection/schema/fhr-equipment-detail-item.schema';
import {
  FHR_STATUSES,
  FhrSignatures,
  FhrSignaturesSchema,
  type FhrStatus,
} from 'src/fhr-collection/schema/fhr-signatures.schema';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type NsFhrCollectionDocument = NsFhrCollection & Document;

/**
 * Non-scheduled FHR aggregate — one doc per NS flight instance.
 * Collection: `ns_fhr_collection` (never write NS flights into `fhr_collection`).
 */
@Schema({ timestamps: true, collection: 'ns_fhr_collection' })
export class NsFhrCollection {
  stationCode: string;

  @Prop({ required: true, unique: true, index: true })
  SerialNo: number;

  @Prop()
  flightSerialNumber: number;

  @Prop()
  lastSnapshotAt: Date;

  @Prop({ default: '' })
  lastSnapshotReason: string;

  @Prop({ type: MainDetailsSchema, default: null })
  mainDetails: MainDetails | null;

  @Prop({ type: TerminalDetailsSchema, default: null })
  terminalDetails: TerminalDetails | null;

  @Prop({ type: LoadControlDetailsSchema, default: null })
  loadControlDetails: LoadControlDetails | null;

  @Prop({ type: RampDetails1Schema, default: null })
  rampDetails1: RampDetails1 | null;

  @Prop({ type: [RampDetails2Schema], default: [] })
  rampDetails2: RampDetails2[];

  @Prop({ type: RampDetails3Schema, default: null })
  rampDetails3: RampDetails3 | null;

  @Prop({ type: RemarksSchema, default: null })
  remarks: Remarks | null;

  @Prop({ type: EquipmentManpowerSchema, default: null })
  equipmentManpower: EquipmentManpower | null;

  @Prop({ type: [FhrEquipmentDetailItemSchema], default: [] })
  equipmentDetails: FhrEquipmentDetailItem[];

  @Prop({ type: AttachmentsSchema, default: null })
  attachments: Attachments | null;

  @Prop({ type: [ReportSchema], default: [] })
  reports: Report[];

  /** RAF cleaning service entries (`deep` / `nightHalt` / `exterior`). */
  @Prop({ type: Object, default: null })
  rafCleaningServices: Record<string, unknown> | null;

  /** RAF Main Details ad-hoc equipment / services payload. */
  @Prop({ type: Object, default: null })
  rafAdhocDetails: Record<string, unknown> | null;

  @Prop({ type: [String], default: [] })
  staDates: string[];

  /** Flat NAV export flag for Non-Scheduled Airlines table (`Yes` / `No`). */
  @Prop({ default: 'No' })
  exportedNAV: string;

  @Prop({ type: FhrSignaturesSchema, default: () => ({}) })
  signatures: FhrSignatures;

  @Prop({ type: String, enum: FHR_STATUSES, default: 'DRAFT', index: true })
  status: FhrStatus;

  @Prop({ type: Date, default: null })
  finalizedAt: Date | null;

  @Prop({ default: '' })
  finalizedByUserId: string;
}

export const NsFhrCollectionSchema =
  SchemaFactory.createForClass(NsFhrCollection);

NsFhrCollectionSchema.index({ staDates: 1, SerialNo: 1 });
stationAwarePlugin(NsFhrCollectionSchema, { required: false });
NsFhrCollectionSchema.index({ stationCode: 1, staDates: 1, SerialNo: 1 });
NsFhrCollectionSchema.index({ stationCode: 1, SerialNo: 1 });
