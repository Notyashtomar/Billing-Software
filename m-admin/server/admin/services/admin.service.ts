import {
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Admin, AdminDocument } from '../schema/admin.schema';
import type { UserFlags } from '../../user/schema/user.schema';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { UpdateAdminDto } from '../dto/update-admin.dto';
import {
  getPasswordPolicyMessages,
  normalizePasswordInput,
} from '../../common/validators/password-policy';
import {
  encryptPassword,
  decryptPassword,
} from '../../common/security/password-vault.util';
import {
  buildFlagsFromPermissions,
  normalizeAccessSubPages,
  PERMISSION_SUB_PAGES,
} from '../../user/utils/permissions-to-flags';
import {
  nextTokenVersion,
  normalizeTokenVersion,
} from '../../auth/utils/token-version.util';
import { sanitizeAdminPanelSections } from '../admin-panel-sections';
import type { UserService } from '../../user/services/user.service';
import { lazyService } from '../../common/nestjs/lazy-service.util';
import {
  allAppsForStations,
  normalizeStationAppAccess,
} from '../../user/utils/bwms-app-access.util';
import {
  allPagesForStations,
  normalizeStationAppPageAccess,
} from '../../user/utils/bwms-app-page-access.util';

function canonicalPanelRole(raw: unknown): string {
  const role = String(raw ?? '').trim().toLowerCase();
  if (role === 'superadmin') return 'superadmin';
  if (role === 'employee') return 'employee';
  if (role === 'manager' || role === 'admin' || role === 'operations') return 'manager';
  return role || 'manager';
}

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('../../user/services/user.service')
              .UserService as typeof import('../../user/services/user.service').UserService,
        ),
      ),
    )
    private readonly userService: UserService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const assigned = await this.backfillMissingAdmNumbers();
      if (assigned > 0) {
        this.logger.log(
          `Assigned ADM numbers to ${assigned} admin account(s).`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Admin ADM number backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async createAdmin(data: CreateAdminDto, creatorRole?: string) {
    const { email, password, role, userid, name, permissions } = data;
    const adminPanelSections = sanitizeAdminPanelSections(
      data.adminPanelSections,
    );
    const normalizedPassword = normalizePasswordInput(password);

    if (
      !email ||
      typeof normalizedPassword !== 'string' ||
      !normalizedPassword ||
      !userid ||
      !name ||
      !role
    ) {
      throw new ForbiddenException('Missing required admin fields');
    }

    const passwordPolicyMessages = getPasswordPolicyMessages(normalizedPassword);
    if (passwordPolicyMessages.length > 0) {
      throw new BadRequestException(passwordPolicyMessages);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUserid = userid.trim();

    const [existingEmail, existingUserid] = await Promise.all([
      this.adminModel.findOne({ email: normalizedEmail }).lean().exec(),
      this.adminModel.findOne({ userid: normalizedUserid }).lean().exec(),
    ]);

    if (existingEmail) {
      throw new ConflictException('Admin with this email already exists');
    }
    if (existingUserid) {
      throw new ConflictException('Admin with this user ID already exists');
    }

    // Only super_admin can create other admins
    if (creatorRole === 'admin' || creatorRole === 'manager' || creatorRole === 'operations') {
      throw new ForbiddenException(
        'Admin users cannot create other admin accounts',
      );
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    let flags: UserFlags;
    let storedPermissions: {
      accessTabs: string[];
      accessSubPages: Record<string, string[]>;
    };

    if (!permissions) {
      throw new BadRequestException(
        'Permissions are required when creating an admin account.',
      );
    }

    const accessSubPages = normalizeAccessSubPages(
      permissions.accessTabs ?? [],
      permissions.accessSubPages ?? {},
    );
    flags = buildFlagsFromPermissions(accessSubPages);
    if (!flags || Object.keys(flags).length === 0) {
      throw new BadRequestException(
        'At least one FRIS module or page must be enabled in permissions.',
      );
    }
    storedPermissions = {
      accessTabs: permissions.accessTabs ?? [],
      accessSubPages,
    };

    const admNumber =
      String(data.admNumber ?? '').trim() ||
      (await this.userService.allocateNextAdmNumber());

    const admin = new this.adminModel({
      ...data,
      userid: normalizedUserid,
      name: name.trim(),
      email: normalizedEmail,
      role,
      password: hashedPassword,
      loginPassword: encryptPassword(normalizedPassword),
      admNumber,
      flags,
      permissions: storedPermissions,
      adminPanelSections,
    });

    const saved = await admin.save();
    const doc = saved.toObject();

    return {
      success: true,
      message: 'Admin created successfully',
      data: {
        id: String(doc._id),
        userid: doc.userid,
        email: doc.email,
        name: doc.name,
        role: doc.role,
        admNumber: doc.admNumber,
        permissions: doc.permissions,
      },
    };
  }

  async findByEmail(email: string) {
    const normalized = String(email ?? '').trim().toLowerCase();
    if (!normalized) return null;
    return this.adminModel.findOne({ email: normalized });
  }

  /**
   * Idempotently seed the env-defined super admin (used by AdminBootstrapService).
   *
   * Unlike the interactive {@link createAdmin}, this deliberately bypasses the
   * password policy and "permissions required" guard: the seed credential comes
   * from the environment and the super admin always gets FULL access to every
   * FRIS tab/sub-page. Returns true when a new record was created. If a record
   * already exists (by email) it is left untouched.
   */
  async ensureSuperAdminSeed(params: {
    name: string;
    userid: string;
    email: string;
    password: string;
    role: string;
  }): Promise<boolean> {
    const email = String(params.email ?? '')
      .trim()
      .toLowerCase();
    const userid = String(params.userid ?? '').trim();
    const password = String(normalizePasswordInput(params.password) ?? '');
    if (!email || !userid || !password || !params.name || !params.role) {
      throw new Error('ensureSuperAdminSeed: missing required super admin fields');
    }

    const existing = await this.adminModel.findOne({ email }).lean().exec();
    if (existing) {
      return false;
    }

    const accessTabs = Object.keys(PERMISSION_SUB_PAGES);
    const accessSubPages = normalizeAccessSubPages(accessTabs, {});
    const flags = buildFlagsFromPermissions(accessSubPages);
    const hashedPassword = await bcrypt.hash(password, 10);

    const admNumber = await this.userService.allocateNextAdmNumber();

    await this.adminModel.create({
      name: params.name.trim(),
      userid,
      email,
      role: params.role,
      password: hashedPassword,
      admNumber,
      flags,
      permissions: { accessTabs, accessSubPages },
      tokenVersion: 0,
    });
    return true;
  }

  /**
   * Create an admin-directory mirror for a FRIS panel user (boot repair).
   * Password must already be bcrypt-hashed — copied from the panel user row.
   */
  async createPanelUserMirror(params: {
    panelUser: {
      userid?: string;
      name?: string;
      email?: string;
      employeeId?: string;
      admNumber?: string;
    };
    authRole: 'superadmin' | 'manager';
    permissions: {
      accessTabs: string[];
      accessSubPages: Record<string, string[]>;
    };
    adminPanelSections?: string[];
    hashedPassword: string;
  }): Promise<void> {
    const userid = String(params.panelUser.userid ?? '').trim();
    const email = String(params.panelUser.email ?? '')
      .trim()
      .toLowerCase();
    const name = String(params.panelUser.name ?? '').trim();
    const hashedPassword = String(params.hashedPassword ?? '').trim();
    if (!userid || !email || !name || !hashedPassword) {
      return;
    }

    const existing = await this.adminModel.findOne({ userid }).lean().exec();
    if (existing) {
      return;
    }

    const accessSubPages = normalizeAccessSubPages(
      params.permissions.accessTabs ?? [],
      params.permissions.accessSubPages ?? {},
    );
    const flags = buildFlagsFromPermissions(accessSubPages);
    const admNumber =
      String(params.panelUser.admNumber ?? '').trim() ||
      (await this.userService.allocateNextAdmNumber());

    await this.adminModel.create({
      name,
      userid,
      email,
      role: params.authRole,
      password: hashedPassword,
      admNumber,
      flags,
      permissions: {
        accessTabs: params.permissions.accessTabs ?? [],
        accessSubPages,
      },
      adminPanelSections: sanitizeAdminPanelSections(params.adminPanelSections),
      isGlobalAdmin: params.authRole === 'superadmin',
      employeeId: String(params.panelUser.employeeId ?? userid).trim() || userid,
      tokenVersion: 0,
    });
  }

  /**
   * Ensure the designated super admin carries the explicit `isGlobalAdmin` flag.
   * Visibility is driven by this flag (not by role): a global admin bypasses
   * station filtering and can see/operate on every station. When the value
   * changes we bump `tokenVersion` so any existing session is forced to re-login
   * and pick up the new claim. Returns true when a change was applied.
   */
  async ensureGlobalSuperAdmin(
    email: string,
    isGlobal: boolean,
  ): Promise<boolean> {
    const normalizedEmail = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedEmail) return false;
    const admin = await this.adminModel.findOne({ email: normalizedEmail });
    if (!admin) return false;
    if ((admin.isGlobalAdmin === true) === isGlobal) return false;
    admin.isGlobalAdmin = isGlobal;
    admin.tokenVersion = nextTokenVersion(admin.tokenVersion);
    await admin.save();
    return true;
  }

  async findByUserId(userid: string) {
    return this.adminModel.findOne({ userid });
  }

  /**
   * Admin-directory row for the same person as a panel user.
   * Managers and superadmins are written to both collections.
   */
  async findAuthorizationMirror(keys: {
    userid?: string;
    employeeId?: string;
    email?: string;
  }) {
    const userid = String(keys.userid ?? '').trim();
    if (userid) {
      const byUserid = await this.adminModel.findOne({ userid }).exec();
      if (byUserid) return byUserid;
    }

    const employeeId = String(keys.employeeId ?? '').trim();
    if (employeeId && employeeId !== userid) {
      const byEmployee = await this.adminModel
        .findOne({ $or: [{ employeeId }, { userid: employeeId }] })
        .exec();
      if (byEmployee) return byEmployee;
    }

    const email = String(keys.email ?? '').trim().toLowerCase();
    if (email) {
      return this.adminModel.findOne({ email }).exec();
    }

    return null;
  }

  async listActiveSuperadminEmails(): Promise<string[]> {
    const rows = await this.adminModel
      .find({ role: 'superadmin' })
      .select('email companyEmail status')
      .lean()
      .exec();
    const emails = new Set<string>();
    for (const row of rows) {
      const status = String(row.status ?? 'Active').trim().toLowerCase();
      if (status && status !== 'active') continue;
      for (const raw of [row.email, row.companyEmail]) {
        const email = String(raw ?? '').trim().toLowerCase();
        if (email.includes('@')) emails.add(email);
      }
    }
    return [...emails];
  }

  async findLoginPasswordsByUserids(
    userids: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!userids?.length) return result;
    const docs = await this.adminModel
      .find({ userid: { $in: userids } })
      .select('userid +loginPassword')
      .lean()
      .exec();
    for (const doc of docs) {
      const loginPassword = (doc as unknown as { loginPassword?: string }).loginPassword;
      if (doc.userid && loginPassword) {
        const decrypted = decryptPassword(String(loginPassword));
        if (decrypted) {
          result.set(doc.userid, decrypted);
        }
      }
    }
    return result;
  }

  async findByUserIdForLogin(userid: string) {
    return this.adminModel.findOne({ userid }).select('+mfaSecret');
  }

  async findById(adminId: string) {
    return this.adminModel.findById(adminId);
  }

  private serializePanelAdmin(doc: Record<string, unknown>) {
    const name = String(doc.name ?? '').trim();
    const parts = name.split(/\s+/);
    return {
      id: String(doc._id),
      accountKind: 'admin' as const,
      userid: doc.userid,
      employeeId: doc.employeeId ?? doc.userid,
      admNumber: doc.admNumber,
      name,
      email: doc.email,
      companyEmail: doc.companyEmail ?? doc.email,
      role: canonicalPanelRole(doc.role),
      firstName: doc.firstName ?? parts[0] ?? '',
      lastName:
        doc.lastName ?? (parts.length > 1 ? parts.slice(1).join(' ') : ''),
      gender: doc.gender,
      dob: doc.dob,
      phone: doc.phone,
      residence: doc.residence,
      state: doc.state,
      country: doc.country,
      pincode: doc.pincode,
      joiningDate: doc.joiningDate,
      department: doc.department ?? '',
      subDepartment: doc.subDepartment,
      designation: doc.designation ?? '',
      company: doc.company,
      station: doc.station,
      assignedStationIds: doc.assignedStationIds,
      stationPermissions: doc.stationPermissions,
      stationAppAccess: doc.stationAppAccess ?? {},
      stationAppPageAccess: doc.stationAppPageAccess ?? {},
      locations: doc.locations,
      status: doc.status ?? 'Active',
      hasPassword: true,
      loginPassword: (doc as Record<string, unknown>).loginPassword
        ? decryptPassword(String((doc as Record<string, unknown>).loginPassword)) ?? undefined
        : undefined,
      permissions: doc.permissions,
      adminPanelSections: Array.isArray(
        (doc as { adminPanelSections?: unknown[] }).adminPanelSections,
      )
        ? (doc as { adminPanelSections: unknown[] }).adminPanelSections.map(
            String,
          )
        : undefined,
      createdAt: (doc as { createdAt?: Date }).createdAt,
    };
  }

  async listPanelAdmins() {
    const rows = await this.adminModel
      .find({})
      .select('-password +loginPassword')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return {
      success: true,
      count: rows.length,
      data: rows.map((doc) =>
        this.serializePanelAdmin(doc as unknown as Record<string, unknown>),
      ),
    };
  }

  async getPanelAdminById(adminId: string) {
    const doc = await this.adminModel
      .findById(adminId)
      .select('-password +loginPassword')
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException('Admin not found');
    }
    return {
      success: true,
      data: this.serializePanelAdmin(doc as unknown as Record<string, unknown>),
    };
  }

  async updatePanelAdmin(
    adminId: string,
    data: UpdateAdminDto,
    options?: { skipUserMirror?: boolean },
  ) {
    const existing = await this.adminModel.findById(adminId).exec();
    if (!existing) {
      throw new NotFoundException('Admin not found');
    }

    const { name, email, password, role, permissions } = data;
    const { adminPanelSections } = data;

    if (email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      const conflict = await this.adminModel
        .findOne({ email: normalizedEmail, _id: { $ne: adminId } })
        .lean()
        .exec();
      if (conflict) {
        throw new ConflictException('Admin with this email already exists');
      }
      existing.set('email', normalizedEmail);
    }

    if (name?.trim()) {
      existing.set('name', name.trim());
    }

    const profileFields = [
      'companyEmail',
      'employeeId',
      'admNumber',
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
      'department',
      'subDepartment',
      'designation',
      'company',
      'station',
      'assignedStationIds',
      'stationPermissions',
      'locations',
      'status',
    ] as const;
    for (const field of profileFields) {
      if (data[field] !== undefined) {
        existing.set(field, data[field]);
      }
    }
    if (data.stationPermissions !== undefined) {
      existing.markModified('stationPermissions');
    }

    const previousRole = existing.role;
    let shouldInvalidateSessions = false;

    if (role) {
      existing.set('role', role);
      if (role !== previousRole) {
        shouldInvalidateSessions = true;
      }
    }

    // Persist BWMS tools as submitted (superadmin editable like employees).
    // Seed all apps only when promoting to superadmin without an explicit payload.
    if (data.stationAppAccess !== undefined) {
      existing.set(
        'stationAppAccess',
        normalizeStationAppAccess(data.stationAppAccess),
      );
      existing.markModified('stationAppAccess');
    } else if (
      existing.role === 'superadmin' &&
      previousRole !== 'superadmin'
    ) {
      const assigned = Array.isArray(existing.assignedStationIds)
        ? (existing.assignedStationIds as string[])
        : [];
      existing.set('stationAppAccess', allAppsForStations(assigned));
      existing.markModified('stationAppAccess');
    }

    if (data.stationAppPageAccess !== undefined) {
      existing.set(
        'stationAppPageAccess',
        normalizeStationAppPageAccess(data.stationAppPageAccess),
      );
      existing.markModified('stationAppPageAccess');
    } else if (
      existing.role === 'superadmin' &&
      previousRole !== 'superadmin'
    ) {
      const assigned = Array.isArray(existing.assignedStationIds)
        ? (existing.assignedStationIds as string[])
        : [];
      existing.set('stationAppPageAccess', allPagesForStations(assigned));
      existing.markModified('stationAppPageAccess');
    }

    if (permissions) {
      const accessSubPages = normalizeAccessSubPages(
        permissions.accessTabs ?? [],
        permissions.accessSubPages ?? {},
      );
      const flags = buildFlagsFromPermissions(accessSubPages);
      if (!flags || Object.keys(flags).length === 0) {
        throw new BadRequestException(
          'At least one FRIS module or page must be enabled in permissions.',
        );
      }
      existing.set('flags', flags);
      existing.set('permissions', {
        accessTabs: permissions.accessTabs ?? [],
        accessSubPages,
      });
      existing.markModified('flags');
      existing.markModified('permissions');
    }

    if (adminPanelSections !== undefined) {
      existing.set(
        'adminPanelSections',
        sanitizeAdminPanelSections(adminPanelSections),
      );
    }

    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string') {
        throw new BadRequestException('Invalid password');
      }
      const passwordPolicyMessages = getPasswordPolicyMessages(password);
      if (passwordPolicyMessages.length > 0) {
        throw new BadRequestException(passwordPolicyMessages);
      }
      existing.password = await bcrypt.hash(password, 10);
      existing.loginPassword = encryptPassword(password);
      shouldInvalidateSessions = true;

      // Sync to matching user in User collection
      const matchingUser = await this.userService.findByUserId(existing.userid);
      if (matchingUser) {
        await this.userService.updatePassword(String(matchingUser._id), existing.password, {
          loginPassword: existing.loginPassword,
        });
      }
    }

    if (shouldInvalidateSessions) {
      existing.tokenVersion = nextTokenVersion(existing.tokenVersion);
    }

    const saved = await existing.save();
    const doc = saved.toObject() as unknown as Record<string, unknown>;

    if (!options?.skipUserMirror) {
      try {
        await this.userService.syncPanelUserFromAdminDirectory(doc);
      } catch (err) {
        this.logger.warn(
          `Admin→user mirror skipped for ${String(doc.userid ?? adminId)}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      success: true,
      message: 'Admin updated successfully',
      data: this.serializePanelAdmin(doc),
    };
  }

  async incrementTokenVersion(adminId: string): Promise<number> {
    const updated = await this.adminModel
      .findByIdAndUpdate(
        adminId,
        { $inc: { tokenVersion: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('Admin not found');
    }
    return normalizeTokenVersion(updated.tokenVersion);
  }

  async updatePassword(
    adminId: string,
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

    const updated = await this.adminModel.findByIdAndUpdate(
      adminId,
      {
        $set: setObj,
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );

    if (updated?.userid && !options?.skipMirror) {
      const matchingUser = await this.userService.findByUserId(updated.userid);
      if (matchingUser) {
        await this.userService.updatePassword(String(matchingUser._id), finalHashedPassword, {
          loginPassword: finalEncryptedPassword,
          skipMirror: true,
        });
      }
    }

    return updated;
  }

  async deletePanelAdmin(
    adminId: string,
    options?: { skipUserMirror?: boolean },
  ) {
    await this.adminModel
      .findByIdAndUpdate(adminId, { $inc: { tokenVersion: 1 } })
      .exec();
    const deleted = await this.adminModel.findByIdAndDelete(adminId).exec();
    if (!deleted) {
      throw new NotFoundException('Admin not found');
    }

    if (!options?.skipUserMirror) {
      const matchingUser = await this.userService.findPanelUserMirror({
        userid: deleted.userid,
        employeeId: deleted.employeeId,
        email: deleted.email,
      });
      if (matchingUser?._id) {
        await this.userService.deletePanelUser(
          String(matchingUser._id),
          undefined,
          { skipAdminMirror: true },
        );
      }
    }

    return {
      success: true,
      message: 'Admin account deleted successfully',
    };
  }

  /** Emails for Raise Ticket → Contact admins (no passwords). */
  async listSupportContacts(): Promise<
    { name: string; email: string; role: string }[]
  > {
    const rows = await this.adminModel
      .find({ role: { $in: ['superadmin', 'admin'] } })
      .select('name email role')
      .sort({ role: 1, name: 1 })
      .lean()
      .exec();

    return rows.map((row) => ({
      name: String(row.name ?? 'Admin').trim() || 'Admin',
      email: String(row.email ?? '').trim(),
      role: String(row.role ?? 'admin'),
    })).filter((row) => row.email.length > 0);
  }

  /** Existing ADM numbers on admin accounts (for shared counter max scan). */
  async listAssignedAdmNumbers(): Promise<string[]> {
    const rows = await this.adminModel
      .find({ admNumber: { $exists: true, $nin: [null, ''] } })
      .select('admNumber')
      .lean()
      .exec();
    return rows
      .map((row) => String(row.admNumber ?? '').trim())
      .filter(Boolean);
  }

  /**
   * Assign ADM numbers to admin/superadmin rows that are missing one.
   * Prefer the mirrored panel-user ADM when present so both stay in sync.
   */
  async backfillMissingAdmNumbers(): Promise<number> {
    const missing = await this.adminModel
      .find({
        $or: [
          { admNumber: { $exists: false } },
          { admNumber: null },
          { admNumber: '' },
        ],
      })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    let assigned = 0;
    for (const admin of missing) {
      const userid = String(admin.userid ?? '').trim();
      const mirrored =
        userid.length > 0
          ? await this.userService.findAdmNumberByUserId(userid)
          : undefined;
      admin.admNumber =
        mirrored || (await this.userService.allocateNextAdmNumber());
      await admin.save();
      assigned += 1;
    }
    return assigned;
  }
}
