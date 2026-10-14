/**
 * BWMS login-tile catalog — keep in sync with LoginAppsGrid LOGIN_APP_GROUPS
 * and server `bwms-app-access.util.ts` ALL_BWMS_APP_IDS.
 * New tile ⇒ add here (and server list + page catalog pages).
 * Universal superadmin `supadm123` auto-receives every id in this list.
 */

export type BwmsAppToolDef = {
  id: string;
  label: string;
  group: string;
  /** Tile has nested FRIS page permissions (Rights & permissions). */
  hasFrisPermissions?: boolean;
};

export const BWMS_APP_TOOLS: BwmsAppToolDef[] = [
  { id: 'safety-incident', label: 'Safety & Incident', group: 'Safety & Compliance' },
  { id: 'compliance', label: 'Compliance', group: 'Safety & Compliance' },
  { id: 'manuals', label: 'Manuals', group: 'Safety & Compliance' },
  { id: 'billing-finance', label: 'Billing', group: 'Finance & Billing' },
  { id: 'do-money', label: 'DO Money', group: 'Finance & Billing' },
  { id: 'bill-receivables', label: 'Bill Receivables', group: 'Finance & Billing' },
  { id: 'fris', label: 'FRIS', group: 'Operations', hasFrisPermissions: true },
  { id: 'trp', label: 'TRP', group: 'Operations' },
  { id: 'cms', label: 'CMS', group: 'Operations' },
  { id: 'aep', label: 'AEP', group: 'Operations' },
  { id: 'ams', label: 'AMS', group: 'Operations' },
  { id: 'chr', label: 'CHR', group: 'Operations' },
  { id: 'ba-test', label: 'BA Test', group: 'Operations' },
  { id: 'uld', label: 'ULD', group: 'Operations' },
  { id: 'hired-gse', label: 'Hired GSE', group: 'Operations' },
  { id: 'maas-services', label: 'MAAS Services', group: 'Operations' },
  { id: 'grooming-checklist', label: 'Grooming', group: 'Operations' },
  { id: 'namaskar-services', label: 'Namaskar', group: 'Operations' },
  { id: 'admin-panel-people', label: 'Admin Panel', group: 'Admin & People' },
  { id: 'gemm', label: 'GEMM', group: 'Admin & People' },
  { id: 'log-data', label: 'Log Data', group: 'Admin & People' },
  { id: 'hr', label: 'HR', group: 'Admin & People' },
  { id: 'meeting', label: 'Meeting', group: 'Admin & People' },
  { id: 'calendar', label: 'Calendar', group: 'Admin & People' },
];

export const ALL_BWMS_APP_IDS: string[] = BWMS_APP_TOOLS.map((t) => t.id);

/** Per-station enabled BWMS login tiles. */
export type StationAppAccessFormState = Record<string, string[]>;

export function emptyStationAppAccess(): StationAppAccessFormState {
  return {};
}

export function normalizeStationAppAccess(
  input: StationAppAccessFormState | undefined,
): StationAppAccessFormState {
  if (!input || typeof input !== 'object') return {};
  const allowed = new Set(ALL_BWMS_APP_IDS);
  const out: StationAppAccessFormState = {};
  for (const [stationId, apps] of Object.entries(input)) {
    if (!stationId.trim() || !Array.isArray(apps)) continue;
    const ids = [...new Set(apps.map((a) => String(a).trim()).filter((a) => allowed.has(a)))];
    out[stationId] = ids;
  }
  return out;
}

export function pruneStationAppAccessToAssigned(
  access: StationAppAccessFormState,
  assignedStationIds: string[],
): StationAppAccessFormState {
  const assigned = new Set(assignedStationIds);
  const pruned: StationAppAccessFormState = {};
  for (const id of assigned) {
    pruned[id] = [...(access[id] ?? [])];
  }
  return normalizeStationAppAccess(pruned);
}

