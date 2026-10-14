import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { FileStorageService } from 'src/common/storage/file-storage.service';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import {
  ApproveBillingKycDto,
  CreateBillingKycCaseDto,
  ListBillingKycQueryDto,
  RejectBillingKycDto,
  SendBillingKycInviteDto,
  UpdateBillingKycFormDto,
} from '../dto/billing-kyc.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import {
  BillingCustomer,
  BillingCustomerDocument,
  BillingKycCase,
  BillingKycCaseDocument,
} from '../schemas/billing.schemas';
import type { BillingActor } from './billing-customers.service';
import { BillingKycMailerService } from './billing-kyc-mailer.service';
import {
  assertKycReadyForSubmit,
  computeKycCompleteness,
  mergeKycForm,
  sanitizeKycCaseForClient,
  type BillingKycFormShape,
} from '../utils/billing-kyc-form.util';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set([
  'draft',
  'invited',
  'in_progress',
  'submitted',
  'under_review',
  'rejected',
  'expired',
]);

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function publicCase(doc: BillingKycCaseDocument | Record<string, unknown>) {
  const obj =
    typeof (doc as BillingKycCaseDocument).toObject === 'function'
      ? (doc as BillingKycCaseDocument).toObject()
      : { ...(doc as Record<string, unknown>) };
  return sanitizeKycCaseForClient(obj as Record<string, unknown>);
}

@Injectable()
export class BillingKycService {
  constructor(
    @InjectModel(BillingKycCase.name)
    private readonly kycModel: Model<BillingKycCaseDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    private readonly mailer: BillingKycMailerService,
    private readonly fileStorage: FileStorageService,
    private readonly auditEngine: AuditEngineService,
  ) {}

  private refreshCompleteness(doc: BillingKycCaseDocument) {
    doc.completenessPercent = computeKycCompleteness(
      doc.form as BillingKycFormShape,
      doc.documents?.length ?? 0,
    );
  }

  private markExpiredIfNeeded(doc: BillingKycCaseDocument): boolean {
    if (
      (doc.status === 'invited' || doc.status === 'expired') &&
      doc.inviteExpiresAt &&
      doc.inviteExpiresAt.getTime() < Date.now() &&
      doc.status !== 'expired'
    ) {
      doc.status = 'expired';
      return true;
    }
    if (
      doc.status === 'invited' &&
      doc.inviteExpiresAt &&
      doc.inviteExpiresAt.getTime() < Date.now()
    ) {
      doc.status = 'expired';
      return true;
    }
    return false;
  }

  async list(ctx: StationScopeContext, query: ListBillingKycQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    const statusRaw = String(query.status ?? '').trim();
    if (statusRaw) {
      const statuses = statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
    }
    if (query.customerCode) {
      filter.customerCode = String(query.customerCode).trim().toUpperCase();
    }
    if (query.search) {
      const q = String(query.search).trim();
      filter.$or = [
        { customerCode: new RegExp(q, 'i') },
        { customerName: new RegExp(q, 'i') },
        { inviteEmail: new RegExp(q, 'i') },
      ];
    }
    const scoped = StationScope.filter(filter, ctx);
    const [items, total] = await Promise.all([
      this.kycModel.find(scoped).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.kycModel.countDocuments(scoped),
    ]);
    return paginatedResponse(
      items.map((i) =>
        sanitizeKycCaseForClient(i as unknown as Record<string, unknown>),
      ),
      total,
      page,
      limit,
    );
  }

