import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  USER_ACTIVITY_LOG_EVENT,
  type UserActivityLogEventPayload,
} from 'src/user-activity-notifications/events/user-activity.events';
import { AuditLog, AuditLogDocument } from 'src/admin-audit/schema/audit-log.schema';
import {
  RepresentativeSignature,
  RepresentativeSignatureDocument,
  type RepresentativeType,
} from '../schema/representative-signature.schema';
import { CreateRepresentativeSignatureDto } from '../dto/create-representative-signature.dto';
import { UpdateRepresentativeSignatureDto } from '../dto/update-representative-signature.dto';

/** Authenticated caller context forwarded from the controller for audit logging. */
export type SignatureActor = {
  userId: string;
  userName: string;
  userEmail?: string;
  accountType: 'admin' | 'user';
  ipAddress?: string;
  userAgent?: string;
};

export type SignatureAuditEvent =
  | 'SIGNATURE_CREATED'
  | 'SIGNATURE_UPDATED'
  | 'SIGNATURE_REPLACED'
  | 'SIGNATURE_DEACTIVATED'
  | 'SIGNATURE_ASSIGNED_TO_FHR'
  | 'SIGNATURE_ASSIGNED_TO_GSE'
  | 'SIGNATURE_ASSIGNED_TO_TEAM_REPORT';

export type AssignReportType = 'FHR' | 'GSE' | 'TEAM_REPORT';

