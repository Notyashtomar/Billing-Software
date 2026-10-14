import type { UserPermissions } from '../schema/user.schema';
import {
  buildFlagsFromPermissions,
  normalizeAccessSubPages,
  PERMISSION_SUB_PAGES,
  prunePermissionSelection,
} from './permissions-to-flags';

export type StationPermissionsMap = Record<
  string,
  {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  }
>;

function normalizeAssignedStationIds(ids: string[] | undefined): string[] {
  return (ids ?? []).map((id) => id.trim()).filter(Boolean);
}

function normalizeStationPermissionEntry(input: {
  accessTabs?: string[];
  accessSubPages?: Record<string, string[]>;
  strict?: boolean;
}): { accessTabs: string[]; accessSubPages: Record<string, string[]> } {
  if (input.strict) {
    return prunePermissionSelection(input);
  }

  const accessSubPages = normalizeAccessSubPages(
    input.accessTabs ?? [],
    input.accessSubPages ?? {},
  );
  const accessTabs = [
    ...new Set([
      ...(input.accessTabs ?? []),
      ...Object.keys(accessSubPages).filter(
        (tab) => (accessSubPages[tab] ?? []).length > 0,
      ),
    ]),
  ];

  return { accessTabs, accessSubPages };
}

export function normalizeStationPermissionsMap(
  stationPermissions: StationPermissionsMap | undefined,
  options?: { strict?: boolean },
): StationPermissionsMap {
  if (!stationPermissions || typeof stationPermissions !== 'object') {
    return {};
  }

  const normalized: StationPermissionsMap = {};
  for (const [stationId, value] of Object.entries(stationPermissions)) {
    if (!stationId?.trim() || !value) continue;
    const entry = normalizeStationPermissionEntry({
      accessTabs: value.accessTabs ?? [],
      accessSubPages: value.accessSubPages ?? {},
      strict: options?.strict ?? true,
    });
    normalized[stationId.trim()] = entry;
  }
  return normalized;
}

export function resolvePrimaryPermissions(input: {
  assignedStationIds?: string[];
  stationPermissions?: StationPermissionsMap;
  permissions?: UserPermissions | { accessTabs: string[]; accessSubPages: Record<string, string[]> };
}): { accessTabs: string[]; accessSubPages: Record<string, string[]> } {
  const assigned = normalizeAssignedStationIds(input.assignedStationIds);
  const stationMap = normalizeStationPermissionsMap(input.stationPermissions, {
    strict: true,
  });

  if (assigned.length === 1) {
    const stationPerms = stationMap[assigned[0]!];
    if (stationPerms) {
      return stationPerms;
    }
  }

  const fallback = input.permissions ?? { accessTabs: [], accessSubPages: {} };
  return normalizeStationPermissionEntry({
    accessTabs: fallback.accessTabs ?? [],
    accessSubPages: fallback.accessSubPages ?? {},
    strict: assigned.length > 0,
  });
}

export function buildStoredPermissionsFromInput(input: {
  assignedStationIds?: string[];
  stationPermissions?: StationPermissionsMap;
  permissions?: { accessTabs: string[]; accessSubPages: Record<string, string[]> };
}) {
  const assignedStationIds = normalizeAssignedStationIds(input.assignedStationIds);
  const stationPermissions = normalizeStationPermissionsMap(input.stationPermissions, {
    strict: true,
  });

  const permissions =
    assignedStationIds.length > 1
      ? { accessTabs: [] as string[], accessSubPages: {} as Record<string, string[]> }
      : resolvePrimaryPermissions({
          assignedStationIds,
          stationPermissions,
          permissions: input.permissions,
        });

  // Keep the single-station bucket in sync so login station scoping finds the grant.
  if (assignedStationIds.length === 1) {
    const stationId = assignedStationIds[0]!;
    stationPermissions[stationId] = {
      accessTabs: [...permissions.accessTabs],
      accessSubPages: { ...permissions.accessSubPages },
    };
  }

  const flags =
    assignedStationIds.length > 0
      ? buildFlagsForStationContext({
          assignedStationIds,
          stationPermissions,
          permissions,
          stationId: assignedStationIds[0],
        })
      : buildFlagsFromPermissions(permissions.accessSubPages);

  return {
    assignedStationIds,
    stationPermissions,
    permissions,
    flags,
  };
}

/**
 * Superadmins always receive every FRIS page on every assigned station.
 * New pages added to PERMISSION_SUB_PAGES are included automatically on save/session.
 */
