import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isValidObjectId, Model, Types } from 'mongoose';
import { escapeRegex } from '../../common/escape-regex.util';
import { CreateAdminStationDto } from '../dto/create-admin-station.dto';
import {
  AdminStation,
  AdminStationDocument,
} from '../schema/admin-station.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import { deriveStationCode } from '../utils/derive-station-code.util';
import {
  findStationLegalDetails,
  legalDetailsPatch,
} from '../utils/station-legal-details.util';
import { emitAdminNotification } from '../../admin-notifications/utils/emit-admin-notification.util';
import type { AuthenticatedPrincipal } from '../../auth/services/identity.service';
import {
  adminPanelStationRegistryFilter,
  assertAdminPanelStationAccess,
} from '../../common/station/admin-panel-station-scope';
import { AdminPanelStationScopeService } from '../../common/station/admin-panel-station-scope.service';

export type ResolvedStationRef = {
  id: string;
  code: string;
};

@Injectable()
export class AdminStationsService implements OnModuleInit {
  constructor(
    @InjectModel(AdminStation.name)
    private stationModel: Model<AdminStationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly adminPanelStationScope: AdminPanelStationScopeService,
  ) {}

  async onModuleInit() {
    await this.backfillStationCodes();
    await this.backfillTerminalsFromZone();
    await this.backfillLegalDetails();
  }

  /**
   * Apply Bird legal-entity / GST / address master onto matching station rows.
   * Matches by stationCode or city alias; does not overwrite operational `city`.
   */
  private async backfillLegalDetails() {
    const rows = await this.stationModel
      .find()
      .select('code stationCode city company street addressCity country pincode gstNumber')
      .exec();

    for (const row of rows) {
      const details = findStationLegalDetails({
        stationCode: row.stationCode,
        code: row.code,
        city: row.city,
      });
      if (!details) continue;

      const patch = legalDetailsPatch(details);
      const needsUpdate =
        row.company !== patch.company ||
        row.street !== patch.street ||
        row.addressCity !== patch.addressCity ||
        row.country !== patch.country ||
        row.pincode !== patch.pincode ||
        row.gstNumber !== patch.gstNumber;

      if (!needsUpdate) continue;

      row.company = patch.company;
      row.street = patch.street;
      row.addressCity = patch.addressCity;
      row.country = patch.country;
      row.pincode = patch.pincode;
      row.gstNumber = patch.gstNumber;
      await row.save();
    }
  }

  /**
   * Idempotently populate the canonical `stationCode` on registry rows that
   * predate the field or have non-canonical aliases, deriving it from `code`,
   * `city`, or `name` (e.g. `Tiruchirappalli` / `TIR-01` -> `TRZ`, `DEL-01` -> `DEL`).
   */
  private async backfillStationCodes() {
    const rows = await this.stationModel
      .find()
      .select('code stationCode city name')
      .exec();

    for (const row of rows) {
      const code = deriveStationCode({
        stationCode: row.stationCode,
        code: row.code,
        city: row.city,
        name: row.name,
      });
      if (code && code !== row.stationCode) {
        row.stationCode = code;
        await row.save();
      }
    }
  }

  /** Persist `terminals[]` from comma-separated `zone` when array missing. */
  private async backfillTerminalsFromZone() {
    const rows = await this.stationModel
      .find({
        $or: [
          { terminals: { $exists: false } },
          { terminals: null },
          { terminals: { $size: 0 } },
        ],
      })
      .select('zone terminals')
      .exec();

    for (const row of rows) {
      const terminals = this.resolveTerminals(row);
      if (!terminals.length) continue;
      row.terminals = terminals;
      await row.save();
    }
  }

  /**
   * Distinct station codes registered in the station registry, normalized to
   * uppercase. Always includes the legacy `MAA` station so the historical
   * dashboard keeps materializing even if the registry row is missing.
   * Used to fan out per-station dashboard materialization (warm + invalidation).
   */
  async listActiveStationCodes(): Promise<string[]> {
    const raw = await this.stationModel.distinct('stationCode').exec();
    const set = new Set<string>(['MAA']);
    for (const value of raw) {
      const code = String(value ?? '').trim().toUpperCase();
      if (code) set.add(code);
    }
    return [...set];
  }

