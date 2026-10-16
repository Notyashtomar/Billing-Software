import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Admin, AdminDocument } from '../../admin/schema/admin.schema';
import { User, UserDocument } from '../../user/schema/user.schema';
import {
  UserActionLog,
  UserActionLogDocument,
} from '../../user-activity-notifications/schema/user-action-log.schema';
import type { UserActivityLogEventPayload } from '../../user-activity-notifications/events/user-activity.events';
import type { AuditKpiFilter } from '../constants/audit.enums';
import { QueryAuditEventsDto, QueryAuditKpisDto } from '../dto/query-audit-events.dto';
import { AuditLog, AuditLogDocument } from '../schema/audit-log.schema';
import { mapActivityToAuditRecord } from '../utils/map-activity-to-audit.util';

type DateRange = { from?: Date; to?: Date };

@Injectable()
export class AdminAuditService implements OnModuleInit {
  private legacyBackfillDone = false;

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    @InjectModel(UserActionLog.name)
    private readonly legacyLogModel: Model<UserActionLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.backfillLegacyLogsIfNeeded();
  }

  async recordFromActivity(payload: UserActivityLogEventPayload, sourceLogId?: string): Promise<void> {
    const enrich = await this.enrichUserContext(payload.userId, payload.accountType);
    const record = mapActivityToAuditRecord(payload, {
      ...enrich,
      sourceLogId,
      timestamp: new Date(),
    });

    try {
      await this.auditModel.create(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('duplicate key') && !message.includes('E11000')) {
        throw error;
      }
    }
  }

  async getKpis(query: QueryAuditKpisDto) {
    await this.backfillLegacyLogsIfNeeded();
    const range = this.resolveDateRange(query.datePreset, query.fromDate, query.toDate);
    const baseFilter = this.buildTimestampFilter(range);

    const [
      totalToday,
      securityEvents,
      userActions,
      configChanges,
      failedOperations,
      criticalAlerts,
      uniqueUsers,
      stationsImpacted,
    ] = await Promise.all([
      this.auditModel.countDocuments({
        timestamp: { $gte: this.startOfToday() },
      }),
      this.auditModel.countDocuments({
        ...baseFilter,
        $or: [
          { module: 'Authentication' },
          { action: { $in: ['LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'ASSIGN_ROLE'] } },
          { severity: { $in: ['HIGH', 'CRITICAL'] } },
        ],
      }),
      this.auditModel.countDocuments({
        ...baseFilter,
        $or: [{ module: 'Access Control' }, { entityType: 'User' }],
      }),
      this.auditModel.countDocuments({
        ...baseFilter,
        module: { $in: ['Station Management', 'Dashboard', 'System'] },
        action: { $in: ['CREATE', 'UPDATE', 'DELETE', 'PERMISSION_CHANGE'] },
      }),
      this.auditModel.countDocuments({ ...baseFilter, result: 'FAILED' }),
      this.auditModel.countDocuments({
        ...baseFilter,
        $or: [{ severity: 'CRITICAL' }, { severity: 'HIGH', result: 'FAILED' }],
      }),
      this.auditModel.distinct('userId', baseFilter).then((rows) => rows.length),
      this.auditModel
        .distinct('station', { ...baseFilter, station: { $exists: true, $ne: '' } })
        .then((rows) => rows.filter(Boolean).length),
    ]);

    return {
      totalToday,
      securityEvents,
      userActions,
      configChanges,
      failedOperations,
      criticalAlerts,
      uniqueUsers,
      stationsImpacted,
    };
  }

  async listEvents(query: QueryAuditEventsDto) {
    await this.backfillLegacyLogsIfNeeded();
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
    const range = this.resolveDateRange(query.datePreset, query.fromDate, query.toDate);
    const and: Record<string, unknown>[] = [];

    const tsFilter = this.buildTimestampFilter(range);
    if (Object.keys(tsFilter).length) and.push(tsFilter);

    if (query.kpiFilter) {
      and.push(this.buildKpiFilter(query.kpiFilter as AuditKpiFilter));
    }

    const userSearch = String(query.userSearch ?? '').trim();
    if (userSearch) {
      const regex = new RegExp(this.escapeRegex(userSearch), 'i');
      and.push({
        $or: [{ userName: regex }, { userEmail: regex }, { employeeId: regex }],
      });
    }

    if (query.station?.trim()) and.push({ station: query.station.trim() });
    if (query.department?.trim()) and.push({ department: query.department.trim() });
    if (query.module?.trim()) and.push({ module: query.module.trim() });
    if (query.eventType?.trim()) and.push({ action: query.eventType.trim() });
    if (query.severity?.trim()) and.push({ severity: query.severity.trim() });
    if (query.result?.trim()) and.push({ result: query.result.trim() });

    const ipAddress = String(query.ipAddress ?? '').trim();
    if (ipAddress) and.push({ ipAddress: new RegExp(this.escapeRegex(ipAddress), 'i') });

    const requestId = String(query.requestId ?? '').trim();
    if (requestId) and.push({ requestId: new RegExp(this.escapeRegex(requestId), 'i') });

    if (query.cursor) {
      const parsed = this.parseCursor(query.cursor);
      if (parsed) {
        and.push({
          $or: [
            { timestamp: { $lt: parsed.timestamp } },
            { timestamp: parsed.timestamp, _id: { $lt: parsed.id } },
          ],
        });
      }
    }

    const filter = and.length > 1 ? { $and: and } : and.length === 1 ? and[0]! : {};

    const rows = await this.auditModel
      .find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && last?._id && last.timestamp
        ? this.encodeCursor(last.timestamp as Date, String(last._id))
        : null;

    return {
      data: pageRows.map((row) => this.serializeEvent(row as unknown as Record<string, unknown>)),
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  }

  async getEventById(eventId: string) {
    const row = await this.auditModel.findOne({ eventId }).lean();
    if (!row) return null;
    return this.serializeEventDetail(row as unknown as Record<string, unknown>);
  }

  async getRelatedEvents(eventId: string, scope: 'user' | 'station' | 'module') {
    const event = await this.auditModel.findOne({ eventId }).lean();
    if (!event) return [];

    const filter: Record<string, unknown> = { eventId: { $ne: eventId } };
    if (scope === 'user') filter.userId = event.userId;
    else if (scope === 'station' && event.station) filter.station = event.station;
    else if (scope === 'module') filter.module = event.module;
    else return [];

    const rows = await this.auditModel
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(8)
      .lean();

    return rows.map((row) => this.serializeEvent(row as unknown as Record<string, unknown>));
  }

  async exportEvents(query: QueryAuditEventsDto, format: 'csv' | 'xlsx' | 'pdf' = 'csv') {
    const { data } = await this.listEvents({ ...query, limit: 500, cursor: undefined });
    if (format === 'csv') {
      const header = [
        'Event ID',
        'Timestamp',
        'User',
        'Employee ID',
        'Station',
        'Module',
        'Action',
        'Entity',
        'Severity',
        'Result',
        'IP Address',
        'Request ID',
      ];
      const lines = data.map((row) =>
        [
          row.eventId,
          row.timestamp,
          row.userName,
          row.employeeId,
          row.station,
          row.module,
          row.action,
          row.entity,
          row.severity,
          row.result,
          row.ipAddress,
          row.requestId,
        ]
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(','),
      );
      return {
        format: 'csv',
        filename: `audit-logs-${Date.now()}.csv`,
        content: [header.join(','), ...lines].join('\n'),
        mimeType: 'text/csv;charset=utf-8',
      };
    }

    return {
      format,
      filename: `audit-logs-${Date.now()}.${format}`,
      content: JSON.stringify(data, null, 2),
      mimeType: 'application/json',
    };
  }

  private async backfillLegacyLogsIfNeeded(): Promise<void> {
    if (this.legacyBackfillDone) return;
    const count = await this.auditModel.estimatedDocumentCount();
    if (count > 50) {
      this.legacyBackfillDone = true;
      return;
    }

    const legacyRows = await this.legacyLogModel
      .find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    for (const row of legacyRows) {
      const sourceLogId = String(row._id);
      const exists = await this.auditModel.exists({ sourceLogId });
      if (exists) continue;

      const payload: UserActivityLogEventPayload = {
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        accountType: row.accountType,
        action: row.action,
        method: row.method,
        path: row.path,
        metadata: row.metadata ?? undefined,
      };

      const enrich = await this.enrichUserContext(row.userId, row.accountType);
      const record = mapActivityToAuditRecord(payload, {
        ...enrich,
        sourceLogId,
        timestamp: row.createdAt ?? new Date(),
      });

      try {
        await this.auditModel.create(record);
      } catch {
        /* skip duplicates */
      }
    }

    this.legacyBackfillDone = true;
  }

  private async enrichUserContext(
    userId: string,
    accountType?: 'admin' | 'user',
  ): Promise<{
    employeeId?: string;
    role?: string;
    station?: string;
    department?: string;
  }> {
    const id = String(userId ?? '').trim();
    if (!id || !Types.ObjectId.isValid(id)) return {};

    if (accountType === 'admin') {
      const admin = await this.adminModel.findById(id).select('userid role').lean();
      if (!admin) return {};
      return {
        employeeId: String(admin.userid ?? '').trim() || undefined,
        role: String(admin.role ?? 'admin').trim() || 'admin',
      };
    }

    const user = await this.userModel
      .findById(id)
      .select('employeeId userid departmentLabel authorizationRole assignedStationIds')
      .lean();
    if (!user) return {};

    return {
      employeeId: String(user.employeeId ?? user.userid ?? '').trim() || undefined,
      role: String(user.authorizationRole ?? 'employee').trim() || undefined,
      department: String(user.departmentLabel ?? '').trim() || undefined,
      station: user.assignedStationIds?.[0]
        ? String(user.assignedStationIds[0]).trim()
        : undefined,
    };
  }

  private resolveDateRange(
    preset?: string,
    fromDate?: string,
    toDate?: string,
  ): DateRange {
    const now = new Date();
    const p = String(preset ?? '').toLowerCase();

    if (p === 'today') {
      return { from: this.startOfToday(), to: now };
    }
    if (p === '24h' || p === 'last_24_hours') {
      return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    }
    if (p === '7d' || p === 'last_7_days') {
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
    }
    if (p === '30d' || p === 'last_30_days') {
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
    }

    const from = fromDate ? new Date(fromDate) : undefined;
    const to = toDate ? new Date(toDate) : undefined;
    if (from && !Number.isNaN(from.getTime())) {
      return { from, to: to && !Number.isNaN(to.getTime()) ? to : now };
    }

    return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private buildTimestampFilter(range: DateRange): Record<string, unknown> {
    const clause: Record<string, Date> = {};
    if (range.from) clause.$gte = range.from;
    if (range.to) clause.$lte = range.to;
    return Object.keys(clause).length ? { timestamp: clause } : {};
  }

  private buildKpiFilter(kpi: AuditKpiFilter): Record<string, unknown> {
    switch (kpi) {
      case 'total_today':
        return { timestamp: { $gte: this.startOfToday() } };
      case 'security':
        return {
          $or: [
            { module: 'Authentication' },
            { action: { $in: ['LOGIN', 'LOGOUT', 'PERMISSION_CHANGE', 'ASSIGN_ROLE'] } },
            { severity: { $in: ['HIGH', 'CRITICAL'] } },
          ],
        };
      case 'user_actions':
        return { $or: [{ module: 'Access Control' }, { entityType: 'User' }] };
      case 'config_changes':
        return {
          module: { $in: ['Station Management', 'Dashboard', 'System'] },
          action: { $in: ['CREATE', 'UPDATE', 'DELETE', 'PERMISSION_CHANGE'] },
        };
      case 'failed':
        return { result: 'FAILED' };
      case 'critical':
        return { $or: [{ severity: 'CRITICAL' }, { severity: 'HIGH', result: 'FAILED' }] };
      case 'stations_impacted':
        return { station: { $exists: true, $ne: '' } };
      case 'unique_users':
      default:
        return {};
    }
  }

  private serializeEvent(row: Record<string, unknown>) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const actionLabel = String(metadata.actionLabel ?? row.action ?? '');
    const entityType = row.entityType ? String(row.entityType) : '';
    const entityId = row.entityId ? String(row.entityId) : '';
    const entity = [entityType, entityId].filter(Boolean).join(' · ') || '—';

    return {
      id: String(row._id ?? ''),
      eventId: String(row.eventId ?? ''),
      timestamp: row.timestamp ? new Date(row.timestamp as Date).toISOString() : '',
      userId: String(row.userId ?? ''),
      userName: String(row.userName ?? ''),
      employeeId: row.employeeId ? String(row.employeeId) : '',
      station: row.station ? String(row.station) : '',
      department: row.department ? String(row.department) : '',
      module: String(row.module ?? ''),
      action: String(row.action ?? ''),
      actionLabel,
      entity,
      entityType,
      entityId,
      severity: String(row.severity ?? 'INFO'),
      result: String(row.result ?? 'SUCCESS'),
      ipAddress: row.ipAddress ? String(row.ipAddress) : '',
      requestId: row.requestId ? String(row.requestId) : '',
      riskScore: Number(row.riskScore ?? 0),
    };
  }

  private serializeEventDetail(row: Record<string, unknown>) {
    const base = this.serializeEvent(row);
    const riskScore = Number(row.riskScore ?? 0);
    return {
      ...base,
      role: row.role ? String(row.role) : '',
      userEmail: row.userEmail ? String(row.userEmail) : '',
      before: row.before ?? null,
      after: row.after ?? null,
      correlationId: row.correlationId ? String(row.correlationId) : '',
      device: row.device ? String(row.device) : '',
      browser: row.browser ? String(row.browser) : '',
      os: row.os ? String(row.os) : '',
      riskLevel: riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Medium' : 'Low',
      suspiciousActivity: riskScore >= 70 || row.result === 'FAILED',
      metadata: row.metadata ?? null,
      rawPayload: row.rawPayload ?? row.metadata ?? null,
    };
  }

  private encodeCursor(timestamp: Date, id: string): string {
    return Buffer.from(`${timestamp.toISOString()}|${id}`).toString('base64url');
  }

  private parseCursor(cursor: string): { timestamp: Date; id: Types.ObjectId } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const [iso, id] = decoded.split('|');
      if (!iso || !id || !Types.ObjectId.isValid(id)) return null;
      const timestamp = new Date(iso);
      if (Number.isNaN(timestamp.getTime())) return null;
      return { timestamp, id: new Types.ObjectId(id) };
    } catch {
      return null;
    }
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