  async create(ctx: StationScopeContext, dto: CreateBillingKycCaseDto, actor: BillingActor) {
    const code = String(dto.customerCode).trim().toUpperCase();
    const customer = await this.customerModel
      .findOne(StationScope.filter({ customerCode: code }, ctx))
      .lean();
    if (!customer) throw new NotFoundException(`Customer ${code} not found`);

    const existing = await this.kycModel
      .findOne(
        StationScope.filter(
          { customerCode: code, status: { $in: [...OPEN_STATUSES] } },
          ctx,
        ),
      )
      .sort({ updatedAt: -1 });

    if (existing) {
      return successResponse(publicCase(existing));
    }

    const form: BillingKycFormShape = {
      legalName: customer.name,
      address: customer.address,
      gstin: customer.gstRegistrationNo,
      msme: customer.msmeRegistrationNo,
      currencyCode: customer.currencyCode as 'INR' | 'USD',
      billingContactEmail: dto.inviteEmail?.trim().toLowerCase(),
    };

    const [created] = await this.kycModel.create([
      StationScope.stampCreate(
        {
          customerCode: code,
          customerName: customer.name,
          status: 'draft',
          form,
          completenessPercent: computeKycCompleteness(form, 0),
          inviteEmail: dto.inviteEmail?.trim().toLowerCase(),
          documents: [],
          overrideHistory: [],
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        ctx,
      ),
    ]);

    await this.auditEngine.log({
      entityType: 'kyc_case',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: created.stationCode,
    });

    return successResponse(publicCase(created));
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (this.markExpiredIfNeeded(doc)) await doc.save();
    return successResponse(publicCase(doc));
  }

  async saveForm(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateBillingKycFormDto,
    actor: BillingActor,
  ) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (doc.status === 'approved') {
      throw new BadRequestException('Approved KYC cannot be edited');
    }
    if (dto.form) {
      doc.form = mergeKycForm(doc.form as BillingKycFormShape, dto.form);
    }
    if (doc.status === 'draft' || doc.status === 'rejected' || doc.status === 'expired') {
      doc.status = 'in_progress';
    }
    if (doc.status === 'invited') {
      doc.status = 'in_progress';
    }
    this.refreshCompleteness(doc);
    doc.updatedBy = actor.userId;
    await doc.save();
    return successResponse(publicCase(doc));
  }

  async sendInvite(
    ctx: StationScopeContext,
    id: string,
    dto: SendBillingKycInviteDto,
    actor: BillingActor,
  ) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (doc.status === 'approved') {
      throw new BadRequestException('Cannot invite for an approved KYC case');
    }

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    doc.inviteEmail = dto.email.trim().toLowerCase();
    doc.inviteTokenHash = hashToken(rawToken);
    doc.inviteExpiresAt = expiresAt;
    doc.inviteSentAt = new Date();
    doc.inviteSentBy = actor.userName;
    doc.status = 'invited';
    const form = mergeKycForm(doc.form as BillingKycFormShape, {
      billingContactEmail: doc.inviteEmail,
    });
    doc.form = form;
    this.refreshCompleteness(doc);
    doc.updatedBy = actor.userId;
    await doc.save();

    const origin =
      String(process.env.BILLING_PUBLIC_ORIGIN || process.env.APP_ORIGIN || '').replace(
        /\/$/,
        '',
      ) || 'http://localhost:3000';
    const inviteUrl = `${origin}/billing/kyc/invite/${rawToken}`;

    const mailResult = await this.mailer.sendInviteEmail({
      to: doc.inviteEmail,
      airlineName: doc.customerName || doc.customerCode,
      customerCode: doc.customerCode,
      stationCode: doc.stationCode,
      inviteUrl,
      expiresAt,
    });

    await this.auditEngine.log({
      entityType: 'kyc_case',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { inviteSent: true, email: doc.inviteEmail, mailSent: mailResult.sent },
    });

