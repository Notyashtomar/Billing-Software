import {
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import {
  SupportTicket,
  SupportTicketDocument,
} from '../../user/schema/support-ticket.schema';
import {
  DEFAULT_STATIONS,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
} from '../constants/incident.enums';
import { escapeRegex } from '../../common/escape-regex.util';
import {
  AddIncidentCommentDto,
  CreateIncidentDto,
  QueryIncidentsDto,
  UpdateIncidentDto,
} from '../dto/incident.dto';
import { Incident, IncidentDocument } from '../schema/incident.schema';

type DateRange = { from?: Date; to?: Date };

const OPEN_STATUSES = [
  'open',
  'acknowledged',
  'assigned',
  'investigating',
  'escalated',
  'waiting',
];

@Injectable()
export class AdminIncidentsService implements OnModuleInit {
    constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(SupportTicket.name)
    private readonly ticketModel: Model<SupportTicketDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.backfillFromTickets();
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private resolveDateRange(
    preset?: string,
    fromDate?: string,
    toDate?: string,
  ): DateRange {
    if (fromDate || toDate) {
      return {
        from: fromDate ? new Date(fromDate) : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59.999`) : undefined,
      };
    }
    const p = String(preset || '30d').toLowerCase();
    if (p === 'today') return { from: this.startOfToday() };
    const from = new Date();
    if (p === '7d') from.setDate(from.getDate() - 7);
    else if (p === '90d') from.setDate(from.getDate() - 90);
    else from.setDate(from.getDate() - 30);
    return { from };
  }

  private buildFilter(query: QueryIncidentsDto): Record<string, unknown> {
    const range = this.resolveDateRange(query.datePreset, query.fromDate, query.toDate);
    const and: Record<string, unknown>[] = [];
    if (range.from || range.to) {
      const createdAt: Record<string, Date> = {};
      if (range.from) createdAt.$gte = range.from;
      if (range.to) createdAt.$lte = range.to;
      and.push({ createdAt });
    }
    if (query.station) and.push({ station: query.station });
    if (query.category) and.push({ category: query.category });
    if (query.severity) and.push({ severity: query.severity });
    if (query.status) and.push({ status: query.status });
    if (query.assignedTo) {
      and.push({
        assignedTo: { $regex: escapeRegex(query.assignedTo), $options: 'i' },
      });
    }
    if (query.reportedBy) {
      and.push({
        reportedBy: { $regex: escapeRegex(query.reportedBy), $options: 'i' },
      });
    }
    if (query.incidentId) {
      and.push({
        incidentId: { $regex: escapeRegex(query.incidentId), $options: 'i' },
      });
    }
    if (query.keyword) {
      const kw = escapeRegex(query.keyword);
      and.push({
        $or: [
          { title: { $regex: kw, $options: 'i' } },
          { description: { $regex: kw, $options: 'i' } },
        ],
      });
    }
    if (query.cursor) {
      and.push({ createdAt: { $lt: new Date(query.cursor) } });
    }
    return and.length ? { $and: and } : {};
  }

  private mapSeverityFromTicket(urgency: string, issueType: string): string {
    if (issueType === 'Catastrophic' || issueType === 'Show stopper') return 'critical';
    if (issueType === 'Major' || urgency === 'urgent') return 'high';
    if (issueType === 'Minor') return 'medium';
    return 'low';
  }

  private mapCategoryFromTicket(issueReason: string, subPage: string): string {
    const text = `${issueReason} ${subPage}`.toLowerCase();
    if (text.includes('security') || text.includes('access')) return 'Security Incident';
    if (text.includes('network') || text.includes('connect')) return 'Network Failure';
    if (text.includes('flight') || text.includes('data')) return 'Flight Data Issue';
    if (text.includes('report')) return 'Report Generation Failure';
    if (text.includes('import')) return 'Bulk Import Failure';
    if (text.includes('api')) return 'API Failure';
    if (text.includes('equipment') || text.includes('gse')) return 'Equipment Failure';
    return 'System Outage';
  }

  private serializeRow(doc: Incident & { _id?: unknown }) {
    return {
      id: doc.incidentId,
      incidentId: doc.incidentId,
      title: doc.title,
      station: doc.station ?? '',
      category: doc.category,
      severity: doc.severity,
      status: doc.status,
      assignedTo: doc.assignedTo ?? '',
      reportedBy: doc.reportedBy ?? '',
      createdAt: new Date(doc.createdAt).toISOString(),
      updatedAt: new Date(doc.updatedAt).toISOString(),
      priority: doc.priority,
    };
  }

  private serializeDetail(doc: Incident & { _id?: unknown }) {
    const now = Date.now();
    const created = new Date(doc.createdAt).getTime();
    const slaTarget = doc.slaTarget ? new Date(doc.slaTarget).getTime() : created + 4 * 3600000;
    const elapsedMs = (doc.resolvedAt ? new Date(doc.resolvedAt).getTime() : now) - created;
    const remainingMs = Math.max(0, slaTarget - now);

    return {
      ...this.serializeRow(doc),
      description: doc.description,
      department: doc.department ?? '',
      affectedArea: doc.affectedArea ?? '',
      affectedSystem: doc.affectedSystem ?? '',
      escalatedTo: doc.escalatedTo ?? '',
      approver: doc.approver ?? '',
      resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : null,
      rootCause: doc.rootCause ?? '',
      contributingFactors: doc.contributingFactors ?? [],
      resolutionSummary: doc.resolutionSummary ?? '',
      preventiveActions: doc.preventiveActions ?? [],
      correctiveActions: doc.correctiveActions ?? [],
      attachments: doc.attachments ?? [],
      timeline: (doc.timeline ?? []).map((t) => ({
        at: new Date(t.at).toISOString(),
        event: t.event,
        actor: t.actor ?? '',
        detail: t.detail ?? '',
      })),
      comments: doc.comments ?? [],
      sla: {
        targetResolutionTime: new Date(slaTarget).toISOString(),
        elapsedTimeMs: elapsedMs,
        remainingTimeMs: doc.resolvedAt ? 0 : remainingMs,
        status: doc.slaBreached
          ? 'breached'
          : doc.resolvedAt
            ? 'met'
            : remainingMs < 3600000
              ? 'at_risk'
              : 'on_track',
      },
      relatedEvents: {
        auditLogs: [],
        userActions: doc.sourceTicketNumber
          ? [{ id: doc.sourceTicketNumber, label: `Support ticket ${doc.sourceTicketNumber}` }]
          : [],
        equipmentEvents: [],
        systemAlerts: [],
      },
      metadata: doc.metadata ?? null,
    };
  }

  async getKpis(query: QueryIncidentsDto) {
    await this.bootstrap();
    const today = this.startOfToday();
    const openFilter = { status: { $in: OPEN_STATUSES } };

    const [
      openIncidents,
      criticalIncidents,
      underInvestigation,
      resolvedToday,
      slaBreaches,
      stationsImpacted,
      activeEscalations,
      avgResolution,
    ] = await Promise.all([
      this.incidentModel.countDocuments(openFilter),
      this.incidentModel.countDocuments({ ...openFilter, severity: 'critical' }),
      this.incidentModel.countDocuments({ status: 'investigating' }),
      this.incidentModel.countDocuments({
        resolvedAt: { $gte: today },
        status: { $in: ['resolved', 'closed'] },
      }),
      this.incidentModel.countDocuments({ slaBreached: true, status: { $in: OPEN_STATUSES } }),
      this.incidentModel
        .distinct('station', { ...openFilter, station: { $ne: '' } })
        .then((s) => s.length),
      this.incidentModel.countDocuments({ status: 'escalated' }),
      this.incidentModel
        .aggregate([
          {
            $match: {
              resolvedAt: { $exists: true },
              createdAt: { $gte: this.resolveDateRange(query.datePreset).from },
            },
          },
          {
            $project: {
              duration: { $subtract: ['$resolvedAt', '$createdAt'] },
            },
          },
          { $group: { _id: null, avg: { $avg: '$duration' } } },
        ])
        .then((r) => Math.round((r[0]?.avg ?? 0) / 60000)),
    ]);

    return {
      openIncidents,
      criticalIncidents,
      underInvestigation,
      resolvedToday,
      averageResolutionTimeMinutes: avgResolution,
      slaBreaches,
      stationsImpacted,
      activeEscalations,
    };
  }

  async getSeveritySummary() {
    await this.bootstrap();
    const openFilter = { status: { $in: OPEN_STATUSES } };
    const rows = await this.incidentModel.aggregate([
      { $match: openFilter },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);
    const map = new Map(rows.map((r) => [String(r._id), r.count as number]));
    return INCIDENT_SEVERITIES.map((severity) => ({
      severity,
      count: map.get(severity) ?? 0,
    }));
  }

  async listIncidents(query: QueryIncidentsDto) {
    await this.bootstrap();
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
    const filter = this.buildFilter(query);
    const rows = await this.incidentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => this.serializeRow(r as Incident));
    return {
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && data.length ? data[data.length - 1].createdAt : null,
      },
    };
  }

  async getIncident(incidentId: string) {
    await this.bootstrap();
    const doc = await this.incidentModel.findOne({ incidentId }).lean();
    if (!doc) throw new NotFoundException('Incident not found');
    return this.serializeDetail(doc as Incident);
  }

  async createIncident(dto: CreateIncidentDto, actor?: string) {
    const now = new Date();
    const incidentId = `INC-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const slaHours =
      dto.severity === 'critical' ? 2 : dto.severity === 'high' ? 4 : dto.severity === 'medium' ? 8 : 24;

    const doc = await this.incidentModel.create({
      incidentId,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      severity: dto.severity,
      status: dto.assignedTo ? 'assigned' : 'open',
      priority: dto.severity === 'critical' ? 'p1' : dto.severity === 'high' ? 'p2' : 'p3',
      station: dto.station ?? '',
      department: dto.department ?? '',
      affectedArea: dto.affectedArea ?? '',
      affectedSystem: dto.affectedSystem ?? '',
      reportedBy: actor ?? 'System',
      assignedTo: dto.assignedTo ?? '',
      createdAt: now,
      updatedAt: now,
      slaTarget: new Date(now.getTime() + slaHours * 3600000),
      slaBreached: false,
      timeline: [
        { at: now, event: 'Incident Created', actor: actor ?? 'System' },
        ...(dto.assignedTo
          ? [{ at: now, event: 'Assigned', actor: actor ?? 'System', detail: dto.assignedTo }]
          : []),
      ],
      comments: [],
      attachments: [],
      contributingFactors: [],
      preventiveActions: [],
      correctiveActions: [],
    });
    return this.serializeDetail(doc.toObject());
  }

  async updateIncident(incidentId: string, dto: UpdateIncidentDto, actor?: string) {
    const doc = await this.incidentModel.findOne({ incidentId });
    if (!doc) throw new NotFoundException('Incident not found');
    const now = new Date();
    const timeline = [...(doc.timeline ?? [])];

    if (dto.status && dto.status !== doc.status) {
      timeline.push({
        at: now,
        event: `Status → ${dto.status}`,
        actor: actor ?? 'System',
      });
      if (dto.status === 'investigating') {
        timeline.push({ at: now, event: 'Investigation Started', actor: actor ?? 'System' });
      }
      if (dto.status === 'escalated') {
        timeline.push({ at: now, event: 'Escalated', actor: actor ?? 'System' });
      }
      if (dto.status === 'resolved' || dto.status === 'closed') {
        doc.resolvedAt = now;
      }
      doc.status = dto.status;
    }
    if (dto.assignedTo) {
      doc.assignedTo = dto.assignedTo;
      timeline.push({ at: now, event: 'Assigned', actor: actor ?? 'System', detail: dto.assignedTo });
    }
    if (dto.escalatedTo) {
      doc.escalatedTo = dto.escalatedTo;
      doc.status = 'escalated';
      timeline.push({ at: now, event: 'Escalated', actor: actor ?? 'System', detail: dto.escalatedTo });
    }
    if (dto.rootCause) doc.rootCause = dto.rootCause;
    if (dto.resolutionSummary) doc.resolutionSummary = dto.resolutionSummary;
    if (dto.severity) doc.severity = dto.severity;

    if (doc.slaTarget && !doc.resolvedAt && now > doc.slaTarget) {
      doc.slaBreached = true;
    }

    doc.timeline = timeline;
    doc.updatedAt = now;
    await doc.save();
    return this.serializeDetail(doc.toObject());
  }

  async addComment(incidentId: string, dto: AddIncidentCommentDto, actor?: string) {
    const doc = await this.incidentModel.findOne({ incidentId });
    if (!doc) throw new NotFoundException('Incident not found');
    const comment = {
      id: randomUUID(),
      author: actor ?? 'Admin',
      body: dto.body,
      createdAt: new Date(),
      mentions: dto.mentions ?? [],
    };
    doc.comments = [...(doc.comments ?? []), comment];
    doc.updatedAt = new Date();
    await doc.save();
    return this.serializeDetail(doc.toObject());
  }

  async getAnalytics(query: QueryIncidentsDto) {
    await this.bootstrap();
    const range = this.resolveDateRange(query.datePreset, query.fromDate, query.toDate);
    const match: Record<string, unknown> = {};
    if (range.from) match.createdAt = { $gte: range.from };

    const [byStation, byCategory, bySeverity, monthly, resolutionTrend, recurring] =
      await Promise.all([
        this.incidentModel.aggregate([
          { $match: match },
          { $group: { _id: '$station', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        this.incidentModel.aggregate([
          { $match: match },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        this.incidentModel.aggregate([
          { $match: match },
          { $group: { _id: '$severity', count: { $sum: 1 } } },
        ]),
        this.incidentModel.aggregate([
          { $match: match },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.incidentModel.aggregate([
          { $match: { resolvedAt: { $exists: true }, ...match } },
          {
            $project: {
              month: { $dateToString: { format: '%Y-%m', date: '$resolvedAt' } },
              duration: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 60000] },
            },
          },
          { $group: { _id: '$month', avgMinutes: { $avg: '$duration' } } },
          { $sort: { _id: 1 } },
        ]),
        this.incidentModel.aggregate([
          { $match: match },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

    return {
      byStation: byStation.map((r) => ({ label: r._id || 'Unknown', value: r.count })),
      byCategory: byCategory.map((r) => ({ label: r._id, value: r.count })),
      bySeverity: bySeverity.map((r) => ({ label: r._id, value: r.count })),
      monthlyTrend: monthly.map((r) => ({ label: r._id, value: r.count })),
      resolutionTimeTrend: resolutionTrend.map((r) => ({
        label: r._id,
        value: Math.round(r.avgMinutes ?? 0),
      })),
      topRecurring: recurring.map((r) => ({ label: r._id, value: r.count })),
    };
  }

  async getStationImpact() {
    await this.bootstrap();
    const stations = [...DEFAULT_STATIONS];
    const rows = await Promise.all(
      stations.map(async (station) => {
        const [total, open, resolved, critical] = await Promise.all([
          this.incidentModel.countDocuments({ station }),
          this.incidentModel.countDocuments({ station, status: { $in: OPEN_STATUSES } }),
          this.incidentModel.countDocuments({ station, status: { $in: ['resolved', 'closed'] } }),
          this.incidentModel.countDocuments({ station, severity: 'critical', status: { $in: OPEN_STATUSES } }),
        ]);
        return { station, total, open, resolved, critical };
      }),
    );
    return { stations: rows };
  }

  async getEscalations() {
    await this.bootstrap();
    const now = Date.now();
    const [pending, escalated, overdue, slaViolations] = await Promise.all([
      this.incidentModel
        .find({ status: 'escalated' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      this.incidentModel.countDocuments({ status: 'escalated' }),
      this.incidentModel
        .find({
          status: 'investigating',
          slaTarget: { $lt: new Date() },
        })
        .limit(10)
        .lean(),
      this.incidentModel.countDocuments({ slaBreached: true, status: { $in: OPEN_STATUSES } }),
    ]);
    return {
      pendingEscalations: pending.map((r) => this.serializeRow(r as Incident)),
      escalatedCount: escalated,
      overdueInvestigations: overdue.map((r) => this.serializeRow(r as Incident)),
      slaViolations,
    };
  }

  async getAlerts() {
    await this.bootstrap();
    const alerts: {
      id: string;
      severity: string;
      title: string;
      detail: string;
    }[] = [];

    const critical = await this.incidentModel
      .find({ severity: 'critical', status: { $in: OPEN_STATUSES } })
      .limit(5)
      .lean();
    for (const c of critical) {
      alerts.push({
        id: `crit-${c.incidentId}`,
        severity: 'critical',
        title: 'Critical Safety Event',
        detail: c.title,
      });
    }

    const categories = [
      { cat: 'Equipment Failure', title: 'Equipment Failures' },
      { cat: 'Security Incident', title: 'Security Incidents' },
      { cat: 'System Outage', title: 'System Outages' },
      { cat: 'Network Failure', title: 'Network Failures' },
    ];
    for (const { cat, title } of categories) {
      const count = await this.incidentModel.countDocuments({
        category: cat,
        status: { $in: OPEN_STATUSES },
      });
      if (count > 0) {
        alerts.push({
          id: `cat-${cat}`,
          severity: cat.includes('Security') ? 'critical' : 'warning',
          title,
          detail: `${count} open incident${count === 1 ? '' : 's'}`,
        });
      }
    }
    return { alerts };
  }

  async exportIncidents(query: QueryIncidentsDto, format: 'csv' | 'xlsx' | 'pdf' = 'csv') {
    const { data } = await this.listIncidents({ ...query, limit: 500, cursor: undefined });
    const header = [
      'Incident ID',
      'Title',
      'Station',
      'Category',
      'Severity',
      'Status',
      'Assigned To',
      'Reported By',
      'Created',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.map((r) =>
      [
        r.incidentId,
        r.title,
        r.station,
        r.category,
        r.severity,
        r.status,
        r.assignedTo,
        r.reportedBy,
        r.createdAt,
      ]
        .map(escape)
        .join(','),
    );
    const csv = [header.map(escape).join(','), ...lines].join('\n');
    const ext = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv';
    return {
      filename: `incidents-export-${Date.now()}.${ext}`,
      mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/octet-stream',
      content: Buffer.from(csv, 'utf8'),
    };
  }

  private async backfillFromTickets(): Promise<void> {
    const ticketCount = await this.ticketModel.estimatedDocumentCount();
    if (ticketCount === 0) return;

    const tickets = await this.ticketModel.find({}).sort({ raisedAt: -1 }).limit(100).lean();
    for (const t of tickets) {
      const exists = await this.incidentModel.exists({ sourceTicketNumber: t.ticketNumber });
      if (exists) continue;

      const severity = this.mapSeverityFromTicket(t.urgency, t.issueType);
      const status =
        t.status === 'closed'
          ? 'closed'
          : t.adminResolvedAt
            ? 'resolved'
            : 'open';
      const created = t.raisedAt ?? new Date();
      await this.incidentModel.create({
        incidentId: `INC-TKT-${t.ticketNumber}`,
        title: t.issueReason || `Ticket ${t.ticketNumber}`,
        description: t.description,
        category: this.mapCategoryFromTicket(t.issueReason, t.subPageLabel),
        severity,
        status,
        priority: severity === 'critical' ? 'p1' : 'p2',
        station: '',
        reportedBy: t.raisedByName,
        reportedById: t.raisedByUserid,
        assignedTo: t.resolvedByAdminName || '',
        createdAt: created,
        updatedAt: t.adminResolvedAt ?? t.closedAt ?? created,
        resolvedAt: t.adminResolvedAt ?? t.closedAt,
        resolutionSummary: t.adminResolutionNote ?? '',
        sourceTicketNumber: t.ticketNumber,
        slaTarget: new Date(new Date(created).getTime() + 8 * 3600000),
        slaBreached: false,
        timeline: [
          { at: created, event: 'Incident Created', actor: t.raisedByName },
          ...(t.resolvedByAdminName
            ? [
                {
                  at: t.adminResolvedAt ?? created,
                  event: 'Resolved',
                  actor: t.resolvedByAdminName,
                },
              ]
            : []),
        ],
        comments: [],
        attachments: [],
        contributingFactors: [],
        preventiveActions: [],
        correctiveActions: [],
      });
    }
  }

}
