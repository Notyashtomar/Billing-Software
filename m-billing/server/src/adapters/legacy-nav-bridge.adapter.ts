/**
 * Wire on FRIS integration so FRIS-posted invoices update legacy exportedNAV.
 *
 * ```typescript
 * import { RawFlightDataService } from '../raw-flight-data/raw-flight-data.service';
 * import { LEGACY_NAV_BRIDGE_TOKEN } from './adapters/legacy-nav-bridge.adapter';
 *
 * {
 *   provide: LEGACY_NAV_BRIDGE_TOKEN,
 *   useFactory: (rawFlightData: RawFlightDataService) => ({
 *     markSerialExportedNav: async (serialNo, stationCode) => {
 *       await rawFlightData.patchNavisionExport(serialNo, { exportedNAV: 'Yes' }, stationCode);
 *     },
 *   }),
 *   inject: [RawFlightDataService],
 * }
 * ```
 *
 * During `parallel` phase the bridge is skipped — BC remains official poster.
 */
export const LEGACY_NAV_BRIDGE_TOKEN = 'BillingLegacyNavBridge';

export interface LegacyNavBridgePort {
  markSerialExportedNav(serialNo: string, stationCode: string): Promise<void>;
}
