import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingInvoiceLine,
  BillingInvoiceLineDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
  BillingContract,
  BillingContractDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { ValidationEngineService } from '../engines/validation-engine.service';
import { ApprovalWorkflowService } from '../engines/approval-workflow.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import { ListInvoicesQueryDto, RejectReviewDto } from '../dto/billing-invoice.dto';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import {
  applyConcessionTotalsToHeader,
  resolveActiveContractForInvoice,
} from '../utils/invoice-concession.util';

type ReviewInvoiceInput = {
  _id: unknown;
  contractId?: unknown;
  currencyCode?: string;
  currencyFactor?: number;
  approvalStatus?: string;
  status?: string;
};

type ReviewLineInput = {
  unitPrice?: number;
  gstPercent?: number;
  sourceRef?: Record<string, unknown>;
};

@Injectable()
export class BillingReviewService {
  constructor(
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingInvoiceLine.name)
    private readonly lineModel: Model<BillingInvoiceLineDocument>,
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    private readonly validationEngine: ValidationEngineService,
    private readonly approvalWorkflow: ApprovalWorkflowService,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const statusFilter =
      query.status === 'all'
        ? { $in: ['pending_approval', 'approved'] }
        : 'pending_approval';
    const filter = StationScope.filter({ status: statusFilter, ...NOT_IN_BIN_FILTER }, ctx);
    const [items, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.invoiceModel.countDocuments(filter),
    ]);

    const withChecks = await Promise.all(
      items.map(async (inv) => ({
        ...inv,
        review: await this.buildReviewChecks(ctx, inv),
      })),
    );

    return paginatedResponse(withChecks, total, page, limit);
  }

  async getReview(ctx: StationScopeContext, invoiceId: string) {
    const inv = await this.invoiceModel.findById(invoiceId).lean();
    if (!inv) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(inv, ctx);
    const lines = await this.lineModel.find({ invoiceId: inv._id }).lean();
    const review = await this.buildReviewChecks(ctx, inv, lines);
    return successResponse({ invoice: inv, lines, review });
  }

  async approve(ctx: StationScopeContext, invoiceId: string, actor: BillingActor) {
    const inv = await this.invoiceModel.findById(invoiceId);
    if (!inv) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(inv, ctx);

    if (inv.status === 'approved') {
      return successResponse(inv.toObject());
    }
    if (inv.status !== 'pending_approval') {
      throw new BadRequestException(
        `Cannot approve invoice in status "${inv.status}". Only pending_approval invoices can be approved.`,
      );
    }

    const contract = await resolveActiveContractForInvoice(this.contractModel, ctx, inv);
    if (contract?._id && !inv.contractId) {
      inv.contractId = contract._id as Types.ObjectId;
    }
    const invoiceLines = await this.lineModel
      .find({ invoiceId: inv._id })
      .sort({ lineNo: 1 })
      .lean();
    applyConcessionTotalsToHeader(inv, invoiceLines, contract, {
      adsConcession: String(inv.invoiceCategory ?? '').trim().toUpperCase() === 'ADS',
      invoiceCategory: String(inv.invoiceCategory ?? '').trim().toUpperCase() || undefined,
    });

    inv.status = this.approvalWorkflow.approve(inv.status);
    inv.approvalStatus = 'approved';
    await inv.save();
    await this.auditEngine.log({
      entityType: 'invoice',
      entityId: inv._id,
      action: 'approved',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: inv.stationCode,
      changes: { approvalStatus: 'approved' },
    });
    return successResponse(inv.toObject());
  }

  async reject(
    ctx: StationScopeContext,
    invoiceId: string,
    dto: RejectReviewDto,
    actor: BillingActor,
  ) {
    const inv = await this.invoiceModel.findById(invoiceId);
    if (!inv) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(inv, ctx);
    if (inv.status !== 'pending_approval') {
      throw new BadRequestException(
        `Cannot reject invoice in status "${inv.status}". Only pending_approval invoices can be rejected.`,
      );
    }
    inv.status = this.approvalWorkflow.rejectApproval(inv.status);
    inv.approvalStatus = 'rejected';
    await inv.save();
    await this.auditEngine.log({
      entityType: 'invoice',
      entityId: inv._id,
      action: 'rejected',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: inv.stationCode,
      changes: { reason: dto.reason },
    });
    return successResponse(inv.toObject());
  }

  private async buildReviewChecks(
    ctx: StationScopeContext,
    inv: ReviewInvoiceInput,
    lines?: ReviewLineInput[],
  ) {
    const invoiceLines =
      lines ??
      (await this.lineModel
        .find({ invoiceId: new Types.ObjectId(String(inv._id)) })
        .lean());

    const missingContract = !inv.contractId;
    const missingRate = invoiceLines.some((l) => !l.unitPrice || Number(l.unitPrice) === 0);
    const currencyError = inv.currencyCode === 'USD' && (!inv.currencyFactor || inv.currencyFactor <= 0);
    const taxError = invoiceLines.some((l) => Number(l.gstPercent) <= 0);

    const serials = invoiceLines
      .map((l) => (l.sourceRef as { serialNo?: string } | undefined)?.serialNo)
      .filter(Boolean);
    let duplicateBilling = false;
    if (serials.length > 0) {
      const dup = await this.preparationModel.exists({
        ...StationScope.filter({}, ctx),
        status: 'invoiced',
        'sourceRef.serialNo': { $in: serials },
      });
      duplicateBilling = Boolean(dup);
    }

    const details = this.validationEngine.merge(
      this.validationEngine.validateContractAndRate({
        hasContract: !missingContract,
        hasRate: !missingRate,
      }),
      [
        {
          rule: 'currency_error',
          passed: !currencyError,
          message: currencyError ? 'Missing exchange rate factor' : undefined,
        },
        {
          rule: 'tax_error',
          passed: !taxError,
          message: taxError ? 'One or more lines missing GST' : undefined,
        },
        {
          rule: 'duplicate_billing',
          passed: !duplicateBilling,
          message: duplicateBilling ? 'Possible duplicate serial billing' : undefined,
        },
      ],
    );

    return {
      missingContract,
      missingRate,
      currencyError,
      taxError,
      duplicateBilling,
      approvalStatus: inv.approvalStatus ?? inv.status,
      passed: this.validationEngine.allPassed(details),
      details,
    };
  }

}
