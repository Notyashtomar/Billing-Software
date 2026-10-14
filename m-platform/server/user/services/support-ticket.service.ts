import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { AdminService } from '../../admin/services/admin.service';
import {
  SupportTicket,
  SupportTicketDocument,
} from '../schema/support-ticket.schema';
import { CreateSupportTicketDto } from '../dto/create-support-ticket.dto';
import { User, UserDocument } from '../schema/user.schema';
import { emitAdminNotification } from '../../admin-notifications/utils/emit-admin-notification.util';

type JwtRaiser = {
  userId: string;
  email?: string;
  role?: string;
};

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectModel(SupportTicket.name)
    private supportTicketModel: Model<SupportTicketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private adminService: AdminService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private buildTicketNumber(raisedAt: Date): string {
    const y = raisedAt.getUTCFullYear();
    const m = String(raisedAt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raisedAt.getUTCDate()).padStart(2, '0');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `TKT-${y}${m}${d}-${suffix}`;
  }

  private normalizeAttachments(
    items: CreateSupportTicketDto['attachments'],
  ): SupportTicket['attachments'] {
    const list = items ?? [];
    if (list.length > MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `At most ${MAX_ATTACHMENTS} attachments are allowed`,
      );
    }

    let totalBytes = 0;
    const out: SupportTicket['attachments'] = [];

    for (const item of list) {
      const raw = String(item.base64 ?? '').trim();
      if (!raw) {
        throw new BadRequestException('Attachment payload is empty');
      }
      if (raw.length > MAX_ATTACHMENT_BYTES * 1.4) {
        throw new BadRequestException(
          `Attachment "${item.fileName}" exceeds size limit`,
        );
      }
      totalBytes += item.sizeBytes;
      if (item.sizeBytes > MAX_ATTACHMENT_BYTES) {
        throw new BadRequestException(
          `Attachment "${item.fileName}" exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
        );
      }
      out.push({
        fileName: item.fileName.trim(),
        mimeType: item.mimeType.trim(),
        sizeBytes: item.sizeBytes,
        base64: raw.replace(/^data:[^;]+;base64,/, ''),
      });
    }

    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new BadRequestException('Total attachment size exceeds limit');
    }

    return out;
  }

  private async resolveRaiser(jwtUser: JwtRaiser): Promise<{
    accountCollection: 'users' | 'admin';
    raisedByMongoId: string;
    raisedByUserid: string;
    raisedByName: string;
    raisedByEmail: string;
    raisedByRole: string;
  }> {
    const mongoId = String(jwtUser.userId ?? '').trim();
    if (!mongoId || !Types.ObjectId.isValid(mongoId)) {
      throw new BadRequestException('Invalid authenticated user');
    }

    const panelUser = await this.userModel
      .findById(mongoId)
      .select('userid name email role employeeId')
      .lean()
      .exec();

    if (panelUser) {
      return {
        accountCollection: 'users',
        raisedByMongoId: mongoId,
        raisedByUserid: String(panelUser.userid ?? panelUser.employeeId ?? ''),
        raisedByName: String(panelUser.name ?? '').trim() || 'Unknown',
        raisedByEmail: String(panelUser.email ?? jwtUser.email ?? '').trim(),
        raisedByRole: String(panelUser.role ?? jwtUser.role ?? '').trim(),
      };
    }

    const admin = await this.adminService.findById(mongoId);
    if (!admin) {
      throw new NotFoundException('Authenticated user record not found');
    }

    const adminDoc = admin.toObject();
    return {
      accountCollection: 'admin',
      raisedByMongoId: mongoId,
      raisedByUserid: String(adminDoc.userid ?? ''),
      raisedByName: String(adminDoc.name ?? '').trim() || 'Unknown',
      raisedByEmail: String(adminDoc.email ?? jwtUser.email ?? '').trim(),
      raisedByRole: String(adminDoc.role ?? jwtUser.role ?? '').trim(),
    };
  }

  async createTicket(jwtUser: JwtRaiser, dto: CreateSupportTicketDto) {
    const raiser = await this.resolveRaiser(jwtUser);
    const raisedAt = new Date();
    const attachments = this.normalizeAttachments(dto.attachments);

    const doc = await this.supportTicketModel.create({
      ticketNumber: this.buildTicketNumber(raisedAt),
      ...raiser,
      raisedAt,
      navigationPageLabel: dto.navigationPageLabel.trim(),
      navigationPagePath: dto.navigationPagePath.trim(),
      subPageLabel: dto.subPageLabel.trim(),
      subPagePath: dto.subPagePath.trim(),
      issueReason: dto.issueReason.trim(),
      description: dto.description.trim(),
      urgency: dto.urgency,
      issueType: dto.issueType,
      attachments,
      status: 'open',
    });

    emitAdminNotification(this.eventEmitter, {
      kind: 'ticket_raised',
      title: 'Raise ticket opened',
      subtitle: `${dto.navigationPageLabel.trim()} · ${raiser.raisedByName || raiser.raisedByEmail || 'User'}`,
      actorName: raiser.raisedByName || raiser.raisedByEmail,
      entityType: 'ticket',
      entityId: String(doc._id),
      ticketNumber: doc.ticketNumber,
      metadata: {
        urgency: dto.urgency,
        issueType: dto.issueType,
      },
    });

    const lean = doc.toObject() as unknown as Record<string, unknown>;
    return {
      success: true,
      message: 'Support ticket raised successfully',
      data: this.toPublicTicket(lean),
    };
  }

  private mapAttachmentsForClient(
    raw: unknown,
  ): { fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const fileName = String(row.fileName ?? '').trim();
        const mimeType = String(row.mimeType ?? 'application/octet-stream').trim();
        const sizeBytes =
          typeof row.sizeBytes === 'number' ? row.sizeBytes : Number(row.sizeBytes) || 0;
        const base64 = String(row.base64 ?? '').trim();
        if (!fileName || !base64) return null;
        const dataUrl = base64.startsWith('data:')
          ? base64
          : `data:${mimeType};base64,${base64}`;
        return { fileName, mimeType, sizeBytes, dataUrl };
      })
      .filter((x): x is { fileName: string; mimeType: string; sizeBytes: number; dataUrl: string } =>
        Boolean(x),
      );
  }

  private toPublicTicket(doc: Record<string, unknown>, includeAttachments = false) {
    const base = {
      id: String(doc._id ?? ''),
      ticketNumber: String(doc.ticketNumber ?? ''),
      status: String(doc.status ?? 'open') as 'open' | 'closed',
      raisedAt: doc.raisedAt as Date,
      closedAt: (doc.closedAt as Date | undefined) ?? null,
      raisedByUserid: String(doc.raisedByUserid ?? ''),
      raisedByName: String(doc.raisedByName ?? ''),
      raisedByEmail: String(doc.raisedByEmail ?? ''),
      navigationPageLabel: String(doc.navigationPageLabel ?? ''),
      subPageLabel: String(doc.subPageLabel ?? ''),
      issueReason: String(doc.issueReason ?? ''),
      urgency: String(doc.urgency ?? ''),
      issueType: String(doc.issueType ?? ''),
      description: String(doc.description ?? ''),
      closeComment: String(doc.closeComment ?? '').trim() || null,
      adminResolutionNote: String(doc.adminResolutionNote ?? '').trim() || null,
      resolvedByAdminName: String(doc.resolvedByAdminName ?? '').trim() || null,
      adminResolvedAt: (doc.adminResolvedAt as Date | undefined) ?? null,
    };
    if (!includeAttachments) return base;
    return {
      ...base,
      attachments: this.mapAttachmentsForClient(doc.attachments),
    };
  }

  private normalizeTicketNumber(raw: string): string {
    return String(raw ?? '')
      .trim()
      .toUpperCase();
  }

  /** Admin panel routes — allow JWT holders in `admin` collection (not only role claim). */
  private async assertAdminUser(jwtUser: JwtRaiser) {
    const mongoId = String(jwtUser.userId ?? '').trim();
    if (!mongoId || !Types.ObjectId.isValid(mongoId)) {
      throw new ForbiddenException('Admin access required');
    }
    const role = String(jwtUser.role ?? '').trim().toLowerCase();
    if (role === 'manager' || role === 'admin' || role === 'operations' || role === 'superadmin') {
      return;
    }
    const admin = await this.adminService.findById(mongoId);
    if (!admin) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private async assertTicketOwner(
    jwtUser: JwtRaiser,
    ticketNumber: string,
  ): Promise<SupportTicketDocument> {
    const raiser = await this.resolveRaiser(jwtUser);
    const doc = await this.supportTicketModel
      .findOne({ ticketNumber: this.normalizeTicketNumber(ticketNumber) })
      .exec();
    if (!doc) {
      throw new NotFoundException('Ticket not found');
    }
    if (doc.raisedByMongoId !== raiser.raisedByMongoId) {
      throw new NotFoundException('Ticket not found');
    }
    return doc;
  }

  async listMyTickets(jwtUser: JwtRaiser) {
    const raiser = await this.resolveRaiser(jwtUser);
    const rows = await this.supportTicketModel
      .find({ raisedByMongoId: raiser.raisedByMongoId })
      .sort({ raisedAt: -1 })
      .limit(50)
      .select(
        'ticketNumber status raisedAt closedAt navigationPageLabel subPageLabel urgency issueType issueReason',
      )
      .lean()
      .exec();

    return {
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ticketNumber: row.ticketNumber,
        status: row.status,
        raisedAt: row.raisedAt,
        closedAt: row.closedAt ?? null,
        navigationPageLabel: row.navigationPageLabel,
        subPageLabel: row.subPageLabel,
        urgency: row.urgency,
        issueType: row.issueType,
        issueReason: row.issueReason,
      })),
    };
  }

  async trackTicket(jwtUser: JwtRaiser, ticketNumber: string) {
    const doc = await this.assertTicketOwner(jwtUser, ticketNumber);
    return {
      success: true,
      data: this.toPublicTicket(
        doc.toObject() as Record<string, unknown>,
        true,
      ),
    };
  }

  async closeTicket(
    jwtUser: JwtRaiser,
    ticketNumber: string,
    closeComment: string,
  ) {
    const comment = closeComment.trim();
    if (!comment) {
      throw new BadRequestException('A closing comment is required');
    }

    const raiser = await this.resolveRaiser(jwtUser);
    const doc = await this.assertTicketOwner(jwtUser, ticketNumber);
    if (doc.status === 'closed') {
      return {
        success: true,
        message: 'Ticket is already closed',
        data: this.toPublicTicket(
          doc.toObject() as Record<string, unknown>,
          true,
        ),
      };
    }

    doc.status = 'closed';
    doc.closedAt = new Date();
    doc.closedByUserid = raiser.raisedByUserid;
    doc.closeComment = comment;
    await doc.save();

    const lean = doc.toObject();
    return {
      success: true,
      message: 'Ticket closed successfully',
      data: this.toPublicTicket(lean as Record<string, unknown>, true),
    };
  }

  async listAllForAdmin(jwtUser: JwtRaiser, status?: 'open' | 'closed') {
    await this.assertAdminUser(jwtUser);
    const filter = status ? { status } : {};
    const rows = await this.supportTicketModel
      .find(filter)
      .sort({ raisedAt: -1, createdAt: -1 })
      .limit(200)
      .select(
        'ticketNumber status raisedAt closedAt navigationPageLabel subPageLabel urgency issueType issueReason raisedByName raisedByEmail raisedByUserid adminResolutionNote adminResolvedAt resolvedByAdminName',
      )
      .lean()
      .exec();

    return {
      success: true,
      count: rows.length,
      data: rows.map((row) => ({
        ticketNumber: row.ticketNumber,
        status: row.status,
        raisedAt: row.raisedAt,
        closedAt: row.closedAt ?? null,
        navigationPageLabel: row.navigationPageLabel,
        subPageLabel: row.subPageLabel,
        urgency: row.urgency,
        issueType: row.issueType,
        issueReason: row.issueReason,
        raisedByName: row.raisedByName,
        raisedByEmail: row.raisedByEmail,
        raisedByUserid: row.raisedByUserid,
        adminResolutionNote: row.adminResolutionNote ?? '',
        adminResolvedAt: row.adminResolvedAt ?? null,
        resolvedByAdminName: row.resolvedByAdminName ?? '',
      })),
    };
  }

  async getTicketForAdmin(jwtUser: JwtRaiser, ticketNumber: string) {
    await this.assertAdminUser(jwtUser);
    const doc = await this.supportTicketModel
      .findOne({ ticketNumber: this.normalizeTicketNumber(ticketNumber) })
      .exec();
    if (!doc) {
      throw new NotFoundException('Ticket not found');
    }
    return {
      success: true,
      data: this.toPublicTicket(
        doc.toObject() as unknown as Record<string, unknown>,
        true,
      ),
    };
  }

  async resolveByAdmin(
    jwtAdmin: JwtRaiser,
    ticketNumber: string,
    resolutionNote: string,
    adminDisplayName?: string,
  ) {
    await this.assertAdminUser(jwtAdmin);
    const note = resolutionNote.trim();
    if (!note) {
      throw new BadRequestException('Resolution note is required');
    }

    const doc = await this.supportTicketModel
      .findOne({ ticketNumber: this.normalizeTicketNumber(ticketNumber) })
      .exec();
    if (!doc) {
      throw new NotFoundException('Ticket not found');
    }

    const now = new Date();
    doc.status = 'closed';
    doc.adminResolutionNote = note;
    doc.resolvedByAdminMongoId = String(jwtAdmin.userId ?? '').trim();
    doc.resolvedByAdminName =
      String(adminDisplayName ?? '').trim() || 'Admin';
    doc.adminResolvedAt = now;
    if (!doc.closedAt) {
      doc.closedAt = now;
    }
    await doc.save();

    return {
      success: true,
      message: 'Ticket resolved successfully',
      data: this.toPublicTicket(
        doc.toObject() as unknown as Record<string, unknown>,
        true,
      ),
    };
  }

  async listAdminContacts(jwtUser: JwtRaiser) {
    const envSupport = String(process.env.SUPPORT_TICKET_EMAIL ?? '').trim();
    const envSuper = String(process.env.SUPERADMIN_EMAIL ?? '').trim();

    const raiser = await this.resolveRaiser(jwtUser);
    const selfEmail = raiser.raisedByEmail.trim().toLowerCase();

    const contacts = (await this.adminService.listSupportContacts()).filter(
      (c) => c.email.trim().toLowerCase() !== selfEmail,
    );

    if (
      envSuper &&
      envSuper.toLowerCase() !== selfEmail &&
      !contacts.some((c) => c.email.toLowerCase() === envSuper.toLowerCase())
    ) {
      contacts.unshift({
        name: 'Super Admin',
        email: envSuper,
        role: 'superadmin',
      });
    }
    if (
      envSupport &&
      envSupport.toLowerCase() !== selfEmail &&
      !contacts.some((c) => c.email.toLowerCase() === envSupport.toLowerCase())
    ) {
      contacts.push({
        name: 'Support desk',
        email: envSupport,
        role: 'support',
      });
    }

    return {
      success: true,
      count: contacts.length,
      data: contacts,
    };
  }
}
