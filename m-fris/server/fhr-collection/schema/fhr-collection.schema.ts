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
} from './fhr-equipment-detail-item.schema';
import {
  FHR_STATUSES,
  FhrSignatures,
  FhrSignaturesSchema,
  type FhrStatus,
} from './fhr-signatures.schema';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type FhrCollectionDocument = FhrCollection & Document;

/**
 * One document per scheduled-airlines flight instance, aggregating all “Open” sidebar forms.
 * Every nested path mirrors the source form / collection schema (all fields defined there).
 * Collection name: `fhr_collection`.
 */
@Schema({ timestamps: true, collection: 'fhr_collection' })
export class FhrCollection {
  /**
   * Owning station (multi-station isolation boundary). Stamped on insert only and
   * never used for serial generation — `SerialNo` remains a single global pool.
   * Added by `stationAwarePlugin`; declared here for typing.
   */
  stationCode: string;

  /** Global instance serial (`SerialNo` / table Sl.No.). */
  @Prop({ required: true, unique: true, index: true })
  SerialNo: number;

  /**
   * Same value as `SerialNo`, kept in sync for APIs / indexes that use `flightSerialNumber`.
   * (Atlas may enforce a unique index on this field; missing/null would collide.)
   */
  @Prop()
  flightSerialNumber: number;

  @Prop()
  lastSnapshotAt: Date;

  @Prop({ default: '' })
  lastSnapshotReason: string;

  @Prop()
  scheduleId: string;

  /** `mainDetails` / `MainDetails` */
  @Prop({ type: MainDetailsSchema, default: null })
  mainDetails: MainDetails | null;

  /** `terminalDetails` / `TerminalDetails` */
  @Prop({ type: TerminalDetailsSchema, default: null })
  terminalDetails: TerminalDetails | null;

  /** `loadControlDetails` / `LoadControlDetails` */
  @Prop({ type: LoadControlDetailsSchema, default: null })
  loadControlDetails: LoadControlDetails | null;

  /** `rampDetails1` / `RampDetails1` */
  @Prop({ type: RampDetails1Schema, default: null })
  rampDetails1: RampDetails1 | null;

  /** `rampDetails2` / `RampDetails2` (array — multiple source documents per flight). */
  @Prop({ type: [RampDetails2Schema], default: [] })
  rampDetails2: RampDetails2[];

  /** `rampDetails3` / `RampDetails3` */
  @Prop({ type: RampDetails3Schema, default: null })
  rampDetails3: RampDetails3 | null;

  /** `remarks` / `Remarks` */
  @Prop({ type: RemarksSchema, default: null })
  remarks: Remarks | null;

  /** `equipmentManpower` / `EquipmentManpower` */
  @Prop({ type: EquipmentManpowerSchema, default: null })
  equipmentManpower: EquipmentManpower | null;

  /** GSE / equipment lines for the equipment report (keyed by same `SerialNo` as the flight). */
  @Prop({ type: [FhrEquipmentDetailItemSchema], default: [] })
  equipmentDetails: FhrEquipmentDetailItem[];

  /** `attachments` / `Attachments` (includes nested `reports` Report 1…6 per that schema). */
  @Prop({ type: AttachmentsSchema, default: null })
  attachments: Attachments | null;

  /** `reports` / `Report` */
  @Prop({ type: [ReportSchema], default: [] })
  reports: Report[];

  /**
   * RAF (Ramp Assistance) cleaning service entries keyed by kind
   * (`deep` / `nightHalt` / `exterior`). Written from RAF Open → Cleaning Services.
   */
  @Prop({ type: Object, default: null })
  rafCleaningServices: Record<string, unknown> | null;

  /**
   * RAF Main Details — Equipment Detail / Ad-Hoc Equipment form
   * (header fields, list type, verification, services table).
   */
  @Prop({ type: Object, default: null })
  rafAdhocDetails: Record<string, unknown> | null;

