import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { isUniversalSuperadminUserid } from '../../user/utils/universal-superadmin.util';

export type AdminPanelStationScope = 'all' | string[];

/** Admin-panel directory roles that see every station + unscoped invites. */
function isSuperadminRole(raw: string | null | undefined): boolean {
  return String(raw ?? '').trim().toLowerCase() === 'superadmin';
}

/**
 * Cross-station admin-panel access. Superadmin directory role, explicit
 * global flag, or the universal login id — not FRIS operational station lock.
 */
export function isAdminPanelCrossStationAccess(input: {
  principal?: Pick<
    AuthenticatedPrincipal,
    'accountType' | 'isGlobalAdmin' | 'userid' | 'role'
  > | null;
  admin?: { isGlobalAdmin?: boolean; role?: string; userid?: string } | null;
  user?: {
    isGlobalAdmin?: boolean;
    authorizationRole?: string;
    role?: string;
    userid?: string;
  } | null;
}): boolean {
  const principal = input.principal;
  if (!principal) return false;
  if (principal.isGlobalAdmin === true) return true;
  if (isUniversalSuperadminUserid(principal.userid)) return true;
  if (isSuperadminRole(principal.role)) return true;
  if (input.admin?.isGlobalAdmin === true) return true;
  if (isSuperadminRole(input.admin?.role)) return true;
  if (isUniversalSuperadminUserid(input.admin?.userid)) return true;
  if (input.user?.isGlobalAdmin === true) return true;
  if (isSuperadminRole(input.user?.authorizationRole)) return true;
  if (isUniversalSuperadminUserid(input.user?.userid)) return true;
  return false;
}

export function inviteUserHasNoStationBinding(user: {
  assignedStationIds?: unknown;
  station?: unknown;
}): boolean {
  const assigned = Array.isArray(user.assignedStationIds)
    ? user.assignedStationIds.map(String).filter(Boolean)
    : [];
  return assigned.length === 0 && !String(user.station ?? '').trim();
}

/**
 * Admin-station document ids the signed-in principal may access in the admin
 * panel. Global admins see every station; station-assigned admins see only
 * theirs. Fail closed when no assignment exists.
 */
export function resolveAdminPanelStationScope(
  principal: AuthenticatedPrincipal | null | undefined,
): AdminPanelStationScope {
  if (!principal) return [];
  if (principal.accountType === 'admin' && principal.isGlobalAdmin === true) {
    return 'all';
  }
  const stationId = String(principal.stationId ?? '').trim();
  return stationId ? [stationId] : [];
}

/** Mongo filter for admin-station registry reads scoped to the principal. */
export function adminPanelStationRegistryFilter(
  scope: AdminPanelStationScope,
): Record<string, unknown> {
  if (scope === 'all') return {};
  if (!scope.length) return { _id: { $in: [] } };
  return { _id: { $in: scope } };
}

export function assertAdminPanelStationAccess(
  scope: AdminPanelStationScope,
  stationId: string,
): void {
  const id = String(stationId ?? '').trim();
  if (!id) {
    throw new ForbiddenException('Station access denied');
  }
  if (scope === 'all') return;
  if (!scope.includes(id)) {
    throw new ForbiddenException('You do not have access to this station');
  }
}

type StationLabelSource = {
  code?: unknown;
  name?: unknown;
  city?: unknown;
  stationCode?: unknown;
};

function resolveStationDisplayCode(station: StationLabelSource): string {
  const registryCode = String(station.stationCode ?? '').trim();
  if (registryCode) return registryCode.toUpperCase();
  const head = String(station.code ?? '')
    .trim()
    .split(/\s*-\s*/)[0]
    ?.trim();
  return head ? head.toUpperCase() : '';
}

/** `CODE — airport name` label used on invites and registration forms. */
export function formatAdminStationLabel(station: StationLabelSource): string {
  const code = resolveStationDisplayCode(station);
  const airportName = String(station.name ?? '').trim();
  if (!code) return airportName;
  if (!airportName || airportName.toUpperCase() === code) return code;
  return `${code} — ${airportName}`;
}

export function userBelongsToAdminPanelStationScope(
  scope: AdminPanelStationScope,
  user: {
    assignedStationIds?: unknown;
    station?: unknown;
  },
  allowedStationIds: Set<string>,
  allowedStationLabels: Set<string>,
): boolean {
  if (scope === 'all') return true;

  const assigned = Array.isArray(user.assignedStationIds)
    ? user.assignedStationIds.map(String).filter(Boolean)
    : [];
  if (assigned.some((id) => allowedStationIds.has(id))) return true;

  const stationLabel = String(user.station ?? '').trim();
  if (stationLabel && allowedStationLabels.has(stationLabel)) return true;

  return false;
}
