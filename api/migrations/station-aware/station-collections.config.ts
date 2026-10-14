/**
 * Registry of station-owned collections for the multi-station rollout.
 *
 * Each entry drives the reversible migration scripts:
 *  - `backfill-station-code.ts` stamps `stationCode = LEGACY_STATION_CODE` on
 *    documents that do not yet have one.
 *  - `swap-station-indexes.ts` drops the legacy (global) unique indexes and
 *    builds the station-scoped compound ones.
 *
 * Add a collection here at the same time its schema is converted to use the
 * `stationAwarePlugin`. `status` documents which collections are live so the
 * migration only touches converted collections.
 */

export interface LegacyIndexSwap {
  /** Existing index name to drop (e.g. `serialNo_1`). Verified before dropping. */
  drop: string;
  /** Replacement compound index keys (already declared in the schema). */
  createKeys: Record<string, 1 | -1>;
  /** Whether the replacement index is unique. */
  unique?: boolean;
}

export interface StationCollectionConfig {
  /** The MongoDB collection name. */
  collection: string;
  /** The field that stores the station code (defaults to `stationCode`). */
  field?: string;
  /** Whether the schema has been converted and is safe to migrate. */
  status: 'live' | 'pending';
  /** Legacy unique indexes that must become station-scoped. */
  indexSwaps?: LegacyIndexSwap[];
}

export const STATION_COLLECTIONS: StationCollectionConfig[] = [
  {
    collection: 'manifest',
    status: 'live',
    indexSwaps: [
      {
        drop: 'serialNo_1',
        createKeys: { stationCode: 1, serialNo: 1 },
        unique: true,
      },
    ],
  },

  // ---- Remaining approved station-owned collections (convert + flip to 'live')
  // Flight/ops core
  { collection: 'fhr_collection', status: 'live' },
  {
    collection: 'mainDetails',
    status: 'live',
    indexSwaps: [
      {
        drop: 'SerialNo_1',
        createKeys: { stationCode: 1, SerialNo: 1 },
        unique: true,
      },
    ],
  },
  { collection: 'rampDetails1', status: 'live' },
  { collection: 'rampDetails2', status: 'live' },
  { collection: 'rampDetails3', status: 'live' },
  { collection: 'loadControlDetails', status: 'live' },
  { collection: 'equipmentDetails', status: 'live' },
  { collection: 'equipmentManpower', status: 'live' },
  { collection: 'remarks', status: 'live' },
  { collection: 'terminalDetails', status: 'live' },
  { collection: 'attachments', status: 'live' },
  { collection: 'psr-flight-details', status: 'pending' },
  { collection: 'psr-employee-sections', status: 'pending' },
  { collection: 'psr-sick-leave', status: 'pending' },
  { collection: 'psr-duty-allocation', status: 'pending' },
  { collection: 'shipped-bags', status: 'pending' },
  { collection: 'performance_flights_snapshots', status: 'pending' },
  // Flight lifecycle / creation
  { collection: 'raw_flight_data', status: 'live' },
  { collection: 'advance_schedule_setup', status: 'live' },
  { collection: 'scheduled_airlines_creation', status: 'live' },
  { collection: 'creation-raf', status: 'pending' },
  { collection: 'raf_collection', status: 'live' },
  { collection: 'creation-additional-flights', status: 'pending' },
  // Global serial-mapping collections — intentionally NOT station-scoped
  // (shared global serial pool, Strategy A). Never backfill stationCode here.
  { collection: 'flight_instance_index', status: 'pending' },
  { collection: 'flight_instance_state', status: 'live' },
  { collection: 'flight_cancellations', status: 'live' },
  { collection: 'flight_serial_counter', status: 'pending' },
  // Reports / dashboard
  { collection: 'reports', status: 'pending' },
  { collection: 'delay_reports', status: 'pending' },
  { collection: 'reports-ramp-shift-report', status: 'pending' },
  { collection: 'reports-pax-shift-report', status: 'pending' },
  // Materialized dashboard collections: backfill stationCode here, but index
  // swaps are handled at boot by DashboardSummaryIndexMigrationService
  // (syncIndexes drops the legacy global-unique index and builds the schema's
  // station-scoped `uniq_station_*` compound by name) — so no indexSwaps entry.
  { collection: 'dashboard_summaries', status: 'live' },
  { collection: 'dashboard_daily_aggregates', status: 'live' },
  { collection: 'dashboard_drilldowns', status: 'live' },
  { collection: 'dashboard_data', status: 'live' },
  { collection: 'dashboard_kpi_flights', status: 'live' },
  // Station-scoped masters / HR (Advance tab — converted, visibility-isolated).
  // Note: name/code unique indexes on these masters intentionally remain GLOBAL
  // for now (no indexSwaps) — visibility is scoped, but a code can't yet be
  // duplicated across stations. advance-cargo is the exception: its `entryKey`
  // must be unique per-station (singleton catalogs), so it swaps to a compound.
  {
    collection: 'advance-airline',
    status: 'live',
    indexSwaps: [
      { drop: 'name_1', createKeys: { stationCode: 1, name: 1 }, unique: true },
      { drop: 'code_1', createKeys: { stationCode: 1, code: 1 }, unique: true },
    ],
  },
  {
    collection: 'advance-aircraft',
    status: 'live',
    // Global shared catalog — one aircraft type for all stations (not per-station).
  },
  { collection: 'advance-aircraft-registration', status: 'live' },
  {
    collection: 'advance-cargo',
    status: 'live',
    indexSwaps: [
      {
        drop: 'entryKey_1',
        createKeys: { stationCode: 1, entryKey: 1 },
        unique: true,
      },
    ],
  },
  { collection: 'advance-contact', status: 'live' },
  { collection: 'ns-advance-contact', status: 'live' },
  { collection: 'ns-advance-ghrep', status: 'live' },
  { collection: 'advance-dcs-master', status: 'live' },
  { collection: 'advance-equipment', status: 'live' },
  { collection: 'advance-ghrep', status: 'live' },
  { collection: 'advance-manpower', status: 'live' },
  { collection: 'advance-other-services', status: 'live' },
  { collection: 'advance-raf-airline', status: 'live' },
  {
    collection: 'advance-staff',
    status: 'live',
    indexSwaps: [
      {
        drop: 'employeeCode_1',
        createKeys: { stationCode: 1, employeeCode: 1 },
        unique: true,
      },
    ],
  },
  { collection: 'advance-terminal', status: 'live' },
  { collection: 'advance-airline-logo', status: 'live' },
  { collection: 'advance-ams-services', status: 'live' },
  { collection: 'advance_gateway_scheduled_airline', status: 'live' },
  { collection: 'ns-advance-non-scheduled-airline', status: 'live' },
  {
    collection: 'ns-non-scheduled-booking',
    status: 'live',
    indexSwaps: [
      {
        drop: 'bookingNo_1',
        createKeys: { stationCode: 1, bookingNo: 1 },
        unique: true,
      },
    ],
  },
  { collection: 'training-matrix', status: 'pending' },
  { collection: 'operation_employees', status: 'pending' },
  { collection: 'representative_signatures', field: 'station', status: 'pending' },
  { collection: 'incidents', field: 'station', status: 'pending' },
  { collection: 'support_tickets', status: 'pending' },
  { collection: 'import_history', status: 'pending' },
  { collection: 'user_notification_center', status: 'pending' },
];