  /**
   * Quality Report FB / LB / Hold snapshot (written by PATCH /reports/quality-update).
   */
  @Prop({ type: Object, default: null })
  qualityKpis: {
    firstBagOnTime?: boolean;
    lastBagOnTime?: boolean;
    holdClosedOnTime?: boolean;
    cancelled?: boolean;
    computedAt?: string;
  } | null;

  /**
   * Normalized STA calendar dates (dd/MM/yyyy) from terminal/ramp embeds — indexed for fast range queries.
   * Backfilled via `scripts/backfill-staDates.ts`; legacy docs without this field still match via nested `$or`.
   * Compound index `{ staDates: 1, SerialNo: 1 }` is declared below (prefix supports `$in` on staDates alone).
   */
  @Prop({ type: [String], default: [] })
  staDates: string[];

  /** When FHR + GSE + Team reports were emailed to the GH representative (opt-in + all locks). */
  @Prop()
  ghRepLockedReportsEmailSentAt?: Date;

  @Prop({ default: '' })
  ghRepLockedReportsEmailTo?: string;

  /** When FHR report was emailed to the airline (opt-in + all locks). */
  @Prop()
  airlineFhrEmailSentAt?: Date;

  @Prop({ default: '' })
  airlineFhrEmailTo?: string;

  /** Opt-in from Main Details — email FHR to airline when all locks complete. */
  @Prop({ default: false })
  shareFhrToAirline: boolean;

  /** Opt-in from Main Details — email FHR/GSE/Team bundle to GH rep when all locks complete. */
  @Prop({ default: false })
  shareReportsToGhRep: boolean;

  /** Digital representative signatures captured in Main Details (GH + Airline). */
  @Prop({ type: FhrSignaturesSchema, default: () => ({}) })
  signatures: FhrSignatures;

  /** FHR lifecycle status. `FINALIZED` once both signatures exist and the user submits. */
  @Prop({ type: String, enum: FHR_STATUSES, default: 'DRAFT', index: true })
  status: FhrStatus;

  /** When the FHR was digitally signed / finalized. */
  @Prop({ type: Date, default: null })
  finalizedAt: Date | null;

  @Prop({ default: '' })
  finalizedByUserId: string;

  /**
   * Residual columns from a scheduled-flight workbook that have no operational
   * embed field (export audit, wheelchair totals, send-status flags).
   */
  @Prop({ type: Object, default: null })
  workbookExtras: Record<string, string> | null;
}

export const FhrCollectionSchema = SchemaFactory.createForClass(FhrCollection);

/*
 * Atlas — compound index for scheduled-merge queries (staDates filter + stable serial):
 *
 * db.fhr_collection.createIndex({ staDates: 1, SerialNo: 1 })
 *
 * If migrating from a prior single-field `{ staDates: 1 }` index, drop the old name after verifying:
 * db.fhr_collection.dropIndex("staDates_1")   // exact name from db.fhr_collection.getIndexes()
 *
 * Never keep unique indexes on nested embeds. A leftover `mainDetails.SerialNo_1`
 * (or `mainDetails.flightSerialNumber_1`) makes FHR create fail with E11000 when
 * main details is missing — form saves then succeed but Scheduled Airlines locks stay unlocked.
 * `FhrCollectionService` drops those names on startup if they reappear.
 */
FhrCollectionSchema.index({ staDates: 1, SerialNo: 1 });

/*
 * Multi-station: add top-level `stationCode` (immutable, indexed). `required: false`
 * keeps legacy/un-backfilled MAA documents valid and `.save()`-able until manual backfill.
 * `SerialNo` stays GLOBALLY unique (shared serial pool — Strategy A); no index swap.
 */
stationAwarePlugin(FhrCollectionSchema, { required: false });

/** Additive: station-scoped scheduled-merge/window scans. */
FhrCollectionSchema.index({ stationCode: 1, staDates: 1, SerialNo: 1 });
