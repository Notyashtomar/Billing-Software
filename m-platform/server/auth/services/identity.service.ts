import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminService } from '../../admin/services/admin.service';
import { UserService } from '../../user/services/user.service';
import { AdminStationsService } from '../../admin-stations/services/admin-stations.service';
import { assertUserEligibleForAuthentication } from '../utils/auth-account-validation.util';
import { assertTokenVersionMatches } from '../utils/token-version.util';
import {
  TESTING_STATION_CODE,
  isTestingStationCode,
} from '../../common/station/station.constants';
import { isUniversalSuperadminUserid } from '../../user/utils/universal-superadmin.util';

export type AuthAccountType = 'admin' | 'user';
export type AuthTokenPurpose = 'access' | 'password-reset';

export interface JwtPayload {
  sub: string;
  email: string;
  accountType?: AuthAccountType;
  role?: string;
  purpose?: AuthTokenPurpose;
  /** Active admin-station id for FRIS employee sessions. */
  stationId?: string;
  /** Canonical clean station code (e.g. `DEL`) for data segregation. */
  stationCode?: string;
  /**
   * Cross-station bypass capability for admin accounts. Independent of `role`.
   * Absent ⇒ treated as `false` (deny-by-default; never grants global access).
   */
  isGlobalAdmin?: boolean;
  /** Must match the account document tokenVersion. */
  tokenVersion?: number;
}

export interface AuthenticatedPrincipal {
  id: string;
  userId: string;
  userid: string;
  email: string;
  name: string;
  role: string;
  accountType: AuthAccountType;
  active: boolean;
  stationId?: string;
  /**
   * Canonical clean station code (e.g. `DEL`) the request operates within.
   * Undefined only for a designated Global Admin (or a misconfigured account,
   * which then fails closed at data-access time).
   */
  stationCode?: string;
  /**
   * True only for explicitly designated Global Admin accounts. The single
   * source of cross-station visibility — `role` never grants it.
   */
  isGlobalAdmin?: boolean;
}

export { isActiveUserStatus } from '../utils/auth-account-validation.util';

/**
 * Stored and JWT role vocabulary is superadmin, manager, employee.
 * Legacy `admin` and `operations` are manager.
 */
export function canonicalizeRole(raw: string | null | undefined): string {
  const role = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (role === 'superadmin') return 'superadmin';
  if (role === 'manager' || role === 'admin' || role === 'operations') {
    return 'manager';
  }
  if (role === 'employee') return 'employee';
  return role;
}

export function normalizeAdminRole(raw: string | null | undefined): string {
  const role = canonicalizeRole(raw);
  if (role === 'superadmin' || role === 'manager') return role;
  return '';
}

