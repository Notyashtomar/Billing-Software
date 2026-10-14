import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  BillingCreditMemo,
  BillingCreditMemoDocument,
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { withBillingTransaction } from '../common/billing-transaction';
import { PdfEngineService } from '../engines/pdf-engine.service';
import { BillingSequencesService } from './billing-settings.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import { CreateCreditMemoDto } from '../dto/billing-invoice.dto';
import { ListInvoicesQueryDto } from '../dto/billing-invoice.dto';
import {
  currentIndianFiscalYear,
  defaultCreditMemoSequenceCode,
} from '../common/billing-fiscal-year.util';

@Injectable()
export class BillingCreditMemosService {
  constructor(
    @InjectModel(BillingCreditMemo.name)
    private readonly creditMemoModel: Model<BillingCreditMemoDocument>,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    private readonly pdfEngine: PdfEngineService,
    private readonly sequencesService: BillingSequencesService,
    private readonly auditEngine: AuditEngineService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter = StationScope.filter({}, ctx);
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.creditMemoModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.creditMemoModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.creditMemoModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Credit memo not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(doc);
  }

  async create(ctx: StationScopeContext, dto: CreateCreditMemoDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const invoice = await this.invoiceModel.findById(dto.appliesToInvoiceId).lean();
    if (!invoice) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(invoice, ctx);
    if (invoice.status !== 'posted') {
      throw new BadRequestException('Credit memo applies to posted invoices only');
    }

    const remaining = Number(invoice.remainingAmount ?? invoice.totalInclTax ?? 0);
    const lines =
      dto.lines ??
      [
        {
          description: `Credit — ${dto.reason}`,
          quantity: 1,
          unitPrice: remaining,
          lineAmountInclTax: remaining,
        },
      ];
    const totalInclTax = lines.reduce(
      (s, l) => s + Number((l as { lineAmountInclTax?: number }).lineAmountInclTax ?? 0),
      0,
    );
    if (!(totalInclTax > 0)) {
      throw new BadRequestException('Credit amount must be greater than zero');
    }
    if (remaining > 0 && totalInclTax > remaining + 0.009) {
      throw new BadRequestException(
        `Credit ${totalInclTax} exceeds remaining receivable ${remaining} on this invoice`,
      );
    }

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const [memo] = await this.creditMemoModel.create(
        [
          StationScope.stampCreate(
            {
              customerCode: dto.customerCode.toUpperCase(),
              appliesToInvoiceId: invoice._id,
              appliesToInvoiceNo: invoice.invoiceNumber ?? invoice.draftNumber,
              status: 'draft',
              documentDate: new Date(dto.documentDate),
              currencyCode: invoice.currencyCode,
              currencyFactor: invoice.currencyFactor,
              lines,
              reason: dto.reason,
              totalInclTax,
            },
            ctx,
          ),
        ],
        { session },
      );

      await this.auditEngine.log(
        {
          entityType: 'credit_memo',
          entityId: memo._id,
          action: 'created',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode,
        },
        { session, afterCommit },
      );

      return successResponse(memo.toObject());
    });
  }

  async post(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const memo = await this.creditMemoModel.findById(id);
    if (!memo) throw new NotFoundException('Credit memo not found');
    StationScope.assertOwnership(memo, ctx);
    if (memo.status !== 'draft') throw new BadRequestException('Already posted');

    const fiscalYear = currentIndianFiscalYear();

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts = { session, afterCommit };
      memo.creditMemoNumber = await this.sequencesService.nextNumber(
        ctx,
        defaultCreditMemoSequenceCode(memo.stationCode),
        fiscalYear,
        sessionOpts,
      );
      memo.status = 'posted';
      memo.postingDate = new Date();
      memo.pdfSnapshot = this.pdfEngine.buildSnapshot({
        title: 'CREDIT MEMO',
        customerName: memo.customerCode,
        customerCode: memo.customerCode,
        documentNumber: memo.creditMemoNumber,
        documentDate: memo.documentDate.toISOString().slice(0, 10),
        currencyCode: memo.currencyCode,
        lines: (memo.lines as Array<Record<string, unknown>>).map((l, i) => ({
          lineNo: i + 1,
          description: String(l.description ?? ''),
          quantity: Number(l.quantity ?? 1),
          unitPrice: Number(l.unitPrice ?? 0),
          lineAmountInclTax: Number(l.lineAmountInclTax ?? 0),
        })),
        subtotalExclTax: memo.totalInclTax,
        taxTotal: 0,
        totalInclTax: memo.totalInclTax,
      });
      await memo.save({ session });

      if (memo.appliesToInvoiceId) {
        await this.invoiceModel.updateOne(
          { _id: memo.appliesToInvoiceId },
          {
            $inc: { remainingAmount: -memo.totalInclTax },
          },
          { session },
        );
      }

      await this.auditEngine.log(
        {
          entityType: 'credit_memo',
          entityId: memo._id,
          action: 'posted',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: memo.stationCode,
        },
        sessionOpts,
      );

      return successResponse(memo.toObject());
    });
  }

  async getPdf(ctx: StationScopeContext, id: string) {
    const memo = await this.creditMemoModel.findById(id).lean();
    if (!memo?.pdfSnapshot) throw new NotFoundException('PDF not available');
    const file = this.pdfEngine.toDownloadBody(memo.pdfSnapshot as { plainText?: string; format?: string });
    return {
      contentType: file.contentType,
      body: file.body,
      encoding: file.encoding,
      fileName: `${memo.creditMemoNumber ?? 'credit-memo'}.${file.fileNameExt}`,
    };
  }
}
