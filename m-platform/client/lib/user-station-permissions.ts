import type { PermissionTabKey } from '@/lib/permission-tab-config';
import type { PanelUserPermissions } from '@/lib/api';

export type StationPermissionsFormState = Record<string, PanelUserPermissions>;

export function emptyStationPermissions(): PanelUserPermissions {
  return {
    accessTabs: [],
    accessSubPages: {},
  };
}

export function prunePermissionSelection(
  input: PanelUserPermissions,
): PanelUserPermissions {
  const accessSubPages: Record<string, string[]> = {};
  for (const [tab, pages] of Object.entries(input.accessSubPages ?? {})) {
    const selected = (pages ?? []).map((page) => page.trim()).filter(Boolean);
    if (selected.length > 0) {
      accessSubPages[tab] = selected;
    }
  }

  return {
    accessTabs: Object.keys(accessSubPages) as PermissionTabKey[],
    accessSubPages: accessSubPages as Record<PermissionTabKey, string[]>,
  };
}

export function normalizeStationPermissionsForm(
  input: StationPermissionsFormState | undefined,
): StationPermissionsFormState {
  if (!input || typeof input !== 'object') return {};
  const normalized: StationPermissionsFormState = {};
  for (const [stationId, value] of Object.entries(input)) {
    if (!stationId.trim() || !value) continue;
    normalized[stationId] = prunePermissionSelection({
      accessTabs: [...(value.accessTabs ?? [])] as PermissionTabKey[],
      accessSubPages: { ...(value.accessSubPages ?? {}) },
    });
  }
  return normalized;
}

/** Keep only permissions for currently assigned stations. */
export function pruneStationPermissionsToAssigned(
  stationPermissions: StationPermissionsFormState,
  assignedStationIds: string[],
): StationPermissionsFormState {
  const assigned = new Set(assignedStationIds);
  const pruned: StationPermissionsFormState = {};
  for (const stationId of assigned) {
    if (stationPermissions[stationId]) {
      pruned[stationId] = stationPermissions[stationId]!;
    }
  }
  return normalizeStationPermissionsForm(pruned);
}

/**
 * Backfill per-station buckets from a legacy single permissions object.
 * Used only when an account has no stationPermissions map yet.
 * Do not use this to fill a newly assigned station when other stations
 * already have their own grants — new stations must start empty.
 */
export function buildStationPermissionsFromLegacy(
  assignedStationIds: string[],
  permissions?: PanelUserPermissions,
): StationPermissionsFormState {
  if (assignedStationIds.length === 0) return {};
  const legacy = permissions ?? emptyStationPermissions();
  const map: StationPermissionsFormState = {};
  for (const stationId of assignedStationIds) {
    map[stationId] = {
      accessTabs: [...(legacy.accessTabs ?? [])],
      accessSubPages: { ...(legacy.accessSubPages ?? {}) },
    };
  }
  return map;
}

export function persistActiveStationPermissions(
  stationPermissions: StationPermissionsFormState,
  activeStationId: string | null,
  accessTabs: PermissionTabKey[],
  accessSubPages: Record<PermissionTabKey, string[]>,
): StationPermissionsFormState {
  if (!activeStationId) return stationPermissions;
  return {
    ...stationPermissions,
    [activeStationId]: prunePermissionSelection({
      accessTabs,
      accessSubPages,
    }),
  };
}

export function loadActiveStationPermissions(
  stationPermissions: StationPermissionsFormState,
  stationId: string,
): PanelUserPermissions {
  return prunePermissionSelection(
    stationPermissions[stationId] ?? emptyStationPermissions(),
  );
}

export function stationPermissionsHaveAccess(
  stationPermissions: StationPermissionsFormState,
  stationId: string,
): boolean {
  const perms = stationPermissions[stationId];
  if (!perms) return false;
  return Object.values(perms.accessSubPages ?? {}).some((pages) => pages.length > 0);
}

export function findStationWithoutPermissions(
  assignedStationIds: string[],
  stationPermissions: StationPermissionsFormState,
  accessTabs: PermissionTabKey[],
  accessSubPages: Record<PermissionTabKey, string[]>,
  activeStationId: string | null,
): string | null {
  if (assignedStationIds.length === 0) {
    const hasAccess = Object.values(accessSubPages).some((pages) => pages.length > 0);
    return hasAccess ? null : 'all';
  }

  const merged = persistActiveStationPermissions(
    stationPermissions,
    activeStationId,
    accessTabs,
    accessSubPages,
  );

  for (const stationId of assignedStationIds) {
    if (!stationPermissionsHaveAccess(merged, stationId)) {
      return stationId;
    }
  }

  return null;
}

export function validateAssignedStationPermissions(
  assignedStationIds: string[],
  stationPermissions: StationPermissionsFormState,
  accessTabs: PermissionTabKey[],
  accessSubPages: Record<PermissionTabKey, string[]>,
  activeStationId: string | null,
  stationNames?: Record<string, string>,
): string | null {
  if (assignedStationIds.length === 0) {
    const hasAccess = Object.values(accessSubPages).some((pages) => pages.length > 0);
    return hasAccess ? null : 'Enable at least one page permission before saving.';
  }

  const invalidStationId = findStationWithoutPermissions(
    assignedStationIds,
    stationPermissions,
    accessTabs,
    accessSubPages,
    activeStationId,
  );

  if (invalidStationId) {
    const stationLabel =
      stationNames?.[invalidStationId] ?? `station "${invalidStationId}"`;
    return `Station ${stationLabel} has no FRIS permissions enabled. Each assigned station must have at least one permission enabled, or remove the unneeded station on the Stations step.`;
  }

  return null;
}