/** FRIS panel authorization role (superadmin, manager, employee). */
export function normalizeUserRole(raw: string | null | undefined): string {
  const role = canonicalizeRole(raw);
  if (role === 'superadmin' || role === 'manager') return role;
  return 'employee';
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly adminService: AdminService,
    private readonly userService: UserService,
    private readonly adminStationsService: AdminStationsService,
  ) {}

  async resolveActivePrincipal(
    payload: JwtPayload,
  ): Promise<AuthenticatedPrincipal> {
    const subject = String(payload?.sub ?? '').trim();
    if (!Types.ObjectId.isValid(subject)) {
      throw new UnauthorizedException('Invalid token subject');
    }

    const accountType = payload.accountType;

    if (accountType === 'admin') {
      return this.resolveAdminPrincipal(subject, payload);
    }
    if (accountType === 'user') {
      return this.resolveUserPrincipal(subject, payload.stationId, payload);
    }

    // Backward compatibility for older access tokens that did not include accountType.
    try {
      return await this.resolveAdminPrincipal(subject, payload);
    } catch {
      return this.resolveUserPrincipal(subject, payload.stationId, payload);
    }
  }

  private async resolveAdminPrincipal(
    adminId: string,
    payload: JwtPayload,
  ): Promise<AuthenticatedPrincipal> {
    const admin = await this.adminService.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException('Authenticated admin no longer exists');
    }

    assertTokenVersionMatches(payload.tokenVersion, admin.tokenVersion);

    const role = normalizeAdminRole(admin.role);
    if (!role) {
      throw new UnauthorizedException('Authenticated admin has invalid role');
    }
    if (
      isTestingStationCode(payload.stationCode) &&
      !isUniversalSuperadminUserid(String(admin.userid ?? '')) &&
      role !== 'superadmin'
    ) {
      throw new UnauthorizedException(
        'Only a superadmin can use Testing FRIS.',
      );
    }

    // Visibility is driven by station assignment + the explicit global flag,
    // NEVER by role. The admin document is the source of truth; fall back to
    // resolving the code from the assigned station id for tokens issued before
    // the multi-station rollout.
    const isGlobalAdmin =
      (admin as { isGlobalAdmin?: boolean }).isGlobalAdmin === true;
    const stationId =
      String(
        payload.stationId ?? (admin as { stationId?: string }).stationId ?? '',
      ).trim() || undefined;
    let stationCode = String(
      payload.stationCode ??
        (admin as { stationCode?: string }).stationCode ??
        '',
    )
      .trim()
      .toUpperCase();
    if (!stationCode && stationId) {
      stationCode =
        (await this.adminStationsService.resolveStationCodeById(stationId)) ??
        '';
    }

    // Fail closed: a non-global admin without a resolvable station is NOT granted
    // global access. The principal carries no stationCode, so every
    // station-scoped data operation rejects via `StationScope.require()`.

    return {
      id: String(admin._id),
      userId: String(admin._id),
      userid: String(admin.userid ?? '').trim(),
      email: String(admin.email ?? '')
        .trim()
        .toLowerCase(),
      name: String(admin.name ?? '').trim(),
      role,
      accountType: 'admin',
      active: true,
      stationId,
      stationCode: stationCode || undefined,
      isGlobalAdmin,
    };
  }

  private assertUserStationSessionAccess(
    assignedStationIds: string[] | undefined,
    stationId?: string,
  ) {
    const assigned = (assignedStationIds ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean);
    const normalizedStation = stationId?.trim();

    if (assigned.length === 0) {
      return normalizedStation || undefined;
    }

    if (!normalizedStation || !assigned.includes(normalizedStation)) {
      throw new UnauthorizedException(
        'Station access is no longer valid. Please sign in again.',
      );
    }

    return normalizedStation;
  }

  private async resolveUserPrincipal(
    userId: string,
    stationId: string | undefined,
    payload: JwtPayload,
  ): Promise<AuthenticatedPrincipal> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Account is not active');
    }

    assertUserEligibleForAuthentication(user);
    assertTokenVersionMatches(payload.tokenVersion, user.tokenVersion);

    const testingSession = isTestingStationCode(payload.stationCode);
    if (testingSession) {
      const authRole =
        (user as { authorizationRole?: string }).authorizationRole ?? user.role;
      if (
        !isUniversalSuperadminUserid(user.userid) &&
        canonicalizeRole(authRole) !== 'superadmin'
      ) {
        throw new UnauthorizedException(
          'Only a superadmin can use Testing FRIS.',
        );
      }
    }

    const authRole = canonicalizeRole(
      (user as { authorizationRole?: string }).authorizationRole ?? user.role,
    );
    const panelSuperadmin =
      isUniversalSuperadminUserid(user.userid) || authRole === 'superadmin';
    // Superadmins may operate any registry station (same gate as login).
    // Other accounts stay limited to assigned stations.
    const activeStationId = testingSession
      ? undefined
      : panelSuperadmin
        ? stationId?.trim() || undefined
        : this.assertUserStationSessionAccess(user.assignedStationIds, stationId);

    // Prefer the station code embedded in the token; fall back to resolving it
    // from the active station id so access tokens issued before the multi-station
    // rollout still carry a usable stationCode.
    let stationCode = testingSession
      ? TESTING_STATION_CODE
      : String(payload.stationCode ?? '')
          .trim()
          .toUpperCase();
    if (!stationCode && activeStationId) {
      stationCode =
        (await this.adminStationsService.resolveStationCodeById(
          activeStationId,
        )) ?? '';
    }

    return {
      id: String(user._id),
      userId: String(user._id),
      userid: String(user.userid ?? '').trim(),
      email: String(user.email ?? '')
        .trim()
        .toLowerCase(),
      name: String(user.name ?? '').trim(),
      role: normalizeUserRole(
        (user as { authorizationRole?: string }).authorizationRole ?? user.role,
      ),
      accountType: 'user',
      active: true,
      stationId: activeStationId,
      stationCode: stationCode || undefined,
    };
  }
}
