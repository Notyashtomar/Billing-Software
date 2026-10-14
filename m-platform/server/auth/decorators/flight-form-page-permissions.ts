import type { FrisPagePermissionMeta } from './fris-page-permission.decorator';

/**
 * Shared Open-form / ns-raw-flight-data access: Scheduled and Non-Scheduled
 * Airlines both persist through the same controllers. Users with either page
 * flag must be able to load and save without 403.
 */
export const FLIGHT_FORM_PAGE_PERMISSIONS: FrisPagePermissionMeta[] = [
  { tab: 'flights', pageLabel: 'Scheduled Airlines' },
  { tab: 'flights', pageLabel: 'Non-Scheduled Airlines' },
];

/**
 * Main Details GH Rep dropdown: flight-form users may list station GH reps
 * without Advance → GH Representative. Create/edit master stays Advance-only.
 */
export const GH_REP_LOOKUP_PAGE_PERMISSIONS: FrisPagePermissionMeta[] = [
  ...FLIGHT_FORM_PAGE_PERMISSIONS,
  { tab: 'advance', pageLabel: 'GH Representative' },
];
