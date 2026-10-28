/**
 * Server mirror of client `bwms-app-page-catalog.ts` — allowlist + normalize + resolve.
 * Keep page ids in sync with the client catalog.
 */

import {
  ALL_BWMS_APP_IDS,
  resolveAppAccessForStation,
} from './bwms-app-access.util';

const PLACEHOLDER = ['access'] as const;

const BILLING_PAGE_IDS = [
  'dashboard',
  'customers',
  'kyc',
  'service-catalog',
  'contracts',
  'concessions',
  'rate-cards',
  'conversion-rates',
  'settings',
  'preparation',
  'invoice-drafts',
  'review',
  'invoices',
  'invoice-bin',
  'scheduled-flights',
  'ads',
  'equipment',
  'manpower',
  'credit-memos',
  'backing-sheets',
  'reports',
  'mis-checker',
  'audit',
  'cutover',
  'parallel-run',
  'decommission',
  'cleaning',
  'raf',
  'uld',
  'ebc',
  'oth',
  'maas',
  'xxld-scheduled',
  'xxld-non-scheduled',
  'non-scheduled',
  'prep-dashboard',
  'billed-services',
  'insights-marketing',
  'insights-payables',
  'insights-receivables',
] as const;

const TRP_PAGE_IDS = [
  'master',
  'planner',
  'fine-tuning',
  'report',
] as const;

const SAFETY_PAGE_IDS = ['cqa', 'incident'] as const;

const PAGE_IDS_BY_APP: Record<string, readonly string[]> = {
  'safety-incident': SAFETY_PAGE_IDS,
  compliance: PLACEHOLDER,
  manuals: PLACEHOLDER,
  'billing-finance': BILLING_PAGE_IDS,
  'do-money': PLACEHOLDER,
  'bill-receivables': PLACEHOLDER,
  fris: [],
  trp: TRP_PAGE_IDS,
  cms: ['roster', 'live-tracking', 'vendors', 'reports'],
  aep: PLACEHOLDER,
  ams: PLACEHOLDER,
  chr: PLACEHOLDER,
  'ba-test': PLACEHOLDER,
  uld: PLACEHOLDER,
  'hired-gse': PLACEHOLDER,
  'maas-services': PLACEHOLDER,
  'grooming-checklist': PLACEHOLDER,
  'namaskar-services': PLACEHOLDER,
  'admin-panel-people': PLACEHOLDER,
  gemm: PLACEHOLDER,
  'log-data': PLACEHOLDER,
  hr: PLACEHOLDER,
  meeting: PLACEHOLDER,
  calendar: PLACEHOLDER,
};

const ALLOWED_APPS = new Set<string>(ALL_BWMS_APP_IDS);

export function allPageIdsForApp(appId: string): string[] {
  return [...(PAGE_IDS_BY_APP[appId] ?? PLACEHOLDER)];
}

export type StationAppPageAccess = Record<string, Record<string, string[]>>;

export function normalizeStationAppPageAccess(
  input: unknown,
): StationAppPageAccess {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: StationAppPageAccess = {};
  for (const [stationId, byApp] of Object.entries(
    input as Record<string, unknown>,
  )) {
    if (!stationId.trim() || !byApp || typeof byApp !== 'object' || Array.isArray(byApp)) {
      continue;
    }
    const stationOut: Record<string, string[]> = {};
    for (const [appId, pages] of Object.entries(
      byApp as Record<string, unknown>,
    )) {
      if (!ALLOWED_APPS.has(appId) || appId === 'fris' || !Array.isArray(pages)) {
        continue;
      }
      const allowedPages = new Set(allPageIdsForApp(appId));
      stationOut[appId] = [
        ...new Set(
          pages
            .map((p) => String(p ?? '').trim())
            .filter((p) => allowedPages.has(p)),
        ),
      ];
    }
    out[stationId] = stationOut;
  }
  return out;
}

export function allPagesForStations(
  assignedStationIds: string[],
): StationAppPageAccess {
  const map: StationAppPageAccess = {};
  for (const stationId of assignedStationIds) {
    const byApp: Record<string, string[]> = {};
    for (const appId of ALL_BWMS_APP_IDS) {
      if (appId === 'fris') continue;
      const ids = allPageIdsForApp(appId);
      if (ids.length > 0) byApp[appId] = [...ids];
    }
    map[stationId] = byApp;
  }
  return map;
}

/**
 * Grandfather (2A): tile on + page key missing ⇒ all catalog pages.
 */
export function resolvePagesForApp(
  stationAppAccess: Record<string, string[]> | undefined,
  stationAppPageAccess: StationAppPageAccess | undefined,
  stationId: string | undefined,
  appId: string,
  isSuperadmin: boolean,
): string[] {
  if (appId === 'fris') return [];
  if (isSuperadmin) return allPageIdsForApp(appId);
  if (!stationId) return [];
  const enabledApps = resolveAppAccessForStation(
    stationAppAccess,
    stationId,
    isSuperadmin,
  );
  if (!enabledApps.includes(appId)) return [];
  const byApp = stationAppPageAccess?.[stationId];
  if (!byApp || !Object.prototype.hasOwnProperty.call(byApp, appId)) {
    return allPageIdsForApp(appId);
  }
  return [...(byApp[appId] ?? [])];
}

export function resolveAppPageAccessForStation(
  stationAppAccess: Record<string, string[]> | undefined,
  stationAppPageAccess: StationAppPageAccess | undefined,
  stationId: string | undefined,
  isSuperadmin: boolean,
): Record<string, string[]> {
  const apps = resolveAppAccessForStation(
    stationAppAccess,
    stationId,
    isSuperadmin,
  );
  const out: Record<string, string[]> = {};
  for (const appId of apps) {
    if (appId === 'fris') continue;
    const pages = resolvePagesForApp(
      stationAppAccess,
      stationAppPageAccess,
      stationId,
      appId,
      isSuperadmin,
    );
    if (pages.length > 0) out[appId] = pages;
  }
  return out;
}
