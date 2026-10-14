/**
 * Per-BWMS-tool page catalogs for admin grants + runtime nav/route checks.
 * FRIS pages stay in stationPermissions — catalog entry is empty.
 * Placeholder tools use a synthetic `access` page until real routes ship.
 */

import {
  ALL_BWMS_APP_IDS,
  appsForStation,
  isBwmsAppEnabled,
  readStoredAppAccess,
  resolveClientAppAccess,
  toggleBwmsApp,
  type StationAppAccessFormState,
} from '@/lib/bwms-app-tools';
import { isUniversalSuperadminSession } from '@/lib/universal-superadmin';

export type BwmsAppPageDef = {
  id: string;
  label: string;
  /** Route prefix / exact path when the module ships. */
  href?: string;
};

const PLACEHOLDER_ACCESS: BwmsAppPageDef[] = [
  { id: 'access', label: 'Full module access' },
];

const BILLING_PAGES: BwmsAppPageDef[] = [
  { id: 'dashboard', label: 'Master dashboard', href: '/billing/dashboard' },
  { id: 'customers', label: 'Customers', href: '/billing/customers' },
  { id: 'kyc', label: 'KYC', href: '/billing/kyc' },
  { id: 'service-catalog', label: 'Service Catalog', href: '/billing/service-catalog' },
  { id: 'contracts', label: 'Contracts', href: '/billing/contracts' },
  { id: 'concessions', label: 'Concessions', href: '/billing/concessions' },
  { id: 'rate-cards', label: 'Rate Cards', href: '/billing/rate-cards' },
  { id: 'conversion-rates', label: 'Conversion Rates', href: '/billing/conversion-rates' },
  { id: 'settings', label: 'Airport Setup', href: '/billing/settings' },
  { id: 'prep-dashboard', label: 'Workflow dashboard', href: '/billing/prep-dashboard' },
  { id: 'preparation', label: 'Preparation', href: '/billing/preparation' },
  { id: 'invoice-drafts', label: 'Invoice drafts', href: '/billing/invoice-drafts' },
  { id: 'review', label: 'Review', href: '/billing/review' },
  { id: 'invoices', label: 'Invoices', href: '/billing/invoices' },
  { id: 'invoice-bin', label: 'Invoice bin', href: '/billing/invoice-bin' },
  { id: 'billed-services', label: 'Billed Services dashboard', href: '/billing/billed-services' },
  { id: 'scheduled-flights', label: 'BHS', href: '/billing/scheduled-flights' },
  { id: 'ads', label: 'ADS', href: '/billing/ads' },
  { id: 'equipment', label: 'Equipment', href: '/billing/equipment' },
  { id: 'manpower', label: 'Manpower', href: '/billing/manpower' },
  { id: 'credit-memos', label: 'Credit memos', href: '/billing/credit-memos' },
  { id: 'backing-sheets', label: 'Backing sheets', href: '/billing/backing-sheets' },
  { id: 'reports', label: 'Reports', href: '/billing/reports' },
  { id: 'mis-checker', label: 'MIS Checker', href: '/billing/mis-checker' },
  { id: 'audit', label: 'Audit', href: '/billing/audit' },
  { id: 'cutover', label: 'Cutover', href: '/billing/cutover' },
  { id: 'parallel-run', label: 'Parallel run', href: '/billing/parallel-run' },
  { id: 'decommission', label: 'BC decommission', href: '/billing/decommission' },
  { id: 'cleaning', label: 'Cleaning', href: '/billing/cleaning' },
  { id: 'raf', label: 'RAF', href: '/billing/raf' },
  { id: 'maas', label: 'MAAS', href: '/billing/maas' },
  { id: 'xxld-scheduled', label: 'XXLD SKD', href: '/billing/xxld-scheduled' },
  { id: 'xxld-non-scheduled', label: 'XXLD Non-SKD', href: '/billing/xxld-non-scheduled' },
  { id: 'non-scheduled', label: 'Non-Scheduled', href: '/billing/non-scheduled' },
  {
    id: 'insights-marketing',
    label: 'Marketing insights',
    href: '/billing/insights/marketing',
  },
  {
    id: 'insights-payables',
    label: 'Payables insights',
    href: '/billing/insights/payables',
  },
  {
    id: 'insights-receivables',
    label: 'Receivables insights',
    href: '/billing/insights/receivables',
  },
];