export type RepresentativeSignatureView = {
  id: string;
  representativeName: string;
  representativeType: RepresentativeType;
  signatureUrl: string;
  station: string;
  active: boolean;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const EVENT_LABELS: Record<SignatureAuditEvent, string> = {
  SIGNATURE_CREATED: 'Representative signature created',
  SIGNATURE_UPDATED: 'Representative signature updated',
  SIGNATURE_REPLACED: 'Representative signature replaced',
  SIGNATURE_DEACTIVATED: 'Representative signature deactivated',
  SIGNATURE_ASSIGNED_TO_FHR: 'Signature assigned to FHR report',
  SIGNATURE_ASSIGNED_TO_GSE: 'Signature assigned to GSE report',
  SIGNATURE_ASSIGNED_TO_TEAM_REPORT: 'Signature assigned to Team report',
};

const ASSIGN_EVENT_BY_REPORT: Record<AssignReportType, SignatureAuditEvent> = {
  FHR: 'SIGNATURE_ASSIGNED_TO_FHR',
  GSE: 'SIGNATURE_ASSIGNED_TO_GSE',
  TEAM_REPORT: 'SIGNATURE_ASSIGNED_TO_TEAM_REPORT',
};

@Injectable()
export class RepresentativeSignatureService {
  private readonly logger = new Logger(RepresentativeSignatureService.name);

  constructor(
    @InjectModel(RepresentativeSignature.name)
    private readonly signatureModel: Model<RepresentativeSignatureDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private static nameKey(name: string): string {
    return String(name ?? '').trim().toLowerCase();
  }

  private toView(doc: RepresentativeSignatureDocument): RepresentativeSignatureView {
    return {
      id: String(doc._id),
      representativeName: doc.representativeName,
      representativeType: doc.representativeType,
      signatureUrl: doc.signatureUrl,
      station: doc.station ?? '',
      active: doc.active !== false,
      createdBy: doc.createdBy ?? '',
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,
    };
  }

  /** Resolve a repository signature by id (used during PDF generation). Returns null if missing. */
  async findById(id: string): Promise<RepresentativeSignatureView | null> {
    if (!id || !Types.ObjectId.isValid(id)) return null;
    const doc = await this.signatureModel.findById(id).exec();
    return doc ? this.toView(doc) : null;
  }

  /** Find the most recently updated active signature for a representative name + type. */
  async getSignatureByName(
    name: string,
    type: RepresentativeType,
  ): Promise<RepresentativeSignatureView | null> {
    const nameKey = RepresentativeSignatureService.nameKey(name);
    if (!nameKey) return null;
    const doc = await this.signatureModel
      .findOne({ representativeType: type, nameKey, active: true })
      .sort({ updatedAt: -1 })
      .exec();
    return doc ? this.toView(doc) : null;
  }

  /** All active signatures for a representative type. */
  async getSignatureByType(
    type: RepresentativeType,
  ): Promise<RepresentativeSignatureView[]> {
    const docs = await this.signatureModel
      .find({ representativeType: type, active: true })
      .sort({ updatedAt: -1 })
      .exec();
    return docs.map((d) => this.toView(d));
  }

  /** Create a brand-new repository signature. */
  async createSignature(
    dto: CreateRepresentativeSignatureDto,
    actor: SignatureActor,
  ): Promise<RepresentativeSignatureView> {
    const representativeName = dto.representativeName.trim();
    if (!representativeName) {
      throw new BadRequestException('Representative name is required.');
    }
    const created = await this.signatureModel.create({
      representativeName,
      nameKey: RepresentativeSignatureService.nameKey(representativeName),
      representativeType: dto.representativeType,
      signatureUrl: dto.signatureUrl,
      station: dto.station?.trim() ?? '',
      createdBy: actor.userId,
      active: true,
    });

    this.emitAudit(actor, 'SIGNATURE_CREATED', created, 'POST');
    return this.toView(created);
  }

  /**
   * Create or replace a signature for a representative name + type. Used by the
   * Digital Signatures modal so the same identity never has duplicate active rows.
   */
  async upsertByName(
    name: string,
    type: RepresentativeType,
    signatureUrl: string,
    actor: SignatureActor,
    station?: string,
  ): Promise<RepresentativeSignatureView> {
    const representativeName = String(name ?? '').trim();
    if (!representativeName) {
      throw new BadRequestException('Representative name is required.');
    }
    const nameKey = RepresentativeSignatureService.nameKey(representativeName);
    const existing = await this.signatureModel
      .findOne({ representativeType: type, nameKey, active: true })
      .sort({ updatedAt: -1 })
      .exec();

    if (existing) {
      existing.signatureUrl = signatureUrl;
      if (station != null) existing.station = station.trim();
      await existing.save();
      this.emitAudit(actor, 'SIGNATURE_REPLACED', existing, 'PUT');
      this.emitAudit(actor, 'SIGNATURE_UPDATED', existing, 'PUT');
      return this.toView(existing);
    }

    const created = await this.signatureModel.create({
      representativeName,
      nameKey,
      representativeType: type,
      signatureUrl,
      station: station?.trim() ?? '',
      createdBy: actor.userId,
      active: true,
    });
    this.emitAudit(actor, 'SIGNATURE_CREATED', created, 'POST');
    return this.toView(created);
  }

  /** Update / replace an existing repository signature by id. */
  async updateSignature(
    id: string,
    dto: UpdateRepresentativeSignatureDto,
    actor: SignatureActor,
  ): Promise<RepresentativeSignatureView> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid signature id.');
    }
    const doc = await this.signatureModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Signature not found.');

    let replaced = false;
    if (dto.signatureUrl && dto.signatureUrl !== doc.signatureUrl) {
      doc.signatureUrl = dto.signatureUrl;
      replaced = true;
    }
    if (dto.representativeName != null) {
      const name = dto.representativeName.trim();
      if (name) {
        doc.representativeName = name;
        doc.nameKey = RepresentativeSignatureService.nameKey(name);
      }
    }
    if (dto.station != null) doc.station = dto.station.trim();
    await doc.save();

    if (replaced) this.emitAudit(actor, 'SIGNATURE_REPLACED', doc, 'PUT');
    this.emitAudit(actor, 'SIGNATURE_UPDATED', doc, 'PUT');
    return this.toView(doc);
  }

  /** Soft-delete a signature so it stops being auto-fetched. */
  async deactivate(
    id: string,
    actor: SignatureActor,
  ): Promise<RepresentativeSignatureView> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid signature id.');
    }
    const doc = await this.signatureModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Signature not found.');
    doc.active = false;
    await doc.save();
    this.emitAudit(actor, 'SIGNATURE_DEACTIVATED', doc, 'DELETE');
    return this.toView(doc);
  }

  /**
   * Record that a repository signature was applied to a specific report type.
   * Emits a report-specific audit event for traceability.
   */
  async assignSignatureToReport(
    signatureId: string,
    reportType: AssignReportType,
    actor: SignatureActor,
    context?: { flightNo?: string; station?: string; serialNo?: number },
  ): Promise<RepresentativeSignatureView> {
    const doc = await this.signatureModel.findById(signatureId).exec();
    if (!doc) throw new NotFoundException('Signature not found.');
    this.emitAudit(
      actor,
      ASSIGN_EVENT_BY_REPORT[reportType],
      doc,
      'POST',
      context,
    );
    return this.toView(doc);
  }

  // ---- Admin management ----

  async list(opts: {
    search?: string;
    type?: RepresentativeType;
    includeInactive?: boolean;
    limit?: number;
  }): Promise<RepresentativeSignatureView[]> {
    const filter: Record<string, unknown> = {};
    if (!opts.includeInactive) filter.active = true;
    if (opts.type) filter.representativeType = opts.type;
    const search = String(opts.search ?? '').trim();
    if (search) {
      filter.representativeName = { $regex: escapeRegex(search), $options: 'i' };
    }
    const limit = Math.min(Math.max(Number(opts.limit ?? 200) || 200, 1), 500);
    const docs = await this.signatureModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((d) => this.toView(d));
  }

  async findOne(id: string): Promise<RepresentativeSignatureView> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid signature id.');
    }
    const doc = await this.signatureModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Signature not found.');
    return this.toView(doc);
  }

  /** Audit trail for a single repository signature (queried from audit_logs). */
  async getAuditHistory(id: string): Promise<
    Array<{
      eventId: string;
      timestamp: Date | null;
      action: string;
      auditEvent: string;
      userName: string;
      userId: string;
      ipAddress?: string;
    }>
  > {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid signature id.');
    }
    const rows = await this.auditModel
      .find({ 'metadata.signatureId': id })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean()
      .exec();
    return rows.map((r) => {
      const metadata = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        eventId: String(r.eventId ?? ''),
        timestamp: r.timestamp ?? null,
        action: String(metadata.actionLabel ?? r.action ?? ''),
        auditEvent: String(metadata.auditEvent ?? r.action ?? ''),
        userName: String(r.userName ?? ''),
        userId: String(r.userId ?? ''),
        ipAddress: r.ipAddress,
      };
    });
  }

  private emitAudit(
    actor: SignatureActor,
    event: SignatureAuditEvent,
    doc: RepresentativeSignatureDocument,
    method: 'POST' | 'PUT' | 'DELETE',
    context?: { flightNo?: string; station?: string; serialNo?: number },
  ): void {
    const signatureId = String(doc._id);
    const payload: UserActivityLogEventPayload = {
      userId: actor.userId,
      userName: actor.userName,
      userEmail: actor.userEmail,
      accountType: actor.accountType,
      action: `${EVENT_LABELS[event]} — ${doc.representativeName}`,
      method,
      path: `/representative-signatures/${signatureId}`,
      metadata: {
        auditEvent: event,
        signatureId,
        representativeName: doc.representativeName,
        representativeType: doc.representativeType,
        station: context?.station || doc.station || undefined,
        stationName: context?.station || doc.station || undefined,
        flightNo: context?.flightNo || undefined,
        serialNo: context?.serialNo,
        fhrNo: context?.serialNo,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    };
    try {
      this.eventEmitter.emit(USER_ACTIVITY_LOG_EVENT, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to emit signature audit event: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
