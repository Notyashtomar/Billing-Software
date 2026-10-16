import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../../admin/schema/admin.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import { escapeRegex } from '../../common/escape-regex.util';
import { CreateAdminDepartmentDto } from '../dto/create-admin-department.dto';
import {
  AdminDepartment,
  AdminDepartmentDocument,
} from '../schema/admin-department.schema';
import { emitAdminNotification } from '../../admin-notifications/utils/emit-admin-notification.util';
import { nextDepartmentCodeForName } from '../utils/department-code.util';

@Injectable()
export class AdminDepartmentsService {
  constructor(
    @InjectModel(AdminDepartment.name)
    private departmentModel: Model<AdminDepartmentDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Admin.name)
    private adminModel: Model<AdminDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private normalizeManagerRoleToken(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private resolveManagerRoleLabel(
    ...tokens: unknown[]
  ): 'Super Admin' | 'Manager' | null {
    const normalized = tokens.map((token) => this.normalizeManagerRoleToken(token));
    if (normalized.some((token) => token === 'superadmin')) return 'Super Admin';
    if (normalized.some((token) => token === 'manager' || token === 'admin' || token === 'operations')) {
      return 'Manager';
    }
    return null;
  }

  async listManagerOptions() {
    const elevatedRoles = ['superadmin', 'manager', 'admin', 'operations'];

    const [userRows, adminRows] = await Promise.all([
      this.userModel
        .find({
          accountStatus: { $ne: 'invited' },
          $or: [
            { authorizationRole: { $in: elevatedRoles } },
            { role: { $in: elevatedRoles } },
          ],
        })
        .select('name userid employeeId authorizationRole role')
        .sort({ name: 1 })
        .lean()
        .exec(),
      this.adminModel
        .find({ role: { $in: elevatedRoles } })
        .select('name userid role')
        .sort({ name: 1 })
        .lean()
        .exec(),
    ]);

    const byKey = new Map<string, Record<string, unknown>>();

    for (const row of userRows) {
      const roleLabel = this.resolveManagerRoleLabel(
        row.authorizationRole,
        row.role,
      );
      if (!roleLabel) continue;

      const employeeId =
        String(row.employeeId ?? '').trim() ||
        String(row.userid ?? '').trim() ||
        String(row._id);

      byKey.set(`user:${String(row._id)}`, {
        id: String(row._id),
        accountKind: 'user',
        name: String(row.name ?? '').trim() || employeeId,
        employeeId,
        roleLabel,
      });
    }

    for (const row of adminRows) {
      const roleLabel = this.resolveManagerRoleLabel(row.role);
      if (!roleLabel) continue;

      const employeeId = String(row.userid ?? '').trim() || String(row._id);
      byKey.set(`admin:${String(row._id)}`, {
        id: String(row._id),
        accountKind: 'admin',
        name: String(row.name ?? '').trim() || employeeId,
        employeeId,
        roleLabel,
      });
    }

    const data = [...byKey.values()].sort((a, b) => {
      const roleA = String(a.roleLabel ?? '');
      const roleB = String(b.roleLabel ?? '');
      if (roleA !== roleB) {
        return roleA === 'Super Admin' ? -1 : 1;
      }
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });

    return { success: true, count: data.length, data };
  }

  private normalizeSubDepartments(
    subDepartments?: string[],
    subDepartment?: string,
  ): string[] {
    const fromArray = (subDepartments ?? [])
      .map((value) => value.trim())
      .filter(Boolean);
    if (fromArray.length) return fromArray;

    const legacy = subDepartment?.trim();
    return legacy ? [legacy] : [];
  }

  private async resolveDepartmentCode(
    name: string,
    requested?: string,
  ): Promise<string> {
    const manual = requested?.trim();
    if (manual) return manual;

    const existing = await this.departmentModel
      .find({}, { departmentCode: 1 })
      .lean()
      .exec();
    const codes = existing.map((row) => String(row.departmentCode ?? '').trim());
    return nextDepartmentCodeForName(name, codes);
  }

  private normalizeStationIds(stationIds?: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of stationIds ?? []) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private buildCreatePayload(
    dto: CreateAdminDepartmentDto,
    departmentCode: string,
  ) {
    const subDepartments = this.normalizeSubDepartments(
      dto.subDepartments,
      dto.subDepartment,
    );
    const assignedStationIds = this.normalizeStationIds(dto.assignedStationIds);

    return {
      name: dto.name.trim(),
      subDepartment: subDepartments[0],
      subDepartments,
      assignedStationIds,
      departmentCode,
      status: dto.status ?? 'Active',
      managerId: dto.managerId,
      managerName: dto.managerName,
      managerInitials: dto.managerInitials,
      headcountSeed: dto.headcountSeed ?? 0,
      attendancePct: 88,
      performancePct: 85,
      taskCompletionPct: 78,
      weeklyPerformance: [70, 72, 74, 76, 78, 80, 82],
      insight: 'New department — baseline metrics calibrating',
      budgetUsd: 400_000,
      accent: 'emerald',
      description: dto.description?.trim() || undefined,
      permissions: dto.permissions ?? { accessTabs: [], accessSubPages: {} },
    };
  }

  async create(dto: CreateAdminDepartmentDto) {
    const departmentCode = await this.resolveDepartmentCode(
      dto.name,
      dto.departmentCode,
    );
    const doc = new this.departmentModel(this.buildCreatePayload(dto, departmentCode));
    const saved = await doc.save();
    emitAdminNotification(this.eventEmitter, {
      kind: 'department_created',
      title: 'Department added',
      subtitle: saved.subDepartment
        ? `${saved.name} · ${saved.subDepartment}`
        : saved.name,
      entityType: 'department',
      entityId: String(saved._id),
    });
    return saved;
  }

  async findAll(filter?: string) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [
          { name: regex },
          { departmentCode: regex },
          { managerName: regex },
          { subDepartment: regex },
        ],
      };
    }

    return this.departmentModel
      .find(query)
      .sort({ name: 1, createdAt: 1 })
      .exec();
  }

  async findOne(id: string) {
    const doc = await this.departmentModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Department not found');
    return doc;
  }

  async update(id: string, dto: Partial<CreateAdminDepartmentDto>) {
    const payload: Partial<AdminDepartment> = {};

    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.subDepartment !== undefined || dto.subDepartments !== undefined) {
      const subDepartments = this.normalizeSubDepartments(
        dto.subDepartments,
        dto.subDepartment,
      );
      payload.subDepartments = subDepartments;
      payload.subDepartment = subDepartments[0];
    }
    if (dto.departmentCode !== undefined) {
      payload.departmentCode = dto.departmentCode.trim();
    }
    if (dto.assignedStationIds !== undefined) {
      payload.assignedStationIds = this.normalizeStationIds(dto.assignedStationIds);
    }
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.managerId !== undefined) payload.managerId = dto.managerId;
    if (dto.managerName !== undefined) payload.managerName = dto.managerName;
    if (dto.managerInitials !== undefined) {
      payload.managerInitials = dto.managerInitials;
    }
    if (dto.headcountSeed !== undefined) payload.headcountSeed = dto.headcountSeed;
    if (dto.description !== undefined) {
      payload.description = dto.description.trim() || undefined;
    }
    if (dto.permissions !== undefined) {
      payload.permissions = {
        accessTabs: dto.permissions.accessTabs ?? [],
        accessSubPages: dto.permissions.accessSubPages ?? {},
      };
    }

    const updated = await this.departmentModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();

    if (!updated) throw new NotFoundException('Department not found');
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.departmentModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Department not found');
    return { message: 'Deleted successfully' };
  }
}
