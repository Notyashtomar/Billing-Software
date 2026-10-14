import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceStaff,
  AdvanceStaffDocument,
} from '../schema/advance-staff.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import { CreateAdvanceStaffDto } from '../dto/create-advance-staff.dto';
import { UpdateAdvanceStaffDto } from '../dto/update-advance-staff.dto';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  scopeForGatewayRead,
  StationScope,
  type StationScopeContext,
} from '../../common/station/station-scope';

/** Bare "Operator" is a manpower role label / legacy placeholder, not a job title. */
function isBareOperatorDesignation(value?: string): boolean {
  return /^operator$/i.test(String(value ?? '').trim());
}

function pickRealDesignation(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    const value = String(raw ?? '').trim();
    if (value && !isBareOperatorDesignation(value)) return value;
  }
  return '';
}

/** Coerce Excel/API/Mongo values to a real person name — never "[object Object]". */
function coercePersonName(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || s === '[object Object]' || /^\[object\s+/i.test(s)) return '';
    return s;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.text === 'string') return coercePersonName(o.text);
    if (typeof o.fullName === 'string') return coercePersonName(o.fullName);
    if (typeof o.employeeName === 'string') return coercePersonName(o.employeeName);
    if (typeof o.displayName === 'string') return coercePersonName(o.displayName);
    if (typeof o.name === 'string') return coercePersonName(o.name);
    const first = o.firstName ?? o.first;
    const last = o.lastName ?? o.last;
    if (first != null || last != null) {
      return coercePersonName(
        [first, last]
          .filter((p) => p != null && typeof p !== 'object')
          .join(' '),
      );
    }
  }
  return '';
}