    return successResponse({
      case: publicCase(doc),
      mail: mailResult,
      /** Dev convenience — omitted when mail succeeded in production-like setups */
      inviteUrl: mailResult.sent ? undefined : inviteUrl,
    });
  }

  async submit(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    const missing = assertKycReadyForSubmit(doc.form as BillingKycFormShape);
    if (missing.length) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }
    doc.status = 'submitted';
    doc.submittedAt = new Date();
    this.refreshCompleteness(doc);
    doc.updatedBy = actor.userId;
    await doc.save();

    await this.auditEngine.log({
      entityType: 'kyc_case',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { status: 'submitted' },
    });

    return successResponse(publicCase(doc));
  }

  async markUnderReview(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (doc.status !== 'submitted' && doc.status !== 'under_review') {
      throw new BadRequestException('Only submitted KYC can enter review');
    }
    doc.status = 'under_review';
    doc.updatedBy = actor.userId;
    await doc.save();
    return successResponse(publicCase(doc));
  }

  async approve(
    ctx: StationScopeContext,
    id: string,
    dto: ApproveBillingKycDto,
    actor: BillingActor,
  ) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (!['submitted', 'under_review'].includes(doc.status)) {
      throw new BadRequestException('KYC must be submitted before approval');
    }
    doc.status = 'approved';
    doc.reviewedAt = new Date();
    doc.reviewedBy = actor.userId;
    doc.reviewNote = dto.note?.trim();
    doc.updatedBy = actor.userId;
    await doc.save();

    if (dto.syncToCustomer !== false) {
      await this.syncFormToCustomer(ctx, doc, actor);
    }

    await this.auditEngine.log({
      entityType: 'kyc_case',
      entityId: doc._id,
      action: 'approved',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
    });

    return successResponse(publicCase(doc));
  }

  async reject(
    ctx: StationScopeContext,
    id: string,
    dto: RejectBillingKycDto,
    actor: BillingActor,
  ) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (!['submitted', 'under_review'].includes(doc.status)) {
      throw new BadRequestException('KYC must be submitted before rejection');
    }
    doc.status = 'rejected';
    doc.reviewedAt = new Date();
    doc.reviewedBy = actor.userId;
    doc.reviewNote = dto.note?.trim();
    doc.updatedBy = actor.userId;
    await doc.save();

    await this.auditEngine.log({
      entityType: 'kyc_case',
      entityId: doc._id,
      action: 'rejected',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
    });

    return successResponse(publicCase(doc));
  }

  private async syncFormToCustomer(
    ctx: StationScopeContext,
    doc: BillingKycCaseDocument,
    actor: BillingActor,
  ) {
    const form = (doc.form ?? {}) as BillingKycFormShape;
    const customer = await this.customerModel.findOne(
      StationScope.filter({ customerCode: doc.customerCode }, ctx),
    );
    if (!customer) return;
    if (form.legalName) customer.name = form.legalName;
    if (form.address) customer.address = form.address;
    if (form.gstin) customer.gstRegistrationNo = form.gstin;
    if (form.msme) customer.msmeRegistrationNo = form.msme;
    if (form.currencyCode === 'INR' || form.currencyCode === 'USD') {
      customer.currencyCode = form.currencyCode;
    }
    await customer.save();
    await this.auditEngine.log({
      entityType: 'customer',
      entityId: customer._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: customer.stationCode,
      changes: { source: 'kyc_approve_sync', kycCaseId: String(doc._id) },
    });
  }

  async addDocument(
    ctx: StationScopeContext,
    id: string,
    file: Express.Multer.File,
    docType: string,
    actor: BillingActor,
  ) {
    const doc = await this.kycModel.findById(id);
    if (!doc) throw new NotFoundException('KYC case not found');
    StationScope.assertOwnership(doc, ctx);
    if (doc.status === 'approved') {
      throw new BadRequestException('Cannot attach documents to approved KYC');
    }
    return this.persistDocument(doc, file, docType, actor.userId);
  }

  private async persistDocument(
    doc: BillingKycCaseDocument,
    file: Express.Multer.File,
    docType: string,
    uploadedBy: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Empty file');
    const safeName = String(file.originalname || 'upload')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 120);
    const storedName = `${Date.now()}_${safeName}`;
    const relativePath = `billing-kyc/${doc.stationCode}/${doc._id}/${storedName}`;
    await this.fileStorage.write(relativePath, file.buffer);
    doc.documents = doc.documents ?? [];
    doc.documents.push({
      docType,
      fileKey: relativePath,
      originalName: file.originalname || safeName,
      mimeType: file.mimetype || 'application/octet-stream',
      uploadedBy,
      uploadedAt: new Date(),
    });
    if (doc.status === 'draft' || doc.status === 'invited') {
      doc.status = 'in_progress';
    }
    this.refreshCompleteness(doc);
    doc.updatedBy = uploadedBy;
    await doc.save();
    return successResponse(publicCase(doc));
  }

  // --- Soft gate ---

  async checkSoftGate(
    ctx: StationScopeContext,
    customerCode: string,
  ): Promise<{
    ok: boolean;
    status: string | null;
    caseId: string | null;
    warning?: string;
  }> {
    const code = String(customerCode ?? '').trim().toUpperCase();
    if (!code) return { ok: true, status: null, caseId: null };

    const latest = await this.kycModel
      .findOne(StationScope.filter({ customerCode: code }, ctx))
      .sort({ updatedAt: -1 })
      .lean();

    if (!latest) {
      return {
        ok: false,
        status: null,
        caseId: null,
        warning: `No KYC case for ${code}. Continue anyway?`,
      };
    }
    if (latest.status === 'approved') {
      return { ok: true, status: 'approved', caseId: String(latest._id) };
    }
    return {
      ok: false,
      status: String(latest.status),
      caseId: String(latest._id),
      warning: `KYC for ${code} is "${String(latest.status).replace(/_/g, ' ')}" — continue anyway?`,
    };
  }

  async assertSoftGateOrThrow(
    ctx: StationScopeContext,
    customerCode: string,
    opts: { kycOverride?: boolean; kycOverrideReason?: string },
    actor: BillingActor,
    context: string,
  ) {
    const gate = await this.checkSoftGate(ctx, customerCode);
    if (gate.ok) return gate;
    if (opts.kycOverride) {
      const reason = String(opts.kycOverrideReason ?? '').trim();
      if (!reason) {
        throw new BadRequestException('kycOverrideReason is required when overriding KYC');
      }
      if (gate.caseId) {
        await this.kycModel.updateOne(
          { _id: gate.caseId },
          {
            $push: {
              overrideHistory: {
                at: new Date(),
                byUserId: actor.userId,
                byUserName: actor.userName,
                reason,
                context,
              },
            },
          },
        );
      }
      return { ...gate, ok: true };
    }
    throw new ConflictException(
      gate.warning ||
        `KYC_SOFT_GATE: KYC incomplete for ${String(customerCode).trim().toUpperCase()} — continue anyway?`,
    );
  }

  // --- Public invite path ---

  private async findByRawToken(token: string): Promise<BillingKycCaseDocument> {
    const raw = String(token ?? '').trim();
    if (!raw || raw.length < 20) throw new UnauthorizedException('Invalid invite link');
    const doc = await this.kycModel
      .findOne({ inviteTokenHash: hashToken(raw) })
      .select('+inviteTokenHash');
    if (!doc) throw new UnauthorizedException('Invalid or expired invite link');
    if (doc.inviteExpiresAt && doc.inviteExpiresAt.getTime() < Date.now()) {
      if (doc.status === 'invited') {
        doc.status = 'expired';
        await doc.save();
      }
      throw new UnauthorizedException('Invite link has expired');
    }
    if (doc.status === 'approved') {
      throw new BadRequestException('KYC already approved');
    }
    if (['submitted', 'under_review'].includes(doc.status)) {
      throw new BadRequestException('KYC already submitted — awaiting review');
    }
    return doc;
  }

  async getByInviteToken(token: string) {
    const doc = await this.findByRawToken(token);
    if (doc.status === 'invited') {
      doc.status = 'in_progress';
      await doc.save();
    }
    return successResponse({
      case: publicCase(doc),
      customerCode: doc.customerCode,
      customerName: doc.customerName,
      stationCode: doc.stationCode,
    });
  }

  async saveFormByInviteToken(token: string, dto: UpdateBillingKycFormDto) {
    const doc = await this.findByRawToken(token);
    if (dto.form) {
      doc.form = mergeKycForm(doc.form as BillingKycFormShape, dto.form);
    }
    doc.status = 'in_progress';
    this.refreshCompleteness(doc);
    doc.updatedBy = 'invite';
    await doc.save();
    return successResponse(publicCase(doc));
  }

  async submitByInviteToken(token: string) {
    const doc = await this.findByRawToken(token);
    const missing = assertKycReadyForSubmit(doc.form as BillingKycFormShape);
    if (missing.length) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }
    doc.status = 'submitted';
    doc.submittedAt = new Date();
    this.refreshCompleteness(doc);
    doc.updatedBy = 'invite';
    await doc.save();
    return successResponse(publicCase(doc));
  }

  async addDocumentByInviteToken(
    token: string,
    file: Express.Multer.File,
    docType: string,
  ) {
    const doc = await this.findByRawToken(token);
    return this.persistDocument(doc, file, docType, 'invite');
  }
}
