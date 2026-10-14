import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isValidObjectId, Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schema/user.schema';
import {
  PanelUserAdmCounter,
  PanelUserAdmCounterDocument,
} from '../schema/panel-user-adm-counter.schema';
import {
  formatPanelUserAdmNumber,
  normalizePanelUserAdmNumberValue,
  parsePanelUserAdmSeq,
  PANEL_USER_ADM_COUNTER_KEY,
  PANEL_USER_ADM_NUMBER_START,
} from '../utils/panel-user-adm.util';
import { CreatePanelUserDto } from '../dto/create-panel-user.dto';
import { UpdatePanelUserDto } from '../dto/update-panel-user.dto';
import {
  generateTemporaryLoginPassword,
  getPasswordPolicyMessages,
  normalizePasswordInput,
} from '../../common/validators/password-policy';
import {
  encryptPassword,
  decryptPassword,
} from '../../common/security/password-vault.util';
import {
  buildDepartmentRecord,
  buildFlagsFromPermissions,
  normalizeAccessSubPages,
  PERMISSION_SUB_PAGES,
} from '../utils/permissions-to-flags';
import {
  buildStoredPermissionsFromInput,
  expandSuperadminFullPageAccess,
  resolvePrimaryPermissions,
  resolveStationScopedPermissions,
  stationPermissionsHaveAccess,
} from '../utils/station-permissions.util';
import {
  allAppsForStations,
  normalizeStationAppAccess,
} from '../utils/bwms-app-access.util';
import {
  allPagesForStations,
  normalizeStationAppPageAccess,
} from '../utils/bwms-app-page-access.util';
import {
  isUniversalSuperadminUserid,
  UNIVERSAL_SUPERADMIN_USERID,
} from '../utils/universal-superadmin.util';
import type { AdminService } from '../../admin/services/admin.service';
import { lazyService } from '../../common/nestjs/lazy-service.util';
import { sanitizeAdminPanelSections } from '../../admin/admin-panel-sections';
import {
  isSessionInvalidatingUserStatus,
} from '../../auth/utils/auth-account-validation.util';
import {
  nextTokenVersion,
  normalizeTokenVersion,
} from '../../auth/utils/token-version.util';
import {
  USER_ACTIVITY_LOG_EVENT,
  type AuditFieldChange,
  type UserActivityLogEventPayload,
} from '../../user-activity-notifications/events/user-activity.events';
import {
  accessLabel,
  adminSectionLabel,
  diffAdminPanelSections,
  diffPermissionState,
  humanizeRole,
  permissionDeltaLabel,
} from '../../user-activity-notifications/utils/audit-format.util';
import {
  AdminStation,
  AdminStationDocument,
} from '../../admin-stations/schema/admin-station.schema';
import {
  adminPanelStationRegistryFilter,
} from '../../common/station/admin-panel-station-scope';
import { AdminPanelStationScopeService } from '../../common/station/admin-panel-station-scope.service';
import type { AdminPanelStationScope } from '../../common/station/admin-panel-station-scope';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import { UserInviteMailerService } from '../registration/services/user-invite-mailer.service';

type AuthorizationRole = 'superadmin' | 'manager' | 'employee';

/** Identity of the admin performing an action on another account. */
export type PanelUserActor = {
  userId?: string;
  name?: string;
  userid?: string;
  email?: string;
  role?: string;
  accountType?: string;
};

type AuditAccessShape = {
  accessTabs?: string[];
  accessSubPages?: Record<string, string[]>;
};

/** Deep snapshot of an account's auditable state for old/new diffing. */
type AuditAccountSnapshot = {
  role: AuthorizationRole;
  permissions: AuditAccessShape | null;
  stationPermissions: Record<string, AuditAccessShape> | null;
  assignedStationIds: string[];
  adminPanelSections: string[];
  name: string;
  email: string;
  companyEmail: string;
  designation: string;
  departmentLabel: string;
  phone: string;
  status: string;
};

