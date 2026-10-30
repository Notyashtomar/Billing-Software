import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserService } from 'src/user/services/user.service';
import {
  buildFlagsFromPermissions,
  normalizeAccessSubPages,
  PERMISSION_SUB_PAGES,
} from 'src/user/utils/permissions-to-flags';
import {
  buildFlagsForStationContext,
  resolveFrisLandingPathFromAccessSubPages,
  resolveFrisSessionPermissionScope,
  validateUserStationLoginAccess,
} from 'src/user/utils/station-permissions.util';
import {
  resolveAppAccessForStation,
} from 'src/user/utils/bwms-app-access.util';
import {
  resolveAppPageAccessForStation,
} from 'src/user/utils/bwms-app-page-access.util';
import { isUniversalSuperadminUserid } from 'src/user/utils/universal-superadmin.util';
import {
  TESTING_STATION_CODE,
  isTestingStationCode,
} from 'src/common/station/station.constants';
import type { UserFlags } from 'src/user/schema/user.schema';
import {
  FRIS_ADVANCE_TAB_PERMISSION,
  FRIS_CREATION_SECTION_PERMISSION,
  isFrisSubPageAllowed,
  resolveAdvanceTabRedirect,
  resolveCreationSectionRedirect,
} from '../utils/fris-navigation.util';
import { AdminService } from 'src/admin/services/admin.service';
import { encryptPassword } from '../../common/security/password-vault.util';
import { AuthAttemptTrackerService } from '../../protection/services/auth-attempt-tracker.service';
import { ProtectionLogEvent } from '../../protection/logging/protection-log-events';
import { ProtectionLoggerService } from '../../protection/logging/protection-logger.service';
import type { AdminDocument } from 'src/admin/schema/admin.schema';
import type { UserDocument } from 'src/user/schema/user.schema';
import { OtpMailerService } from './otp-mailer.service';
import { OtpStoreService } from './otp-store.service';
import {
  RawFlightDataService,
} from 'src/raw-flight-data/services/raw-flight-data.service';
import { invalidateListDailyFromAdvanceCache } from 'src/raw-flight-data/utils/list-daily-from-advance-cache.util';
import { FlightCancellationsService } from 'src/flight-cancellations/flight-cancellations.service';
import { sanitizeAttachmentBase64 } from 'src/flight-cancellations/utils/cancellation-attachment.util';
import { type CancelFlightKind } from 'src/flight-cancellations/dto/cancel-flight.dto';
import { FlightInstanceStateService } from 'src/flight-instance-state/flight-instance-state.service';
import { MainDetailsService } from 'src/main-details/services/main-details.service';
import {
  AuthAccountType,
  AuthenticatedPrincipal,
  JwtPayload,
  normalizeAdminRole,
  normalizeUserRole,
  IdentityService,
} from './identity.service';
import { assertUserEligibleForAuthentication } from '../utils/auth-account-validation.util';
import {
  PASSWORD_RESET_OTP,
  PASSWORD_RESET_OTP_MESSAGES,
} from '../constants/password-reset-otp.constants';
import type {
  SendPasswordResetOtpDto,
  VerifyPasswordResetOtpDto,
  VerifyPasswordResetOtpOnlyDto,
} from '../dto/password-reset-otp.dto';
import { getPasswordPolicyMessages } from '../../common/validators/password-policy';
import { verifyAdminTotp } from '../utils/admin-mfa.util';
import { normalizeTokenVersion } from '../utils/token-version.util';
import { USER_ACTIVITY_LOG_EVENT } from '../../user-activity-notifications/events/user-activity.events';
import { humanizeRole } from '../../user-activity-notifications/utils/audit-format.util';
import {
  deriveClientPageLocation,
  isUntrackedClientPath,
} from '../../user-activity-notifications/utils/describe-user-action.util';
import { extractClientIp } from '../../admin-audit/utils/parse-user-agent.util';
import type { Request } from 'express';
import {
  extractAdminAuthCookieToken,
  extractFrisAuthCookieToken,
} from '../utils/auth-cookie.util';
import { MessagingRecorderService } from '../../admin-messaging/services/messaging-recorder.service';
import { AdminStationsService } from '../../admin-stations/services/admin-stations.service';
import {
  CROSS_STATION_SYSTEM_SCOPE,
  fixedStationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

type AuthUser = AdminDocument | UserDocument | null;
type OtpPurpose =
  | 'cancel-step-1'
  | 'cancel-step-2'
  | 'reopen-step-1'
  | 'reopen-step-2';
type CancellationAttachment = {
  fileName?: string;
  mimeType?: string;
  base64?: string;
};

type CancellationFormPayload = {
  intimationTime?: string;
  intimatedBy?: string;
  intimationPersonEmail?: string;
  intimationMode?: string;
  proofNote?: string;
  attachment?: CancellationAttachment;
};

type CancellationFlightSnapshot = {
  airlineName?: string;
  serialNumber?: string;
  flightNo?: string;
  aircraftType?: string;
  airlineRepresentativeName?: string;
  route?: string;
  source?: string;
  destination?: string;
  staDate?: string;
  staTime?: string;
  stdDate?: string;
  stdTime?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private otpStore = new Map<
    string,
    { hash: string; expiresAt: number; tries: number; used?: boolean }
  >();
  private otpRateStore = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();
  private otpTTLms = 3 * 60 * 1000;
  private otpRateWindowMs = Number(
    process.env.OTP_RATE_WINDOW_MS || 2 * 60 * 1000,
  );
  private otpRateLimit = Number(process.env.OTP_RATE_LIMIT || 10);
  private otpMaxTries = 5;
  /** Single-use password-reset JWT ids (jti → expiresAt ms). */
  private readonly consumedResetJtis = new Map<string, number>();
  /**
   * Short-lived sessions after OTP verify succeeds, before password is saved.
   * Keyed by password-reset OTP key (scope + canonical account id + email).
   */
  private readonly passwordResetVerifiedStore = new Map<
    string,
    { accountDocId: string; expiresAt: number }
  >();

  constructor(
    private userService: UserService,
    private adminService: AdminService,
    private readonly identityService: IdentityService,
    private jwtService: JwtService,
    private otpMailerService: OtpMailerService,
    private readonly otpStoreService: OtpStoreService,
    private rawFlightDataService: RawFlightDataService,
    private flightCancellationsService: FlightCancellationsService,
    private flightInstanceStateService: FlightInstanceStateService,
    private mainDetailsService: MainDetailsService,
    private readonly authAttemptTracker: AuthAttemptTrackerService,
    private readonly protectionLogger: ProtectionLoggerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly adminStationsService: AdminStationsService,
    @Optional()
    @Inject(forwardRef(() => MessagingRecorderService))
    private readonly messagingRecorder?: MessagingRecorderService,
  ) {}

  /** Throttle identical page-presence beacons (path + user). */
  private readonly pagePresenceThrottle = new Map<
    string,
    { path: string; at: number }
  >();

  /**
   * Record the browser page the signed-in user is currently viewing.
   * Used by the station login “current page” hover + live presence.
   */
  recordPagePresence(
    user: AuthenticatedPrincipal,
    rawPath: string,
  ): { ok: true; skipped?: boolean } {
    const path = String(rawPath ?? '').trim().slice(0, 500);
    if (!path || !path.startsWith('/')) {
      throw new BadRequestException('path must be an app pathname');
    }
    if (isUntrackedClientPath(path)) {
      return { ok: true, skipped: true };
    }
    // Never accept absolute URLs / protocol-relative paths.
    if (path.includes('://') || path.startsWith('//')) {
      throw new BadRequestException('Invalid path');
    }

    const userId = String(user.userId ?? '').trim();
    if (!userId) {
      throw new UnauthorizedException('Sign-in required');
    }

    const now = Date.now();
    const prev = this.pagePresenceThrottle.get(userId);
    if (prev && prev.path === path && now - prev.at < 30_000) {
      return { ok: true, skipped: true };
    }
    this.pagePresenceThrottle.set(userId, { path, at: now });
    // Bound memory for long-lived processes.
    if (this.pagePresenceThrottle.size > 5000) {
      const cutoff = now - 10 * 60_000;
      for (const [key, value] of this.pagePresenceThrottle) {
        if (value.at < cutoff) this.pagePresenceThrottle.delete(key);
      }
    }

    const loc = deriveClientPageLocation(path);
    const actorName = String(user.name ?? user.userid ?? user.email ?? 'User');
    const stationCode = String(user.stationCode ?? '').trim();
    const pageLabel =
      [loc.systemLabel || loc.module, loc.page, loc.tab].filter(Boolean).join(' · ') ||
      path;

    this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
      userId,
      userName: actorName,
      userEmail: user.email,
      accountType: user.accountType === 'admin' ? 'admin' : 'user',
      action: 'Viewing page',
      summary: `${actorName} is viewing ${pageLabel} on ${loc.systemLabel || 'BWMS'}.`,
      actorRole: humanizeRole(user.role),
      module: loc.module || 'App',
      page: loc.page || path,
      tab: loc.tab || undefined,
      stationId: String(user.stationId ?? '').trim() || undefined,
      stationName: stationCode || undefined,
      method: 'POST',
      path,
      metadata: {
        clientPath: path,
        pagePresence: true,
        systemId: loc.systemId || undefined,
        systemLabel: loc.systemLabel || undefined,
      },
    });

    return { ok: true };
  }

  /**
   * Re-authenticate the current session with the account password.
   * Used for destructive confirmations (e.g. deleting a schedule master).
   */
  async confirmPassword(
    user: AuthenticatedPrincipal,
    password: string,
  ): Promise<{ ok: true }> {
    const plain = String(password ?? '');
    if (!plain) {
      throw new BadRequestException('Password is required');
    }

    let storedHash = '';
    if (user.accountType === 'admin') {
      const admin = await this.adminService.findById(user.userId);
      storedHash = String(admin?.password ?? '');
    } else {
      const panelUser = await this.userService.findByUserId(user.userid, true);
      storedHash = String(panelUser?.password ?? '');
    }

    if (!storedHash || !(await bcrypt.compare(plain, storedHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    return { ok: true };
  }

  async getSession(user: AuthenticatedPrincipal) {
    const accountType = user.accountType;

    if (accountType === 'admin') {
      const admin = await this.adminService.findById(user.userId);
      if (!admin) {
        throw new UnauthorizedException('Authenticated admin no longer exists');
      }

      const adminIsSuper = this.isEffectiveSuperadmin(admin.role, admin.userid);
      const adminFlags = adminIsSuper
        ? this.buildFullAccessFlags()
        : admin.flags && Object.keys(admin.flags).length > 0
          ? admin.flags
          : admin.permissions
            ? buildFlagsFromPermissions(
                normalizeAccessSubPages(
                  admin.permissions.accessTabs ?? [],
                  admin.permissions.accessSubPages ?? {},
                ),
              )
            : undefined;

      const adminUser: Record<string, unknown> = {
        userid: admin.userid,
        name: admin.name,
        email: admin.email,
        role: this.effectiveAuthRole(admin.role, admin.userid),
      };
      if (adminFlags && Object.keys(adminFlags).length > 0) {
        adminUser.flags = adminFlags;
      }
      // Carry the JWT active-station into the session payload so the profile
      // dropdown (and other clients) can show Station after admin login.
      const sessionStationId = String(user.stationId ?? '').trim();
      const sessionStationCode = String(user.stationCode ?? '')
        .trim()
        .toUpperCase();
      if (sessionStationId) {
        adminUser.stationId = sessionStationId;
      }
      if (sessionStationCode) {
        adminUser.stationCode = sessionStationCode;
      }
      // Admin directory logins must still populate BWMS tile grants.
      this.appendAppAccess(
        adminUser,
        null,
        sessionStationId || user.stationId,
        admin.role,
        admin.userid,
      );

      return {
        success: true,
        user: adminUser,
        collection: 'admin',
      };
    }

    const panelUser = await this.userService.findById(user.userId);
    if (!panelUser) {
      throw new UnauthorizedException('Authenticated user no longer exists');
    }

    const perms = panelUser.permissions;
    const authRole = this.effectiveAuthRole(
      (panelUser as { authorizationRole?: string }).authorizationRole ??
        panelUser.role,
      panelUser.userid,
    );
    const effectiveFlags =
      authRole === 'superadmin'
        ? this.buildFullAccessFlags()
        : buildFlagsForStationContext({
            assignedStationIds: panelUser.assignedStationIds,
            stationPermissions: panelUser.stationPermissions as Record<
              string,
              { accessTabs: string[]; accessSubPages: Record<string, string[]> }
            >,
            permissions: perms,
            flags: panelUser.flags,
            stationId: user.stationId,
          });

    const userResponse: Record<string, unknown> = {
      userid: panelUser.userid,
      name: panelUser.name,
      email: panelUser.email,
    };

    if (panelUser.department) {
      userResponse.department = panelUser.department;
    }
    if (authRole !== 'employee') {
      userResponse.role = authRole;
    }
    if (user.stationId) {
      userResponse.stationId = user.stationId;
    }
    if (user.stationCode) {
      userResponse.stationCode = user.stationCode;
    }
    if (Object.keys(effectiveFlags).length > 0) {
      userResponse.flags = effectiveFlags;
    }
    this.appendFrisPermissionScope(
      userResponse,
      panelUser,
      user.stationId,
      authRole,
      panelUser.userid,
    );
    this.appendAppAccess(
      userResponse,
      panelUser,
      user.stationId,
      authRole,
      panelUser.userid,
    );
    this.appendPanelProfileFields(userResponse, panelUser);

    return {
      success: true,
      user: userResponse,
      collection: 'users',
    };
  }

  /** Validates the FRIS httpOnly cookie and returns the same shape as {@link getSession}. */
  async getFrisSessionFromRequest(req: Request) {
    const token = extractFrisAuthCookieToken(req);
    if (!token) {
      throw new UnauthorizedException('FRIS sign-in required');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Invalid session');
    }

    const principal = await this.identityService.resolveActivePrincipal(payload);
    return this.getSession(principal);
  }

  /**
   * Rebind the current FRIS session to another station without a new password.
   * Superadmins only. Issues a replacement access cookie; tokenVersion is unchanged
   * so other devices stay signed in.
   */
  async switchFrisStation(
    principal: AuthenticatedPrincipal,
    rawStationCode: string,
    options?: { handoff?: boolean },
  ) {
    const role = String(principal.role ?? '').trim().toLowerCase();
    const universal = isUniversalSuperadminUserid(principal.userid);
    const handoff = options?.handoff === true;
    if (!handoff && role !== 'superadmin' && !universal) {
      throw new ForbiddenException(
        'Only a superadmin can change station without signing out.',
      );
    }

    const requested = String(rawStationCode ?? '').trim().toUpperCase();
    if (!requested) {
      throw new BadRequestException('Station code is required.');
    }
    if (handoff && role !== 'superadmin' && !universal) {
      const own = String(principal.stationCode ?? '').trim().toUpperCase();
      if (own && requested !== own) {
        throw new ForbiddenException('This sign-in link is for a different station.');
      }
    }

    let stationId: string | undefined;
    let stationCode = requested;
    if (isTestingStationCode(requested)) {
      stationCode = TESTING_STATION_CODE;
    } else {
      const resolvedId =
        await this.adminStationsService.resolveStationIdByCode(requested);
      if (!resolvedId) {
        throw new BadRequestException('That station is not available.');
      }
      stationId = resolvedId;
      stationCode =
        (await this.adminStationsService.resolveStationCodeById(resolvedId)) ??
        requested;
    }

    let tokenVersion = 0;
    let email = String(principal.email ?? '').trim().toLowerCase();
    let isGlobalAdmin = principal.isGlobalAdmin === true;
    let jwtRole = role;

    if (principal.accountType === 'admin') {
      const admin = await this.adminService.findById(principal.userId);
      if (!admin) {
        throw new UnauthorizedException('Authenticated admin no longer exists');
      }
      tokenVersion = normalizeTokenVersion(admin.tokenVersion);
      email = String(admin.email ?? email).trim().toLowerCase();
      jwtRole = this.effectiveAuthRole(admin.role, admin.userid);
      isGlobalAdmin =
        admin.isGlobalAdmin === true ||
        isUniversalSuperadminUserid(admin.userid);
    } else {
      const user = await this.userService.findById(principal.userId);
      if (!user) {
        throw new UnauthorizedException('Account is not active');
      }
      tokenVersion = normalizeTokenVersion(user.tokenVersion);
      email = String(user.email ?? email).trim().toLowerCase();
      jwtRole = this.effectiveAuthRole(
        user.authorizationRole ?? user.role,
        user.userid,
      );
    }

    const payload: JwtPayload = {
      sub: principal.userId,
      email,
      accountType: principal.accountType,
      role: jwtRole,
      purpose: 'access',
      tokenVersion,
    };
    if (isGlobalAdmin) payload.isGlobalAdmin = true;
    if (stationId) payload.stationId = stationId;
    if (stationCode) payload.stationCode = stationCode;

    this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
      userId: principal.userId,
      userName: principal.name || principal.userid,
      userEmail: email,
      accountType: principal.accountType,
      action: 'Changed FRIS station',
      summary: `${principal.name || principal.userid} switched the active station to ${stationCode}.`,
      actorRole: humanizeRole(jwtRole),
      module: 'Authentication',
      page: 'Navbar',
      stationId,
      stationName: stationCode,
      method: 'POST',
      path: '/auth/switch-station',
      bumpLastActivity: false,
    });

    return {
      success: true,
      message: 'Station updated',
      access_token: this.jwtService.sign(payload),
      stationId: stationId ?? '',
      stationCode,
    };
  }

  /** Short-lived token so billing on another host can open live FRIS already signed in. */
  async createFrisHandoff(
    principal: AuthenticatedPrincipal,
  ): Promise<{ code: string }> {
    let tokenVersion = 0;
    if (principal.accountType === 'admin') {
      const admin = await this.adminService.findById(principal.userId);
      tokenVersion = normalizeTokenVersion(admin?.tokenVersion);
    } else {
      const user = await this.userService.findById(principal.userId);
      tokenVersion = normalizeTokenVersion(user?.tokenVersion);
    }
    const code = this.jwtService.sign(
      {
        sub: principal.userId,
        email: principal.email,
        accountType: principal.accountType,
        role: principal.role,
        purpose: 'fris-handoff',
        stationId: principal.stationId,
        stationCode: principal.stationCode,
        tokenVersion,
      },
      { expiresIn: '90s' },
    );
    return { code };
  }

  /** Verify a billing handoff and issue the normal FRIS session cookie. */
  async redeemFrisHandoff(rawCode: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(String(rawCode ?? '').trim());
    } catch {
      throw new UnauthorizedException(
        'Sign-in link expired. Open Flights again from billing.',
      );
    }
    if (payload.purpose !== 'fris-handoff') {
      throw new UnauthorizedException('Invalid sign-in link.');
    }
    const principal = await this.identityService.resolveActivePrincipal({
      ...payload,
      purpose: 'access',
    });
    const stationCode = String(
      payload.stationCode || principal.stationCode || '',
    ).trim();
    if (!stationCode) {
      throw new UnauthorizedException('Sign-in link has no station.');
    }
    return this.switchFrisStation(principal, stationCode, { handoff: true });
  }

  private async resolveEffectiveUserFlags(
    user: AuthenticatedPrincipal,
  ): Promise<UserFlags | undefined> {
    if (user.accountType === 'admin') {
      const admin = await this.adminService.findById(user.userId);
      if (!admin) {
        throw new UnauthorizedException('Authenticated admin no longer exists');
      }
      if (this.isEffectiveSuperadmin(admin.role, admin.userid)) {
        return this.buildFullAccessFlags();
      }
      if (admin.flags && Object.keys(admin.flags).length > 0) {
        return admin.flags;
      }
      if (admin.permissions) {
        return buildFlagsFromPermissions(
          normalizeAccessSubPages(
            admin.permissions.accessTabs ?? [],
            admin.permissions.accessSubPages ?? {},
          ),
        );
      }
      return undefined;
    }

    const panelUser = await this.userService.findById(user.userId);
    if (!panelUser) {
      throw new UnauthorizedException('Authenticated user no longer exists');
    }

    const authRole = this.effectiveAuthRole(
      (panelUser as { authorizationRole?: string }).authorizationRole ??
        panelUser.role,
      panelUser.userid,
    );
    if (authRole === 'superadmin') {
      return this.buildFullAccessFlags();
    }

    return buildFlagsForStationContext({
      assignedStationIds: panelUser.assignedStationIds,
      stationPermissions: panelUser.stationPermissions as Record<
        string,
        { accessTabs: string[]; accessSubPages: Record<string, string[]> }
      >,
      permissions: panelUser.permissions,
      flags: panelUser.flags,
      stationId: user.stationId,
    });
  }

  private buildFullAccessFlags(): UserFlags {
    const accessTabs = Object.keys(PERMISSION_SUB_PAGES);
    return buildFlagsFromPermissions(normalizeAccessSubPages(accessTabs, {}));
  }

  private isPanelSuperadminRole(role: string | null | undefined): boolean {
    return normalizeUserRole(role) === 'superadmin';
  }

  /**
   * Effective BWMS / FRIS superadmin: role, or canonical universal userid
   * (`supadm123`) which always has every tile + page at every station.
   */
  private isEffectiveSuperadmin(
    role: string | null | undefined,
    userid?: string | null,
  ): boolean {
    if (isUniversalSuperadminUserid(userid)) return true;
    if (normalizeUserRole(role) === 'superadmin') return true;
    // Admin-directory seed may store role as "superadmin" via normalizeAdminRole.
    return normalizeAdminRole(role) === 'superadmin';
  }

  /** Force session role label for universal id so clients store `userRole=superadmin`. */
  private effectiveAuthRole(
    role: string | null | undefined,
    userid?: string | null,
  ): string {
    if (isUniversalSuperadminUserid(userid)) return 'superadmin';
    const panel = normalizeUserRole(role);
    if (panel === 'superadmin') return 'superadmin';
    const admin = normalizeAdminRole(role);
    return admin || panel;
  }

  /** Non-secret HR / org fields for FRIS View Profile (from panel user document). */
  private appendPanelProfileFields(
    target: Record<string, unknown>,
    panelUser: UserDocument,
  ): void {
    const pick = (key: string, value: unknown) => {
      if (value == null) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) target[key] = trimmed;
        return;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        target[key] = value;
      }
    };

    pick('gender', panelUser.gender);
    pick('joiningDate', panelUser.joiningDate);
    pick('designation', panelUser.designation);
    pick('employeeId', panelUser.employeeId);
    pick('phone', panelUser.phone);
    pick('company', panelUser.company);
    pick('station', panelUser.station);
    pick('locations', panelUser.locations);
    pick('city', panelUser.city);
    pick('departmentLabel', panelUser.departmentLabel);
    pick('subDepartment', panelUser.subDepartment);

    if (!target.email && panelUser.companyEmail) {
      pick('email', panelUser.companyEmail);
    }
  }

  private appendFrisPermissionScope(
    target: Record<string, unknown>,
    panelUser: UserDocument,
    stationId?: string,
    authRole?: string,
    userid?: string | null,
  ): void {
    if (this.isEffectiveSuperadmin(authRole, userid ?? panelUser.userid)) {
      target.landingPath = '/fris/dashboard';
      return;
    }

    const scope = resolveFrisSessionPermissionScope({
      assignedStationIds: panelUser.assignedStationIds,
      stationPermissions: panelUser.stationPermissions as Record<
        string,
        { accessTabs: string[]; accessSubPages: Record<string, string[]> }
      >,
      permissions: panelUser.permissions,
      stationId,
    });
    target.permissionScope = scope;
    target.landingPath = resolveFrisLandingPathFromAccessSubPages(
      scope.accessSubPages,
    );
  }

  /** Enabled BWMS login-tile ids + resolved page grants for the active station. */
  private appendAppAccess(
    target: Record<string, unknown>,
    panelUser: UserDocument | null,
    stationId?: string,
    authRole?: string,
    userid?: string | null,
  ): void {
    const isSuperadmin = this.isEffectiveSuperadmin(
      authRole,
      userid ?? panelUser?.userid,
    );
    const stationAppAccess = (panelUser?.stationAppAccess ?? {}) as Record<
      string,
      string[]
    >;
    const stationAppPageAccess = (panelUser?.stationAppPageAccess ??
      {}) as Record<string, Record<string, string[]>>;
    target.appAccess = resolveAppAccessForStation(
      stationAppAccess,
      stationId,
      isSuperadmin,
    );
    target.appPageAccess = resolveAppPageAccessForStation(
      stationAppAccess,
      stationAppPageAccess,
      stationId,
      isSuperadmin,
    );
  }

  /** Billing tile grant from admin BWMS tools (`billing-finance`). */
  private async hasBillingFinanceAppAccess(
    user: AuthenticatedPrincipal,
  ): Promise<boolean> {
    if (user.accountType === 'admin') return true;
    if (this.isEffectiveSuperadmin(user.role, user.userid)) return true;
    const panelRole = normalizeUserRole(user.role);
    if (panelRole === 'superadmin' || panelRole === 'manager') return true;

    const panelUser = await this.userService.findById(user.userId);
    if (!panelUser) return false;

    const apps = resolveAppAccessForStation(
      (panelUser.stationAppAccess ?? {}) as Record<string, string[]>,
      user.stationId,
      false,
    );
    return apps.includes('billing-finance');
  }

  async resolveFrisAdvanceNavigation(
    user: AuthenticatedPrincipal,
    tab: string,
  ) {
    const normalizedTab = String(tab ?? '').trim();
    const redirectPath = resolveAdvanceTabRedirect(normalizedTab);
    if (!redirectPath) {
      throw new BadRequestException('Unknown Advance tab');
    }

    if (user.accountType === 'admin') {
      return { success: true, redirectPath };
    }

    const panelRole = normalizeUserRole(user.role);
    // Superadmins (and managers, matching assertFrisPageAccess) see every Advance page.
    if (panelRole === 'superadmin' || panelRole === 'manager') {
      return { success: true, redirectPath };
    }

    const flags = await this.resolveEffectiveUserFlags(user);
    const permissionLabel = FRIS_ADVANCE_TAB_PERMISSION[normalizedTab];
    if (
      !permissionLabel ||
      !isFrisSubPageAllowed(flags, 'advance', permissionLabel)
    ) {
      throw new ForbiddenException(
        'You do not have access to this Advance section',
      );
    }

    return { success: true, redirectPath };
  }

  async resolveFrisCreationNavigation(
    user: AuthenticatedPrincipal,
    section: string,
  ) {
    const normalizedSection = String(section ?? '').trim();
    const redirectPath = resolveCreationSectionRedirect(normalizedSection);
    if (!redirectPath) {
      throw new BadRequestException('Unknown Creation section');
    }

    if (user.accountType === 'admin') {
      return { success: true, redirectPath };
    }

    const panelRole = normalizeUserRole(user.role);
    if (panelRole === 'superadmin' || panelRole === 'manager') {
      return { success: true, redirectPath };
    }

    const flags = await this.resolveEffectiveUserFlags(user);
    const permissionLabel = FRIS_CREATION_SECTION_PERMISSION[normalizedSection];
    if (
      !permissionLabel ||
      !isFrisSubPageAllowed(flags, 'creation', permissionLabel)
    ) {
      throw new ForbiddenException(
        'You do not have access to this Creation section',
      );
    }

    return { success: true, redirectPath };
  }

  async assertFrisPageAccess(
    user: AuthenticatedPrincipal | undefined,
    tab: string,
    pageLabel: string,
  ): Promise<void> {
    if (!(await this.hasFrisPageAccess(user, tab, pageLabel))) {
      if (!user) {
        throw new UnauthorizedException('Authentication is required');
      }
      throw new ForbiddenException(
        `You do not have permission to access ${pageLabel}`,
      );
    }
  }

  /** Soft check used by multi-page (`any of`) permission gates. */
  async hasFrisPageAccess(
    user: AuthenticatedPrincipal | undefined,
    tab: string,
    pageLabel: string,
  ): Promise<boolean> {
    if (!user) return false;
    if (user.accountType === 'admin') return true;
    const panelRole = normalizeUserRole(user.role);
    if (panelRole === 'superadmin' || panelRole === 'manager') return true;

    // Billing system: Advance → Invoicing OR admin BWMS tools → Billing tile.
    if (
      tab === 'advance' &&
      pageLabel === 'Invoicing' &&
      (await this.hasBillingFinanceAppAccess(user))
    ) {
      return true;
    }

    const flags = await this.resolveEffectiveUserFlags(user);
    return isFrisSubPageAllowed(flags, tab, pageLabel);
  }

  private normalizeToYmd(raw: string): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
    const dash = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (dash) return `${dash[3]}-${dash[2]}-${dash[1]}`;
    return null;
  }

  private parseMainDetailsSerial(raw: string): number | null {
    const trimmed = String(raw ?? '')
      .trim()
      .replace(/^FL-/i, '');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  }

  private otpSecret(): string {
    const secret =
      process.env.CANCEL_OTP_SECRET?.trim() || process.env.JWT_SECRET?.trim();
    if (secret) return secret;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CANCEL_OTP_SECRET or JWT_SECRET must be set in production',
      );
    }
    return 'dev-otp-secret';
  }

  private otpKey(email: string, flightId: string, purpose: OtpPurpose): string {
    return `${email.toLowerCase()}::${flightId}::${purpose}`;
  }

  private hashOtp(raw: string): string {
    return crypto
      .createHmac('sha256', this.otpSecret())
      .update(raw)
      .digest('hex');
  }

  private issueOtp(email: string, flightId: string, purpose: OtpPurpose) {
    const now = Date.now();
    const rateKey = `${email.toLowerCase()}::${purpose}`;
    const rl = this.otpRateStore.get(rateKey);
    if (
      rl &&
      now - rl.windowStartedAt < this.otpRateWindowMs &&
      rl.count >= this.otpRateLimit
    ) {
      const retryInMs = this.otpRateWindowMs - (now - rl.windowStartedAt);
      const retryInSec = Math.max(1, Math.ceil(retryInMs / 1000));
      this.protectionLogger.logEvent(ProtectionLogEvent.RATE_LIMIT_BLOCKED, {
        category: 'AUTH_OTP',
        route: 'auth:otp',
        userId: email,
        retryAfter: retryInSec,
        timestamp: new Date().toISOString(),
        securityIssue: false,
      });
      return {
        ok: false as const,
        message: `OTP rate limit exceeded. Try again in ${retryInSec}s.`,
      };
    }
    if (!rl || now - rl.windowStartedAt >= this.otpRateWindowMs) {
      this.otpRateStore.set(rateKey, { count: 1, windowStartedAt: now });
    } else {
      this.otpRateStore.set(rateKey, { ...rl, count: rl.count + 1 });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const key = this.otpKey(email, flightId, purpose);
    const entry = {
      hash: this.hashOtp(`${otp}:${email}:${flightId}:${purpose}`),
      expiresAt: now + this.otpTTLms,
      tries: 0,
    };
    this.otpStore.set(key, entry);
    void this.otpStoreService.setOtp(key, entry, this.otpTTLms);
    return { ok: true as const, otp };
  }

  private async verifyIssuedOtp(
    email: string,
    flightId: string,
    purpose: OtpPurpose,
    otp: string,
  ) {
    const key = this.otpKey(email, flightId, purpose);
    const rec =
      (await this.otpStoreService.getOtp(key)) ?? this.otpStore.get(key) ?? null;
    if (!rec)
      return {
        ok: false as const,
        message: 'OTP not found. Please send OTP again.',
      };
    if (Date.now() > rec.expiresAt) {
      this.otpStore.delete(key);
      await this.otpStoreService.deleteOtp(key);
      return {
        ok: false as const,
        message: 'OTP expired. Please send OTP again.',
      };
    }
    if (rec.tries >= this.otpMaxTries) {
      this.otpStore.delete(key);
      await this.otpStoreService.deleteOtp(key);
      return { ok: false as const, message: 'Too many invalid attempts.' };
    }
    const expected = this.hashOtp(`${otp}:${email}:${flightId}:${purpose}`);
    if (expected !== rec.hash) {
      rec.tries += 1;
      this.otpStore.set(key, rec);
      await this.otpStoreService.setOtp(
        key,
        rec,
        Math.max(1, rec.expiresAt - Date.now()),
      );
      return { ok: false as const, message: 'Invalid OTP.' };
    }
    this.otpStore.delete(key);
    await this.otpStoreService.deleteOtp(key);
    return { ok: true as const };
  }

  private async verifyIssuedOtpWithPurposeFallback(
    email: string,
    flightId: string,
    preferredPurpose: OtpPurpose,
    otp: string,
  ): Promise<
    { ok: true; matchedPurpose: OtpPurpose } | { ok: false; message: string }
  > {
    const fallbackOrder: OtpPurpose[] =
      preferredPurpose === 'reopen-step-1'
        ? ['reopen-step-1', 'cancel-step-1']
        : preferredPurpose === 'reopen-step-2'
          ? ['reopen-step-2', 'cancel-step-2']
          : preferredPurpose === 'cancel-step-1'
            ? ['cancel-step-1', 'reopen-step-1']
            : ['cancel-step-2', 'reopen-step-2'];

    let lastMessage = 'OTP not found. Please send OTP again.';
    for (const p of fallbackOrder) {
      const result = await this.verifyIssuedOtp(email, flightId, p, otp);
      if (result.ok) {
        return { ok: true, matchedPurpose: p };
      }
      lastMessage = result.message;
      // For invalid/expired/too-many-attempts, stop early; fallback is only useful for "not found" key mismatch.
      if (
        result.message !== 'OTP not found. Please send OTP again.' &&
        result.message !== 'OTP expired. Please send OTP again.'
      ) {
        return { ok: false, message: result.message };
      }
    }
    return { ok: false, message: lastMessage };
  }

  private rollbackOtpIssue(
    email: string,
    flightId: string,
    purpose: OtpPurpose,
  ) {
    const key = this.otpKey(email, flightId, purpose);
    this.otpStore.delete(key);
    void this.otpStoreService.deleteOtp(key);
    const rateKey = `${email.toLowerCase()}::${purpose}`;
    const rl = this.otpRateStore.get(rateKey);
    if (rl && rl.count > 0) {
      this.otpRateStore.set(rateKey, { ...rl, count: rl.count - 1 });
    }
  }

  /** Effective module flags for a FRIS panel user (DB flags, falling back to derived permissions). */
  private resolveUserFlags(user: UserDocument): UserFlags | undefined {
    const u = user as unknown as {
      flags?: UserFlags;
      permissions?: {
        accessTabs?: string[];
        accessSubPages?: Record<string, string[]>;
      };
    };
    if (u.flags && Object.keys(u.flags).length > 0) {
      return u.flags;
    }
    if (u.permissions) {
      return buildFlagsFromPermissions(
        normalizeAccessSubPages(
          u.permissions.accessTabs ?? [],
          u.permissions.accessSubPages ?? {},
        ),
      );
    }
    return undefined;
  }

  /**
   * Resolve the actor (email/name/userid) performing a cancel/reopen, supporting
   * both admin-collection accounts and FRIS panel users (created employees).
   *
   * The OTP is sent to — and the action is attributed to — the logged-in actor's
   * own email. Admin/superadmin/manager accounts are always permitted; a created
   * employee must hold the matching Flights page permission (Scheduled or
   * Non-Scheduled Airlines), mirroring the page access enforced on the frontend.
   */
  private async resolveCancellationActor(
    userId: string,
    role: string,
    accountType: AuthAccountType,
    flightKind: CancelFlightKind = 'scheduled',
  ): Promise<{ email: string; name: string; userid: string }> {
    if (accountType === 'admin') {
      const admin = await this.adminService.findById(userId);
      if (!admin?.email) {
        throw new UnauthorizedException(
          'Logged-in admin not found in admins collection.',
        );
      }
      return {
        email: String(admin.email).trim().toLowerCase(),
        name: String(admin.name ?? '').trim(),
        userid: String(admin.userid ?? '').trim(),
      };
    }

    const user = await this.userService.findById(userId);
    if (!user?.email) {
      throw new UnauthorizedException(
        'Logged-in user not found or has no email on file.',
      );
    }

    // Employees may only cancel/reopen when granted the matching airlines page.
    if (role === 'employee') {
      const flags = this.resolveUserFlags(user);
      const flightsFlags = flags?.flights;
      const pageLabel =
        flightKind === 'non-scheduled'
          ? 'Non-Scheduled Airlines'
          : 'Scheduled Airlines';
      const allowed =
        flightsFlags && typeof flightsFlags === 'object'
          ? (flightsFlags as Record<string, number>)[pageLabel] === 1
          : false;
      if (!allowed) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }
    }

    return {
      email: String(user.email).trim().toLowerCase(),
      name: String(user.name ?? '').trim(),
      userid: String(user.userid ?? '').trim(),
    };
  }

  async sendCancelFlightOtp(
    userId: string,
    role: string,
    accountType: AuthAccountType,
    flightId: string,
    purpose: OtpPurpose,
    flightKind: CancelFlightKind = 'scheduled',
  ) {
    const actor = await this.resolveCancellationActor(
      userId,
      role,
      accountType,
      flightKind,
    );

    const issued = this.issueOtp(actor.email, flightId, purpose);
    if (!issued.ok) {
      void this.messagingRecorder?.recordOtpOutcome({
        email: actor.email,
        flightId,
        purpose,
        status: 'abuse',
        failureReason: 'max_attempts',
        ipAddress: undefined,
        riskScore: 80,
      });
      throw new UnauthorizedException(issued.message);
    }
    const sendStarted = Date.now();
    let otpId: string | undefined;
    try {
      await this.messagingRecorder?.recordOtpResent({
        email: actor.email,
        flightId,
        purpose,
      });
      otpId = await this.messagingRecorder?.recordOtpGenerated({
        userId,
        email: actor.email,
        purpose,
        flightId,
        expiresInMs: this.otpTTLms,
      });
      await this.otpMailerService.sendOtpEmail({
        toEmail: actor.email,
        otp: issued.otp,
        flightId,
        purpose,
      });
      await this.messagingRecorder?.recordMessage({
        messageType: 'otp',
        recipient: actor.email,
        template: `flight-${purpose}`,
        module: 'Authentication',
        status: 'delivered',
        subject: `Flight OTP: ${flightId}`,
        deliveryTimeMs: Date.now() - sendStarted,
        otpId,
        metadata: { purpose, flightId },
      });
    } catch (error) {
      this.rollbackOtpIssue(actor.email, flightId, purpose);
      await this.messagingRecorder?.recordMessage({
        messageType: 'otp',
        recipient: actor.email,
        template: `flight-${purpose}`,
        module: 'Authentication',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Send failed',
        otpId,
        metadata: { purpose, flightId },
      });
      await this.messagingRecorder?.recordOtpOutcome({
        email: actor.email,
        flightId,
        purpose,
        status: 'failed',
        failureReason: 'provider_failure',
      });
      throw error;
    }

    return { success: true, message: `OTP sent to ${actor.email}.` };
  }

  /**
   * Build the station scope for an admin-driven cancel/reopen. A concrete active
   * station scopes the cancellation row to that station; a cross-station admin
   * with no active station operates cross-station (reads/removes unfiltered,
   * creates fall back to the legacy MAA station — see service.stampStationCode).
   */
  private cancellationStationScope(stationCode?: string): StationScopeContext {
    const code = String(stationCode ?? '').trim();
    return code ? fixedStationScope(code) : CROSS_STATION_SYSTEM_SCOPE;
  }

  async verifyCancelFlightOtp(
    userId: string,
    role: string,
    accountType: AuthAccountType,
    flightId: string,
    purpose: OtpPurpose,
    otp: string,
    cancellationForm?: Record<string, unknown>,
    flightSnapshot?: Record<string, unknown>,
    stationCode?: string,
    flightKind: CancelFlightKind = 'scheduled',
  ) {
    const actor = await this.resolveCancellationActor(
      userId,
      role,
      accountType,
      flightKind,
    );
    const verified = await this.verifyIssuedOtpWithPurposeFallback(
      actor.email,
      flightId,
      purpose,
      otp,
    );
    if (!verified.ok) {
      const reason = verified.message.includes('expired')
        ? 'expired'
        : verified.message.includes('Too many')
          ? 'max_attempts'
          : verified.message.includes('not found')
            ? 'invalid'
            : 'invalid';
      void this.messagingRecorder?.recordOtpOutcome({
        email: actor.email,
        flightId,
        purpose,
        status: reason === 'expired' ? 'expired' : 'failed',
        failureReason: reason,
        attemptCount: reason === 'max_attempts' ? this.otpMaxTries : 1,
        riskScore: reason === 'max_attempts' ? 65 : 25,
      });
      throw new UnauthorizedException(verified.message);
    }
    const matchedPurpose = verified.matchedPurpose;
    void this.messagingRecorder?.recordOtpOutcome({
      email: actor.email,
      flightId,
      purpose: matchedPurpose,
      status: 'verified',
      verificationTimeMs: this.otpTTLms,
      attemptCount: 1,
    });
    if (matchedPurpose === 'cancel-step-2') {
      return this.finalizeCancelFlight(
        userId,
        role,
        accountType,
        String(flightId || '').trim(),
        cancellationForm,
        flightSnapshot,
        stationCode,
        flightKind,
      );
    }
    if (
      matchedPurpose === 'reopen-step-1' ||
      matchedPurpose === 'reopen-step-2'
    ) {
      return this.finalizeReopenFlight(
        userId,
        role,
        accountType,
        String(flightId || '').trim(),
        flightSnapshot,
        stationCode,
        flightKind,
      );
    }
    return { success: true, message: 'OTP verified.' };
  }

  private normalizeCancellationForm(
    raw: Record<string, unknown> | undefined,
  ): CancellationFormPayload {
    const src = raw ?? {};
    const toStr = (v: unknown) => String(v ?? '').trim();
    const attachmentRaw =
      src.attachment && typeof src.attachment === 'object'
        ? (src.attachment as Record<string, unknown>)
        : {};
    return {
      intimationTime: toStr(src.intimationTime),
      intimatedBy: toStr(src.intimatedBy),
      intimationPersonEmail: toStr(src.intimationPersonEmail),
      intimationMode: toStr(src.intimationMode),
      proofNote: toStr(src.proofNote),
      attachment: {
        fileName: toStr(attachmentRaw.fileName),
        mimeType: toStr(attachmentRaw.mimeType),
        base64: toStr(attachmentRaw.base64),
      },
    };
  }

  private normalizeFlightSnapshot(
    raw: Record<string, unknown> | undefined,
  ): CancellationFlightSnapshot {
    const src = raw ?? {};
    const toStr = (v: unknown) => String(v ?? '').trim();
    return {
      airlineName: toStr(src.airlineName ?? src.airline),
      serialNumber: toStr(src.serialNumber ?? src.slNo ?? src.scheduleId),
      flightNo: toStr(src.flightNo),
      aircraftType: toStr(src.aircraftType ?? src.aircraft),
      airlineRepresentativeName: toStr(
        src.airlineRepresentativeName ?? src.airlineRep,
      ),
      route: toStr(src.route ?? src.routing),
      source: toStr(src.source),
      destination: toStr(src.destination),
      staDate: toStr(src.staDate ?? src['STA Date']),
      staTime: toStr(src.staTime ?? src['STA Time']),
      stdDate: toStr(src.stdDate ?? src['STD Date']),
      stdTime: toStr(src.stdTime ?? src['STD Time']),
    };
  }

  async finalizeCancelFlight(
    userId: string,
    role: string,
    accountType: AuthAccountType,
    flightId: string,
    cancellationForm?: Record<string, unknown>,
    flightSnapshot?: Record<string, unknown>,
    stationCode?: string,
    flightKind: CancelFlightKind = 'scheduled',
  ) {
    const actor = await this.resolveCancellationActor(
      userId,
      role,
      accountType,
      flightKind,
    );

    const serialNo = String(flightId ?? '').trim();
    if (!serialNo) {
      throw new UnauthorizedException('Flight identifier is required.');
    }

    const form = this.normalizeCancellationForm(cancellationForm);
    if (!form.intimationTime || !form.intimatedBy || !form.intimationMode) {
      throw new UnauthorizedException(
        'Intimation time, intimated by, and intimation mode are required.',
      );
    }

    const isNonScheduled = flightKind === 'non-scheduled';
    const dbFlightInfo = isNonScheduled
      ? {
          airlineName: '',
          flightNo: '',
          aircraftType: '',
          airlineRepresentativeName: '',
        }
      : await this.rawFlightDataService.getBasicFlightIdentityBySerial(
          serialNo,
        );
    let snapshot = this.normalizeFlightSnapshot(flightSnapshot);
    const instanceOccurrence = isNonScheduled
      ? null
      : await this.rawFlightDataService.getInstanceOccurrenceBySerial(
          serialNo,
        );
    if (!snapshot.staDate && instanceOccurrence?.operationDate) {
      snapshot = {
        ...snapshot,
        staDate: instanceOccurrence.operationDate,
      };
    }

    const summary: CancellationFlightSnapshot = {
      airlineName: dbFlightInfo.airlineName || snapshot.airlineName,
      serialNumber: serialNo || snapshot.serialNumber,
      flightNo: dbFlightInfo.flightNo || snapshot.flightNo,
      aircraftType: dbFlightInfo.aircraftType || snapshot.aircraftType,
      airlineRepresentativeName:
        dbFlightInfo.airlineRepresentativeName ||
        snapshot.airlineRepresentativeName,
    };

    const cancelledDate = this.normalizeToYmd(snapshot.staDate ?? '');
    if (!cancelledDate) {
      throw new BadRequestException(
        'STA date is required to cancel this occurrence.',
      );
    }
    const intimationMedia = String(form.attachment?.fileName ?? '').trim();
    const attachmentBase64 = String(form.attachment?.base64 ?? '').trim();
    const attachmentMimeType = String(form.attachment?.mimeType ?? '').trim();
    const cancellationRow = await this.flightCancellationsService.create(
      {
        flightId: serialNo,
        date: cancelledDate,
        reason: form.proofNote ?? '',
        airlineName: summary.airlineName ?? '',
        flightNo: summary.flightNo ?? '',
        route: snapshot.route ?? '',
        source: snapshot.source ?? '',
        destination: snapshot.destination ?? '',
        staDate: snapshot.staDate ?? '',
        staTime: snapshot.staTime ?? '',
        stdDate: snapshot.stdDate ?? '',
        stdTime: snapshot.stdTime ?? '',
        aircraft: summary.aircraftType ?? '',
        intimationMode: form.intimationMode ?? '',
        intimatedBy: form.intimatedBy ?? '',
        intimationPersonEmail: form.intimationPersonEmail ?? '',
        intimationMedia,
        attachmentFileName: intimationMedia,
        attachmentMimeType,
        attachmentBase64: attachmentBase64 || undefined,
        intimationTime: form.intimationTime ?? '',
        cancelledByUserId: String(actor.userid ?? userId ?? '').trim(),
        flightKind,
      },
      this.cancellationStationScope(stationCode),
    );
    const proofSaved = await this.flightCancellationsService.attachProofFromEmailPayload(
      String(cancellationRow._id ?? ''),
      form.attachment ?? {},
      this.cancellationStationScope(stationCode),
    );
    if (String(form.attachment?.base64 ?? '').trim() && !proofSaved) {
      this.logger.warn(
        `Cancellation proof was emailed but not stored for serial ${serialNo} (${cancellationRow._id}).`,
      );
    }
    await this.flightInstanceStateService.markCancelled(
      serialNo,
      this.cancellationStationScope(stationCode),
    );
    if (!isNonScheduled) {
      await this.rawFlightDataService.updateFlightStatusBySerial(
        serialNo,
        'Cancelled',
      );
      if (instanceOccurrence?.scheduleId) {
        await this.rawFlightDataService.clearScheduleMasterCancelFlags(
          instanceOccurrence.scheduleId,
        );
      }
      invalidateListDailyFromAdvanceCache();
    }
    // Persist cancellation marker only when main-details form data already exists.
    const mainSerial = this.parseMainDetailsSerial(serialNo);
    if (mainSerial != null) {
      await this.mainDetailsService.setFlightCancelledBySerial(
        mainSerial,
        {
          Airline: summary.airlineName ?? '',
          Arline_Code: summary.flightNo ?? '',
        },
        CROSS_STATION_SYSTEM_SCOPE,
      );
    }

    const configuredNotify = String(process.env.ADMIN_NOTIFY_EMAIL || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const superAdminNotify = String(process.env.SUPERADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const recipientEmails = Array.from(
      new Set([
        String(actor.email || '')
          .trim()
          .toLowerCase(),
        ...(superAdminNotify ? [superAdminNotify] : []),
        ...configuredNotify,
      ]),
    ).filter(Boolean);

    const proofBase64 = sanitizeAttachmentBase64(
      String(form.attachment?.base64 ?? ''),
    );
    const proofFileName = String(form.attachment?.fileName ?? '').trim();
    const extraAttachments =
      proofBase64 && proofFileName
        ? [
            {
              filename: proofFileName,
              content: proofBase64,
              encoding: 'base64' as const,
              contentType:
                String(form.attachment?.mimeType ?? '').trim() || undefined,
            },
          ]
        : undefined;

    void this.flightCancellationsService
      .sendCancellationInfoEmail(
        String(cancellationRow._id ?? ''),
        recipientEmails,
        this.cancellationStationScope(stationCode),
        {
          subject: `Flight cancellation confirmed: ${
            summary.flightNo || serialNo || 'Unknown flight'
          }`,
          extraAttachments,
        },
      )
      .catch((err: unknown) => {
        this.logger.error(
          'Cancellation summary email failed',
          err instanceof Error ? err.stack : String(err),
        );
      });

    return {
      success: true,
      message:
        'Flight cancelled for selected STA date. Confirmation email sent.',
      serialNo,
      cancelledDate,
      cancellationId: cancellationRow._id,
    };
  }

  async finalizeReopenFlight(
    userId: string,
    role: string,
    accountType: AuthAccountType,
    flightId: string,
    flightSnapshot?: Record<string, unknown>,
    stationCode?: string,
    flightKind: CancelFlightKind = 'scheduled',
  ) {
    const actor = await this.resolveCancellationActor(
      userId,
      role,
      accountType,
      flightKind,
    );

    const serialNo = String(flightId ?? '').trim();
    if (!serialNo) {
      throw new UnauthorizedException('Flight identifier is required.');
    }
    const snapshot = this.normalizeFlightSnapshot(flightSnapshot);
    const reopenedDate = this.normalizeToYmd(snapshot.staDate ?? '');
    if (!reopenedDate) {
      throw new BadRequestException(
        'STA date is required to reopen this occurrence.',
      );
    }

    try {
      await this.flightCancellationsService.remove(
        serialNo,
        reopenedDate,
        this.cancellationStationScope(stationCode),
      );
    } catch (err) {
      // Reopen should still work for legacy rows cancelled via status flags (no mapping row).
      if (!(err instanceof NotFoundException)) {
        throw err;
      }
    }
    const isNonScheduled = flightKind === 'non-scheduled';
    // Ensure legacy/global cancel flags are cleared when reopening.
    if (!isNonScheduled) {
      await this.rawFlightDataService.updateFlightStatusBySerial(
        serialNo,
        'Open',
      );
    }
    await this.flightInstanceStateService.markReopened(
      serialNo,
      this.cancellationStationScope(stationCode),
    );
    const mainSerial = this.parseMainDetailsSerial(serialNo);
    if (mainSerial != null) {
      await this.mainDetailsService.clearFlightCancelledBySerial(
        mainSerial,
        CROSS_STATION_SYSTEM_SCOPE,
      );
    }

    const dbFlightInfo = isNonScheduled
      ? {
          airlineName: '',
          flightNo: '',
          aircraftType: '',
          airlineRepresentativeName: '',
        }
      : await this.rawFlightDataService.getBasicFlightIdentityBySerial(
          serialNo,
        );
    const summary: CancellationFlightSnapshot = {
      airlineName: dbFlightInfo.airlineName || snapshot.airlineName,
      serialNumber: serialNo || snapshot.serialNumber,
      flightNo: dbFlightInfo.flightNo || snapshot.flightNo,
      aircraftType: dbFlightInfo.aircraftType || snapshot.aircraftType,
      airlineRepresentativeName:
        dbFlightInfo.airlineRepresentativeName ||
        snapshot.airlineRepresentativeName,
    };

    const configuredNotify = String(process.env.ADMIN_NOTIFY_EMAIL || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const superAdminNotify = String(process.env.SUPERADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const recipientEmails = Array.from(
      new Set([
        String(actor.email || '')
          .trim()
          .toLowerCase(),
        ...(superAdminNotify ? [superAdminNotify] : []),
        ...configuredNotify,
      ]),
    ).filter(Boolean);

    void this.otpMailerService
      .sendReopenSummaryEmail({
        toEmail: recipientEmails,
        verifiedBy: actor.name || actor.userid || actor.email,
        adminUserId: String(actor.userid || ''),
        flight: summary,
        reopenedDate,
      })
      .catch((err: unknown) => {
        this.logger.error(
          'Reopen summary email failed',
          err instanceof Error ? err.stack : String(err),
        );
      });

    return {
      success: true,
      message:
        'Flight reopened successfully. Cancellation flags cleared and confirmation email sent.',
      serialNo,
      reopenedDate,
    };
  }

  async login(
    userid: string,
    password: string,
    context?: {
      ip?: string;
      requestId?: string;
      stationId?: string;
      autoSelectFirstStation?: boolean;
    },
  ) {
    const clientIp = String(context?.ip ?? 'unknown');
    const requestId = String(context?.requestId ?? '').trim() || undefined;

    // Prefer linked FRIS panel accounts over mirrored admin-collection rows.
    let user: AuthUser | null =
      (await this.userService.findByUserIdOrEmployeeId(userid)) ??
      (await this.userService.findByEmail(userid));
    let accountType: AuthAccountType = 'user';

    if (!user) {
      user =
        (await this.adminService.findByUserId(userid)) ??
        (await this.adminService.findByEmail(userid));
      accountType = 'admin';
    }

    if (!user) {
      this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
      throw new UnauthorizedException('Invalid credentials');
    }

    const testingStationLogin = isTestingStationCode(context?.stationId);
    if (testingStationLogin) {
      const loginRole =
        accountType === 'admin'
          ? (user as AdminDocument).role
          : ((user as UserDocument).authorizationRole ??
            (user as UserDocument).role);
      if (!this.isEffectiveSuperadmin(loginRole, user.userid)) {
        throw new UnauthorizedException(
          'Only a superadmin can sign in to Testing FRIS.',
        );
      }
    }

    let activeStationId: string | undefined;
    if (accountType === 'user') {
      assertUserEligibleForAuthentication(user as UserDocument);
    }
    if (accountType === 'user' && !testingStationLogin) {
      const panelUser = user as UserDocument;
      const isUniversal = isUniversalSuperadminUserid(panelUser.userid);
      // authorizationRole (or role) superadmin may sign in to any station —
      // same station gate as the universal portal id. Station assignment still
      // scopes data for non-superadmin employees/managers.
      const panelAuthRole = String(
        (panelUser as { authorizationRole?: string }).authorizationRole ??
          panelUser.role ??
          '',
      )
        .trim()
        .toLowerCase();
      const isPanelSuperadmin =
        isUniversal ||
        panelAuthRole === 'superadmin' ||
        this.isEffectiveSuperadmin(panelAuthRole, panelUser.userid);

      let requestedStationId = String(context?.stationId ?? '').trim();
      const assigned = (panelUser.assignedStationIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean);

      if (requestedStationId) {
        if (!assigned.includes(requestedStationId)) {
          const resolved =
            await this.adminStationsService.resolveStationIdByCode(
              requestedStationId,
              // Superadmins may resolve any registry station; others only theirs.
              isPanelSuperadmin ? undefined : assigned,
            );
          if (
            resolved &&
            (isPanelSuperadmin || assigned.includes(resolved))
          ) {
            requestedStationId = resolved;
          }
        }
      }

      if (isPanelSuperadmin) {
        activeStationId = requestedStationId || assigned[0] || undefined;
      } else {
        const stationAccess = validateUserStationLoginAccess({
          assignedStationIds: assigned,
          stationId: requestedStationId || undefined,
          autoSelectFirstStation: context?.autoSelectFirstStation === true,
        });
        if (!stationAccess.ok) {
          throw new UnauthorizedException(stationAccess.message);
        }
        activeStationId = stationAccess.stationId;
      }
    }

    // Resolve the canonical clean station code (e.g. `DEL`) from the active
    // station id so it can be embedded in the JWT and returned to the client.
    let activeStationCode: string | undefined;
    if (testingStationLogin) {
      activeStationCode = TESTING_STATION_CODE;
    } else if (activeStationId) {
      activeStationCode =
        (await this.adminStationsService.resolveStationCodeById(
          activeStationId,
        )) ?? undefined;
    }

    // Build JWT payload
    const payload: JwtPayload = {
      sub: String(user._id),
      email: String(user.email ?? '')
        .trim()
        .toLowerCase(),
      accountType,
      purpose: 'access',
      tokenVersion: normalizeTokenVersion(
        (user as { tokenVersion?: number }).tokenVersion,
      ),
    };

    if (activeStationId) {
      payload.stationId = activeStationId;
    }
    if (activeStationCode) {
      payload.stationCode = activeStationCode;
    }

    if (accountType === 'admin') {
      // Visibility is by station, not role. A Global Admin may sign in to ANY
      // station and is then confined to that station's data; a station-bound
      // admin is always confined to its assigned station, regardless of any
      // client-supplied selection.
      const adminDoc = user as AdminDocument;
      payload.role = this.effectiveAuthRole(adminDoc.role, adminDoc.userid);
      payload.isGlobalAdmin =
        adminDoc.isGlobalAdmin === true ||
        isUniversalSuperadminUserid(adminDoc.userid);

      if (testingStationLogin) {
        delete payload.stationId;
        payload.stationCode = TESTING_STATION_CODE;
        activeStationId = undefined;
        activeStationCode = TESTING_STATION_CODE;
      } else {
      const selectedStationId = String(context?.stationId ?? '').trim();
      const assignedStationId = String(adminDoc.stationId ?? '').trim();
      let resolvedSelectedStationId = selectedStationId;
      if (selectedStationId) {
        const resolved =
          await this.adminStationsService.resolveStationIdByCode(
            selectedStationId,
          );
        if (resolved) {
          resolvedSelectedStationId = resolved;
        }
      }
      const effectiveStationId = payload.isGlobalAdmin
        ? resolvedSelectedStationId || assignedStationId
        : resolvedSelectedStationId || assignedStationId;

      // Reset any station context inherited from earlier in the flow so the
      // admin branch is the single authority on the admin's active station.
      delete payload.stationId;
      delete payload.stationCode;

      if (effectiveStationId) {
        payload.stationId = effectiveStationId;

        // Reuse the stored code only when it belongs to the assigned station;
        // otherwise resolve the code from the effective station id.
        let adminStationCode = '';
        if (
          effectiveStationId === assignedStationId &&
          String(adminDoc.stationCode ?? '').trim()
        ) {
          adminStationCode = String(adminDoc.stationCode).trim().toUpperCase();
        } else {
          adminStationCode =
            (await this.adminStationsService.resolveStationCodeById(
              effectiveStationId,
            )) ?? '';
        }
        if (adminStationCode) {
          payload.stationCode = adminStationCode;
        }
        // Keep login response + app-access helpers in sync with JWT station.
        activeStationId = effectiveStationId;
        activeStationCode = adminStationCode || undefined;
      }
      }
    } else {
      const panelUser = user as UserDocument;
      payload.role = this.effectiveAuthRole(
        panelUser.authorizationRole ?? panelUser.role,
        panelUser.userid,
      );
    }

    // Build user response object
    const userResponse: Record<string, unknown> = {
      userid: user.userid,
      name: user.name,
      email: user.email,
    };

    // For admins and superadmins: include role and optional FRIS flags
    if (accountType === 'admin' && 'role' in user && user.role) {
      const adminDoc = user as AdminDocument;
      userResponse.role = this.effectiveAuthRole(
        adminDoc.role,
        adminDoc.userid,
      );
      const adminPerms = adminDoc.permissions;
      const adminFlags = this.isEffectiveSuperadmin(
        adminDoc.role,
        adminDoc.userid,
      )
        ? this.buildFullAccessFlags()
        : adminDoc.flags && Object.keys(adminDoc.flags).length > 0
          ? adminDoc.flags
          : adminPerms
            ? buildFlagsFromPermissions(
                normalizeAccessSubPages(
                  adminPerms.accessTabs ?? [],
                  adminPerms.accessSubPages ?? {},
                ),
              )
            : undefined;
      if (adminFlags && Object.keys(adminFlags).length > 0) {
        userResponse.flags = adminFlags;
      }
      this.appendAppAccess(
        userResponse,
        null,
        activeStationId,
        adminDoc.role,
        adminDoc.userid,
      );
      if (activeStationId) {
        userResponse.stationId = activeStationId;
      }
      if (activeStationCode) {
        userResponse.stationCode = activeStationCode;
      }
    }

    // For regular users: include department and station-scoped flags (NOT role)
    if (accountType === 'user') {
      if ('department' in user && user.department) {
        userResponse.department = user.department;
      }
      const panelUser = user as UserDocument;
      const authRole = this.effectiveAuthRole(
        panelUser.authorizationRole ?? panelUser.role,
        panelUser.userid,
      );
      if (authRole !== 'employee') {
        userResponse.role = authRole;
      }
      const effectiveFlags =
        authRole === 'superadmin'
          ? this.buildFullAccessFlags()
          : buildFlagsForStationContext({
              assignedStationIds: panelUser.assignedStationIds,
              stationPermissions: panelUser.stationPermissions as Record<
                string,
                { accessTabs: string[]; accessSubPages: Record<string, string[]> }
              >,
              permissions: panelUser.permissions,
              flags: panelUser.flags,
              stationId: activeStationId,
            });
      if (activeStationId) {
        userResponse.stationId = activeStationId;
      }
      if (activeStationCode) {
        userResponse.stationCode = activeStationCode;
      }
      if (Object.keys(effectiveFlags).length > 0) {
        userResponse.flags = effectiveFlags;
      }
      this.appendFrisPermissionScope(
        userResponse,
        panelUser,
        activeStationId,
        authRole,
        panelUser.userid,
      );
      this.appendAppAccess(
        userResponse,
        panelUser,
        activeStationId,
        authRole,
        panelUser.userid,
      );
      this.appendPanelProfileFields(userResponse, panelUser);
    }

    if (testingStationLogin) {
      payload.stationCode = TESTING_STATION_CODE;
      delete payload.stationId;
      activeStationCode = TESTING_STATION_CODE;
      activeStationId = undefined;
      userResponse.stationCode = TESTING_STATION_CODE;
      delete userResponse.stationId;
      userResponse.flags = this.buildFullAccessFlags();
      delete userResponse.permissionScope;
      userResponse.landingPath = '/fris/dashboard';
    }

    {
      const loginName = String(user.name ?? user.userid ?? 'User');
      const loginRole = humanizeRole(
        accountType === 'admin'
          ? (user as AdminDocument).role
          : ((user as UserDocument).authorizationRole ??
              (user as UserDocument).role),
      );
      const stationCtx = String(activeStationCode ?? '').trim();
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
        userId: String(user._id),
        userName: loginName,
        userEmail: String(user.email ?? ''),
        accountType,
        action: 'Signed in to FRIS',
        summary:
          `${loginName} logged into FRIS` +
          (stationCtx ? ` at station ${stationCtx}` : '') +
          `. Session created successfully.`,
        actorRole: loginRole,
        module: 'Authentication',
        page: 'Login',
        stationId: String(activeStationId ?? '').trim() || undefined,
        stationName: stationCtx || undefined,
        method: 'POST',
        path: '/auth/login',
      });
    }

    return {
      success: true,
      message: 'Login successful',
      access_token: this.jwtService.sign(payload),
      user: userResponse,
      collection: accountType === 'admin' ? 'admin' : 'users',
    };
  }

  /** Admin panel sign-in: admin collection, with FRIS panel-user fallback + mirror sync. */
  async loginAdminPanel(
    userid: string,
    password: string,
    context?: { ip?: string; requestId?: string; totpCode?: string },
  ) {
    const clientIp = String(context?.ip ?? 'unknown');
    const requestId = String(context?.requestId ?? '').trim() || undefined;

    let user = await this.adminService.findByUserIdForLogin(userid);
    let passwordValidated = false;

    if (!user) {
      const panelUser = await this.userService.findByUserId(userid, true);
      if (!panelUser) {
        this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!this.userService.canAccessAdminPanel(panelUser)) {
        this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
        throw new UnauthorizedException(
          'Only admin accounts may sign in to the admin panel.',
        );
      }

      const panelPasswordValid = await bcrypt.compare(password, panelUser.password);
      if (!panelPasswordValid) {
        this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.userService.ensureAdminMirrorForPanelLogin(panelUser, password);
      user = await this.adminService.findByUserIdForLogin(userid);
      if (!user) {
        throw new UnauthorizedException(
          'Admin panel account could not be prepared. Contact support.',
        );
      }
      passwordValidated = true;
    }

    if (!passwordValidated) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const totpCode = String(context?.totpCode ?? '').trim();
      if (!totpCode) {
        throw new UnauthorizedException('MFA code required');
      }
      if (!(await verifyAdminTotp(user.mfaSecret, totpCode))) {
        this.authAttemptTracker.recordFailedLogin(userid, clientIp, requestId);
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const role = normalizeAdminRole(user.role);
    if (role !== 'manager' && role !== 'superadmin') {
      throw new UnauthorizedException(
        'Only admin accounts may sign in to the admin panel.',
      );
    }

    const payload: JwtPayload = {
      sub: String(user._id),
      email: String(user.email ?? '')
        .trim()
        .toLowerCase(),
      accountType: 'admin',
      purpose: 'access',
      role,
      tokenVersion: normalizeTokenVersion(user.tokenVersion),
    };

    // Visibility is by station, not role. Carry assigned station + global flag.
    payload.isGlobalAdmin = user.isGlobalAdmin === true;
    const panelAdminStationId = String(user.stationId ?? '').trim();
    if (panelAdminStationId) {
      payload.stationId = panelAdminStationId;
    }
    let panelAdminStationCode = String(user.stationCode ?? '')
      .trim()
      .toUpperCase();
    if (!panelAdminStationCode && panelAdminStationId) {
      panelAdminStationCode =
        (await this.adminStationsService.resolveStationCodeById(
          panelAdminStationId,
        )) ?? '';
    }
    if (panelAdminStationCode) {
      payload.stationCode = panelAdminStationCode;
    }

    const userResponse: Record<string, unknown> = {
      userid: user.userid,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const adminDoc = user as AdminDocument;
    const adminPerms = adminDoc.permissions;
    const adminFlags =
      adminDoc.flags && Object.keys(adminDoc.flags).length > 0
        ? adminDoc.flags
        : adminPerms
          ? buildFlagsFromPermissions(
              normalizeAccessSubPages(
                adminPerms.accessTabs ?? [],
                adminPerms.accessSubPages ?? {},
              ),
            )
          : undefined;
    if (adminFlags && Object.keys(adminFlags).length > 0) {
      userResponse.flags = adminFlags;
    }

    {
      const adminName = String(user.name ?? user.userid ?? 'Admin');
      const roleLabel = user.isGlobalAdmin
        ? 'Global Admin'
        : humanizeRole(role);
      const stationCtx = panelAdminStationCode;
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
        userId: String(user._id),
        userName: adminName,
        userEmail: String(user.email ?? ''),
        accountType: 'admin',
        action: 'Signed in to admin panel',
        summary:
          `${adminName} logged into the admin panel` +
          (stationCtx ? ` at station ${stationCtx}` : '') +
          `. Session created successfully.`,
        actorRole: roleLabel,
        module: 'Authentication',
        page: 'Admin Login',
        stationId: panelAdminStationId || undefined,
        stationName: stationCtx || undefined,
        ipAddress: clientIp !== 'unknown' ? clientIp : undefined,
        method: 'POST',
        path: '/auth/admin-login',
      });
    }

    return {
      success: true,
      message: 'Login successful',
      access_token: this.jwtService.sign(payload),
      user: userResponse,
      collection: 'admin' as const,
    };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = String(email ?? '')
      .trim()
      .toLowerCase();
    const genericResponse = {
      success: true,
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };

    if (!normalizedEmail) {
      return genericResponse;
    }

    let user: AuthUser = await this.adminService.findByEmail(normalizedEmail);
    let accountType: AuthAccountType = 'admin';

    if (!user) {
      user = await this.userService.findByEmail(normalizedEmail);
      accountType = 'user';
    }

    if (!user) {
      return genericResponse;
    }

    const jti = crypto.randomUUID();
    const token = this.jwtService.sign(
      {
        sub: String(user._id),
        accountType,
        type: accountType,
        purpose: 'password-reset',
        jti,
      },
      { expiresIn: '15m' },
    );

    const clientBase = String(
      process.env.CLIENT_URL ??
        process.env.FRIS_CLIENT_URL ??
        'http://localhost:3000',
    ).replace(/\/$/, '');
    const resetUrl = `${clientBase}/admin/login?resetToken=${encodeURIComponent(token)}`;

    try {
      await this.otpMailerService.sendPasswordResetEmail({
        toEmail: normalizedEmail,
        resetUrl,
      });
    } catch (err) {
      this.logger.warn(
        `Password reset email could not be sent for ${normalizedEmail}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return genericResponse;
  }

  /**
   * Forgot-password OTP: send to registered email (FRIS employee or admin).
   * Does not expose OTP or email address in the response.
   */
  async sendPasswordResetOtp(dto: SendPasswordResetOtpDto) {
    const accountScope =
      dto.accountScope === 'admin' ? ('admin' as const) : ('fris' as const);
    const identifier = String(dto.employeeId ?? '').trim();

    if (!identifier) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_REQUIRED
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_REQUIRED,
      );
    }

    const account = await this.resolvePasswordResetAccount(
      accountScope,
      identifier,
    );
    if (!account) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_NOT_FOUND
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_NOT_FOUND,
      );
    }

    const toEmail = String(account.email ?? '')
      .trim()
      .toLowerCase();
    if (!toEmail) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED_ADMIN
          : PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED,
      );
    }

    const issued = this.issuePasswordResetOtp(
      accountScope,
      account.accountId,
      toEmail,
    );
    if (!issued.ok) {
      throw new BadRequestException(issued.message);
    }

    // Clear any prior verified session when a new OTP is sent.
    this.clearPasswordResetVerifiedSession(
      accountScope,
      account.accountId,
      toEmail,
    );

    try {
      await this.otpMailerService.sendPasswordResetOtpEmail({
        toEmail,
        otp: issued.otp,
        expiresInMinutes: Math.ceil(PASSWORD_RESET_OTP.TTL_MS / 60000),
      });
    } catch (err) {
      this.rollbackPasswordResetOtp(accountScope, account.accountId, toEmail);
      this.logger.warn(
        `Password reset OTP email failed for ${accountScope} ${account.accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(PASSWORD_RESET_OTP_MESSAGES.EMAIL_SEND_FAILED);
    }

    this.logger.log(
      `Password reset OTP sent for ${accountScope} ${account.accountId} (email redacted)`,
    );

    return {
      success: true,
      message: PASSWORD_RESET_OTP_MESSAGES.OTP_SENT,
      expiresInMs: PASSWORD_RESET_OTP.TTL_MS,
    };
  }

  /**
   * Verify OTP only. On success, opens a short-lived session so the client
   * can collect and save a new password.
   */
  async verifyPasswordResetOtpOnly(dto: VerifyPasswordResetOtpOnlyDto) {
    const accountScope =
      dto.accountScope === 'admin' ? ('admin' as const) : ('fris' as const);
    const identifier = String(dto.employeeId ?? '').trim();
    const otp = String(dto.otp ?? '').trim();

    if (!identifier) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_REQUIRED
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_REQUIRED,
      );
    }
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException(PASSWORD_RESET_OTP_MESSAGES.OTP_INVALID_FORMAT);
    }

    const account = await this.resolvePasswordResetAccount(
      accountScope,
      identifier,
    );
    if (!account) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_NOT_FOUND
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_NOT_FOUND,
      );
    }

    const toEmail = String(account.email ?? '')
      .trim()
      .toLowerCase();
    if (!toEmail) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED_ADMIN
          : PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED,
      );
    }

    const verified = await this.verifyPasswordResetIssuedOtp(
      accountScope,
      account.accountId,
      toEmail,
      otp,
    );
    if (!verified.ok) {
      throw new BadRequestException(verified.message);
    }

    const sessionKey = this.passwordResetOtpKey(
      accountScope,
      account.accountId,
      toEmail,
    );
    this.passwordResetVerifiedStore.set(sessionKey, {
      accountDocId: String(account._id),
      expiresAt: Date.now() + PASSWORD_RESET_OTP.TTL_MS,
    });

    return {
      success: true,
      message: PASSWORD_RESET_OTP_MESSAGES.OTP_VERIFIED,
    };
  }

  /**
   * Save hashed password after OTP was verified (step 2).
   */
  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto) {
    const accountScope =
      dto.accountScope === 'admin' ? ('admin' as const) : ('fris' as const);
    const identifier = String(dto.employeeId ?? '').trim();
    const newPassword = String(dto.newPassword ?? '');
    const confirmPassword = String(dto.confirmPassword ?? '');

    if (!identifier) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_REQUIRED
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_REQUIRED,
      );
    }

    this.assertPasswordResetCredentials(newPassword, confirmPassword);

    const account = await this.resolvePasswordResetAccount(
      accountScope,
      identifier,
    );
    if (!account) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.USER_ID_NOT_FOUND
          : PASSWORD_RESET_OTP_MESSAGES.EMPLOYEE_NOT_FOUND,
      );
    }

    const toEmail = String(account.email ?? '')
      .trim()
      .toLowerCase();
    if (!toEmail) {
      throw new BadRequestException(
        accountScope === 'admin'
          ? PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED_ADMIN
          : PASSWORD_RESET_OTP_MESSAGES.EMAIL_NOT_REGISTERED,
      );
    }

    const sessionKey = this.passwordResetOtpKey(
      accountScope,
      account.accountId,
      toEmail,
    );
    const session = this.passwordResetVerifiedStore.get(sessionKey);
    if (!session || Date.now() > session.expiresAt) {
      this.passwordResetVerifiedStore.delete(sessionKey);
      throw new BadRequestException(PASSWORD_RESET_OTP_MESSAGES.OTP_NOT_VERIFIED);
    }
    if (session.accountDocId !== String(account._id)) {
      this.passwordResetVerifiedStore.delete(sessionKey);
      throw new BadRequestException(PASSWORD_RESET_OTP_MESSAGES.OTP_NOT_VERIFIED);
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      PASSWORD_RESET_OTP.BCRYPT_ROUNDS,
    );
    const encryptedPassword = encryptPassword(newPassword);
    if (accountScope === 'admin') {
      await this.adminService.updatePassword(String(account._id), hashedPassword, {
        loginPassword: encryptedPassword,
      });
    } else {
      await this.userService.updatePassword(String(account._id), hashedPassword, {
        loginPassword: encryptedPassword,
      });
    }

    this.passwordResetVerifiedStore.delete(sessionKey);
    this.otpStore.delete(sessionKey);
    void this.otpStoreService.deleteOtp(sessionKey);

    this.logger.log(
      `Password reset completed for ${accountScope} ${account.accountId} (email redacted)`,
    );

    try {
      await this.otpMailerService.sendPasswordChangedConfirmationEmail({
        toEmail,
      });
    } catch (err) {
      this.logger.warn(
        `Password changed confirmation email failed for ${accountScope} ${account.accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return {
      success: true,
      message: PASSWORD_RESET_OTP_MESSAGES.PASSWORD_RESET_SUCCESS,
    };
  }

  private looksLikeEmail(value: string): boolean {
    return value.includes('@');
  }

  private async resolvePasswordResetAccount(
    accountScope: 'fris' | 'admin',
    identifier: string,
  ): Promise<{ _id: unknown; email?: string; accountId: string } | null> {
    const raw = String(identifier ?? '').trim();
    if (!raw) return null;

    if (accountScope === 'admin') {
      const admin = this.looksLikeEmail(raw)
        ? await this.adminService.findByEmail(raw.trim().toLowerCase())
        : await this.adminService.findByUserId(raw);
      if (!admin) return null;
      const accountId = String(
        (admin as { userid?: string }).userid ?? raw,
      ).trim();
      return {
        _id: admin._id,
        email: String((admin as { email?: string }).email ?? ''),
        accountId: accountId || raw,
      };
    }

    const user = this.looksLikeEmail(raw)
      ? await this.userService.findByEmail(raw.trim().toLowerCase())
      : await this.userService.findByUserIdOrEmployeeId(raw);
    if (!user) return null;

    const accountId = String(
      (user as { userid?: string; employeeId?: string }).userid ??
        (user as { employeeId?: string }).employeeId ??
        raw,
    ).trim();

    return {
      _id: user._id,
      email: String((user as { email?: string }).email ?? ''),
      accountId: accountId || raw,
    };
  }

  private clearPasswordResetVerifiedSession(
    accountScope: 'fris' | 'admin',
    accountId: string,
    email: string,
  ): void {
    const key = this.passwordResetOtpKey(accountScope, accountId, email);
    this.passwordResetVerifiedStore.delete(key);
  }

  private assertPasswordResetCredentials(
    newPassword: string,
    confirmPassword: string,
  ): void {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(PASSWORD_RESET_OTP_MESSAGES.PASSWORDS_MISMATCH);
    }
    const policyMessages = getPasswordPolicyMessages(newPassword);
    if (policyMessages.length > 0) {
      throw new BadRequestException(policyMessages);
    }
  }

  private passwordResetOtpKey(
    accountScope: 'fris' | 'admin',
    accountId: string,
    email: string,
  ): string {
    return `${PASSWORD_RESET_OTP.PURPOSE}::${accountScope}::${accountId.toLowerCase()}::${email.toLowerCase()}`;
  }

  private passwordResetRateKey(
    accountScope: 'fris' | 'admin',
    accountId: string,
  ): string {
    return `${PASSWORD_RESET_OTP.PURPOSE}::${accountScope}::rate::${accountId.toLowerCase()}`;
  }

  private issuePasswordResetOtp(
    accountScope: 'fris' | 'admin',
    accountId: string,
    email: string,
  ) {
    const now = Date.now();
    const rateKey = this.passwordResetRateKey(accountScope, accountId);
    const rl = this.otpRateStore.get(rateKey);
    if (
      rl &&
      now - rl.windowStartedAt < PASSWORD_RESET_OTP.RATE_WINDOW_MS &&
      rl.count >= PASSWORD_RESET_OTP.RATE_LIMIT
    ) {
      const retryInMs =
        PASSWORD_RESET_OTP.RATE_WINDOW_MS - (now - rl.windowStartedAt);
      const retryInSec = Math.max(1, Math.ceil(retryInMs / 1000));
      this.protectionLogger.logEvent(ProtectionLogEvent.RATE_LIMIT_BLOCKED, {
        category: 'AUTH_PASSWORD_RESET_OTP',
        route: 'auth:password-reset-otp',
        userId: accountId,
        retryAfter: retryInSec,
        timestamp: new Date().toISOString(),
        securityIssue: false,
      });
      return {
        ok: false as const,
        message: `${PASSWORD_RESET_OTP_MESSAGES.RATE_LIMIT} Try again in ${retryInSec}s.`,
      };
    }
    if (!rl || now - rl.windowStartedAt >= PASSWORD_RESET_OTP.RATE_WINDOW_MS) {
      this.otpRateStore.set(rateKey, { count: 1, windowStartedAt: now });
    } else {
      this.otpRateStore.set(rateKey, { ...rl, count: rl.count + 1 });
    }

    void this.otpStoreService.incrementRate(
      rateKey,
      PASSWORD_RESET_OTP.RATE_WINDOW_MS,
    );

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(
      PASSWORD_RESET_OTP.LENGTH,
      '0',
    );
    const key = this.passwordResetOtpKey(accountScope, accountId, email);
    const entry = {
      hash: this.hashOtp(
        `${otp}:${accountScope}:${accountId.toLowerCase()}:${email}:${PASSWORD_RESET_OTP.PURPOSE}`,
      ),
      expiresAt: now + PASSWORD_RESET_OTP.TTL_MS,
      tries: 0,
      used: false,
    };
    this.otpStore.set(key, entry);
    void this.otpStoreService.setOtp(key, entry, PASSWORD_RESET_OTP.TTL_MS);
    return { ok: true as const, otp };
  }

  private rollbackPasswordResetOtp(
    accountScope: 'fris' | 'admin',
    accountId: string,
    email: string,
  ): void {
    const key = this.passwordResetOtpKey(accountScope, accountId, email);
    this.otpStore.delete(key);
    void this.otpStoreService.deleteOtp(key);
    const rateKey = this.passwordResetRateKey(accountScope, accountId);
    const rl = this.otpRateStore.get(rateKey);
    if (rl && rl.count > 0) {
      this.otpRateStore.set(rateKey, { ...rl, count: rl.count - 1 });
    }
  }

  private async verifyPasswordResetIssuedOtp(
    accountScope: 'fris' | 'admin',
    accountId: string,
    email: string,
    otp: string,
  ) {
    const key = this.passwordResetOtpKey(accountScope, accountId, email);
    const rec =
      (await this.otpStoreService.getOtp(key)) ?? this.otpStore.get(key) ?? null;

    if (!rec) {
      return {
        ok: false as const,
        message: PASSWORD_RESET_OTP_MESSAGES.OTP_NOT_FOUND,
      };
    }
    if (rec.used) {
      return {
        ok: false as const,
        message: PASSWORD_RESET_OTP_MESSAGES.OTP_ALREADY_USED,
      };
    }
    if (Date.now() > rec.expiresAt) {
      this.otpStore.delete(key);
      await this.otpStoreService.deleteOtp(key);
      return {
        ok: false as const,
        message: PASSWORD_RESET_OTP_MESSAGES.OTP_EXPIRED,
      };
    }
    if (rec.tries >= PASSWORD_RESET_OTP.MAX_TRIES) {
      this.otpStore.delete(key);
      await this.otpStoreService.deleteOtp(key);
      return {
        ok: false as const,
        message: PASSWORD_RESET_OTP_MESSAGES.OTP_TOO_MANY_TRIES,
      };
    }

    const expected = this.hashOtp(
      `${otp}:${accountScope}:${accountId.toLowerCase()}:${email}:${PASSWORD_RESET_OTP.PURPOSE}`,
    );
    if (expected !== rec.hash) {
      const updated = { ...rec, tries: rec.tries + 1 };
      this.otpStore.set(key, updated);
      await this.otpStoreService.setOtp(
        key,
        updated,
        Math.max(1, rec.expiresAt - Date.now()),
      );
      return {
        ok: false as const,
        message: PASSWORD_RESET_OTP_MESSAGES.OTP_INCORRECT,
      };
    }

    const usedEntry = {
      ...rec,
      used: true,
      hash: this.hashOtp(`used:${rec.hash}:${Date.now()}`),
    };
    const remainingTtl = Math.max(1, rec.expiresAt - Date.now());
    this.otpStore.set(key, usedEntry);
    await this.otpStoreService.setOtp(key, usedEntry, remainingTtl);

    return { ok: true as const };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const decoded = this.jwtService.verify<
        JwtPayload & { type?: AuthAccountType; jti?: string }
      >(token);
      if (decoded?.purpose && decoded.purpose !== 'password-reset') {
        throw new UnauthorizedException('Invalid or expired token');
      }

      const jti = String(decoded?.jti ?? '').trim();
      if (!jti) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      this.pruneConsumedResetJtis();
      if (this.consumedResetJtis.has(jti)) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      const accountType = decoded?.accountType ?? decoded?.type;
      if (accountType !== 'admin' && accountType !== 'user') {
        throw new UnauthorizedException('Invalid or expired token');
      }

      const passwordPolicyMessages = getPasswordPolicyMessages(newPassword);
      if (passwordPolicyMessages.length > 0) {
        throw new BadRequestException(passwordPolicyMessages);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const encryptedPassword = encryptPassword(newPassword);
      if (accountType === 'admin') {
        await this.adminService.updatePassword(decoded.sub, hashedPassword, {
          loginPassword: encryptedPassword,
        });
      } else {
        await this.userService.updatePassword(decoded.sub, hashedPassword, {
          loginPassword: encryptedPassword,
        });
      }

      this.consumedResetJtis.set(jti, Date.now() + 15 * 60 * 1000);

      return {
        success: true,
        message: 'Password updated successfully',
      };
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof UnauthorizedException
      ) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private pruneConsumedResetJtis(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.consumedResetJtis.entries()) {
      if (expiresAt <= now) {
        this.consumedResetJtis.delete(jti);
      }
    }
  }

  async logoutAll(user: AuthenticatedPrincipal) {
    if (user.accountType === 'admin') {
      await this.adminService.incrementTokenVersion(user.userId);
    } else {
      await this.userService.incrementTokenVersion(user.userId);
    }

    this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
      userId: user.userId,
      userName: user.name,
      userEmail: user.email,
      accountType: user.accountType,
      action: 'Signed out from all devices',
      summary: `${user.name} signed out from all devices (all active sessions ended).`,
      actorRole: humanizeRole(user.role),
      module: 'Authentication',
      page: 'Logout',
      stationId: user.stationId || undefined,
      stationName: user.stationCode || undefined,
      method: 'POST',
      path: '/auth/logout-all',
    });

    return {
      success: true,
      message: 'Logged out from all devices',
    };
  }

  /** Best-effort audit entry before cookies are cleared on public logout routes. */
  recordLogoutActivity(req: Request, scope: 'fris' | 'admin'): void {
    try {
      const token =
        scope === 'admin'
          ? extractAdminAuthCookieToken(req)
          : extractFrisAuthCookieToken(req);
      if (!token) return;

      const decoded = this.jwtService.verify<JwtPayload>(token);
      if (decoded.purpose && decoded.purpose !== 'access') return;

      const accountType: AuthAccountType =
        decoded.accountType ?? (scope === 'admin' ? 'admin' : 'user');

      const logoutName = String(decoded.email ?? 'User');
      const stationCtx = String(decoded.stationCode ?? '').trim();
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
        userId: String(decoded.sub),
        userName: logoutName,
        userEmail: String(decoded.email ?? ''),
        accountType,
        action:
          scope === 'admin'
            ? 'Signed out of admin panel'
            : 'Signed out of FRIS',
        summary:
          `${logoutName} logged out of ${scope === 'admin' ? 'the admin panel' : 'FRIS'}` +
          (stationCtx ? ` (station ${stationCtx})` : '') +
          '.',
        module: 'Authentication',
        page: 'Logout',
        stationId: String(decoded.stationId ?? '').trim() || undefined,
        stationName: stationCtx || undefined,
        ipAddress: extractClientIp(req.headers as Record<string, unknown>),
        userAgent:
          String((req.headers as Record<string, unknown>)['user-agent'] ?? '').trim() ||
          undefined,
        method: 'POST',
        path: scope === 'admin' ? '/auth/admin-logout' : '/auth/logout',
      });
    } catch {
      /* ignore invalid/expired token on logout */
    }
  }
}