const TRP_PAGES: BwmsAppPageDef[] = [
  { id: 'master', label: 'Master', href: '/trp/master' },
  { id: 'planner', label: 'Training Planner', href: '/trp/planner' },
  { id: 'fine-tuning', label: 'Fine tunning', href: '/trp/fine-tuning' },
  { id: 'report', label: 'Report', href: '/trp/report' },
  { id: 'updation', label: 'Training updation', href: '/trp/updation' },
];

const SAFETY_PAGES: BwmsAppPageDef[] = [
  { id: 'cqa', label: 'CQA Checklist', href: '/safety-incident/cqa' },
  { id: 'incident', label: 'Incident', href: '/safety-incident/incident' },
];

const CMS_PAGES: BwmsAppPageDef[] = [
  { id: 'roster', label: 'Cab Roster', href: '/cms/roster' },
  { id: 'live-tracking', label: 'Live Tracking', href: '/cms/live-tracking' },
  { id: 'vendors', label: 'Vendors', href: '/cms/vendors' },
  { id: 'reports', label: 'Reports', href: '/cms/reports' },
];

const HR_PAGES: BwmsAppPageDef[] = [
  { id: 'employees', label: 'Employee', href: '/hr/hub/employees' },
  { id: 'departments', label: 'Department', href: '/hr/hub/departments' },
  {
    id: 'sub-departments',
    label: 'Sub Department',
    href: '/hr/hub/sub-departments',
  },
  { id: 'designations', label: 'Designation', href: '/hr/hub/designations' },
  { id: 'uniform', label: 'Uniform', href: '/hr/uniform' },
];

export const MANUALS_PAGES: BwmsAppPageDef[] = [
  { id: 'master', label: 'Master', href: '/manuals/master' },
  { id: 'stations', label: 'Stations Manuals', href: '/manuals/stations' },
  {
    id: 'corporate',
    label: 'Corporate / HO Manuals',
    href: '/manuals/corporate',
  },
];

/** Pages per BWMS app id. Empty array = FRIS (uses stationPermissions). */
export const BWMS_APP_PAGE_CATALOG: Record<string, BwmsAppPageDef[]> = {
  'safety-incident': SAFETY_PAGES,
  compliance: PLACEHOLDER_ACCESS,
  manuals: MANUALS_PAGES,
  'billing-finance': BILLING_PAGES,
  'do-money': PLACEHOLDER_ACCESS,
  'bill-receivables': PLACEHOLDER_ACCESS,
  fris: [],
  trp: TRP_PAGES,
  cms: CMS_PAGES,
  aep: PLACEHOLDER_ACCESS,
  ams: PLACEHOLDER_ACCESS,
  chr: PLACEHOLDER_ACCESS,
  'ba-test': PLACEHOLDER_ACCESS,
  uld: PLACEHOLDER_ACCESS,
  'hired-gse': PLACEHOLDER_ACCESS,
  'maas-services': PLACEHOLDER_ACCESS,
  'grooming-checklist': PLACEHOLDER_ACCESS,
  'namaskar-services': PLACEHOLDER_ACCESS,
  'admin-panel-people': PLACEHOLDER_ACCESS,
  gemm: PLACEHOLDER_ACCESS,
  'log-data': PLACEHOLDER_ACCESS,
  hr: HR_PAGES,
  meeting: PLACEHOLDER_ACCESS,
  calendar: PLACEHOLDER_ACCESS,
};

export function pagesForApp(appId: string): BwmsAppPageDef[] {
  return BWMS_APP_PAGE_CATALOG[appId] ?? PLACEHOLDER_ACCESS;
}

export function allPageIdsForApp(appId: string): string[] {
  return pagesForApp(appId).map((p) => p.id);
}

export function appHasNestedPages(appId: string): boolean {
  return pagesForApp(appId).length > 0;
}

/** stationId → appId → page ids. Missing app key = grandfather (all pages). */
export type StationAppPageAccessFormState = Record<
  string,
  Record<string, string[]>
>;