export function expandSuperadminFullPageAccess(input: {
  assignedStationIds: string[];
  stationPermissions: StationPermissionsMap;
  permissions: { accessTabs: string[]; accessSubPages: Record<string, string[]> };
  flags: ReturnType<typeof buildFlagsFromPermissions>;
}) {
  const accessTabs = Object.keys(PERMISSION_SUB_PAGES);
  const accessSubPages = normalizeAccessSubPages(accessTabs, {});
  const permissions = { accessTabs, accessSubPages };
  const stationPermissions: StationPermissionsMap = {
    ...input.stationPermissions,
  };
  for (const stationId of input.assignedStationIds) {
    stationPermissions[stationId] = {
      accessTabs: [...accessTabs],
      accessSubPages: { ...accessSubPages },
    };
  }
  const flags = buildFlagsFromPermissions(accessSubPages);
  return {
    assignedStationIds: input.assignedStationIds,
    stationPermissions,
    permissions,
    flags,
  };
}

export function stationPermissionsHaveAccess(
  stationPermissions: StationPermissionsMap,
  stationId: string,
): boolean {
  const perms = stationPermissions[stationId.trim()];
  if (!perms) return false;
  return Object.values(prunePermissionSelection(perms).accessSubPages).some(
    (pages) => pages.length > 0,
  );
}

export function validateUserStationLoginAccess(input: {
  assignedStationIds?: string[];
  stationId?: string;
  /** When true (e.g. Safety module login), pick first assigned station if none selected. */
  autoSelectFirstStation?: boolean;
}):
  | { ok: true; stationId?: string }
  | { ok: false; message: string } {
  const assigned = normalizeAssignedStationIds(input.assignedStationIds);
  const requested = input.stationId?.trim();

  if (assigned.length === 0) {
    return { ok: true, stationId: requested || undefined };
  }

  if (!requested) {
    // Single-station staff: no picker needed.
    if (assigned.length === 1) {
      return { ok: true, stationId: assigned[0] };
    }
    if (input.autoSelectFirstStation) {
      return { ok: true, stationId: assigned[0] };
    }
    return { ok: false, message: 'Select a station to sign in.' };
  }

  if (!assigned.includes(requested)) {
    return {
      ok: false,
      message: 'You do not have access to this station.',
    };
  }

  return { ok: true, stationId: requested };
}