@Injectable()
export class AdvanceStaffService {
  constructor(
    @InjectModel(AdvanceStaff.name)
    private readonly advanceStaffModel: Model<AdvanceStaffDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private toProperCase(s: string): string {
    return s
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private normalizeStatus(status?: string): string {
    const s = String(status ?? 'Active').trim();
    return s.toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
  }

  private normalizeGseAssigned(
    raw:
      | CreateAdvanceStaffDto['gseAssigned']
      | UpdateAdvanceStaffDto['gseAssigned'],
  ) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: { code: string; name: string }[] = [];
    for (const item of raw) {
      const code = String(item?.code ?? '')
        .trim()
        .toUpperCase();
      const name = String(item?.name ?? '').trim();
      if (!code && !name) continue;
      const key = code || name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code, name });
    }
    return out;
  }

  private normalize(
    dto: CreateAdvanceStaffDto | UpdateAdvanceStaffDto,
  ): Partial<CreateAdvanceStaffDto> {
    const out: Partial<CreateAdvanceStaffDto> = {};
    if (dto.employeeName !== undefined) {
      const name = coercePersonName(dto.employeeName);
      if (name) out.employeeName = this.toProperCase(name);
    }
    if (dto.employeeCode !== undefined) {
      out.employeeCode = String(dto.employeeCode).trim().toUpperCase();
    }
    if (dto.manpower !== undefined) {
      out.manpower = String(dto.manpower).trim();
    }
    if (dto.manpowerCode !== undefined) {
      out.manpowerCode = String(dto.manpowerCode).trim().toUpperCase();
    }
    if (dto.gseAssigned !== undefined) {
      out.gseAssigned = this.normalizeGseAssigned(dto.gseAssigned);
    }
    if (dto.department !== undefined) {
      out.department = this.toProperCase(String(dto.department));
    }
    if (dto.designation !== undefined) {
      out.designation = String(dto.designation).trim();
    }
    if (dto.status !== undefined) {
      out.status = this.normalizeStatus(dto.status);
    }
    return out;
  }

  /** Optional enrichment from panel users when gateway row has no designation. */
  private async designationByEmployeeCode(
    employeeCodes: string[],
  ): Promise<Map<string, string>> {
    const codes = Array.from(
      new Set(
        employeeCodes
          .map((c) => String(c ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    const map = new Map<string, string>();
    if (codes.length === 0) return map;

    const users = await this.userModel
      .find({ employeeId: { $in: codes } })
      .select({ employeeId: 1, designation: 1 })
      .lean()
      .exec();
    for (const user of users) {
      const code = String(user.employeeId ?? '').trim().toUpperCase();
      const designation = pickRealDesignation(user.designation);
      if (code && designation) map.set(code, designation);
    }

    return map;
  }

  private async withResolvedDesignation<
    T extends {
      employeeCode?: string;
      designation?: string;
      manpower?: string;
      manpowerCode?: string;
    },
  >(docs: T[]): Promise<Array<T & { designation: string }>> {
    const lookup = await this.designationByEmployeeCode(
      docs.map((d) => String(d.employeeCode ?? '')),
    );
    return docs.map((doc) => {
      const code = String(doc.employeeCode ?? '').trim().toUpperCase();
      const designation = pickRealDesignation(
        doc.designation,
        lookup.get(code),
        doc.manpower,
        doc.manpowerCode,
      );
      return { ...doc, designation };
    });
  }

  async createBulk(dtos: CreateAdvanceStaffDto[], station: StationScopeContext) {
    const stationCode = StationScope.require(station);
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        skipped: 0,
      };
    }
    /** Last row wins for duplicate employee codes in the same request. */
    const byCode = new Map<
      string,
      {
        employeeCode: string;
        employeeName: string;
        manpower: string;
        manpowerCode: string;
        gseAssigned: { code: string; name: string }[];
        designation: string;
        status: string;
        stationCode: string;
      }
    >();

    for (const dto of dtos) {
      const body = this.normalize(dto) as CreateAdvanceStaffDto;
      if (!body.employeeCode?.trim() || !body.employeeName?.trim()) {
        continue;
      }
      byCode.set(body.employeeCode, {
        employeeCode: body.employeeCode,
        employeeName: body.employeeName,
        manpower: body.manpower ?? '',
        manpowerCode: body.manpowerCode ?? '',
        gseAssigned: this.normalizeGseAssigned(body.gseAssigned),
        designation: body.designation ?? '',
        status: this.normalizeStatus(body.status),
        stationCode,
      });
    }

    const normalized = Array.from(byCode.values());
    const skipped = Math.max(0, dtos.length - normalized.length);

    if (!normalized.length) {
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        skipped,
      };
    }

    const res = await this.advanceStaffModel.bulkWrite(
      normalized.map((doc) => ({
        updateOne: {
          filter: {
            employeeCode: doc.employeeCode,
            stationCode: doc.stationCode,
          },
          update: { $set: doc },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return {
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      upsertedCount: res.upsertedCount,
      skipped,
    };
  }

  async create(dto: CreateAdvanceStaffDto, station: StationScopeContext) {
    const body = this.normalize(dto) as CreateAdvanceStaffDto;
    if (!body.employeeName?.trim() || !body.employeeCode?.trim()) {
      throw new ConflictException('Employee ID and name are required');
    }
    const dup = await this.advanceStaffModel
      .findOne(StationScope.filter({ employeeCode: body.employeeCode }, station))
      .exec();
    if (dup) {
      throw new ConflictException('Employee ID already exists');
    }
    const [enriched] = await this.withResolvedDesignation([
      {
        employeeCode: body.employeeCode,
        designation: body.designation ?? '',
        manpower: body.manpower ?? '',
        manpowerCode: body.manpowerCode ?? '',
      },
    ]);
    const payload = StationScope.stampCreate(
      {
        ...body,
        designation: enriched.designation || body.designation || '',
        gseAssigned: this.normalizeGseAssigned(body.gseAssigned),
        status: this.normalizeStatus(body.status),
      } as Record<string, unknown>,
      station,
    );
    const doc = new this.advanceStaffModel(payload);
    return doc.save();
  }

  async findAll(filter: string | undefined, station: StationScopeContext) {
    let query: Record<string, unknown> = {};
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      query = {
        $or: [
          { employeeName: regex },
          { employeeCode: regex },
          { manpower: regex },
          { manpowerCode: regex },
          { 'gseAssigned.code': regex },
          { 'gseAssigned.name': regex },
          { department: regex },
          { designation: regex },
          { status: regex },
        ],
      };
    }
    const docs = await this.advanceStaffModel
      .find(StationScope.filter(query, scopeForGatewayRead(station)))
      .sort({ employeeName: 1 })
      .lean()
      .exec();
    const coerced = docs.map((doc) => ({
      ...doc,
      employeeName: coercePersonName(doc.employeeName) || coercePersonName(
        (doc as { name?: unknown }).name,
      ),
    }));
    return this.withResolvedDesignation(coerced);
  }

  async findOne(id: string, station: StationScopeContext) {
    const doc = await this.advanceStaffModel
      .findOne(StationScope.filter({ _id: id }, station))
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException('Staff record not found');
    }
    StationScope.assertOwnership({ stationCode: doc.stationCode }, station);
    const [enriched] = await this.withResolvedDesignation([doc]);
    return enriched;
  }

  async update(
    id: string,
    dto: UpdateAdvanceStaffDto,
    station: StationScopeContext,
  ) {
    const existing = await this.advanceStaffModel
      .findOne(StationScope.filter({ _id: id }, station))
      .exec();
    if (!existing) {
      throw new NotFoundException('Staff record not found');
    }
    StationScope.assertOwnership(
      { stationCode: existing.stationCode },
      station,
    );
    const body = this.normalize(dto);
    if (body.employeeCode) {
      const dup = await this.advanceStaffModel
        .findOne(
          StationScope.filter(
            { employeeCode: body.employeeCode, _id: { $ne: id } },
            station,
          ),
        )
        .exec();
      if (dup) {
        throw new ConflictException('Employee ID already exists');
      }
    }
    const { stationCode: _ignore, ...safeBody } = body as Record<
      string,
      unknown
    > & { stationCode?: unknown };
    const updated = await this.advanceStaffModel
      .findOneAndUpdate(StationScope.filter({ _id: id }, station), safeBody, {
        new: true,
      })
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException('Staff record not found');
    }
    const [enriched] = await this.withResolvedDesignation([updated]);
    return enriched;
  }

  async remove(id: string, station: StationScopeContext) {
    const deleted = await this.advanceStaffModel
      .findOneAndDelete(StationScope.filter({ _id: id }, station))
      .exec();
    if (!deleted) {
      throw new NotFoundException('Staff record not found');
    }
    return { message: 'Deleted successfully' };
  }
}