export function emptyStationAppPageAccess(): StationAppPageAccessFormState {
  return {};
}

export function normalizeStationAppPageAccess(
  input: StationAppPageAccessFormState | undefined,
): StationAppPageAccessFormState {
  if (!input || typeof input !== 'object') return {};
  const allowedApps = new Set(ALL_BWMS_APP_IDS);
  const out: StationAppPageAccessFormState = {};
  for (const [stationId, byApp] of Object.entries(input)) {
    if (!stationId.trim() || !byApp || typeof byApp !== 'object' || Array.isArray(byApp)) {
      continue;
    }
    const stationOut: Record<string, string[]> = {};
    for (const [appId, pages] of Object.entries(byApp)) {
      if (!allowedApps.has(appId) || !Array.isArray(pages)) continue;
      // FRIS has no nested page catalog here.
      if (appId === 'fris') continue;
      const allowedPages = new Set(allPageIdsForApp(appId));
      stationOut[appId] = [
        ...new Set(
          pages.map((p) => String(p).trim()).filter((p) => allowedPages.has(p)),
        ),
      ];
    }
    out[stationId] = stationOut;
  }
  return out;
}

export function pruneStationAppPageAccessToAssigned(
  access: StationAppPageAccessFormState,
  assignedStationIds: string[],
): StationAppPageAccessFormState {
  const assigned = new Set(assignedStationIds);
  const pruned: StationAppPageAccessFormState = {};
  for (const id of assigned) {
    pruned[id] = { ...(access[id] ?? {}) };
  }
  return normalizeStationAppPageAccess(pruned);
}

