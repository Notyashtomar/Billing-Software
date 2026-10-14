/**
 * Production route manifest used for smoke coverage reporting.
 * Paths match controller prefixes in the FRIS server.
 */
export const PROTECTION_ROUTE_MANIFEST = {
  auth: [
    { method: 'POST', path: '/auth/login' },
    { method: 'POST', path: '/auth/admin-login' },
    { method: 'POST', path: '/auth/forgot-password' },
    { method: 'POST', path: '/auth/reset-password' },
    { method: 'GET', path: '/auth/session' },
  ],
  dashboard: [
    { method: 'GET', path: '/dashboard-summary' },
    { method: 'GET', path: '/dashboard-summary/latest' },
    { method: 'GET', path: '/dashboard-kpi-flights' },
  ],
  reports: [
    { method: 'GET', path: '/reports/main-report/:serialNo' },
    { method: 'GET', path: '/reports/quality-scheduled-table' },
    { method: 'GET', path: '/reports/delay-report-summary' },
  ],
  exports: [
    { method: 'GET', path: '/exports/report' },
    { method: 'GET', path: '/raw-flight-data/navision-export-errors' },
  ],
  imports: [{ method: 'POST', path: '/import/maa-march' }],
  operations: [
    { method: 'GET', path: '/main-details' },
    { method: 'GET', path: '/fhr-collection' },
    { method: 'GET', path: '/advance-invoicing/daily' },
  ],
} as const;

export type RouteManifestCategory = keyof typeof PROTECTION_ROUTE_MANIFEST;