export function allAppsForStations(assignedStationIds: string[]): StationAppAccessFormState {
  const map: StationAppAccessFormState = {};
  for (const id of assignedStationIds) {
    map[id] = [...ALL_BWMS_APP_IDS];
  }
  return map;
}

/** Live tiles that already ship routes — used when stationAppAccess was never configured.
 * Billing is grant-only via admin BWMS tools (`billing-finance`); not in this default list.
 */
export const DEFAULT_LIVE_BWMS_APP_IDS: string[] = [
  'fris',
  'trp',
  'admin-panel-people',
];

export const BILLING_BWMS_APP_ID = 'billing-finance';

export function hasBillingAppAccess(appAccess: string[] | null | undefined): boolean {
  return Array.isArray(appAccess) && appAccess.includes(BILLING_BWMS_APP_ID);
}

/** Client: enabled BWMS tiles stored after FRIS login / session refresh. */
export function readStoredAppAccess(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('userAppAccess');
    if (!raw?.trim()) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function hasStoredBillingAppAccess(): boolean {
  return hasBillingAppAccess(readStoredAppAccess());
}

/** Which BWMS tile launched the current session — drives shared FRIS navbar chrome. */
export const BWMS_ENTRY_APP_KEY = 'bwmsEntryApp';
export type BwmsEntryApp = 'billing' | 'fris';

/** FRIS top-level tabs allowed while in billing navbar chrome. */
export const BILLING_NAVBAR_ALLOWED_LABELS = ['Advance', 'Flights', 'MIS'] as const;

export function setBwmsEntryApp(app: BwmsEntryApp): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BWMS_ENTRY_APP_KEY, app);
}

export function clearBwmsEntryApp(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BWMS_ENTRY_APP_KEY);
}

export function readBwmsEntryApp(): BwmsEntryApp | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BWMS_ENTRY_APP_KEY)?.trim();
    if (raw === 'billing' || raw === 'fris') return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Billing login (or any /billing page) uses a slim FRIS navbar: Advance / Flights / MIS only.
 * FRIS login clears this so dual-access users keep full FRIS tabs.
 */
export function isBillingNavbarChrome(pathname: string | null | undefined): boolean {
  if (typeof window === 'undefined') return false;
  const path = String(pathname ?? '');
  if (path.startsWith('/billing') && !path.startsWith('/billing/login')) {
    return true;
  }
  return readBwmsEntryApp() === 'billing';
}

export function isBillingCrossNavFrisPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '');
  return (
    path === '/fris/advance' ||
    path.startsWith('/fris/advance/') ||
    path === '/fris/flights' ||
    path.startsWith('/fris/flights/') ||
    path === '/fris/mis' ||
    path.startsWith('/fris/mis/')
  );
}

export function resolveClientAppAccess(
  access: StationAppAccessFormState | undefined,
  stationId: string | null | undefined,
  isSuperadmin: boolean,
): string[] {
  if (isSuperadmin) return [...ALL_BWMS_APP_IDS];
  if (!stationId) return [];
  if (!access || Object.keys(access).length === 0) {
    return [...DEFAULT_LIVE_BWMS_APP_IDS];
  }
  return access[stationId] ?? [];
}

export function appsForStation(
  access: StationAppAccessFormState | undefined,
  stationId: string | null | undefined,
): string[] {
  if (!stationId) return [];
  return access?.[stationId] ?? [];
}

export function isBwmsAppEnabled(
  access: StationAppAccessFormState | undefined,
  stationId: string | null | undefined,
  appId: string,
): boolean {
  return appsForStation(access, stationId).includes(appId);
}

export function toggleBwmsApp(
  access: StationAppAccessFormState,
  stationId: string,
  appId: string,
  enabled: boolean,
): StationAppAccessFormState {
  const current = new Set(access[stationId] ?? []);
  if (enabled) current.add(appId);
  else current.delete(appId);
  return {
    ...access,
    [stationId]: [...current],
  };
}