export function allPagesForStations(
  assignedStationIds: string[],
): StationAppPageAccessFormState {
  const map: StationAppPageAccessFormState = {};
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
 * Resolve effective page ids for an app at a station.
 * Grandfather (2A): tile on + page key missing ⇒ all catalog pages.
 */
export function resolvePagesForApp(
  stationAppAccess: StationAppAccessFormState | undefined,
  stationAppPageAccess: StationAppPageAccessFormState | undefined,
  stationId: string | null | undefined,
  appId: string,
  isSuperadmin = false,
): string[] {
  if (appId === 'fris') return [];
  if (isSuperadmin) return allPageIdsForApp(appId);
  if (!stationId) return [];
  const enabledApps = resolveClientAppAccess(
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

/** Resolved map for session: appId → page ids (enabled apps only). */
export function resolveAppPageAccessForStation(
  stationAppAccess: StationAppAccessFormState | undefined,
  stationAppPageAccess: StationAppPageAccessFormState | undefined,
  stationId: string | null | undefined,
  isSuperadmin: boolean,
  appAccessOverride?: string[],
): Record<string, string[]> {
  const apps =
    appAccessOverride ??
    (isSuperadmin
      ? [...ALL_BWMS_APP_IDS]
      : appsForStation(stationAppAccess, stationId));
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

export function isPageEnabled(
  stationAppAccess: StationAppAccessFormState | undefined,
  stationAppPageAccess: StationAppPageAccessFormState | undefined,
  stationId: string | null | undefined,
  appId: string,
  pageId: string,
  isSuperadmin = false,
): boolean {
  return resolvePagesForApp(
    stationAppAccess,
    stationAppPageAccess,
    stationId,
    appId,
    isSuperadmin,
  ).includes(pageId);
}

export function enableAppWithAllPages(
  stationAppAccess: StationAppAccessFormState,
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appId: string,
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  const nextApps = toggleBwmsApp(stationAppAccess, stationId, appId, true);
  const nextPages = { ...stationAppPageAccess };
  const stationPages = { ...(nextPages[stationId] ?? {}) };
  if (appId !== 'fris') {
    stationPages[appId] = allPageIdsForApp(appId);
  } else {
    delete stationPages[appId];
  }
  nextPages[stationId] = stationPages;
  return { stationAppAccess: nextApps, stationAppPageAccess: nextPages };
}

export function disableAppAndPages(
  stationAppAccess: StationAppAccessFormState,
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appId: string,
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  const nextApps = toggleBwmsApp(stationAppAccess, stationId, appId, false);
  const nextPages = { ...stationAppPageAccess };
  const stationPages = { ...(nextPages[stationId] ?? {}) };
  delete stationPages[appId];
  nextPages[stationId] = stationPages;
  return { stationAppAccess: nextApps, stationAppPageAccess: nextPages };
}

export function setAppPages(
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appId: string,
  pageIds: string[],
): StationAppPageAccessFormState {
  const allowed = new Set(allPageIdsForApp(appId));
  const cleaned = [
    ...new Set(pageIds.map((p) => String(p).trim()).filter((p) => allowed.has(p))),
  ];
  const next = { ...stationAppPageAccess };
  const stationPages = { ...(next[stationId] ?? {}) };
  stationPages[appId] = cleaned;
  next[stationId] = stationPages;
  return next;
}

export function toggleAppPage(
  stationAppAccess: StationAppAccessFormState,
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appId: string,
  pageId: string,
  enabled: boolean,
  isSuperadmin = false,
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  const current = new Set(
    resolvePagesForApp(
      stationAppAccess,
      stationAppPageAccess,
      stationId,
      appId,
      isSuperadmin,
    ),
  );
  if (enabled) current.add(pageId);
  else current.delete(pageId);

  let nextApps = stationAppAccess;
  let nextPages = setAppPages(stationAppPageAccess, stationId, appId, [...current]);

  if (current.size === 0) {
    return disableAppAndPages(nextApps, nextPages, stationId, appId);
  }
  if (!isBwmsAppEnabled(nextApps, stationId, appId)) {
    nextApps = toggleBwmsApp(nextApps, stationId, appId, true);
  }
  return { stationAppAccess: nextApps, stationAppPageAccess: nextPages };
}

export function enableAllToolsAndPagesForStation(
  stationId: string,
  assignedStationIds: string[],
  prevApps: StationAppAccessFormState,
  prevPages: StationAppPageAccessFormState,
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  const allApps = { ...prevApps, [stationId]: [...ALL_BWMS_APP_IDS] };
  const allPagesMap = allPagesForStations([stationId]);
  const nextPages = {
    ...pruneStationAppPageAccessToAssigned(prevPages, assignedStationIds),
    [stationId]: allPagesMap[stationId] ?? {},
  };
  return {
    stationAppAccess: allApps,
    stationAppPageAccess: nextPages,
  };
}

export function clearAllToolsAndPagesForStation(
  stationId: string,
  assignedStationIds: string[],
  prevApps: StationAppAccessFormState,
  prevPages: StationAppPageAccessFormState,
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  return {
    stationAppAccess: { ...prevApps, [stationId]: [] },
    stationAppPageAccess: {
      ...pruneStationAppPageAccessToAssigned(prevPages, assignedStationIds),
      [stationId]: {},
    },
  };
}

export function enableGroupToolsAndPages(
  stationAppAccess: StationAppAccessFormState,
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appIds: string[],
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  let apps = stationAppAccess;
  let pages = stationAppPageAccess;
  for (const appId of appIds) {
    const next = enableAppWithAllPages(apps, pages, stationId, appId);
    apps = next.stationAppAccess;
    pages = next.stationAppPageAccess;
  }
  return { stationAppAccess: apps, stationAppPageAccess: pages };
}

export function clearGroupToolsAndPages(
  stationAppAccess: StationAppAccessFormState,
  stationAppPageAccess: StationAppPageAccessFormState,
  stationId: string,
  appIds: string[],
): {
  stationAppAccess: StationAppAccessFormState;
  stationAppPageAccess: StationAppPageAccessFormState;
} {
  let apps = stationAppAccess;
  let pages = stationAppPageAccess;
  for (const appId of appIds) {
    const next = disableAppAndPages(apps, pages, stationId, appId);
    apps = next.stationAppAccess;
    pages = next.stationAppPageAccess;
  }
  return { stationAppAccess: apps, stationAppPageAccess: pages };
}

/** Map billing href → page id. */
export function billingPageIdFromHref(href: string): string | null {
  const path = href.split('?')[0] ?? href;
  for (const page of BILLING_PAGES) {
    if (page.href === path) return page.id;
  }
  // Prefix match for nested routes under a page.
  const match = BILLING_PAGES.find(
    (p) => p.href && path.startsWith(`${p.href}/`),
  );
  return match?.id ?? null;
}

export function trpPageIdFromPathname(pathname: string): string | null {
  const path = pathname.split('?')[0] ?? pathname;
  // Module root redirects to Training Planner — treat as planner for access checks.
  if (path === '/trp' || path === '/trp/') return 'planner';
  for (const page of TRP_PAGES) {
    if (!page.href || page.id === 'hub') continue;
    if (path === page.href || path.startsWith(`${page.href}/`)) return page.id;
  }
  return null;
}

export function safetyPageIdFromPathname(pathname: string): string | null {
  const path = pathname.split('?')[0] ?? pathname;
  for (const page of SAFETY_PAGES) {
    if (!page.href) continue;
    if (path === page.href || path.startsWith(`${page.href}/`)) return page.id;
  }
  return null;
}

/** Client: resolved page map after FRIS/module login. */
export function readStoredAppPageAccess(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('userAppPageAccess');
    if (!raw?.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [appId, pages] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(pages)) continue;
      out[appId] = pages.map((p) => String(p).trim()).filter(Boolean);
    }
    return out;
  } catch {
    return {};
  }
}

export function hasStoredAppPage(
  appId: string,
  pageId: string,
  options?: { grandfatherAllIfMissing?: boolean },
): boolean {
  const map = readStoredAppPageAccess();
  const pages = map[appId];
  if (pages === undefined) {
    // Session always emits resolved pages; missing app key ⇒ no grant.
    // Optional grandfather only when tile is on and map empty entirely (legacy session).
    if (options?.grandfatherAllIfMissing && Object.keys(map).length === 0) {
      return true;
    }
    return false;
  }
  return pages.includes(pageId);
}

/** True when localStorage already has a session app-access payload (post-login). */
export function hasConfiguredAppAccess(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('userAppAccess') != null;
  } catch {
    return false;
  }
}

/**
 * Snapshot-based evaluator for hot render paths (tile grids, tab bars).
 * Reads session/localStorage once and returns a stable predicate.
 */
export function createClientBwmsAppAccessEvaluator(): (appId: string) => boolean {
  if (typeof window === 'undefined') return () => true;

  let bypassGrants = false;
  try {
    // Universal id (`supadm123`) always sees every tile, including newly added ones.
    if (isUniversalSuperadminSession()) bypassGrants = true;
    const role = String(localStorage.getItem('userRole') ?? '')
      .trim()
      .toLowerCase();
    // Only full superadmins bypass tile grants. Managers follow stationAppAccess.
    if (role === 'superadmin') bypassGrants = true;
  } catch {
    /* ignore */
  }

  const configured = hasConfiguredAppAccess();
  let authenticated = false;
  try {
    authenticated = localStorage.getItem('isAuthenticated') === 'true';
  } catch {
    /* ignore */
  }

  const grantedApps = configured ? new Set(readStoredAppAccess()) : new Set<string>();

  return (appId: string): boolean => {
    if (bypassGrants) return true;
    if (!configured) {
      // Pre-login discovery: show tiles so each app login can run.
      // If a session claims authenticated but never wrote grants, fail closed.
      return !authenticated;
    }
    return grantedApps.has(appId);
  };
}

/** True when the current client session may use this BWMS tile. */
export function clientMayUseBwmsApp(appId: string): boolean {
  return createClientBwmsAppAccessEvaluator()(appId);
}

/**
 * Page grant for a tile. Grandfather: tile on + empty page map (legacy session) ⇒ all pages.
 */
export function clientMayUseBwmsAppPage(appId: string, pageId: string): boolean {
  if (!clientMayUseBwmsApp(appId)) return false;
  if (typeof window === 'undefined') return true;
  try {
    if (isUniversalSuperadminSession()) return true;
    const role = String(localStorage.getItem('userRole') ?? '')
      .trim()
      .toLowerCase();
    if (role === 'superadmin') return true;
  } catch {
    /* ignore */
  }
  const map = readStoredAppPageAccess();
  if (Object.keys(map).length === 0) {
    // Legacy / grandfather: tile grant alone is enough when no page map stored.
    return true;
  }
  return (map[appId] ?? []).includes(pageId);
}
