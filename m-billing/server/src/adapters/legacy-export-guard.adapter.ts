/**
 * Gate legacy `PATCH /raw-flight-data/navision-export/:serialNo` after BC decommission.
 *
 * In `raw-flight-data.controller.ts` (on FRIS integration):
 *
 * ```typescript
 * import { BillingDecommissionService } from '../billing/services/billing-decommission.service';
 *
 * @Patch('navision-export/:serialNo')
 * async patchNavisionExport(@CurrentStation() station, @Param('serialNo') serialNo, @Body() body) {
 *   const policy = await this.billingDecommission.getLegacyExportPolicy(station);
 *   if (!policy.data.legacyNavExportAllowed) {
 *     throw new ForbiddenException(policy.data.reason);
 *   }
 *   return this.rawFlightDataService.patchNavisionExport(serialNo, body, station);
 * }
 * ```
 *
 * Export `BillingDecommissionService` from BillingModule for this guard.
 */
export const LEGACY_EXPORT_GUARD_NOTE =
  'Call GET /billing/cutover/legacy-export-policy before allowing navision-export patches.';