export function resolveStationScopedPermissions(input: {
  assignedStationIds?: string[];
  stationPermissions?: StationPermissionsMap;
  permissions?: UserPermissions | {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
  stationId?: string;
}): { accessTabs: string[]; accessSubPages: Record<string, string[]> } {
  const assigned = normalizeAssignedStationIds(input.assignedStationIds);
  const stationId = input.stationId?.trim();
  const stationMap = normalizeStationPermissionsMap(input.stationPermissions, {
    strict: true,
  });

  if (assigned.length > 0 && stationId && assigned.includes(stationId)) {
    let stationPerms = stationMap[stationId];
    if (!stationPerms) {
      const matchKey = Object.keys(stationMap).find(
        (k) => k.toLowerCase() === stationId.toLowerCase(),
      );
      if (matchKey) {
        stationPerms = stationMap[matchKey];
      }
    }
    if (
      stationPerms &&
      (stationPerms.accessTabs.length > 0 ||
        Object.values(stationPerms.accessSubPages ?? {}).some((p) => p.length > 0))
    ) {
      return stationPerms;
    }

    // Single-station accounts or multi-station accounts falling back to primary station permissions
    if (assigned.length > 0) {
      const primaryKey = assigned.find((id) => stationMap[id]);
      if (primaryKey && stationMap[primaryKey]) {
        const primaryPerms = stationMap[primaryKey]!;
        if (
          primaryPerms.accessTabs.length > 0 ||
          Object.values(primaryPerms.accessSubPages ?? {}).some((p) => p.length > 0)
        ) {
          return primaryPerms;
        }
      }
    }

    // Fall back to legacy / global permissions if present
    if (
      input.permissions?.accessTabs?.length ||
      (input.permissions?.accessSubPages &&
        Object.values(input.permissions.accessSubPages).some((p) => p.length > 0))
    ) {
      return normalizeStationPermissionEntry({
        accessTabs: input.permissions?.accessTabs ?? [],
        accessSubPages: input.permissions?.accessSubPages ?? {},
        strict: true,
      });
    }

    return stationPerms ?? { accessTabs: [], accessSubPages: {} };
  }

  return resolvePrimaryPermissions({
    assignedStationIds: assigned,
    stationPermissions: stationMap,
    permissions: input.permissions,
  });
}

export function buildFlagsForStationContext(input: {
  assignedStationIds?: string[];
  stationPermissions?: StationPermissionsMap;
  permissions?: UserPermissions | {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
  flags?: Record<string, number | Record<string, number>>;
  stationId?: string;
}) {
  const scoped = resolveStationScopedPermissions(input);
  return buildFlagsFromPermissions(scoped.accessSubPages);
}

/** FRIS navbar tab order — keep aligned with client permission-tab-config. */
const FRIS_TAB_ORDER = [
  'dashboard',
  'creation',
  'advance',
  'flights',
  'reports',
  'mis',
] as const;

/** First routable path for an admin-assigned permission page label. */
const FRIS_PERMISSION_PAGE_PATHS: Record<string, Record<string, string>> = {
  dashboard: {
    'Dashboard page': '/fris/dashboard',
  },
  creation: {
    'Scheduled Airlines': '/fris/creation?section=scheduled-airlines',
    'Additional Flights': '/fris/creation?section=additional-flights',
    RAF: '/fris/creation?section=raf',
  },
  advance: {
    Gateway: '/fris/advance?tab=gateway',
    'Schedule Setup': '/fris/advance?tab=schedule',
    'Schedule Equipment Setup': '/fris/advance?tab=schedule-equipment',
    Cargo: '/fris/advance?tab=cargo',
    'GH Representative': '/fris/advance?tab=gh-representative',
    Invoicing: '/fris/advance?tab=invoicing',
    'Alert Setup': '/fris/advance?tab=alert',
  },
  flights: {
    'Scheduled Airlines': '/fris/flights/scheduledairlines',
    'Scheduled Data Export': '/fris/flights/scheduledairlines/data-export',
    'Cancellation History': '/fris/flights/cancellation-history',
    'Non-Scheduled Airlines': '/fris/flights/Non-Scheduled-Airlines',
    'Non scheduled Booking':
      '/fris/flights/non-scheduled-airlines/non-scheduled-booking',
    'Booking Details': '/fris/flights/non-scheduled-airlines/booking-details',
    'Non-Scheduled Data': '/fris/flights/non-scheduled-airlines/data-export',
    'MIS Non-Scheduled Flights': '/fris/flights/non-scheduled-airlines/mis',
    'Flight Schedule': '/fris/flights/flight-schedule',
    'Peak Flights': '/fris/flights/peak-flights',
  },
  reports: {
    'Pax Shift Report': '/fris/reports/pax-shift',
    'Pax Shift Analysis Report': '/fris/reports/pax-shift-analysis',
    'Ramp Shift Report': '/fris/reports/ramp-shift',
    'GSD Shift Report': '/fris/reports/gsd-shift',
    'Quality Report': '/fris/reports/quality',
    'Missing FHR Report': '/fris/reports/missing-fhr',
    'Delay Report': '/fris/reports/delay',
    'Cleaning Services': '/fris/reports/cleaning-services',
    'Scheduled FHR Report': '/fris/reports/consolidated/scheduled-fhr',
    'Non Scheduled FHR Report': '/fris/reports/consolidated/non-scheduled-fhr',
  },
  mis: {
    'MIS Station Wise': '/fris/mis/station-wise',
    // Same ACL — NS monthwise shares MIS Station Wise permission
    // path used for deep-links; nav lists both slugs under MIS.
    'MIS Airline Wise': '/fris/mis/airline-wise',
    // Same ACL — NS airline-wise shares MIS Airline Wise permission.
    'MIS Month Wise': '/fris/mis/month-wise',
    'MIS Remarks': '/fris/mis/remarks',
    'MIS RAF': '/fris/mis/raf',
    'MIS BHS': '/fris/mis/bhs',
    'MIS ADS': '/fris/mis/ads',
    'MIS Checker': '/billing/mis-checker',
  },
  others: {
    Billing: '/billing/insights/payables',
  },
};

/**
 * Post-login landing from station-scoped admin assignments (not derived flags).
 * Returns the first assigned tab/page in FRIS navbar order.
 */
export function resolveFrisLandingPathFromAccessSubPages(
  accessSubPages: Record<string, string[]>,
): string {
  for (const tab of FRIS_TAB_ORDER) {
    const pages = accessSubPages[tab] ?? [];
    const pathMap = FRIS_PERMISSION_PAGE_PATHS[tab] ?? {};
    for (const page of pages) {
      const path = pathMap[page.trim()];
      if (path) return path;
    }
  }
  return '/fris/flights/scheduledairlines';
}

export function resolveFrisSessionPermissionScope(input: {
  assignedStationIds?: string[];
  stationPermissions?: StationPermissionsMap;
  permissions?: UserPermissions | {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
  stationId?: string;
}): { accessTabs: string[]; accessSubPages: Record<string, string[]> } {
  return resolveStationScopedPermissions(input);
}
