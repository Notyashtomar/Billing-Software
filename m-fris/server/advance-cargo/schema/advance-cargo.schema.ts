import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { stationAwarePlugin } from '../../common/station/station-aware.plugin';

export type AdvanceCargoDocument = AdvanceCargo & Document;

/** Singleton document key for the global cargo services catalog. */
export const ADVANCE_CARGO_SERVICES_ENTRY_KEY = 'services';

/** Singleton document key for the global cargo unit master catalog. */
export const ADVANCE_CARGO_UNIT_MASTER_ENTRY_KEY = 'unitMaster';

export const ADVANCE_CARGO_SECTIONS = [
  'cargoAirline',
  'cargoScheduled',
  'flightCreation',
] as const;

export type AdvanceCargoSection = (typeof ADVANCE_CARGO_SECTIONS)[number];

export type AdvanceCargoFlightRow = {
  serialNo: string;
  cargoScheduled?: Record<string, unknown>;
  flightCreation?: Record<string, unknown>;
  createdAt?: Date;
};

export type AdvanceCargoServiceItem = {
  id: string;
  serviceName: string;
  serviceCode: string;
  unitType: string;
  quantityNecessary: string;
  savedAt: string;
};

export type AdvanceCargoUnitMasterItem = {
  id: string;
  unitName: string;
  unitCode: string;
  unitFormat: string;
  savedAt: string;
};

export type AdvanceCargoSections = {
  cargoAirline?: Record<string, unknown>;
  cargoScheduled?: Record<string, unknown>;
  flightCreation?: Record<string, unknown>;
};

/**
 * Advance → Cargo.
 * - Per-airline docs: `entryKey` = airline code, `sections` + `flights`.
 * - Global services catalog: `entryKey: "services"`, top-level `services[]`.
 * - Global unit master catalog: `entryKey: "unitMaster"`, top-level `unitMaster[]`.
 */
@Schema({ timestamps: true, collection: 'advance-cargo' })
export class AdvanceCargo {
  // entryKey is unique *per station* (compound index below) so every station
  // owns its own airline cargo entries and its own services/unitMaster catalogs.
  // No standalone index here — the { stationCode, entryKey } compound covers
  // station-scoped lookups; a plain `entryKey_1` would just be redundant churn.
  @Prop({ required: true })
  entryKey: string;

  @Prop({ type: Object, default: {} })
  sections: AdvanceCargoSections;

  @Prop({ type: Array, default: [] })
  flights: AdvanceCargoFlightRow[];

  /** Per-station services catalog (used on the singleton `entryKey: services` document). */
  @Prop({ type: Array, default: [] })
  services: AdvanceCargoServiceItem[];

  /** Per-station unit master catalog (used on the singleton `entryKey: unitMaster` document). */
  @Prop({ type: Array, default: [] })
  unitMaster: AdvanceCargoUnitMasterItem[];

  /** Owning station (added by {@link stationAwarePlugin}); legacy rows = MAA. */
  stationCode: string;
}

export const AdvanceCargoSchema = SchemaFactory.createForClass(AdvanceCargo);

AdvanceCargoSchema.plugin(stationAwarePlugin, { required: false });

// entryKey is unique within a station, not globally (replaces the old global
// `entryKey` unique index — see station-collections.config indexSwaps).
AdvanceCargoSchema.index({ stationCode: 1, entryKey: 1 }, { unique: true });
