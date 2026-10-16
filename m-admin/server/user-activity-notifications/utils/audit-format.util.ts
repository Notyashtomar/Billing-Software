/**
 * Helpers that turn raw codes/permission objects into the self-explanatory,
 * human-readable values used in the audit log (module/page labels, role labels,
 * Enabled/Disabled access, and field-level permission diffs with old/new).
 *
 * Keep the tab labels in sync with `client/lib/permission-tab-config.ts`.
 */

/** FRIS permission tab key → human module label. */
const TAB_MODULE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  creation: 'Creation',
  advance: 'Advance',
  flights: 'Flights',
  reports: 'Reports',
  mis: 'MIS',
  others: 'Others',
};

/** Authorization role code → human label. */
export function humanizeRole(role: string | null | undefined): string {
  const code = String(role ?? '').trim().toLowerCase();
  switch (code) {
    case 'superadmin':
      return 'Super Admin';
    case 'admin':
    case 'operations':
    case 'manager':
      return 'Manager';
    case 'employee':
      return 'Employee';
    case '':
      return '—';
    default:
      return code.charAt(0).toUpperCase() + code.slice(1);
  }
}

/** Admin-panel section key → human label (mirrors `client/lib/admin-nav-config.ts`). */
const ADMIN_SECTION_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  'user-credentials': 'User ID & Password',
  departments: 'Department',
  stations: 'Stations',
  training: 'Training',
  tickets: 'Raise ticket query',
  notifications: 'Notifications',
  'user-activity': 'User activity',
  'system-check': 'System check',
  export: 'Export data',
};

/** Admin-panel section key → human label. */
export function adminSectionLabel(section: string): string {
  const key = String(section ?? '').trim();
  return (
    ADMIN_SECTION_LABEL[key] ??
    (key
      ? key
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Section')
  );
}

/** A single admin-panel page access grant/revocation. */
export type AdminSectionDelta = {
  section: string;
  before: boolean;
  after: boolean;
};

/** Diff two admin-panel section grant lists → per-page grants/revocations. */
export function diffAdminPanelSections(
  before: string[],
  after: string[],
): AdminSectionDelta[] {
  const beforeSet = new Set((before ?? []).map((s) => String(s).trim()).filter(Boolean));
  const afterSet = new Set((after ?? []).map((s) => String(s).trim()).filter(Boolean));
  const sections = new Set<string>([...beforeSet, ...afterSet]);
  const deltas: AdminSectionDelta[] = [];
  for (const section of sections) {
    const had = beforeSet.has(section);
    const has = afterSet.has(section);
    if (had !== has) deltas.push({ section, before: had, after: has });
  }
  return deltas;
}

/** Permission tab key → human module label (falls back to a title-cased key). */
export function moduleLabelForTab(tab: string): string {
  const key = String(tab ?? '').trim();
  return (
    TAB_MODULE_LABEL[key] ??
    (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Module')
  );
}

/** Boolean access → "Enabled" / "Disabled". */
export function accessLabel(enabled: boolean): string {
  return enabled ? 'Enabled' : 'Disabled';
}

type AccessShape = {
  accessTabs?: string[];
  accessSubPages?: Record<string, string[]>;
};

/** A single permission grant/revocation expressed in human terms. */
export type PermissionDelta = {
  /** Permission tab key, e.g. "flights". */
  tab: string;
  /** Sub-page label, e.g. "Scheduled Airlines"; empty for whole-module access. */
  page: string;
  /** Station this grant belongs to (omitted for the account-default scope). */
  stationId?: string;
  before: boolean;
  after: boolean;
};

function pagesByTab(access: AccessShape | null | undefined): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!access || typeof access !== 'object') return out;
  const sub = access.accessSubPages ?? {};
  for (const [tab, pages] of Object.entries(sub)) {
    if (!Array.isArray(pages)) continue;
    const set = out.get(tab) ?? new Set<string>();
    for (const p of pages) {
      const label = String(p ?? '').trim();
      if (label) set.add(label);
    }
    out.set(tab, set);
  }
  return out;
}

/** Diff two access objects → list of page-level grants/revocations. */
function diffAccess(
  before: AccessShape | null | undefined,
  after: AccessShape | null | undefined,
  stationId?: string,
): PermissionDelta[] {
  const beforeMap = pagesByTab(before);
  const afterMap = pagesByTab(after);
  const tabs = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
  const deltas: PermissionDelta[] = [];

  for (const tab of tabs) {
    const beforePages = beforeMap.get(tab) ?? new Set<string>();
    const afterPages = afterMap.get(tab) ?? new Set<string>();
    const pages = new Set<string>([...beforePages, ...afterPages]);
    for (const page of pages) {
      const had = beforePages.has(page);
      const has = afterPages.has(page);
      if (had !== has) {
        deltas.push({ tab, page, stationId, before: had, after: has });
      }
    }
  }
  return deltas;
}

type PermissionMaps = {
  permissions?: AccessShape | null;
  stationPermissions?: Record<string, AccessShape> | null;
};

/**
 * Diff the account-default permissions AND every station-scoped permission set
 * between two snapshots, producing a flat list of human-readable grants/revocations.
 */
export function diffPermissionState(
  before: PermissionMaps,
  after: PermissionMaps,
): PermissionDelta[] {
  const deltas: PermissionDelta[] = [];

  deltas.push(...diffAccess(before.permissions, after.permissions));

  const beforeStations = before.stationPermissions ?? {};
  const afterStations = after.stationPermissions ?? {};
  const stationIds = new Set<string>([
    ...Object.keys(beforeStations),
    ...Object.keys(afterStations),
  ]);
  for (const stationId of stationIds) {
    deltas.push(
      ...diffAccess(
        beforeStations[stationId],
        afterStations[stationId],
        stationId,
      ),
    );
  }
  return deltas;
}

/** "Flights → Scheduled Airlines" (or just "Flights" for whole-module access). */
export function permissionDeltaLabel(delta: PermissionDelta): string {
  const moduleLabel = moduleLabelForTab(delta.tab);
  return delta.page ? `${moduleLabel} → ${delta.page}` : moduleLabel;
}
