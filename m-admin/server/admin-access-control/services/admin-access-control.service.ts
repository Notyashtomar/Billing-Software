import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../../admin/schema/admin.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import {
  ACCESS_CONTROL_ROLE_ORDER,
  AccessControlRole,
} from '../constants/access-control-role.enum';
import { QueryAccessControlUsersDto } from '../dto/query-access-control-users.dto';
import {
  AccountKind,
  isAccountActive,
  normalizeStatusLabel,
  resolveAdminAccessRole,
  resolveUserAccessRole,
  roleFilterForAdmins,
  roleFilterForUsers,
} from '../utils/access-control-role.util';

type RoleCountBucket = {
  role: AccessControlRole;
  userCount: number;
  activeCount: number;
  inactiveCount: number;
};

@Injectable()
export class AdminAccessControlService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {}

  async getRoleSummary(): Promise<RoleCountBucket[]> {
    const buckets = new Map<AccessControlRole, RoleCountBucket>();
    for (const role of ACCESS_CONTROL_ROLE_ORDER) {
      buckets.set(role, {
        role,
        userCount: 0,
        activeCount: 0,
        inactiveCount: 0,
      });
    }

    const users = await this.userModel
      .find({ accountStatus: { $ne: 'invited' } })
      .select(
        'authorizationRole role station assignedStationIds designation status isActive accountStatus',
      )
      .lean()
      .exec();

    for (const doc of users) {
      const role = resolveUserAccessRole(doc);
      const bucket = buckets.get(role)!;
      bucket.userCount += 1;
      if (isAccountActive(doc)) bucket.activeCount += 1;
      else bucket.inactiveCount += 1;
    }

    const admins = await this.adminModel
      .find({})
      .select('role')
      .lean()
      .exec();

    for (const doc of admins) {
      const role = resolveAdminAccessRole(doc.role);
      const bucket = buckets.get(role)!;
      bucket.userCount += 1;
      bucket.activeCount += 1;
    }

    return ACCESS_CONTROL_ROLE_ORDER.map((role) => buckets.get(role)!);
  }

  async listUsers(query: QueryAccessControlUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    const adminFilter = roleFilterForAdmins(query.role);
    const userFilter = roleFilterForUsers(query.role);

    const search = query.search?.trim();
    const station = query.station?.trim();
    const department = query.department?.trim();
    const status = query.status?.trim().toLowerCase();

    const [userRows, adminRows] = await Promise.all([
      this.userModel
            .find({
              accountStatus: { $ne: 'invited' },
              ...userFilter,
            })
            .select('-password')
            .lean()
            .exec(),
      adminFilter
        ? this.adminModel
            .find(adminFilter)
            .select('-password')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    let merged = [
      ...userRows.map((doc) =>
        this.serializeUserRow(doc as unknown as Record<string, unknown>),
      ),
      ...adminRows.map((doc) =>
        this.serializeAdminRow(doc as unknown as Record<string, unknown>),
      ),
    ];

    if (search) {
      const needle = search.toLowerCase();
      merged = merged.filter((row) => {
        const haystack = `${row.employeeId} ${row.name} ${row.email}`.toLowerCase();
        return haystack.includes(needle);
      });
    }

    if (station) {
      const needle = station.toLowerCase();
      merged = merged.filter((row) =>
        String(row.station ?? '').toLowerCase().includes(needle),
      );
    }

    if (department) {
      const needle = department.toLowerCase();
      merged = merged.filter((row) =>
        String(row.department ?? '').toLowerCase().includes(needle),
      );
    }

    if (status) {
      merged = merged.filter(
        (row) => String(row.status).toLowerCase() === status,
      );
    }

    merged.sort((a, b) => a.name.localeCompare(b.name));

    const total = merged.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const data = merged.slice(skip, skip + limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getUserDetail(id: string, accountKind?: string) {
    const kind = accountKind?.trim().toLowerCase();
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }

    if (kind === 'admin') {
      const doc = await this.adminModel.findById(id).select('-password').lean().exec();
      if (!doc) throw new NotFoundException('User not found');
      return this.serializeAdminDetail(doc as unknown as Record<string, unknown>);
    }

    const userDoc = await this.userModel
      .findById(id)
      .select('-password')
      .lean()
      .exec();
    if (userDoc) {
      return this.serializeUserDetail(userDoc as unknown as Record<string, unknown>);
    }

    if (!kind) {
      const adminDoc = await this.adminModel.findById(id).select('-password').lean().exec();
      if (adminDoc)
        return this.serializeAdminDetail(adminDoc as unknown as Record<string, unknown>);
    }

    throw new NotFoundException('User not found');
  }

  private emptyPage(page: number, limit: number) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 1 },
    };
  }

  private serializeUserRow(doc: Record<string, unknown>) {
    const name = String(doc.name ?? '').trim() || String(doc.userid ?? '');
    return {
      id: String(doc._id),
      accountKind: 'user' as AccountKind,
      accessRole: resolveUserAccessRole(doc),
      employeeId: String(doc.employeeId ?? doc.userid ?? ''),
      name,
      email: String(doc.email ?? ''),
      station: String(doc.station ?? '') || '—',
      department: String(doc.departmentLabel ?? '') || '—',
      status: normalizeStatusLabel(doc.status),
      lastLogin: this.formatLastLogin(doc.lastActivityAt),
    };
  }

  private serializeAdminRow(doc: Record<string, unknown>) {
    const name = String(doc.name ?? '').trim();
    return {
      id: String(doc._id),
      accountKind: 'admin' as AccountKind,
      accessRole: resolveAdminAccessRole(doc.role),
      employeeId: String(doc.userid ?? ''),
      name,
      email: String(doc.email ?? ''),
      station: '—',
      department: '—',
      status: 'Active',
      lastLogin: '—',
    };
  }

  private serializeUserDetail(doc: Record<string, unknown>) {
    const row = this.serializeUserRow(doc);
    return {
      ...row,
      userid: String(doc.userid ?? ''),
      phone: String(doc.phone ?? '') || '—',
      designation: String(doc.designation ?? '') || '—',
      company: String(doc.company ?? '') || '—',
      permissions: doc.permissions ?? { accessTabs: [], accessSubPages: {} },
      stationPermissions: doc.stationPermissions ?? {},
      assignedStationIds: Array.isArray(doc.assignedStationIds)
        ? doc.assignedStationIds.map(String)
        : [],
      authorizationRole: String(doc.authorizationRole ?? doc.role ?? ''),
      isActive: doc.isActive !== false,
      accountStatus: String(doc.accountStatus ?? 'active'),
      createdAt: (doc as { createdAt?: Date }).createdAt,
    };
  }

  private serializeAdminDetail(doc: Record<string, unknown>) {
    const row = this.serializeAdminRow(doc);
    return {
      ...row,
      userid: String(doc.userid ?? ''),
      phone: '—',
      designation: '—',
      company: '—',
      permissions: doc.permissions ?? { accessTabs: [], accessSubPages: {} },
      stationPermissions: {},
      assignedStationIds: [] as string[],
      authorizationRole: String(doc.role ?? ''),
      isActive: true,
      accountStatus: 'active',
      createdAt: (doc as { createdAt?: Date }).createdAt,
    };
  }

  private formatLastLogin(value: unknown): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