  private rand(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  private clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  private insightFor(status: string, eff: number, delayed: number) {
    if (status === 'Maintenance') return 'Maintenance required ⚠️';
    if (status === 'Offline') return 'Station offline — action needed 🛑';
    if (status === 'Delayed' || delayed > 10) return 'Delay rate increased today 📈';
    if (eff >= 86) return 'High traffic detected 🚀';
    return 'Operations running smoothly ✅';
  }

  private nextStationCode(existing: AdminStationDocument[], prefix: string) {
    const nums = existing
      .filter((s) => s.code.startsWith(`${prefix}-`))
      .map((s) => Number(s.code.split('-')[1] ?? 0))
      .filter((n) => Number.isFinite(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${String(next).padStart(2, '0')}`;
  }

  private buildMetrics(seed: number, status: string) {
    const weeklyPerf = Array.from({ length: 7 }, (_, d) =>
      this.clamp(
        72 + Math.round(this.rand(seed * 91 + d * 7) * 22) + Math.round(10 * Math.sin(d * 0.7)),
        35,
        98,
      ),
    );
    const eff = this.clamp(
      Math.round(weeklyPerf.reduce((s, v) => s + v, 0) / weeklyPerf.length),
      35,
      98,
    );
    const delayedOps =
      status === 'Delayed'
        ? 12 + Math.round(this.rand(seed * 29) * 16)
        : Math.round(this.rand(seed * 29) * 8);

    return {
      weeklyPerf,
      efficiencyPct: eff,
      delayedOps,
      dailyOps: 160 + Math.round(this.rand(seed * 19) * 520),
      throughputMonth: Array.from({ length: 12 }, (_, m) =>
        this.clamp(55 + Math.round(this.rand(seed * 47 + m * 13) * 42), 25, 98),
      ),
      insight: this.insightFor(status, eff, delayedOps),
    };
  }

  private normalizeForm(dto: CreateAdminStationDto) {
    const terminals = (dto.terminals ?? []).map((t) => t.trim()).filter(Boolean);
    const zone =
      terminals.length > 0
        ? terminals.join(', ')
        : dto.zone?.trim() || 'Terminal 1';

    return {
      name: dto.name.trim(),
      code: dto.code?.trim() ?? '',
      company: dto.company.trim(),
      region: dto.region,
      city: dto.city.trim(),
      state: dto.state?.trim() || undefined,
      street: dto.street?.trim() || undefined,
      addressCity: dto.addressCity?.trim() || undefined,
      country: dto.country?.trim() || 'India',
      pincode: dto.pincode?.trim() || undefined,
      gstNumber: dto.gstNumber?.trim().toUpperCase() || undefined,
      zone,
      terminals: terminals.length > 0 ? terminals : undefined,
      photoUrl: dto.photoUrl?.trim() || undefined,
      type: dto.type ?? 'Airport',
      manager: dto.manager.trim(),
      capacity: dto.capacity,
      status: dto.status,
      notes: dto.notes?.trim() ?? '',
      activeStaff: dto.activeStaff,
      departmentCount: dto.departmentCount,
      permissions: dto.permissions ?? { accessTabs: [], accessSubPages: {} },
    };
  }

  async create(dto: CreateAdminStationDto) {
    const existing = await this.stationModel.find().exec();
    const normalized = this.normalizeForm(dto);
    const metrics = this.buildMetrics(existing.length + 13, normalized.status);

    if (!normalized.code) {
      const canonicalCode = deriveStationCode({
        city: normalized.city,
        name: normalized.name,
      });
      const prefix =
        canonicalCode ||
        (normalized.city.slice(0, 3) || 'STN').toUpperCase();
      normalized.code = this.nextStationCode(existing, prefix);
    }

    const doc = new this.stationModel({
      ...normalized,
      stationCode: deriveStationCode(normalized),
      ...metrics,
    });
    const saved = await doc.save();
    emitAdminNotification(this.eventEmitter, {
      kind: 'station_created',
      title: 'Station added',
      subtitle: `${saved.name} · ${saved.code}`,
      entityType: 'station',
      entityId: String(saved._id),
    });
    return saved;
  }

  async findAll(filter?: string, principal?: AuthenticatedPrincipal) {
    const scope = await this.adminPanelStationScope.resolve(principal);
    const scopeFilter = adminPanelStationRegistryFilter(scope);

    let query: Record<string, unknown> = { ...scopeFilter };
    if (filter?.trim()) {
      const regex = new RegExp(escapeRegex(filter.trim()), 'i');
      const textFilter = {
        $or: [
          { name: regex },
          { code: regex },
          { city: regex },
          { company: regex },
          { region: regex },
        ],
      };
      query =
        Object.keys(scopeFilter).length > 0
          ? { $and: [scopeFilter, textFilter] }
          : textFilter;
    }

    const stations = await this.stationModel
      .find(query)
      .sort({ name: 1, createdAt: 1 })
      .lean()
      .exec();

    if (!stations.length) return stations;

    const stationIds = stations.map((s) => String(s._id));
    const metricsMap = await this.liveStaffMetricsByStation(stationIds);

    return stations.map((station) => {
      const id = String(station._id);
      const metrics = metricsMap.get(id) ?? {
        staffCount: 0,
        departmentCount: 0,
      };
      const terminals = this.resolveTerminals(station);

      return {
        ...station,
        terminals,
        activeStaff: metrics.staffCount,
        departmentCount: metrics.departmentCount,
      };
    });
  }

  /**
   * Live Staff / Departments for station cards — same panel rules as
   * `listPanelUsersByStation` (exclude invited + superadmin).
   * Departments = unique non-empty labels (case-insensitive) from staff.
   */
  private async liveStaffMetricsByStation(
    stationIds: string[],
  ): Promise<Map<string, { staffCount: number; departmentCount: number }>> {
    const empty = new Map<
      string,
      { staffCount: number; departmentCount: number }
    >();
    if (!stationIds.length) return empty;

    const metricsAgg = await this.userModel
      .aggregate<{
        _id: string;
        staffCount: number;
        departments: string[];
      }>([
        {
          $match: {
            accountStatus: { $ne: 'invited' },
            authorizationRole: { $ne: 'superadmin' },
            role: { $ne: 'superadmin' },
            assignedStationIds: { $in: stationIds },
          },
        },
        { $unwind: '$assignedStationIds' },
        {
          $match: {
            assignedStationIds: { $in: stationIds },
          },
        },
        {
          $group: {
            _id: '$assignedStationIds',
            staffCount: { $sum: 1 },
            departments: {
              $addToSet: {
                $toLower: this.departmentNameAggregationExpr(),
              },
            },
          },
        },
      ])
      .exec();

    return new Map(
      metricsAgg.map((row) => [
        String(row._id),
        {
          staffCount: row.staffCount ?? 0,
          departmentCount: (row.departments ?? []).filter(
            (name) => String(name ?? '').trim().length > 0,
          ).length,
        },
      ]),
    );
  }

  /** Prefer departmentLabel, then string department, then first object key. */
  private departmentNameAggregationExpr() {
    return {
      $trim: {
        input: {
          $let: {
            vars: {
              label: {
                $cond: [
                  { $eq: [{ $type: '$departmentLabel' }, 'string'] },
                  { $ifNull: ['$departmentLabel', ''] },
                  '',
                ],
              },
              deptString: {
                $cond: [
                  { $eq: [{ $type: '$department' }, 'string'] },
                  { $ifNull: ['$department', ''] },
                  '',
                ],
              },
              deptObjectKey: {
                $cond: [
                  { $eq: [{ $type: '$department' }, 'object'] },
                  {
                    $let: {
                      vars: {
                        first: {
                          $arrayElemAt: [
                            {
                              $objectToArray: {
                                $ifNull: ['$department', {}],
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: {
                        $replaceAll: {
                          input: { $ifNull: ['$$first.k', ''] },
                          find: '_',
                          replacement: ' ',
                        },
                      },
                    },
                  },
                  '',
                ],
              },
            },
            in: {
              $cond: [
                {
                  $gt: [{ $strLenCP: { $trim: { input: '$$label' } } }, 0],
                },
                '$$label',
                {
                  $cond: [
                    {
                      $gt: [
                        { $strLenCP: { $trim: { input: '$$deptString' } } },
                        0,
                      ],
                    },
                    '$$deptString',
                    '$$deptObjectKey',
                  ],
                },
              ],
            },
          },
        },
      },
    };
  }

  /** Prefer `terminals[]`; fall back to comma-separated `zone`. */
  private resolveTerminals(station: {
    terminals?: string[] | null;
    zone?: string | null;
  }): string[] {
    if (Array.isArray(station.terminals) && station.terminals.length > 0) {
      return station.terminals
        .map((t) => String(t ?? '').trim())
        .filter(Boolean);
    }
    return String(station.zone ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  /** Minimal station list for unauthenticated login station picker (no metrics/PII). */
  async listLoginOptions() {
    return this.stationModel
      .find({
        // Operational status (Maintenance/Offline) must not block sign-in — staff
        // still authenticate against their assigned station registry row.
        status: { $in: ['Active', 'Delayed', 'Maintenance', 'Offline'] },
      })
      .select('name code stationCode company city status')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, principal?: AuthenticatedPrincipal) {
    const scope = await this.adminPanelStationScope.resolve(principal);
    assertAdminPanelStationAccess(scope, id);
    const doc = await this.stationModel.findById(id).lean().exec();
    if (!doc) throw new NotFoundException('Station not found');

    const metricsMap = await this.liveStaffMetricsByStation([id]);
    const metrics = metricsMap.get(id) ?? {
      staffCount: 0,
      departmentCount: 0,
    };

    return {
      ...doc,
      terminals: this.resolveTerminals(doc),
      activeStaff: metrics.staffCount,
      departmentCount: metrics.departmentCount,
    };
  }

  async update(id: string, dto: Partial<CreateAdminStationDto>) {
    const existing = await this.stationModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Station not found');

    const merged: CreateAdminStationDto = {
      name: dto.name ?? existing.name,
      code: dto.code ?? existing.code,
      company: dto.company ?? existing.company,
      region: dto.region ?? existing.region,
      city: dto.city ?? existing.city,
      state: dto.state ?? existing.state,
      street: dto.street ?? existing.street,
      addressCity: dto.addressCity ?? existing.addressCity,
      country: dto.country ?? existing.country,
      pincode: dto.pincode ?? existing.pincode,
      gstNumber: dto.gstNumber ?? existing.gstNumber,
      zone: dto.zone ?? existing.zone,
      terminals: dto.terminals ?? existing.terminals,
      photoUrl: dto.photoUrl ?? existing.photoUrl,
      type: dto.type ?? existing.type,
      manager: dto.manager ?? existing.manager,
      capacity: dto.capacity ?? existing.capacity,
      status: dto.status ?? existing.status,
      notes: dto.notes ?? existing.notes,
      activeStaff: dto.activeStaff ?? existing.activeStaff,
      departmentCount: dto.departmentCount ?? existing.departmentCount ?? 0,
      permissions: (dto.permissions ?? existing.permissions) as CreateAdminStationDto['permissions'],
    };

    const normalized = this.normalizeForm(merged);
    if (!normalized.code) normalized.code = existing.code;

    const updated = await this.stationModel
      .findByIdAndUpdate(
        id,
        {
          ...normalized,
          stationCode: deriveStationCode({
            stationCode: existing.stationCode,
            code: normalized.code,
          }),
          insight: this.insightFor(
            normalized.status,
            existing.efficiencyPct,
            existing.delayedOps,
          ),
        },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Station not found');
    return updated;
  }

  /**
   * Resolve a login/map station reference that may be either:
   * - Mongo AdminStation `_id`, or
   * - Canonical airport code (`MAA`, `IXC`, …) / registry code (`MAA-01`).
   *
   * TRP (and some map deep-links) send the IATA code as `stationId`; auth must
   * normalize that before ObjectId queries or assignedStationIds checks.
   */
  async resolveStationRef(
    idOrCode: string | undefined,
  ): Promise<ResolvedStationRef | null> {
    const raw = String(idOrCode ?? '').trim();
    if (!raw) return null;

    if (isValidObjectId(raw) && String(new Types.ObjectId(raw)) === raw) {
      const doc = await this.stationModel
        .findById(raw)
        .select('code stationCode city name')
        .lean()
        .exec();
      if (!doc) return null;
      const code =
        deriveStationCode({
          stationCode: doc.stationCode,
          code: doc.code,
          city: doc.city,
          name: doc.name,
        }) ||
        String(doc.stationCode || doc.code || '').trim().toUpperCase();
      return { id: String(doc._id), code: code || String(doc._id) };
    }

    const needle = raw.toUpperCase();
    const derivedTarget =
      deriveStationCode({
        stationCode: needle,
        code: needle,
        city: needle,
        name: needle,
      }) || needle;

    const docs = await this.stationModel
      .find({
        $or: [
          { stationCode: new RegExp(`^${escapeRegex(needle)}$`, 'i') },
          { stationCode: new RegExp(`^${escapeRegex(derivedTarget)}$`, 'i') },
          { code: new RegExp(`^${escapeRegex(needle)}(-\\d+)?$`, 'i') },
          { code: new RegExp(`^${escapeRegex(derivedTarget)}(-\\d+)?$`, 'i') },
          { city: new RegExp(`^${escapeRegex(needle)}$`, 'i') },
          { city: new RegExp(`^${escapeRegex(derivedTarget)}$`, 'i') },
          { name: new RegExp(escapeRegex(needle), 'i') },
          { name: new RegExp(escapeRegex(derivedTarget), 'i') },
        ],
      })
      .select('code stationCode city name')
      .lean()
      .exec();

    if (!docs.length) {
      return { id: raw, code: derivedTarget };
    }

    // Prefer exact stationCode match, then first registry row for that airport.
    const exact =
      docs.find(
        (d) =>
          deriveStationCode({
            stationCode: d.stationCode,
            code: d.code,
            city: d.city,
            name: d.name,
          }) === derivedTarget,
      ) ?? docs[0]!;

    const code =
      deriveStationCode({
        stationCode: exact.stationCode,
        code: exact.code,
        city: exact.city,
        name: exact.name,
      }) || derivedTarget;

    return { id: String(exact._id), code };
  }

  /**
   * Resolve the canonical clean station code (e.g. `DEL`) for an admin-station
   * document id **or** airport code. Used by auth to stamp `stationCode` into
   * the JWT/principal. Returns `null` when the ref is missing or unknown.
   */
  async resolveStationCodeById(id: string | undefined): Promise<string | null> {
    const resolved = await this.resolveStationRef(id);
    if (resolved?.code) return resolved.code;
    const raw = String(id ?? '').trim();
    if (raw && !isValidObjectId(raw)) {
      return (
        deriveStationCode({
          stationCode: raw,
          code: raw,
          city: raw,
          name: raw,
        }) || raw.toUpperCase()
      );
    }
    return null;
  }

  /**
   * Resolve an admin-station Mongo id from an IATA/airport code (e.g. IXC, DEL, TRZ).
   * Prefers exact stationCode match, then registry code prefix (DEL-01), then city/name alias.
   * When `preferIds` is set, only returns an id from that list.
   */
  async resolveStationIdByCode(
    stationCode: string | undefined,
    preferIds?: string[],
  ): Promise<string | null> {
    const raw = String(stationCode ?? '').trim();
    if (!raw) return null;
    const code = raw.toUpperCase();

    const preferred = (preferIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);

    // If already an exact match in preferred list (by ID string comparison), return directly
    const directPreferred = preferred.find(
      (id) => id === raw || id.toLowerCase() === raw.toLowerCase(),
    );
    if (directPreferred) return directPreferred;

    // Resolve target's canonical code (via doc lookup if ObjectId, or deriveStationCode if string/alias)
    const targetRef = await this.resolveStationRef(raw);
    const canonicalTarget =
      targetRef?.code?.toUpperCase() ||
      deriveStationCode({
        stationCode: code,
        code,
        city: code,
        name: code,
      })?.toUpperCase() ||
      code;

    if (preferred.length > 0) {
      for (const id of preferred) {
        if (
          targetRef?.id &&
          (id === targetRef.id || id.toLowerCase() === targetRef.id.toLowerCase())
        ) {
          return id;
        }

        const assignedRef = await this.resolveStationRef(id);
        if (
          assignedRef?.id &&
          targetRef?.id &&
          assignedRef.id === targetRef.id
        ) {
          return id;
        }

        if (assignedRef?.code && targetRef?.code) {
          const assignedCode = assignedRef.code.toUpperCase();
          const targetCode = targetRef.code.toUpperCase();
          if (
            assignedCode === targetCode ||
            assignedCode === canonicalTarget ||
            assignedCode === code
          ) {
            return id;
          }
        }

        const resolved = await this.resolveStationCodeById(id);
        if (
          resolved &&
          (resolved.toUpperCase() === code ||
            resolved.toUpperCase() === canonicalTarget ||
            (targetRef?.code &&
              resolved.toUpperCase() === targetRef.code.toUpperCase()))
        ) {
          return id;
        }
      }
      // When preferIds is provided, never return a station outside that list.
      return null;
    }

    if (targetRef?.id) {
      return targetRef.id;
    }

    const exact = await this.stationModel
      .findOne({
        $or: [
          { stationCode: code },
          { stationCode: canonicalTarget },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    if (exact?._id) return String(exact._id);

    const prefix = await this.stationModel
      .findOne({
        $or: [
          { code: code },
          { code: canonicalTarget },
          { code: new RegExp(`^${escapeRegex(code)}-`, 'i') },
          { code: new RegExp(`^${escapeRegex(canonicalTarget)}-`, 'i') },
          { city: new RegExp(`^${escapeRegex(code)}$`, 'i') },
          { city: new RegExp(`^${escapeRegex(canonicalTarget)}$`, 'i') },
          { name: new RegExp(escapeRegex(code), 'i') },
          { name: new RegExp(escapeRegex(canonicalTarget), 'i') },
        ],
      })
      .select('_id')
      .sort({ code: 1 })
      .lean()
      .exec();
    return prefix?._id ? String(prefix._id) : null;
  }

  async remove(id: string) {
    const deleted = await this.stationModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Station not found');
    return { message: 'Deleted successfully' };
  }
}