@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PanelUserAdmCounter.name)
    private readonly panelUserAdmCounterModel: Model<PanelUserAdmCounterDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../admin/services/admin.service')
              .AdminService as typeof import('../../admin/services/admin.service').AdminService,
        ),
      ),
    )
    private readonly adminService: AdminService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(AdminStation.name)
    private readonly stationModel: Model<AdminStationDocument>,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
    private readonly inviteMailer: UserInviteMailerService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const normalized = await this.normalizePanelUserAdmNumberFormat();
      if (normalized > 0) {
        this.logger.log(
          `Normalized ${normalized} panel user ID(s) to numeric format (no ADM prefix).`,
        );
      }
      const result = await this.backfillPanelUserAdmNumbers();
      if (result.assigned > 0) {
        this.logger.log(
          `Assigned admin IDs to ${result.assigned} panel user(s); counter at ${result.counter}.`,
        );
      }
      const adminAdmAssigned =
        await this.adminService.backfillMissingAdmNumbers();
      if (adminAdmAssigned > 0) {
        this.logger.log(
          `Assigned ADM numbers to ${adminAdmAssigned} admin account(s).`,
        );
      }
      const syncedSuperadmins =
        await this.syncLegacySuperadminsToAdminDirectory();
      if (syncedSuperadmins > 0) {
        this.logger.log(
          `Synced ${syncedSuperadmins} legacy superadmin profile(s) to the admin directory.`,
        );
      }
      const universalSynced = await this.ensureUniversalSuperadminAccess();
      if (universalSynced) {
        this.logger.log(
          `Universal superadmin ${UNIVERSAL_SUPERADMIN_USERID} elevated with all-station BWMS tile + page grants.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Panel user admin ID sync skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Keep canonical userid `supadm123` as superadmin with every station + every
   * BWMS tile/page from the current catalogs (covers apps added after account creation).
   */
  private async ensureUniversalSuperadminAccess(): Promise<boolean> {
    const userid = UNIVERSAL_SUPERADMIN_USERID;
    const stations = await this.stationModel
      .find({})
      .select('_id')
      .lean()
      .exec();
    const stationIds = stations
      .map((s) => String((s as { _id?: unknown })._id ?? '').trim())
      .filter(Boolean);
    if (stationIds.length === 0) return false;

    const accessTabs = Object.keys(PERMISSION_SUB_PAGES);
    const accessSubPages = normalizeAccessSubPages(accessTabs, {});
    const permissions = { accessTabs, accessSubPages };
    const flags = buildFlagsFromPermissions(accessSubPages);
    const stationPermissions: Record<
      string,
      { accessTabs: string[]; accessSubPages: Record<string, string[]> }
    > = {};
    for (const id of stationIds) {
      stationPermissions[id] = {
        accessTabs: [...accessTabs],
        accessSubPages: { ...accessSubPages },
      };
    }
    const stationAppAccess = allAppsForStations(stationIds);
    const stationAppPageAccess = allPagesForStations(stationIds);

    let changed = false;
    const panelUser = await this.userModel.findOne({ userid });
    if (panelUser) {
      const beforeRole = String(
        (panelUser as { authorizationRole?: string }).authorizationRole ??
          panelUser.role ??
          '',
      )
        .trim()
        .toLowerCase();
      panelUser.authorizationRole = 'superadmin';
      panelUser.role = 'superadmin';
      panelUser.assignedStationIds = stationIds;
      panelUser.stationPermissions = stationPermissions as UserDocument['stationPermissions'];
      panelUser.permissions = permissions as UserDocument['permissions'];
      panelUser.flags = flags as UserDocument['flags'];
      panelUser.stationAppAccess = stationAppAccess as UserDocument['stationAppAccess'];
      panelUser.stationAppPageAccess =
        stationAppPageAccess as UserDocument['stationAppPageAccess'];
      await panelUser.save();
      changed = changed || beforeRole !== 'superadmin';
      changed = true;
    }

    const admin = await this.adminService.findByUserId(userid);
    if (admin) {
      const before = String(admin.role ?? '')
        .trim()
        .toLowerCase();
      let adminChanged = false;
      if (before !== 'superadmin') {
        admin.role = 'superadmin';
        adminChanged = true;
      }
      if (admin.isGlobalAdmin !== true) {
        admin.isGlobalAdmin = true;
        adminChanged = true;
      }
      if (adminChanged) {
        admin.permissions = permissions as typeof admin.permissions;
        admin.flags = flags as typeof admin.flags;
        admin.tokenVersion = nextTokenVersion(admin.tokenVersion);
        await admin.save();
        changed = true;
      }
    }

    return changed;
  }

  private async syncLegacySuperadminsToAdminDirectory(): Promise<number> {
    const rows = await this.userModel
      .find({
        $or: [{ authorizationRole: 'superadmin' }, { role: 'superadmin' }],
      })
      .lean()
      .exec();
    let synced = 0;

    for (const row of rows) {
      const doc = row as unknown as Record<string, unknown>;
      const userid = String(doc.userid ?? '').trim();
      const email = String(doc.email ?? '').trim();
      const name = String(doc.name ?? '').trim();
      if (!userid || !email || !name) continue;

      const existingAdmin = await this.adminService.findByUserId(userid);

      if (existingAdmin) {
        // Admin directory is the source of truth for the Users → Superadmins
        // edit window. Copying users → admin on every boot wiped name/phone/
        // tool edits after re-login or a Nest restart.
        continue;
      }

      const fullUser = await this.userModel
        .findOne({ userid })
        .select('+password')
        .exec();
      if (fullUser?.password && this.canAccessAdminPanel(fullUser)) {
        await this.ensureAdminMirrorWithStoredPassword(fullUser);
        synced++;
      } else {
        this.logger.warn(
          `Superadmin ${userid} has no admin mirror; user record retained.`,
        );
      }
    }

    return synced;
  }

  /** Panel users eligible for sequential ADM numbers (direct add + approved onboarding). */
  private panelUserAdmEligibilityFilter(): Record<string, unknown> {
    return {
      accountStatus: { $ne: 'invited' },
      $or: [
        { createdViaPanel: true },
        {
          approvalStatus: 'approved',
          registrationStatus: 'approved',
        },
        {
          $and: [
            {
              $or: [
                { inviteCode: { $exists: false } },
                { inviteCode: null },
                { inviteCode: '' },
              ],
            },
          ],
        },
      ],
    };
  }

  private missingAdmNumberFilter(): Record<string, unknown> {
    return {
      $or: [
        { admNumber: { $exists: false } },
        { admNumber: null },
        { admNumber: '' },
      ],
    };
  }

  private async maxExistingPanelUserAdmSeq(): Promise<number> {
    const rows = await this.userModel
      .find({ admNumber: { $exists: true, $nin: [null, ''] } })
      .select('admNumber')
      .lean()
      .exec();
    let max = PANEL_USER_ADM_NUMBER_START - 1;
    for (const row of rows) {
      const seq = parsePanelUserAdmSeq(row.admNumber);
      if (seq != null) max = Math.max(max, seq);
    }

    try {
      const adminNumbers = await this.adminService.listAssignedAdmNumbers();
      for (const value of adminNumbers) {
        const seq = parsePanelUserAdmSeq(value);
        if (seq != null) max = Math.max(max, seq);
      }
    } catch {
      // Admin lookup optional during early bootstrap.
    }

    return max;
  }

  /** Strip legacy `ADM-` prefix from stored admin IDs. */
  async normalizePanelUserAdmNumberFormat(): Promise<number> {
    const rows = await this.userModel.find({ admNumber: /^ADM-/i }).exec();
    let updated = 0;
    for (const user of rows) {
      const normalized = normalizePanelUserAdmNumberValue(user.admNumber);
      if (!normalized || normalized === user.admNumber) continue;
      user.admNumber = normalized;
      await user.save();
      updated += 1;
    }
    return updated;
  }

  /** Keep the counter at the highest issued ADM sequence (never reuse on delete). */
  private async syncPanelUserAdmCounterToSeq(seq: number): Promise<void> {
    const floor = PANEL_USER_ADM_NUMBER_START - 1;
    await this.panelUserAdmCounterModel
      .findOneAndUpdate(
        { key: PANEL_USER_ADM_COUNTER_KEY },
        {
          $max: { seq: Math.max(seq, floor) },
          $setOnInsert: { key: PANEL_USER_ADM_COUNTER_KEY },
        },
        { upsert: true },
      )
      .exec();
  }

  private isMongoDuplicateKeyError(error: unknown): boolean {
    const maybe = error as { code?: unknown; message?: unknown };
    return (
      maybe?.code === 11000 ||
      String(maybe?.message ?? '').includes('E11000') ||
      String(maybe?.message ?? '').includes('duplicate key')
    );
  }

  private isAdmNumberDuplicateError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message ?? '');
    return this.isMongoDuplicateKeyError(error) && message.includes('admNumber');
  }

  private conflictForDuplicateKey(error: unknown): ConflictException {
    const message = String((error as { message?: unknown })?.message ?? '');
    if (message.includes('email')) {
      return new ConflictException('User with this email already exists');
    }
    if (message.includes('userid')) {
      return new ConflictException('User with this employee ID already exists');
    }
    if (message.includes('admNumber')) {
      return new ConflictException('Could not allocate a unique admin ID. Please try again.');
    }
    return new ConflictException('User already exists');
  }

  /**
   * Idempotent: assign 100001… to legacy panel users missing a number,
   * then advance the counter so the next create receives the next free slot.
   */
  async backfillPanelUserAdmNumbers(): Promise<{
    assigned: number;
    counter: number;
  }> {
    const missing = await this.userModel
      .find({
        ...this.panelUserAdmEligibilityFilter(),
        ...this.missingAdmNumberFilter(),
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    let seq = await this.maxExistingPanelUserAdmSeq();
    let assigned = 0;

    for (const user of missing) {
      seq += 1;
      user.admNumber = formatPanelUserAdmNumber(seq);
      user.createdViaPanel = true;
      await user.save();
      assigned += 1;
    }

    const counterSeq = await this.maxExistingPanelUserAdmSeq();
    await this.syncPanelUserAdmCounterToSeq(counterSeq);

    return { assigned, counter: counterSeq };
  }

  private getFrontendBaseUrl(): string {
    return (
      process.env.FRONTEND_URL ||
      process.env.CLIENT_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private userMatchesAdminPanelStationScope(
    assignedStationIds: string[] | undefined,
    scope: AdminPanelStationScope,
  ): boolean {
    if (scope === 'all') return true;
    const assigned = (assignedStationIds ?? []).map(String).filter(Boolean);
    return assigned.some((id) => scope.includes(id));
  }

  /** Resolve "Station Name (CODE)" for a station id; falls back gracefully. */
  private async resolveStationLabel(
    stationId: string | undefined | null,
  ): Promise<{ id: string; name: string } | null> {
    const id = String(stationId ?? '').trim();
    if (!id) return null;
    try {
      const doc = await this.stationModel
        .findById(id)
        .select('name code stationCode')
        .lean()
        .exec();
      if (!doc) return { id, name: id };
      const name = String(doc.name ?? '').trim();
      const code = String(doc.stationCode ?? doc.code ?? '').trim();
      const label = name && code ? `${name} (${code})` : name || code || id;
      return { id, name: label };
    } catch {
      return { id, name: id };
    }
  }

  private normalizeAuthorizationRole(role: string): AuthorizationRole {
    const normalized = role.trim().toLowerCase();
    if (normalized === 'superadmin') return 'superadmin';
    if (normalized === 'manager' || normalized === 'admin' || normalized === 'operations') {
      return 'manager';
    }
    return 'employee';
  }

  private resolveSerializedAuthorizationRole(doc: {
    authorizationRole?: unknown;
    role?: unknown;
  }): AuthorizationRole {
    const stored = String(doc.authorizationRole ?? '').trim().toLowerCase();
    if (stored === 'superadmin' || stored === 'manager' || stored === 'employee') {
      return stored;
    }
    if (stored === 'admin' || stored === 'operations') {
      return 'manager';
    }
    const legacy = String(doc.role ?? '').trim().toLowerCase();
    if (legacy === 'superadmin') {
      return 'superadmin';
    }
    if (legacy === 'admin' || legacy === 'manager' || legacy === 'operations') {
      return 'manager';
    }
    return 'employee';
  }

  /** Panel users granted admin-panel sections or elevated authorization may sign in at /admin/login. */
  canAccessAdminPanel(doc: {
    authorizationRole?: unknown;
    role?: unknown;
    adminPanelSections?: unknown;
  }): boolean {
    const authRole = this.resolveSerializedAuthorizationRole(doc);
    if (authRole === 'superadmin' || authRole === 'manager') {
      return true;
    }
    const sections = doc.adminPanelSections;
    return Array.isArray(sections) && sections.length > 0;
  }

  /**
   * Mirror a FRIS panel user into `admins` so admin-panel login can issue
   * `fris_admin_session` (admin-login only queries the admin collection).
   */
  async ensureAdminMirrorForPanelLogin(
    panelUser: UserDocument,
    plaintextPassword: string,
  ): Promise<void> {
    if (!this.canAccessAdminPanel(panelUser)) {
      return;
    }

    const authRole = this.resolveSerializedAuthorizationRole(panelUser.toObject());
    if (authRole === 'employee') {
      return;
    }

    const storedAdminPanelSections = sanitizeAdminPanelSections(
      panelUser.adminPanelSections as string[] | undefined,
    );

    await this.syncAdminAuthorizationAccount({
      authRole,
      userid: String(panelUser.userid),
      name: String(panelUser.name),
      email: String(panelUser.email),
      password: plaintextPassword.trim(),
      permissions: resolvePrimaryPermissions({
        assignedStationIds: panelUser.assignedStationIds ?? [],
        stationPermissions: panelUser.stationPermissions as Record<
          string,
          { accessTabs: string[]; accessSubPages: Record<string, string[]> }
        >,
        permissions: panelUser.permissions as {
          accessTabs: string[];
          accessSubPages: Record<string, string[]>;
        },
      }),
      adminPanelSections: storedAdminPanelSections,
      profile: {
        employeeId: panelUser.employeeId,
        admNumber: panelUser.admNumber,
        firstName: panelUser.firstName,
        lastName: panelUser.lastName,
        gender: panelUser.gender,
        dob: panelUser.dob,
        phone: panelUser.phone,
        residence: panelUser.residence,
        state: panelUser.state,
        country: panelUser.country,
        pincode: panelUser.pincode,
        joiningDate: panelUser.joiningDate,
        department: panelUser.departmentLabel,
        subDepartment: panelUser.subDepartment,
        designation: panelUser.designation,
        company: panelUser.company,
        station: panelUser.station,
        assignedStationIds: panelUser.assignedStationIds,
        stationPermissions: panelUser.stationPermissions as Record<
          string,
          { accessTabs: string[]; accessSubPages: Record<string, string[]> }
        >,
        stationAppAccess: panelUser.stationAppAccess as Record<string, string[]>,
        stationAppPageAccess: panelUser.stationAppPageAccess as Record<
          string,
          Record<string, string[]>
        >,
        locations: panelUser.locations,
      },
    });
  }

  /** Boot repair: copy stored bcrypt hash when no admin mirror exists yet. */
  async ensureAdminMirrorWithStoredPassword(
    panelUser: UserDocument,
  ): Promise<void> {
    if (!this.canAccessAdminPanel(panelUser)) {
      return;
    }

    const authRole = this.resolveSerializedAuthorizationRole(panelUser.toObject());
    if (authRole === 'employee') {
      return;
    }

    const hashedPassword = String(panelUser.password ?? '').trim();
    if (!hashedPassword) {
      return;
    }

    const storedAdminPanelSections = sanitizeAdminPanelSections(
      panelUser.adminPanelSections as string[] | undefined,
    );

    await this.adminService.createPanelUserMirror({
      panelUser,
      authRole,
      permissions: resolvePrimaryPermissions({
        assignedStationIds: panelUser.assignedStationIds ?? [],
        stationPermissions: panelUser.stationPermissions as Record<
          string,
          { accessTabs: string[]; accessSubPages: Record<string, string[]> }
        >,
        permissions: panelUser.permissions as {
          accessTabs: string[];
          accessSubPages: Record<string, string[]>;
        },
      }),
      adminPanelSections: storedAdminPanelSections,
      hashedPassword,
    });
  }

  private async syncAdminAuthorizationAccount(input: {
    authRole: AuthorizationRole;
    userid: string;
    name: string;
    email: string;
    password?: string;
    permissions: {
      accessTabs: string[];
      accessSubPages: Record<string, string[]>;
    };
    adminPanelSections?: string[];
    creatorRole?: string;
    profile?: Omit<
      Partial<CreatePanelUserDto>,
      | 'userid'
      | 'name'
      | 'email'
      | 'password'
      | 'role'
      | 'permissions'
      | 'adminPanelSections'
    > & {
      admNumber?: string;
    };
  }) {
    const existingAdmin = await this.adminService.findByUserId(input.userid);

    if (input.authRole === 'employee') {
      if (existingAdmin?._id) {
        await this.adminService.deletePanelAdmin(String(existingAdmin._id));
      }
      return;
    }

    if (existingAdmin?._id) {
      const adminUpdate: Parameters<AdminService['updatePanelAdmin']>[1] = {
        ...input.profile,
        name: input.name,
        email: input.email,
        role: input.authRole,
        permissions: input.permissions,
        adminPanelSections: input.adminPanelSections,
      };
      const profileAdm = String(adminUpdate.admNumber ?? '').trim();
      const existingAdm = String(
        (existingAdmin as { admNumber?: string }).admNumber ?? '',
      ).trim();
      if (!profileAdm) {
        adminUpdate.admNumber =
          existingAdm || (await this.allocateNextAdmNumber());
      }
      const explicitPassword = input.password?.trim();
      if (explicitPassword) {
        adminUpdate.password = explicitPassword;
      }
      await this.adminService.updatePanelAdmin(String(existingAdmin._id), adminUpdate, {
        skipUserMirror: true,
      });
      return;
    }

    const passwordForAdmin = input.password?.trim();

    if (!passwordForAdmin) {
      return;
    }

    await this.adminService.createAdmin(
      {
        ...input.profile,
        userid: input.userid,
        name: input.name,
        email: input.email,
        password: passwordForAdmin,
        role: input.authRole,
        permissions: input.permissions,
        adminPanelSections: input.adminPanelSections,
      },
      input.creatorRole,
    );
  }

  private normalizeEmail(email: string): string {
    if (typeof email !== 'string') {
      throw new BadRequestException('Email must be a string');
    }
    return email.trim().toLowerCase();
  }

  private normalizeUserId(userid: string): string {
    if (typeof userid !== 'string') {
      throw new BadRequestException('User ID must be a string');
    }
    return userid.trim();
  }

  /** Next numeric admin ID (100001, 100002, …) for panel users and admin accounts. */
  async allocateNextAdmNumber(): Promise<string> {
    const maxSeq = await this.maxExistingPanelUserAdmSeq();
    await this.syncPanelUserAdmCounterToSeq(maxSeq);

    const counter = await this.panelUserAdmCounterModel
      .findOneAndUpdate(
        { key: PANEL_USER_ADM_COUNTER_KEY },
        { $inc: { seq: 1 } },
        { new: true },
      )
      .lean()
      .exec();

    const seq = Number(counter?.seq ?? PANEL_USER_ADM_NUMBER_START);
    const normalized = Math.max(seq, PANEL_USER_ADM_NUMBER_START);
    return formatPanelUserAdmNumber(normalized);
  }

  /** @deprecated Prefer {@link allocateNextAdmNumber}. */
  private async allocateNextPanelUserAdmNumber(): Promise<string> {
    return this.allocateNextAdmNumber();
  }

  async findAdmNumberByUserId(userid: string): Promise<string | undefined> {
    const normalized = String(userid ?? '').trim();
    if (!normalized) return undefined;
    const row = await this.userModel
      .findOne({ userid: normalized })
      .select('admNumber')
      .lean()
      .exec();
    const value = String(row?.admNumber ?? '').trim();
    return value || undefined;
  }

  /** Assign the next ADM number when missing (e.g. after onboarding approval). */
  async ensurePanelUserAdmNumber(
    user: UserDocument,
  ): Promise<string | undefined> {
    const existing = String(user.admNumber ?? '').trim();
    if (existing) return existing;

    user.admNumber = await this.allocateNextPanelUserAdmNumber();
    user.createdViaPanel = true;
    return user.admNumber;
  }

  async savePanelUserWithAdmNumberRetry(
    user: UserDocument,
    maxAttempts = 5,
  ): Promise<UserDocument> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await user.save();
      } catch (error) {
        if (!this.isMongoDuplicateKeyError(error)) {
          throw error;
        }

        if (this.isAdmNumberDuplicateError(error) && attempt < maxAttempts - 1) {
          user.admNumber = await this.allocateNextPanelUserAdmNumber();
          user.createdViaPanel = true;
          continue;
        }

        throw this.conflictForDuplicateKey(error);
      }
    }

    throw new ConflictException('Could not allocate a unique admin ID. Please try again.');
  }

  async createPanelUser(
    data: CreatePanelUserDto,
    creatorRole?: string,
    actor?: PanelUserActor,
  ) {
    const {
      userid,
      name,
      email,
      companyEmail,
      password,
      role,
      department,
      subDepartment,
      permissions,
      assignedStationIds,
      stationPermissions,
      adminPanelSections,
      employeeId,
      ...profile
    } = data;
    const normalizedPassword = normalizePasswordInput(password);

    if (
      !userid?.trim() ||
      !name?.trim() ||
      !email?.trim() ||
      !role?.trim() ||
      typeof normalizedPassword !== 'string' ||
      !normalizedPassword
    ) {
      throw new BadRequestException('Missing required user fields');
    }

    const passwordPolicyMessages = getPasswordPolicyMessages(normalizedPassword);
    if (passwordPolicyMessages.length > 0) {
      throw new BadRequestException(passwordPolicyMessages);
    }

    const normalizedEmail = this.normalizeEmail(email);
    const normalizedUserid = this.normalizeUserId(userid);
    // Canonical universal id is always the superadmin category.
    const authRole: AuthorizationRole = isUniversalSuperadminUserid(
      normalizedUserid,
    )
      ? 'superadmin'
      : this.normalizeAuthorizationRole(role);

    const [existingEmail, existingUserid] = await Promise.all([
      this.userModel.findOne({ email: normalizedEmail }).lean().exec(),
      this.userModel.findOne({ userid: normalizedUserid }).lean().exec(),
    ]);

    if (existingEmail) {
      throw new ConflictException('User with this email already exists');
    }
    if (existingUserid) {
      throw new ConflictException('User with this employee ID already exists');
    }

    const departmentRecord = buildDepartmentRecord(department, subDepartment);
    let storedAccess = buildStoredPermissionsFromInput({
      assignedStationIds,
      stationPermissions,
      permissions,
    });
    // Universal portal id always gets full FRIS. Other superadmins keep the
    // grants sent from the form (same path as employees).
    if (isUniversalSuperadminUserid(normalizedUserid)) {
      storedAccess = expandSuperadminFullPageAccess(storedAccess);
    }

    if (Object.keys(storedAccess.flags).length === 0) {
      throw new BadRequestException(
        'At least one FRIS module or page must be enabled in permissions.',
      );
    }

    const assigned = storedAccess.assignedStationIds;
    if (assigned.length > 0) {
      for (const stationId of assigned) {
        if (!stationPermissionsHaveAccess(storedAccess.stationPermissions, stationId)) {
          throw new BadRequestException(
            'Each assigned station must have at least one permission enabled.',
          );
        }
      }
    }

    const incomingAppAccess = (data as { stationAppAccess?: Record<string, string[]> })
      .stationAppAccess;
    const incomingAppPageAccess = (
      data as { stationAppPageAccess?: Record<string, Record<string, string[]>> }
    ).stationAppPageAccess;

    const storedStationAppAccess = isUniversalSuperadminUserid(normalizedUserid)
      ? allAppsForStations(assigned)
      : normalizeStationAppAccess(incomingAppAccess);

    const storedStationAppPageAccess = isUniversalSuperadminUserid(normalizedUserid)
      ? allPagesForStations(assigned)
      : normalizeStationAppPageAccess(incomingAppPageAccess);

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const storedPermissions = storedAccess.permissions;
    // Admin-panel section grants only apply to elevated (admin/superadmin) roles.
    const storedAdminPanelSections =
      authRole === 'employee'
        ? undefined
        : sanitizeAdminPanelSections(adminPanelSections);

    const admNumber = await this.allocateNextAdmNumber();

    await this.syncAdminAuthorizationAccount({
      authRole,
      userid: normalizedUserid,
      name: name.trim(),
      email: normalizedEmail,
      password: normalizedPassword,
      permissions: storedPermissions,
      adminPanelSections: storedAdminPanelSections,
      creatorRole,
      profile: {
        ...profile,
        employeeId: employeeId?.trim() || normalizedUserid,
        companyEmail: companyEmail?.trim().toLowerCase() || normalizedEmail,
        department: department.trim(),
        subDepartment: subDepartment?.trim() || undefined,
        assignedStationIds: storedAccess.assignedStationIds,
        stationPermissions: storedAccess.stationPermissions,
        stationAppAccess: storedStationAppAccess,
        stationAppPageAccess: storedStationAppPageAccess,
        admNumber,
      },
    });

    const user = new this.userModel({
      ...profile,
      userid: normalizedUserid,
      name: name.trim(),
      email: normalizedEmail,
      companyEmail: companyEmail?.trim().toLowerCase() || normalizedEmail,
      password: hashedPassword,
      loginPassword: encryptPassword(normalizedPassword),
      role: 'employee',
      authorizationRole: authRole,
      employeeId: employeeId?.trim() || normalizedUserid,
      admNumber,
      createdViaPanel: true,
      departmentLabel: department.trim(),
      subDepartment: subDepartment?.trim() || undefined,
      department: departmentRecord,
      flags: storedAccess.flags,
      permissions: storedPermissions,
      adminPanelSections: storedAdminPanelSections,
      assignedStationIds: storedAccess.assignedStationIds,
      stationPermissions: storedAccess.stationPermissions,
      stationAppAccess: storedStationAppAccess,
      stationAppPageAccess: storedStationAppPageAccess,
      isActive: true,
      accountStatus: 'active',
      approvalStatus: 'approved',
      registrationStatus: 'approved',
      approvedAt: new Date(),
    });

    const saved = await this.savePanelUserWithAdmNumberRetry(user);
    const doc = saved.toObject();

    await this.logUserLifecycle('create', saved, actor);

    // Auto-send credentials email at creation time (plaintext is still in memory).
    const creationEmail = String(
      companyEmail?.trim().toLowerCase() || normalizedEmail,
    );
    if (creationEmail) {
      this.inviteMailer
        .sendFrisAccessCredentialsEmail({
          to: creationEmail,
          employeeName: name.trim(),
          employeeId: employeeId?.trim() || normalizedUserid,
          password: normalizedPassword,
          company: (profile as Record<string, unknown>).company as string | undefined,
          loginUrl: this.getFrontendBaseUrl(),
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `Auto-send credentials email on create failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }

    return {
      success: true,
      message: 'User created successfully',
      data: {
        id: String(doc._id),
        userid: doc.userid,
        email: doc.email,
        name: doc.name,
        role: this.resolveSerializedAuthorizationRole(
          doc as unknown as Record<string, unknown>,
        ),
        authorizationRole: this.resolveSerializedAuthorizationRole(
          doc as unknown as Record<string, unknown>,
        ),
        employeeId: doc.employeeId,
        admNumber: doc.admNumber,
        permissions: doc.permissions,
        /** One-time reveal at create only — not stored in Mongo. */
        initialPassword: normalizedPassword,
        hasPassword: true,
      },
    };
  }

  private serializePanelUser(doc: Record<string, unknown>) {
    return {
      id: String(doc._id),
      accountKind: 'user' as const,
      userid: doc.userid,
      employeeId: doc.employeeId ?? doc.userid,
      admNumber: doc.admNumber,
      name: doc.name,
      email: doc.email,
      companyEmail: doc.companyEmail ?? doc.email,
      hasPassword: true,
      loginPassword: (doc as Record<string, unknown>).loginPassword
        ? decryptPassword(String((doc as Record<string, unknown>).loginPassword)) ?? undefined
        : undefined,
      role: this.resolveSerializedAuthorizationRole(doc),
      authorizationRole: this.resolveSerializedAuthorizationRole(doc),
      firstName: doc.firstName,
      lastName: doc.lastName,
      gender: doc.gender,
      dob: doc.dob,
      fatherName: doc.fatherName,
      motherName: doc.motherName,
      phone: doc.phone,
      residence: doc.residence,
      state: doc.state,
      country: doc.country,
      pincode: doc.pincode,
      joiningDate: doc.joiningDate,
      trainingTitle: doc.trainingTitle,
      trainings: doc.trainings,
      department: doc.departmentLabel ?? this.formatDepartment(doc.department),
      subDepartment: doc.subDepartment,
      designation: doc.designation ?? '—',
      status: doc.status ?? 'Active',
      company: doc.company,
      station: doc.station,
      assignedStationIds: Array.isArray(doc.assignedStationIds)
        ? doc.assignedStationIds.map(String)
        : [],
      stationPermissions: (doc.stationPermissions ?? {}) as Record<
        string,
        { accessTabs: string[]; accessSubPages: Record<string, string[]> }
      >,
      stationAppAccess: (doc.stationAppAccess ?? {}) as Record<string, string[]>,
      stationAppPageAccess: (doc.stationAppPageAccess ?? {}) as Record<
        string,
        Record<string, string[]>
      >,
      locations:
        doc.locations ??
        (doc.registrationDraft as { office?: string } | undefined)?.office,
      isActive: doc.isActive ?? true,
      accountStatus: doc.accountStatus ?? 'active',
      approvalStatus: doc.approvalStatus ?? 'approved',
      inviteId: doc.inviteId,
      lastActivityAt: doc.lastActivityAt,
      permissions: doc.permissions,
      adminPanelSections: Array.isArray(doc.adminPanelSections)
        ? (doc.adminPanelSections as unknown[]).map(String)
        : undefined,
      createdAt: (doc as { createdAt?: Date }).createdAt,
    };
  }



  async listCredentialsByStation(principal: AuthenticatedPrincipal) {
    const scope = await this.adminPanelStationScope.resolve(principal);

    if (scope !== 'all' && scope.length === 0) {
      return { success: true, count: 0, data: [] };
    }

    const stationFilter = adminPanelStationRegistryFilter(scope);

    const stations = await this.stationModel
      .find(stationFilter)
      .sort({ code: 1, name: 1 })
      .lean()
      .exec();

    const stationIds = stations.map((row) => String(row._id));
    if (!stationIds.length) {
      return { success: true, count: 0, data: [] };
    }

    const userRows = await this.userModel
      .find({
        accountStatus: { $ne: 'invited' },
        assignedStationIds: { $in: stationIds },
      })
      .select(
        'name userid employeeId assignedStationIds joiningDate email companyEmail company permissions stationPermissions loginPassword',
      )
      .sort({ name: 1 })
      .lean()
      .exec();

    const allUserids = userRows.map((u) => u.userid).filter(Boolean);
    const adminPasswordMap = await this.adminService.findLoginPasswordsByUserids(allUserids);

    const data = stations.map((station) => {
      const stationId = String(station._id);
      const employees = userRows
        .filter((row) => {
          const assigned = Array.isArray(row.assignedStationIds)
            ? row.assignedStationIds.map(String)
            : [];
          return assigned.includes(stationId);
        })
        .map((row) => {
          const assigned = Array.isArray(row.assignedStationIds)
            ? row.assignedStationIds.map(String)
            : [];
          const scoped = resolveStationScopedPermissions({
            assignedStationIds: assigned,
            stationPermissions: (row.stationPermissions ?? {}) as Record<
              string,
              { accessTabs: string[]; accessSubPages: Record<string, string[]> }
            >,
            permissions: (row.permissions ?? {
              accessTabs: [],
              accessSubPages: {},
            }) as { accessTabs: string[]; accessSubPages: Record<string, string[]> },
            stationId,
          });

          const rowLoginPassword = (row as unknown as { loginPassword?: string }).loginPassword;
          let decryptedLoginPassword = rowLoginPassword
            ? decryptPassword(String(rowLoginPassword)) ?? undefined
            : undefined;

          if (!decryptedLoginPassword && row.userid && adminPasswordMap.has(row.userid)) {
            decryptedLoginPassword = adminPasswordMap.get(row.userid);
          }

          return {
            id: String(row._id),
            name: String(row.name ?? '').trim() || '—',
            userid: String(row.userid ?? '').trim(),
            employeeId: String(row.employeeId ?? row.userid ?? '').trim(),
            email:
              String(row.companyEmail ?? row.email ?? '').trim().toLowerCase() ||
              undefined,
            joiningDate: String(row.joiningDate ?? '').trim() || undefined,
            hasPassword: true,
            loginPassword: decryptedLoginPassword,
            accessTabs: scoped.accessTabs,
          };
        });

      return {
        stationId,
        stationCode: String(station.code ?? station.stationCode ?? '').trim(),
        stationName: String(station.name ?? '').trim(),
        employeeCount: employees.length,
        employees,
      };
    });

    return {
      success: true,
      count: data.length,
      data,
    };
  }

  async shootCredentialsEmail(
    userId: string,
    principal: AuthenticatedPrincipal,
  ) {
    const scope = await this.adminPanelStationScope.resolve(principal);
    if (scope !== 'all' && scope.length === 0) {
      throw new ForbiddenException('You do not have access to send credentials');
    }

    let user = isValidObjectId(userId)
      ? await this.userModel
          .findById(userId)
          .select('+loginPassword')
          .exec()
      : null;
    if (!user) {
      user = await this.userModel
        .findOne({ $or: [{ userid: userId }, { employeeId: userId }] })
        .select('+loginPassword')
        .exec();
    }
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      !this.userMatchesAdminPanelStationScope(user.assignedStationIds, scope)
    ) {
      throw new ForbiddenException('You do not have access to this employee');
    }

    const toEmail = String(user.companyEmail ?? user.email ?? '')
      .trim()
      .toLowerCase();
    const employeeId = String(user.employeeId ?? user.userid ?? '').trim();

    if (!toEmail) {
      return {
        success: false,
        message: 'Employee email is missing.',
      };
    }
    if (!employeeId) {
      return {
        success: false,
        message: 'Employee ID is missing.',
      };
    }

    // Retrieve the decrypted password from the encrypted vault.
    let password = user.loginPassword ? decryptPassword(user.loginPassword) : null;

    // If not found in user document, check if matching admin document has it
    if (!password && user.userid) {
      const adminDoc = await this.adminService.findByUserId(user.userid);
      if (adminDoc) {
        const adminPass = (adminDoc as unknown as { loginPassword?: string }).loginPassword;
        if (adminPass) {
          const decryptedAdminPass = decryptPassword(adminPass);
          if (decryptedAdminPass) {
            password = decryptedAdminPass;
            user.loginPassword = adminPass;
            user.password = adminDoc.password;
            await user.save();
          }
        }
      }
    }

    if (!password) {
      password = generateTemporaryLoginPassword();
      user.password = await bcrypt.hash(password, 10);
      user.loginPassword = encryptPassword(password);
      user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
      await user.save();
    }

    const mailResult = await this.inviteMailer.sendFrisAccessCredentialsEmail({
      to: toEmail,
      employeeName: String(user.name ?? '').trim() || undefined,
      employeeId,
      password,
      company: String(user.company ?? '').trim() || undefined,
      loginUrl: this.getFrontendBaseUrl(),
    });

    if (mailResult.sent) {
      const employeeName = String(user.name ?? employeeId).trim();
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, {
        userId: String(principal.userId),
        userName: principal.name,
        userEmail: principal.email,
        accountType: principal.accountType,
        action: 'Shot credentials email',
        summary: `${principal.name} emailed FRIS login credentials to ${employeeName} (${employeeId}) at ${toEmail}.`,
        actorRole: humanizeRole(principal.role),
        module: 'Admin Panel',
        page: 'User ID & Password',
        entityType: 'user',
        entityId: String(user._id),
        entityName: employeeName,
        method: 'POST',
        path: `/users/panel/${userId}/shoot-credentials`,
      });
    }

    return {
      success: mailResult.sent,
      message: mailResult.sent
        ? `Credentials sent to ${toEmail}`
        : mailResult.error ?? 'Could not send credentials email.',
      data: {
        email: toEmail,
        credentialsEmailSent: mailResult.sent,
      },
    };
  }

  async listPanelUsersByStation(stationId: string) {
    const normalizedStationId = stationId?.trim();
    if (!normalizedStationId) {
      throw new BadRequestException('Station id is required');
    }

    const rows = await this.userModel
      .find({
        accountStatus: { $ne: 'invited' },
        assignedStationIds: normalizedStationId,
        authorizationRole: { $ne: 'superadmin' },
        role: { $ne: 'superadmin' },
      })
      .select('-password')
      .sort({ name: 1 })
      .lean()
      .exec();

    return {
      success: true,
      count: rows.length,
      data: rows.map((doc) =>
        this.serializePanelUser(doc as unknown as Record<string, unknown>),
      ),
    };
  }

  /**
   * Public-safe directory for D1 modules: userid + name only.
   * Scoped to caller's station when provided; otherwise caller's assigned stations.
   */
  async listFrisStationDirectory(
    actor: { userId?: string; stationId?: string; stationCode?: string },
    stationId?: string,
  ) {
    const normalizedStationId = String(stationId ?? '').trim();
    const filter: Record<string, unknown> = {
      accountStatus: { $ne: 'invited' },
      authorizationRole: { $ne: 'superadmin' },
      role: { $ne: 'superadmin' },
    };
    if (normalizedStationId) {
      filter.assignedStationIds = normalizedStationId;
    }

    const rows = await this.userModel
      .find(filter)
      .select({ userid: 1, name: 1, employeeId: 1, assignedStationIds: 1 })
      .sort({ name: 1 })
      .lean()
      .exec();

    const data = rows
      .map((doc) => {
        const userId = String(
          (doc as { userid?: string }).userid ??
            (doc as { employeeId?: string }).employeeId ??
            '',
        ).trim();
        if (!userId) return null;
        return {
          userId,
          userName: String((doc as { name?: string }).name ?? userId).trim(),
          stationId: normalizedStationId || undefined,
          stationCode: actor.stationCode || undefined,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    return {
      success: true,
      count: data.length,
      data,
    };
  }

  async listPanelUsers() {
    const rows = await this.userModel
      .find({
        accountStatus: { $ne: 'invited' },
        authorizationRole: { $ne: 'superadmin' },
        role: { $ne: 'superadmin' },
      })
      .select('-password +loginPassword')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean()
      .exec();

    return {
      success: true,
      count: rows.length,
      data: rows.map((doc) => this.serializePanelUser(doc as unknown as Record<string, unknown>)),
    };
  }

  async getPanelUserById(userId: string) {
    let doc = isValidObjectId(userId)
      ? await this.userModel
          .findById(userId)
          .select('-password +loginPassword')
          .lean()
          .exec()
      : null;
    if (!doc) {
      doc = await this.userModel
        .findOne({ $or: [{ userid: userId }, { employeeId: userId }] })
        .select('-password +loginPassword')
        .lean()
        .exec();
    }
    if (!doc) {
      throw new NotFoundException('User not found');
    }
    return {
      success: true,
      data: this.serializePanelUser(doc as unknown as Record<string, unknown>),
    };
  }

  async updatePanelUser(
    userId: string,
    data: UpdatePanelUserDto,
    creatorRole?: string,
    actor?: PanelUserActor,
  ) {
    let existing = isValidObjectId(userId)
      ? await this.userModel.findById(userId).exec()
      : null;
    if (!existing) {
      existing = await this.userModel
        .findOne({ $or: [{ userid: userId }, { employeeId: userId }] })
        .exec();
    }
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Snapshot the account state BEFORE mutations so we can detect (and log,
    // in human-readable detail) exactly what an admin changed.
    const auditBefore = this.auditSnapshot(existing);

    const {
      name,
      email,
      companyEmail,
      password,
      role,
      department,
      subDepartment,
      permissions,
      assignedStationIds,
      stationPermissions,
      stationAppAccess,
      stationAppPageAccess,
      adminPanelSections,
      ...profile
    } = data;

    if (email?.trim()) {
      const normalizedEmail = this.normalizeEmail(email);
      const conflict = await this.userModel
        .findOne({ email: normalizedEmail, _id: { $ne: existing._id } })
        .lean()
        .exec();
      if (conflict) {
        throw new ConflictException('User with this email already exists');
      }
      existing.email = normalizedEmail;
      if (existing.inviteId || existing.inviteStatus) {
        existing.companyEmail = normalizedEmail;
      }
    }

    if (companyEmail !== undefined) {
      existing.companyEmail = companyEmail.trim()
        ? companyEmail.trim().toLowerCase()
        : undefined;
    }

    if (name?.trim()) {
      existing.name = name.trim();
    }

    let nextAuthRole = this.resolveSerializedAuthorizationRole(existing.toObject());
    const previousAuthRole = nextAuthRole;
    if (isUniversalSuperadminUserid(existing.userid)) {
      // Never demote the universal BWMS portal id.
      nextAuthRole = 'superadmin';
      existing.authorizationRole = 'superadmin';
      existing.role = 'superadmin';
    } else if (role?.trim()) {
      nextAuthRole = this.normalizeAuthorizationRole(role);
      existing.authorizationRole = nextAuthRole;
      existing.role = 'employee';
    }

    if (department?.trim()) {
      existing.departmentLabel = department.trim();
      existing.department = buildDepartmentRecord(
        department,
        subDepartment ?? existing.subDepartment,
      );
    } else if (subDepartment !== undefined) {
      existing.subDepartment = subDepartment.trim() || undefined;
      if (existing.departmentLabel) {
        existing.department = buildDepartmentRecord(
          existing.departmentLabel,
          existing.subDepartment,
        );
      }
    }

    let shouldInvalidateSessions = false;

    if (
      permissions !== undefined ||
      assignedStationIds !== undefined ||
      stationPermissions !== undefined
    ) {
      let storedAccess = buildStoredPermissionsFromInput({
        assignedStationIds:
          assignedStationIds ?? existing.assignedStationIds ?? [],
        stationPermissions:
          stationPermissions ??
          (existing.stationPermissions as Record<
            string,
            { accessTabs: string[]; accessSubPages: Record<string, string[]> }
          >),
        permissions: permissions ?? existing.permissions,
      });
      // Universal portal id always keeps full FRIS. Other superadmins keep
      // explicit grants when the permissions step sends them. Stations-only
      // assignment for a superadmin seeds full FRIS on every assigned station
      // so a newly added station (e.g. DEL) is usable immediately after save.
      if (isUniversalSuperadminUserid(existing.userid)) {
        storedAccess = expandSuperadminFullPageAccess(storedAccess);
      } else if (nextAuthRole === 'superadmin') {
        if (
          previousAuthRole !== 'superadmin' &&
          permissions === undefined &&
          stationPermissions === undefined
        ) {
          storedAccess = expandSuperadminFullPageAccess(storedAccess);
        } else if (
          assignedStationIds !== undefined &&
          stationPermissions === undefined &&
          permissions === undefined
        ) {
          storedAccess = expandSuperadminFullPageAccess(storedAccess);
        }
      }

      // Only apply strict "at least one permission" checks when the caller is
      // explicitly submitting permissions data (permissions / stationPermissions).
      // Pure station-assignment updates (assignedStationIds only, no permissions)
      // are allowed to carry forward existing user permissions so the admin can
      // set permissions in a subsequent step without being blocked here.
      const isExplicitPermissionUpdate =
        permissions !== undefined || stationPermissions !== undefined;

      if (isExplicitPermissionUpdate) {
        if (Object.keys(storedAccess.flags).length === 0) {
          throw new BadRequestException(
            'At least one FRIS module or page must be enabled in permissions.',
          );
        }

        const assigned = storedAccess.assignedStationIds;
        if (assigned.length > 0) {
          for (const stationId of assigned) {
            if (!stationPermissionsHaveAccess(storedAccess.stationPermissions, stationId)) {
              throw new BadRequestException(
                'Each assigned station must have at least one permission enabled.',
              );
            }
          }
        }
      }

      existing.flags = storedAccess.flags;
      existing.permissions = storedAccess.permissions;
      existing.assignedStationIds = storedAccess.assignedStationIds;
      existing.stationPermissions = storedAccess.stationPermissions;
      shouldInvalidateSessions = true;
    } else if (
      isUniversalSuperadminUserid(existing.userid) ||
      (nextAuthRole === 'superadmin' && previousAuthRole !== 'superadmin')
    ) {
      // Universal id, or first promotion to superadmin without a permissions
      // payload: seed full FRIS access. Later edits keep stored grants.
      const expanded = expandSuperadminFullPageAccess({
        assignedStationIds: existing.assignedStationIds ?? [],
        stationPermissions:
          (existing.stationPermissions as Record<
            string,
            { accessTabs: string[]; accessSubPages: Record<string, string[]> }
          >) ?? {},
        permissions: existing.permissions ?? {
          accessTabs: [],
          accessSubPages: {},
        },
        flags: existing.flags ?? {},
      });
      existing.flags = expanded.flags;
      existing.permissions = expanded.permissions;
      existing.stationPermissions = expanded.stationPermissions;
      shouldInvalidateSessions = true;
    }

    if (stationAppAccess !== undefined) {
      existing.stationAppAccess = normalizeStationAppAccess(stationAppAccess);
      shouldInvalidateSessions = true;
    } else if (
      isUniversalSuperadminUserid(existing.userid) ||
      (nextAuthRole === 'superadmin' && previousAuthRole !== 'superadmin')
    ) {
      const assigned =
        existing.assignedStationIds ?? assignedStationIds ?? [];
      existing.stationAppAccess = allAppsForStations(assigned);
      shouldInvalidateSessions = true;
    }

    if (stationAppPageAccess !== undefined) {
      existing.stationAppPageAccess =
        normalizeStationAppPageAccess(stationAppPageAccess);
      shouldInvalidateSessions = true;
    } else if (
      isUniversalSuperadminUserid(existing.userid) ||
      (nextAuthRole === 'superadmin' && previousAuthRole !== 'superadmin')
    ) {
      const assigned =
        existing.assignedStationIds ?? assignedStationIds ?? [];
      existing.stationAppPageAccess = allPagesForStations(assigned);
      shouldInvalidateSessions = true;
    }

    // Resolve admin-panel section grants: cleared for employees, updated when
    // provided, otherwise preserved. Only meaningful for elevated roles.
    if (nextAuthRole === 'employee') {
      existing.adminPanelSections = undefined;
    } else if (adminPanelSections !== undefined) {
      existing.adminPanelSections =
        sanitizeAdminPanelSections(adminPanelSections);
    }

    let nextPassword: string | undefined;
    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string') {
        throw new BadRequestException('Invalid password');
      }
      const passwordPolicyMessages = getPasswordPolicyMessages(password);
      if (passwordPolicyMessages.length > 0) {
        throw new BadRequestException(passwordPolicyMessages);
      }
      nextPassword = password;
      existing.password = await bcrypt.hash(password, 10);
      existing.loginPassword = encryptPassword(password);
      shouldInvalidateSessions = true;

      // Auto-send credentials email when admin changes a user's password
      // (plaintext is still in memory at this point).
      const passwordChangeEmail = String(
        existing.companyEmail ?? existing.email ?? '',
      )
        .trim()
        .toLowerCase();
      if (passwordChangeEmail) {
        this.inviteMailer
          .sendFrisAccessCredentialsEmail({
            to: passwordChangeEmail,
            employeeName: String(existing.name ?? '').trim(),
            employeeId: String(
              existing.employeeId ?? existing.userid ?? '',
            ).trim(),
            password: nextPassword,
            company: String(existing.company ?? '').trim() || undefined,
            loginUrl: this.getFrontendBaseUrl(),
          })
          .catch((err: unknown) =>
            this.logger.warn(
              `Auto-send credentials email on password change failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
    }

    if (role?.trim() && nextAuthRole !== previousAuthRole) {
      shouldInvalidateSessions = true;
    }

    const profileFields = [
      'firstName',
      'lastName',
      'gender',
      'dob',
      'fatherName',
      'motherName',
      'phone',
      'residence',
      'state',
      'country',
      'pincode',
      'joiningDate',
      'designation',
      'company',
      'station',
      'locations',
      'status',
    ] as const;

    for (const key of profileFields) {
      if (profile[key] !== undefined) {
        const value = profile[key];
        (existing as unknown as Record<string, unknown>)[key] =
          typeof value === 'string' ? value.trim() || undefined : value;
      }
    }

    if (
      profile.status !== undefined &&
      isSessionInvalidatingUserStatus(
        typeof profile.status === 'string' ? profile.status : undefined,
      )
    ) {
      shouldInvalidateSessions = true;
    }

    if (shouldInvalidateSessions) {
      existing.tokenVersion = nextTokenVersion(existing.tokenVersion);
    }

    await this.ensurePanelUserAdmNumber(existing);

    await this.syncAdminAuthorizationAccount({
        authRole: nextAuthRole,
        userid: String(existing.userid),
        name: String(existing.name),
        email: String(existing.email),
        password: nextPassword,
        permissions: resolvePrimaryPermissions({
          assignedStationIds: existing.assignedStationIds,
          stationPermissions: existing.stationPermissions as Record<
            string,
            { accessTabs: string[]; accessSubPages: Record<string, string[]> }
          >,
          permissions: existing.permissions,
        }),
        adminPanelSections: existing.adminPanelSections,
        creatorRole,
        profile: {
          employeeId: existing.employeeId,
          admNumber: existing.admNumber,
          firstName: existing.firstName,
          lastName: existing.lastName,
          gender: existing.gender,
          dob: existing.dob,
          phone: existing.phone,
          residence: existing.residence,
          state: existing.state,
          country: existing.country,
          pincode: existing.pincode,
          joiningDate: existing.joiningDate,
          department: existing.departmentLabel,
          subDepartment: existing.subDepartment,
          designation: existing.designation,
          company: existing.company,
          station: existing.station,
          assignedStationIds: existing.assignedStationIds,
          stationPermissions: existing.stationPermissions,
          stationAppAccess: existing.stationAppAccess as Record<string, string[]>,
          stationAppPageAccess: existing.stationAppPageAccess as Record<
            string,
            Record<string, string[]>
          >,
          locations: existing.locations,
          status: existing.status,
          companyEmail: existing.companyEmail,
        },
      });

    const saved = await this.savePanelUserWithAdmNumberRetry(existing);
    const doc = saved.toObject() as unknown as Record<string, unknown>;

    // Record a self-explanatory activity-log entry describing exactly what the
    // acting admin changed (role, permissions, stations, profile) with old/new
    // values. The generic request interceptor skips /users/panel writes so this
    // is the single, rich audit entry for the edit.
    await this.logUserUpdate(saved, auditBefore, actor);

    return {
      success: true,
      message: 'User updated successfully',
      data: this.serializePanelUser(doc),
    };
  }

  /** Deep, comparable snapshot of an account used for audit diffing. */
  private auditSnapshot(doc: {
    permissions?: unknown;
    stationPermissions?: unknown;
    assignedStationIds?: unknown;
    adminPanelSections?: unknown;
    authorizationRole?: unknown;
    role?: unknown;
    name?: unknown;
    email?: unknown;
    companyEmail?: unknown;
    designation?: unknown;
    departmentLabel?: unknown;
    phone?: unknown;
    status?: unknown;
  }): AuditAccountSnapshot {
    const clone = <T>(value: T): T => {
      try {
        return JSON.parse(JSON.stringify(value ?? null)) as T;
      } catch {
        return value;
      }
    };
    const strArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];
    const str = (value: unknown): string => String(value ?? '').trim();
    return {
      role: this.resolveSerializedAuthorizationRole({
        authorizationRole: doc.authorizationRole,
        role: doc.role,
      }),
      permissions: clone(doc.permissions ?? null) as AuditAccessShape | null,
      stationPermissions:
        (clone(doc.stationPermissions ?? null) as Record<
          string,
          AuditAccessShape
        > | null) ?? null,
      assignedStationIds: strArray(doc.assignedStationIds).sort(),
      adminPanelSections: strArray(doc.adminPanelSections).sort(),
      name: str(doc.name),
      email: str(doc.email),
      companyEmail: str(doc.companyEmail),
      designation: str(doc.designation),
      departmentLabel: str(doc.departmentLabel),
      phone: str(doc.phone),
      status: str(doc.status),
    };
  }

  /**
   * Emit a self-explanatory {@link USER_ACTIVITY_LOG_EVENT} describing exactly
   * what the acting admin changed on the target account — with human-readable
   * field labels and old/new values. Recorded under the ACTOR (so the activity
   * is attributed to who performed it) with the affected account captured as
   * the entity. The target's "last active" timestamp is never bumped.
   */
  private async logUserUpdate(
    target: UserDocument,
    before: AuditAccountSnapshot,
    actor?: PanelUserActor,
  ): Promise<void> {
    const after = this.auditSnapshot(target);
    const changes: AuditFieldChange[] = [];
    const phrases: string[] = [];

    // --- Role ---
    if (before.role !== after.role) {
      changes.push({
        field: 'Role',
        oldValue: humanizeRole(before.role),
        newValue: humanizeRole(after.role),
      });
      phrases.push(
        `changed role from ${humanizeRole(before.role)} to ${humanizeRole(after.role)}`,
      );
    }

    // --- Permission grants / revocations (page-level, with station scope) ---
    const stationIdsToResolve = new Set<string>([
      ...before.assignedStationIds,
      ...after.assignedStationIds,
    ]);
    const deltas = diffPermissionState(
      { permissions: before.permissions, stationPermissions: before.stationPermissions },
      { permissions: after.permissions, stationPermissions: after.stationPermissions },
    );
    for (const delta of deltas) {
      if (delta.stationId) stationIdsToResolve.add(delta.stationId);
    }

    const stationLabels = new Map<string, string>();
    for (const id of stationIdsToResolve) {
      const resolved = await this.resolveStationLabel(id);
      if (resolved) stationLabels.set(id, resolved.name);
    }

    for (const delta of deltas) {
      const scope = delta.stationId
        ? ` (${stationLabels.get(delta.stationId) ?? delta.stationId})`
        : '';
      const label = `${permissionDeltaLabel(delta)}${scope}`;
      changes.push({
        field: label,
        oldValue: accessLabel(delta.before),
        newValue: accessLabel(delta.after),
      });
      phrases.push(
        `${delta.after ? 'granted' : 'removed'} access to ${label}`,
      );
    }

    // --- Assigned stations ---
    const beforeStations = before.assignedStationIds;
    const afterStations = after.assignedStationIds;
    if (JSON.stringify(beforeStations) !== JSON.stringify(afterStations)) {
      const labelList = (ids: string[]): string =>
        ids.length === 0
          ? 'None'
          : ids.map((id) => stationLabels.get(id) ?? id).join(', ');
      const oldLabel = labelList(beforeStations);
      const newLabel = labelList(afterStations);
      changes.push({
        field: 'Assigned stations',
        oldValue: oldLabel,
        newValue: newLabel,
      });
      phrases.push(`changed assigned stations from ${oldLabel} to ${newLabel}`);
    }

    // --- Admin-panel access (per-page, from the Admin Permissions tab) ---
    const adminSectionDeltas = diffAdminPanelSections(
      before.adminPanelSections,
      after.adminPanelSections,
    );
    for (const delta of adminSectionDeltas) {
      const label = adminSectionLabel(delta.section);
      changes.push({
        field: `Admin Panel → ${label}`,
        oldValue: accessLabel(delta.before),
        newValue: accessLabel(delta.after),
      });
      phrases.push(
        `${delta.after ? 'granted' : 'removed'} admin-panel access to ${label}`,
      );
    }

    // --- Profile fields ---
    const profileFieldLabels: Array<[keyof AuditAccountSnapshot, string]> = [
      ['name', 'Name'],
      ['email', 'Email'],
      ['companyEmail', 'Company email'],
      ['designation', 'Designation'],
      ['departmentLabel', 'Department'],
      ['phone', 'Phone'],
      ['status', 'Account status'],
    ];
    for (const [key, label] of profileFieldLabels) {
      const oldValue = String(before[key] ?? '');
      const newValue = String(after[key] ?? '');
      if (oldValue !== newValue) {
        changes.push({
          field: label,
          oldValue: oldValue || '—',
          newValue: newValue || '—',
        });
        phrases.push(`updated ${label.toLowerCase()}`);
      }
    }

    if (changes.length === 0) return;

    const targetId = String((target as { _id?: unknown })._id ?? '').trim();
    if (!targetId) return;

    const targetName =
      after.name ||
      String(target.userid ?? '').trim() ||
      after.email ||
      'User';
    const actorName =
      String(actor?.name ?? '').trim() ||
      String(actor?.userid ?? '').trim() ||
      String(actor?.email ?? '').trim() ||
      'An administrator';
    const actorId = String(actor?.userId ?? actor?.userid ?? '').trim();

    // Station context = the account's (new) primary assigned station.
    const primaryStationId = afterStations[0];
    const primaryStation = primaryStationId
      ? stationLabels.get(primaryStationId) ?? primaryStationId
      : '';

    const summary = `${actorName} ${phrases.join('; ')} for ${targetName}.`;

    // Reflect which sub-tab of the Edit User flow the change came from.
    const tab =
      adminSectionDeltas.length > 0
        ? 'Admin Permissions'
        : deltas.length > 0 || beforeStations.length !== afterStations.length
          ? 'Rights & Permissions'
          : before.role !== after.role
            ? 'Account'
            : 'Profile';

    const payload: UserActivityLogEventPayload = {
      userId: actorId || targetId,
      userName: actorName,
      userEmail: String(actor?.email ?? '').trim() || undefined,
      accountType: actor?.accountType === 'user' ? 'user' : 'admin',
      action: 'Updated user account',
      summary,
      actorRole: humanizeRole(actor?.role),
      module: 'User Management',
      page: 'Edit User',
      tab,
      entityType: 'User',
      entityId: targetId,
      entityName: targetName,
      stationId: primaryStationId || undefined,
      stationName: primaryStation || undefined,
      changes,
      method: 'PATCH',
      path: `/users/panel/${targetId}`,
      bumpLastActivity: false,
      metadata: {
        targetUserId: targetId,
        targetName,
        targetEmployeeId:
          String(target.employeeId ?? target.userid ?? '').trim() || undefined,
        actorId: actorId || undefined,
        actorName,
      },
    };

    try {
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
    } catch {
      // Activity logging must never break the update flow.
    }
  }

  private formatDepartment(department: unknown): string {
    if (typeof department === 'string' && department.trim()) return department.trim();
    if (department && typeof department === 'object' && !Array.isArray(department)) {
      const key = Object.keys(department as Record<string, string>)[0];
      if (!key) return '—';
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return '—';
  }

  async findByEmail(email: string, includePassword = false) {
    const normalizedEmail = this.normalizeEmail(email);
    const query = this.userModel.findOne({ email: normalizedEmail });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findByUserId(userid: string, includePassword = false) {
    const normalizedUserid = this.normalizeUserId(userid);
    const query = this.userModel.findOne({ userid: normalizedUserid });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  /**
   * Copy admin-directory profile/grants onto the matching `users` row.
   * Does not call `updatePanelUser` / `syncAdminAuthorizationAccount` (no recursion).
   */
  async syncPanelUserFromAdminDirectory(admin: {
    userid?: string;
    name?: string;
    email?: string;
    role?: string;
    companyEmail?: string;
    employeeId?: string;
    admNumber?: string;
    firstName?: string;
    lastName?: string;
    gender?: string;
    dob?: string;
    phone?: string;
    residence?: string;
    state?: string;
    country?: string;
    pincode?: string;
    joiningDate?: string;
    department?: string;
    subDepartment?: string;
    designation?: string;
    company?: string;
    station?: string;
    assignedStationIds?: string[];
    stationPermissions?: Record<
      string,
      { accessTabs: string[]; accessSubPages: Record<string, string[]> }
    >;
    stationAppAccess?: Record<string, string[]>;
    stationAppPageAccess?: Record<string, Record<string, string[]>>;
    locations?: string;
    status?: string;
    permissions?: { accessTabs: string[]; accessSubPages: Record<string, string[]> };
    adminPanelSections?: string[];
    flags?: unknown;
  }): Promise<void> {
    const userid = this.normalizeUserId(String(admin.userid ?? ''));
    if (!userid) return;

    const existing = await this.findByUserId(userid);
    if (!existing) return;

    if (admin.name?.trim()) {
      existing.name = admin.name.trim();
    }
    if (admin.email?.trim()) {
      existing.email = this.normalizeEmail(admin.email);
    }
    if (admin.companyEmail !== undefined) {
      existing.companyEmail = admin.companyEmail.trim()
        ? admin.companyEmail.trim().toLowerCase()
        : undefined;
    }

    const authRole = this.normalizeAuthorizationRole(String(admin.role ?? ''));
    if (authRole === 'superadmin' || authRole === 'manager') {
      existing.authorizationRole = authRole;
      existing.role = 'employee';
    }

    if (admin.employeeId !== undefined) {
      existing.employeeId = String(admin.employeeId ?? '').trim() || undefined;
    }
    if (admin.admNumber !== undefined) {
      existing.admNumber = String(admin.admNumber ?? '').trim() || undefined;
    }

    const profileFields = [
      'firstName',
      'lastName',
      'gender',
      'dob',
      'phone',
      'residence',
      'state',
      'country',
      'pincode',
      'joiningDate',
      'designation',
      'company',
      'station',
      'locations',
      'status',
    ] as const;
    for (const key of profileFields) {
      const value = admin[key];
      if (value !== undefined) {
        existing.set(key, typeof value === 'string' ? value.trim() || undefined : value);
      }
    }

    if (admin.department !== undefined) {
      const department = String(admin.department ?? '').trim();
      existing.departmentLabel = department || undefined;
      if (department) {
        existing.department = buildDepartmentRecord(
          department,
          admin.subDepartment ?? existing.subDepartment,
        );
      }
    } else if (admin.subDepartment !== undefined) {
      existing.subDepartment = String(admin.subDepartment ?? '').trim() || undefined;
    }

    if (admin.assignedStationIds !== undefined) {
      existing.assignedStationIds = admin.assignedStationIds;
    }
    if (admin.stationPermissions !== undefined) {
      existing.stationPermissions = admin.stationPermissions;
      existing.markModified('stationPermissions');
    }
    if (admin.stationAppAccess !== undefined) {
      existing.stationAppAccess = normalizeStationAppAccess(admin.stationAppAccess);
      existing.markModified('stationAppAccess');
    }
    if (admin.stationAppPageAccess !== undefined) {
      existing.stationAppPageAccess = normalizeStationAppPageAccess(
        admin.stationAppPageAccess,
      );
      existing.markModified('stationAppPageAccess');
    }
    if (admin.permissions !== undefined) {
      const accessSubPages = normalizeAccessSubPages(
        admin.permissions.accessTabs ?? [],
        admin.permissions.accessSubPages ?? {},
      );
      existing.permissions = {
        accessTabs: admin.permissions.accessTabs ?? [],
        accessSubPages,
      };
      existing.flags = buildFlagsFromPermissions(accessSubPages);
      existing.markModified('permissions');
      existing.markModified('flags');
    } else if (admin.flags !== undefined) {
      existing.flags = admin.flags as UserDocument['flags'];
      existing.markModified('flags');
    }
    if (admin.adminPanelSections !== undefined) {
      existing.adminPanelSections = sanitizeAdminPanelSections(admin.adminPanelSections);
    }

    await existing.save();
  }

  /** Resolve FRIS employee by login userid or employeeId (exact match, trimmed). */
  async findByUserIdOrEmployeeId(id: string, includePassword = false) {
    const normalized = this.normalizeUserId(id);
    if (!normalized) return null;

    const byUserId = this.userModel.findOne({ userid: normalized });
    if (includePassword) {
      byUserId.select('+password');
    }
    const user = await byUserId.exec();
    if (user) return user;

    const byEmployeeId = this.userModel.findOne({ employeeId: normalized });
    if (includePassword) {
      byEmployeeId.select('+password');
    }
    return byEmployeeId.exec();
  }

  async findById(userId: string) {
    return this.userModel.findById(userId).exec();
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $inc: { tokenVersion: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return normalizeTokenVersion(updated.tokenVersion);
  }

  async updatePassword(
    userId: string,
    password: string,
    options?: { loginPassword?: string; skipMirror?: boolean },
  ) {
    const isAlreadyHash = typeof password === 'string' && password.startsWith('$2');
    const finalHashedPassword = isAlreadyHash ? password : await bcrypt.hash(password, 10);
    const finalEncryptedPassword = options?.loginPassword
      ? options.loginPassword
      : isAlreadyHash
        ? undefined
        : encryptPassword(password);

    const setObj: Record<string, unknown> = {
      password: finalHashedPassword,
    };
    if (finalEncryptedPassword) {
      setObj.loginPassword = finalEncryptedPassword;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: setObj,
          $inc: { tokenVersion: 1 },
        },
        { new: true },
      )
      .exec();

    if (updated?.userid && !options?.skipMirror) {
      const matchingAdmin = await this.adminService.findByUserId(updated.userid);
      if (matchingAdmin) {
        await this.adminService.updatePassword(
          String(matchingAdmin._id),
          finalHashedPassword,
          { loginPassword: finalEncryptedPassword, skipMirror: true },
        );
      }
    }

    return updated;
  }

  /** Panel user that matches an admin-directory account (userid, employee id, or email). */
  async findPanelUserMirror(keys: {
    userid?: string;
    employeeId?: string;
    email?: string;
  }) {
    const userid = String(keys.userid ?? '').trim();
    if (userid) {
      const byUserid = await this.userModel.findOne({ userid }).exec();
      if (byUserid) return byUserid;
    }

    const employeeId = String(keys.employeeId ?? '').trim();
    if (employeeId && employeeId !== userid) {
      const byEmployee = await this.userModel
        .findOne({ $or: [{ employeeId }, { userid: employeeId }] })
        .exec();
      if (byEmployee) return byEmployee;
    }

    const email = String(keys.email ?? '').trim().toLowerCase();
    if (email) {
      return this.userModel.findOne({ email }).exec();
    }

    return null;
  }

  async deletePanelUser(
    userId: string,
    actor?: PanelUserActor,
    options?: { skipAdminMirror?: boolean },
  ) {
    let user = isValidObjectId(userId)
      ? await this.userModel.findById(userId).exec()
      : null;
    if (!user) {
      user = await this.userModel
        .findOne({ $or: [{ userid: userId }, { employeeId: userId }] })
        .exec();
    }
    if (!user) {
      // Superadmin rows in the users table are admin-directory ids.
      if (!options?.skipAdminMirror && isValidObjectId(userId)) {
        try {
          return await this.adminService.deletePanelAdmin(userId);
        } catch (error) {
          if (!(error instanceof NotFoundException)) throw error;
        }
      }
      throw new NotFoundException('User not found');
    }
    await this.userModel
      .findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } })
      .exec();
    const deleted = await this.userModel.findByIdAndDelete(user._id).exec();
    if (!deleted) {
      throw new NotFoundException('User not found');
    }

    if (!options?.skipAdminMirror) {
      const matchingAdmin = await this.adminService.findAuthorizationMirror({
        userid: String(deleted.userid ?? ''),
        employeeId: String(deleted.employeeId ?? ''),
        email: String(deleted.email ?? ''),
      });
      if (matchingAdmin?._id) {
        await this.adminService.deletePanelAdmin(String(matchingAdmin._id), {
          skipUserMirror: true,
        });
      }
    }

    await this.logUserLifecycle('delete', deleted, actor);

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  /**
   * Emit a self-explanatory create/delete log for a panel user, attributed to
   * the acting admin with the affected account captured as the entity.
   */
  private async logUserLifecycle(
    kind: 'create' | 'delete',
    target: UserDocument,
    actor?: PanelUserActor,
  ): Promise<void> {
    const targetId = String((target as { _id?: unknown })._id ?? '').trim();
    if (!targetId) return;

    const snapshot = this.auditSnapshot(target);
    const targetName =
      snapshot.name ||
      String(target.userid ?? '').trim() ||
      snapshot.email ||
      'User';
    const targetEmail = snapshot.email;
    const roleLabel = humanizeRole(snapshot.role);
    const actorName =
      String(actor?.name ?? '').trim() ||
      String(actor?.userid ?? '').trim() ||
      String(actor?.email ?? '').trim() ||
      'An administrator';
    const actorId = String(actor?.userId ?? actor?.userid ?? '').trim();

    const primaryStationId = snapshot.assignedStationIds[0];
    const primaryStation = primaryStationId
      ? (await this.resolveStationLabel(primaryStationId))?.name ?? primaryStationId
      : '';

    const verb = kind === 'create' ? 'created' : 'deleted';
    const summary =
      `${actorName} ${verb} the ${roleLabel} account for ${targetName}` +
      (targetEmail ? ` (${targetEmail})` : '') +
      (primaryStation ? ` at ${primaryStation}` : '') +
      '.';

    const changes: AuditFieldChange[] =
      kind === 'create'
        ? [
            { field: 'Role', oldValue: '—', newValue: roleLabel },
            {
              field: 'Assigned stations',
              oldValue: '—',
              newValue:
                snapshot.assignedStationIds.length > 0
                  ? (primaryStation || snapshot.assignedStationIds.join(', '))
                  : 'None',
            },
          ]
        : [{ field: 'Account', oldValue: `${targetName} (${roleLabel})`, newValue: 'Deleted' }];

    const payload: UserActivityLogEventPayload = {
      userId: actorId || targetId,
      userName: actorName,
      userEmail: String(actor?.email ?? '').trim() || undefined,
      accountType: actor?.accountType === 'user' ? 'user' : 'admin',
      action: kind === 'create' ? 'Created user account' : 'Deleted user account',
      summary,
      actorRole: humanizeRole(actor?.role),
      module: 'User Management',
      page: 'Users',
      entityType: 'User',
      entityId: targetId,
      entityName: targetName,
      stationId: primaryStationId || undefined,
      stationName: primaryStation || undefined,
      changes,
      method: kind === 'create' ? 'POST' : 'DELETE',
      path: kind === 'create' ? '/users' : `/users/panel/${targetId}`,
      bumpLastActivity: false,
      metadata: {
        targetUserId: targetId,
        targetName,
        actorId: actorId || undefined,
        actorName,
      },
    };

    try {
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
    } catch {
      // Activity logging must never break the lifecycle flow.
    }
  }
}
