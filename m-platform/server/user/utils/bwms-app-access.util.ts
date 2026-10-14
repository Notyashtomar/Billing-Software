/**
 * Canonical BWMS login-tile ids (mirror client `bwms-app-tools.ts`).
 * When adding a new login tile / module, append its id here AND to client
 * `BWMS_APP_TOOLS`. Universal superadmin (`supadm123`) and role=superadmin
 * always receive the full list via `resolveAppAccessForStation`.
 */
export const ALL_BWMS_APP_IDS = [
  'safety-incident',
  'compliance',
  'manuals',
  'billing-finance',
  'do-money',
  'bill-receivables',
  'fris',
  'trp',
  'cms',
  'aep',
  'ams',
  'chr',
  'ba-test',
  'uld',
  'hired-gse',
  'maas-services',
  'grooming-checklist',
  'namaskar-services',
  'admin-panel-people',
  'gemm',
  'log-data',
  'hr',
  'meeting',
  'calendar',
] as const;

export type BwmsAppId = (typeof ALL_BWMS_APP_IDS)[number];

const ALLOWED = new Set<string>(ALL_BWMS_APP_IDS);

export function normalizeStationAppAccess(
  input: unknown,
): Record<string, string[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string[]> = {};
  for (const [stationId, apps] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (!stationId.trim() || !Array.isArray(apps)) continue;
    out[stationId] = [
      ...new Set(
        apps
          .map((a) => String(a ?? '').trim())
          .filter((a) => ALLOWED.has(a)),
      ),
    ];
  }
  return out;
}

export function allAppsForStations(
  assignedStationIds: string[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const id of assignedStationIds) {
    map[id] = [...ALL_BWMS_APP_IDS];
  }
  return map;
}

export function resolveAppAccessForStation(
  stationAppAccess: Record<string, string[]> | undefined,
  stationId: string | undefined,
  isSuperadmin: boolean,
): string[] {
  if (isSuperadmin) return [...ALL_BWMS_APP_IDS];
  if (!stationId) return [];
  if (!stationAppAccess || Object.keys(stationAppAccess).length === 0) {
    // Legacy accounts with no BWMS-tools grants keep currently live tiles.
    // Billing (`billing-finance`) is grant-only from admin BWMS tools.
    return ['fris', 'trp', 'admin-panel-people'];
  }
  const exact = stationAppAccess[stationId];
  if (exact && exact.length > 0) return exact;
  const matchKey = Object.keys(stationAppAccess).find(
    (k) => k.toLowerCase() === stationId.toLowerCase(),
  );
  if (matchKey && stationAppAccess[matchKey]?.length) {
    return stationAppAccess[matchKey]!;
  }
  const firstWithApps = Object.values(stationAppAccess).find(
    (apps) => Array.isArray(apps) && apps.length > 0,
  );
  if (firstWithApps && firstWithApps.length > 0) {
    return firstWithApps;
  }
  return ['fris', 'trp', 'admin-panel-people'];
}
