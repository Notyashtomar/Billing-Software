import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  withBillingTransaction,
  type BillingSessionOptions,
} from '../common/billing-transaction';
import {
  BillingBackingSheet,
  BillingBackingSheetDocument,
  BillingCreditMemo,
  BillingCreditMemoDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingContract,
  BillingContractDocument,
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingInvoiceLine,
  BillingInvoiceLineDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
  BillingServiceCatalog,
  BillingServiceCatalogDocument,
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import {
  AdvanceGatewayScheduledAirlineRead,
  AdvanceGatewayScheduledAirlineReadDocument,
} from '../schemas/operational.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { ApprovalWorkflowService } from '../engines/approval-workflow.service';
import { PdfEngineService } from '../engines/pdf-engine.service';
import { BackingSheetEngineService } from '../engines/backing-sheet-engine.service';
import { ExportEngineService } from '../engines/export-engine.service';
import { CurrencyEngineService } from '../engines/currency-engine.service';
import { BillingSequencesService } from './billing-settings.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import { LegacyNavBridgeService } from './legacy-nav-bridge.service';
import type { BillingActor } from './billing-customers.service';
import { BillingInvoiceDraftsService } from './billing-invoice-drafts.service';
import { BillingKycService } from './billing-kyc.service';
import { ListInvoicesQueryDto, PostInvoiceDto, BulkDeleteInvoicesDto } from '../dto/billing-invoice.dto';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import { PaxShiftReportEmailService } from 'src/reports-pax-shift-report/services/pax-shift-report-email.service';
import {
  concessionTotalsFromSavedHeader,
  resolveActiveContractForInvoice,
} from '../utils/invoice-concession.util';
import { billingSettingsForInvoicing } from '../shared/ignored-billing-masters';
import { resolveBillingCustomerAddress } from '../utils/customer-address.util';
import { formatBillingPeriodLabel } from '../engines/invoice-pdf.mapper';
import {
  resolveAirportConfig,
  resolveInvoiceCompanyDefaults,
} from '../engines/invoice-pdf.defaults';
import {
  adsAnnexureFileName,
  adsAnnexureMonthLabel,
  adsAnnexureTitleLine,
  buildAdsAnnexureTable,
} from '../engines/ads-equipment-annexure.util';
import {
  currentIndianFiscalYear,
  defaultInvoiceSequenceCode,
} from '../common/billing-fiscal-year.util';

const INVOICE_LIST_STATUSES = ['posted', 'generated', 'approved', 'cancelled', 'archived'];
const SENDABLE_STATUSES = new Set(['approved', 'generated', 'posted']);
const DELETABLE_INVOICE_STATUSES = new Set(['approved', 'generated', 'cancelled', 'archived']);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseEmailList(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function collectInvoicePreparationIds(
  header: { preparationRecordIds?: unknown[] },
  lines: Array<{ preparationRecordIds?: unknown[]; sourceRef?: Record<string, unknown> | null }>,
): Types.ObjectId[] {
  const ids = new Set<string>();
  const push = (value: unknown) => {
    const id = String(value ?? '').trim();
    if (Types.ObjectId.isValid(id)) ids.add(id);
  };
  for (const value of header.preparationRecordIds ?? []) push(value);
  for (const line of lines) {
    for (const value of line.preparationRecordIds ?? []) push(value);
    const nested = line.sourceRef?.preparationRecordIds;
    if (Array.isArray(nested)) {
      for (const value of nested) push(value);
    }
  }
  return [...ids].map((id) => new Types.ObjectId(id));
}

function formatInvoiceDate(value?: Date | string): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

@Injectable()
export class BillingInvoicesService {
  constructor(
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingInvoiceLine.name)
    private readonly lineModel: Model<BillingInvoiceLineDocument>,
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingBackingSheet.name)
    private readonly backingModel: Model<BillingBackingSheetDocument>,
    @InjectModel(BillingCreditMemo.name)
    private readonly creditMemoModel: Model<BillingCreditMemoDocument>,
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingServiceCatalog.name)
    private readonly catalogModel: Model<BillingServiceCatalogDocument>,
    @InjectModel(AdvanceGatewayScheduledAirlineRead.name)
    private readonly gatewayModel: Model<AdvanceGatewayScheduledAirlineReadDocument>,
    private readonly approvalWorkflow: ApprovalWorkflowService,
    private readonly pdfEngine: PdfEngineService,
    private readonly backingEngine: BackingSheetEngineService,
    private readonly exportEngine: ExportEngineService,
    private readonly sequencesService: BillingSequencesService,
    private readonly auditEngine: AuditEngineService,
    private readonly legacyNavBridge: LegacyNavBridgeService,
    private readonly invoiceEmailService: PaxShiftReportEmailService,
    private readonly currencyEngine: CurrencyEngineService,
    @Inject(forwardRef(() => BillingInvoiceDraftsService))
    private readonly invoiceDraftsService: BillingInvoiceDraftsService,
    private readonly kycService: BillingKycService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination({
      ...query,
      limit: query.limit ?? '5000',
    });
    const filter: Record<string, unknown> = StationScope.filter({ ...NOT_IN_BIN_FILTER }, ctx);
    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = { $in: INVOICE_LIST_STATUSES };
    }
    if (query.customerCode) filter.customerCode = query.customerCode.toUpperCase();

    const [items, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ postingDate: -1, updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const header = await this.getHeader(ctx, id);
    let responseHeader = header;
    if (!header.customerAddress?.trim()) {
      const customer = await this.customerModel
        .findOne(StationScope.filter({ customerCode: header.customerCode }, ctx))
        .lean();
      const address = resolveBillingCustomerAddress(customer);
      if (address) {
        responseHeader = { ...header, customerAddress: address } as typeof header;
      }
    }
    const [lines, backing, creditMemos, auditTrail, customerMaster] = await Promise.all([
      this.lineModel.find({ invoiceId: header._id }).sort({ lineNo: 1 }).lean(),
      header.backingSheetId
        ? this.backingModel.findById(header.backingSheetId).lean()
        : null,
      this.creditMemoModel
        .find({ appliesToInvoiceId: header._id })
        .lean(),
      this.auditEngine.listForEntity(ctx, 'invoice', id),
      this.customerModel
        .findOne(StationScope.filter({ customerCode: header.customerCode }, ctx))
        .lean(),
    ]);
    return successResponse({
      header: responseHeader,
      lines,
      backing,
      creditMemos,
      auditTrail,
      customerMaster: customerMaster
        ? {
            name: customerMaster.name,
            address: resolveBillingCustomerAddress(customerMaster),
            gstRegistrationNo: customerMaster.gstRegistrationNo,
          }
        : undefined,
    });
  }

  async generate(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
    kycOpts: { kycOverride?: boolean; kycOverrideReason?: string } = {},
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    await this.assertRafLinesHaveRates(header);
    if (!['approved', 'draft', 'generated', 'posted'].includes(header.status)) {
      throw new BadRequestException(
        `Cannot generate PDF for invoice in status "${header.status}". Approve the draft first.`,
      );
    }

    await this.kycService.assertSoftGateOrThrow(
      ctx,
      header.customerCode,
      kycOpts,
      actor,
      'invoice_generate',
    );

    // Fortnight parts keep the contract rate. Other USD invoices use Conversion Rates.
    const partRate = await this.invoiceDraftsService.fortnightExchangeRateForHeader(ctx, header);
    if (partRate != null) {
      header.currencyFactor = partRate;
    } else if (header.currencyCode === 'USD' || Number(header.currencyFactor) > 1) {
      try {
        header.currencyFactor = await this.currencyEngine.resolveFactor(
          ctx,
          'USD',
          header.documentDate,
          header.billingPeriodStart,
        );
      } catch {
        // Keep existing factor if no master rate exists yet.
      }
    }

    const pdfSnapshot = await this.buildPdfSnapshotForInvoice(ctx, id);

    const lines = await this.lineModel.find({ invoiceId: header._id }).sort({ lineNo: 1 }).lean();
    const backingRows = this.backingEngine.buildRows(
      lines.map((l) => ({
        serialNo: (l.sourceRef as { serialNo?: string })?.serialNo,
        operationalSnapshot: l.sourceRef as Record<string, unknown>,
      })),
    );

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };

      let backing = await this.backingModel
        .findOne({ invoiceId: header._id })
        .session(session);
      if (!backing) {
        const [created] = await this.backingModel.create(
          [
            {
              invoiceId: header._id,
              customerCode: header.customerCode,
              billingPeriodStart: header.billingPeriodStart,
              billingPeriodEnd: header.billingPeriodEnd,
              rows: backingRows,
              rowCount: backingRows.length,
              generatedAt: new Date(),
              stationCode: header.stationCode,
            },
          ],
          { session },
        );
        backing = created;
      } else {
        backing.rows = backingRows;
        backing.rowCount = backingRows.length;
        backing.generatedAt = new Date();
        await backing.save({ session });
      }

      if (header.status === 'approved' || header.status === 'draft') {
        header.status = this.approvalWorkflow.markGenerated(header.status);
      }
      header.pdfSnapshot = pdfSnapshot as unknown as Record<string, unknown>;
      header.backingSheetId = backing._id;
      await header.save({ session });

      // Safety: clear any leftover preparation rows linked to this invoice.
      const prepIds = (header.preparationRecordIds ?? []).map(
        (id) => new Types.ObjectId(String(id)),
      );
      if (prepIds.length > 0) {
        await this.preparationModel.deleteMany(
          { _id: { $in: prepIds } },
          { session },
        );
      }

      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: header._id,
          action: 'generated',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: header.stationCode,
        },
        sessionOpts,
      );

      return successResponse({
        header: header.toObject(),
        backing: backing.toObject(),
      });
    });
  }

  async post(
    ctx: StationScopeContext,
    id: string,
    dto: PostInvoiceDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (this.approvalWorkflow.isImmutable(header.status)) {
      throw new BadRequestException('Invoice already posted or cancelled');
    }
    if (!this.approvalWorkflow.canPost(header.status)) {
      throw new BadRequestException(
        `Cannot post invoice in status "${header.status}". Use a draft, approved, or generated invoice.`,
      );
    }

    const fiscalYear = dto.fiscalYear ?? currentIndianFiscalYear();
    const sequenceCode = dto.sequenceCode ?? defaultInvoiceSequenceCode(header.stationCode);

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };

      const invoiceNumber = await this.sequencesService.nextNumber(
        ctx,
        sequenceCode,
        fiscalYear,
        sessionOpts,
      );

      header.invoiceNumber = invoiceNumber;
      header.status = this.approvalWorkflow.markPosted(header.status);
      header.postingDate = new Date(dto.postingDate);
      header.postedAt = new Date();
      header.postedBy = actor.userName;
      header.remainingAmount = header.totalInclTax;
      await header.save({ session });

      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: header._id,
          action: 'posted',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: header.stationCode,
          changes: { invoiceNumber },
        },
        sessionOpts,
      );

      const navBridge = await this.legacyNavBridge.afterInvoicePosted(
        ctx,
        header,
        sessionOpts,
      );
      if (navBridge.serialsMarked > 0) {
        await this.auditEngine.log(
          {
            entityType: 'invoice',
            entityId: header._id,
            action: 'updated',
            userId: actor.userId,
            userName: actor.userName,
            stationCode: header.stationCode,
            changes: { legacyNavBridge: navBridge },
          },
          sessionOpts,
        );
      }

      return successResponse(header.toObject());
    });
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!DELETABLE_INVOICE_STATUSES.has(header.status)) {
      throw new BadRequestException(
        header.status === 'posted'
          ? 'Posted invoices cannot be deleted — cancel the invoice first'
          : `Cannot delete invoice in status "${header.status}"`,
      );
    }

    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };
      await this.releasePreparationRecords(header, sessionOpts);
      await this.lineModel.deleteMany({ invoiceId: header._id }, { session });
      const snapshot = header.toObject();
      await header.deleteOne({ session });
      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: snapshot._id,
          action: 'cancelled',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: snapshot.stationCode,
          changes: { deleted: true, status: snapshot.status },
        },
        sessionOpts,
      );
      return successResponse({ deleted: true });
    });
  }

  async removeMany(ctx: StationScopeContext, ids: string[], actor: BillingActor) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let deleted = 0;
    const failed: Array<{ id: string; message: string; label?: string }> = [];

    for (const id of uniqueIds) {
      try {
        await this.remove(ctx, id, actor);
        deleted += 1;
      } catch (err) {
        const header = await this.invoiceModel.findById(id).lean();
        failed.push({
          id,
          label: header?.invoiceNumber ?? header?.draftNumber,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  private async releasePreparationRecords(
    header: BillingInvoiceHeaderDocument,
    options?: BillingSessionOptions,
  ) {
    const prepIds = (header.preparationRecordIds ?? []).map((id) => new Types.ObjectId(id));
    const filter =
      prepIds.length > 0
        ? { $or: [{ _id: { $in: prepIds } }, { invoiceDraftId: header._id }] }
        : { invoiceDraftId: header._id };

    await this.preparationModel.updateMany(
      filter,
      {
        $set: { status: 'ready_for_invoice' },
        $unset: { invoiceDraftId: '', invoiceId: '' },
      },
      { session: options?.session },
    );
  }

  async cancel(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    if (header.status !== 'posted') {
      throw new BadRequestException('Only posted invoices can be cancelled');
    }
    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      header.status = 'cancelled';
      header.cancelled = true;
      await header.save({ session });
      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: header._id,
          action: 'cancelled',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: header.stationCode,
        },
        { session, afterCommit },
      );
      return successResponse(header.toObject());
    });
  }

  async archive(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      header.status = 'archived';
      await header.save({ session });
      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: header._id,
          action: 'updated',
          userId: actor.userId,
          userName: actor.userName,
          stationCode: header.stationCode,
          changes: { archived: true },
        },
        { session, afterCommit },
      );
      return successResponse(header.toObject());
    });
  }

  async getSamplePdf() {
    const snapshot = await this.pdfEngine.buildSampleInvoiceSnapshot();
    const file = this.pdfEngine.toDownloadBody(snapshot);
    return {
      contentType: file.contentType,
      body: file.body,
      encoding: file.encoding,
      fileName: 'invoice-sample-SI-MA-326-001896.pdf',
    };
  }

  async getPdf(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeader(ctx, id);
    await this.assertRafLinesHaveRates(header);
    const snapshot = await this.buildPdfSnapshotForInvoice(ctx, id);

    await this.exportEngine.track(ctx, {
      exportType: 'invoice_pdf',
      documentId: header._id as Types.ObjectId,
      fileName: `${header.draftNumber}.pdf`,
      exportedBy: actor.userName,
    });
    const file = this.pdfEngine.toDownloadBody(
      snapshot as { format?: string; pdfBase64?: string; plainText?: string },
    );
    return {
      contentType: file.contentType,
      body: file.body,
      encoding: file.encoding,
      fileName: `${header.invoiceNumber ?? header.draftNumber}.${file.fileNameExt}`,
    };
  }

  async getAnnexurePdf(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeader(ctx, id);
    const category = String(header.invoiceCategory ?? '').trim().toUpperCase();
    if (category !== 'ADS') {
      throw new BadRequestException(
        'Additional equipment annexure is available for ADS invoices only.',
      );
    }

    const [lines, customer, settingsDoc, contract] = await Promise.all([
      this.lineModel.find({ invoiceId: header._id }).sort({ lineNo: 1 }).lean(),
      this.customerModel
        .findOne({ stationCode: header.stationCode, customerCode: header.customerCode })
        .lean(),
      this.settingsModel
        .findOne({ stationCode: header.stationCode })
        .select('companyLegalEntity')
        .lean(),
      resolveActiveContractForInvoice(this.contractModel, ctx, header),
    ]);

    const prepIds = collectInvoicePreparationIds(header, lines);
    const records =
      prepIds.length > 0
        ? await this.preparationModel.find({ _id: { $in: prepIds } }).lean()
        : [];
    const table = buildAdsAnnexureTable(records, contract?.adsEquipmentRules, lines);
    const company = resolveInvoiceCompanyDefaults(
      header.stationCode,
      settingsDoc?.companyLegalEntity,
    );
    const airport = resolveAirportConfig(header.stationCode);
    const invoiceNumber = String(header.invoiceNumber ?? header.draftNumber ?? '').trim();
    const snapshot = await this.pdfEngine.buildAdsAnnexureSnapshot({
      companyName: company.name,
      airlineName:
        customer?.airlineInvoiceName?.trim() ||
        customer?.name?.trim() ||
        header.customerName?.trim() ||
        header.customerCode,
      serviceStation: airport.serviceStation || header.stationCode,
      titleLine: adsAnnexureTitleLine({
        monthLabel: adsAnnexureMonthLabel(header.billingPeriodStart),
        invoiceNumber,
      }),
      table,
    });

    await this.exportEngine.track(ctx, {
      exportType: 'invoice_pdf',
      documentId: header._id as Types.ObjectId,
      fileName: adsAnnexureFileName(invoiceNumber),
      exportedBy: actor.userName,
    });
    const file = this.pdfEngine.toDownloadBody(
      snapshot as { format?: string; pdfBase64?: string; plainText?: string },
    );
    return {
      contentType: file.contentType,
      body: file.body,
      encoding: file.encoding,
      fileName: adsAnnexureFileName(invoiceNumber),
    };
  }

  async getBackingPdf(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeader(ctx, id);
    if (!header.backingSheetId) throw new NotFoundException('No backing sheet');
    const backing = await this.backingModel.findById(header.backingSheetId).lean();
    if (!backing) throw new NotFoundException('Backing sheet not found');
    const body = JSON.stringify(backing.rows, null, 2);
    await this.exportEngine.track(ctx, {
      exportType: 'backing_pdf',
      documentId: backing._id as Types.ObjectId,
      fileName: `backing-${header.draftNumber}.json`,
      exportedBy: actor.userName,
    });
    return {
      contentType: 'application/json',
      body,
      fileName: `backing-${header.invoiceNumber ?? header.draftNumber}.json`,
    };
  }

  async relatedFlights(ctx: StationScopeContext, id: string) {
    const header = await this.getHeader(ctx, id);
    const lines = await this.lineModel.find({ invoiceId: header._id }).lean();
    const serials = lines
      .map((l) => (l.sourceRef as { serialNo?: string })?.serialNo)
      .filter(Boolean);
    return successResponse({ serials, count: serials.length });
  }

  async sendToAirline(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    await this.assertRafLinesHaveRates(header);
    if (!SENDABLE_STATUSES.has(header.status)) {
      throw new BadRequestException(
        `Cannot email invoice in status "${header.status}". Approve the draft first.`,
      );
    }

    const customer = await this.customerModel
      .findOne({
        stationCode: header.stationCode,
        customerCode: header.customerCode,
      })
      .lean();
    const toEmails = await this.resolveAirlineEmails(ctx, header.customerCode, customer);
    if (toEmails.length === 0) {
      throw new NotFoundException(
        `No airline email found for customer "${header.customerCode}". ` +
          'Add Email ID in Advance → Gateway → Scheduled Airlines (matching airline code), ' +
          'then try again.',
      );
    }

    const snapshot = await this.buildPdfSnapshotForInvoice(ctx, id);
    const emailContract = await resolveActiveContractForInvoice(this.contractModel, ctx, header);
    const file = this.pdfEngine.toDownloadBody(
      snapshot as { format?: string; pdfBase64?: string; plainText?: string },
    );
    if (file.encoding !== 'base64' || !file.body) {
      throw new BadRequestException('Invoice PDF is not available for email.');
    }

    const invoiceLabel = header.invoiceNumber ?? header.draftNumber;
    const fileName = `${invoiceLabel}.pdf`;
    const period =
      formatBillingPeriodLabel(header.billingPeriodStart, header.billingPeriodEnd, {
        fortnight: emailContract?.fortnightBillingEnabled === true,
      }) ||
      `${formatInvoiceDate(header.billingPeriodStart)} – ${formatInvoiceDate(header.billingPeriodEnd)}`;
    const subject = `Tax Invoice — ${invoiceLabel} — ${header.customerCode}`;
    const textBody = [
      'TAX INVOICE',
      '',
      `Invoice: ${invoiceLabel}`,
      `Customer: ${header.customerName} (${header.customerCode})`,
      `Billing period: ${period}`,
      `Total: ${header.currencyCode} ${Number(header.totalInclTax ?? 0).toFixed(2)}`,
      '',
      'Please find the tax invoice attached as a PDF.',
      '',
      'BIRD AIRPORT SERVICES',
    ].join('\n');
    const htmlBody = `
      <p><strong>Tax Invoice</strong></p>
      <p><strong>Invoice:</strong> ${invoiceLabel}<br/>
      <strong>Customer:</strong> ${header.customerName} (${header.customerCode})<br/>
      <strong>Billing period:</strong> ${period}<br/>
      <strong>Total:</strong> ${header.currencyCode} ${Number(header.totalInclTax ?? 0).toFixed(2)}</p>
      <p>Please find the tax invoice attached as a PDF.</p>
      <p>BIRD AIRPORT SERVICES</p>
    `.trim();

    await this.invoiceEmailService.sendMultiPdfReportEmail({
      emails: toEmails,
      subject,
      textBody,
      htmlBody,
      attachments: [{ filename: fileName, pdfBase64: file.body }],
    });

    // Email already succeeded — persist send markers atomically (header + export + audit).
    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };
      header.airlineEmailSentAt = new Date();
      header.airlineEmailSentTo = toEmails;
      if (header.status === 'approved') {
        header.status = 'generated';
      }
      if (!header.pdfSnapshot) {
        header.pdfSnapshot = snapshot as unknown as Record<string, unknown>;
      }
      await header.save({ session });

      await this.exportEngine.track(
        ctx,
        {
          exportType: 'invoice_email',
          documentId: header._id,
          fileName,
          exportedBy: actor.userName,
          recipient: toEmails.join(', '),
        },
        sessionOpts,
      );
      await this.auditEngine.log(
        {
          entityType: 'invoice',
          entityId: header._id,
          action: 'email_sent',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: header.stationCode,
          changes: { toEmails, invoiceLabel },
        },
        sessionOpts,
      );

      return successResponse({
        sent: true,
        invoiceId: String(header._id),
        toEmails,
        invoiceLabel,
      });
    });
  }

  async sendManyToAirline(
    ctx: StationScopeContext,
    ids: string[],
    actor: BillingActor,
  ) {
    const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Select at least one invoice to send.');
    }

    const sent: Array<{ invoiceId: string; toEmails: string[]; invoiceLabel: string }> = [];
    const failed: Array<{ id: string; message: string }> = [];

    for (const id of uniqueIds) {
      try {
        const result = await this.sendToAirline(ctx, id, actor);
        sent.push({
          invoiceId: result.data.invoiceId,
          toEmails: result.data.toEmails,
          invoiceLabel: result.data.invoiceLabel,
        });
      } catch (error) {
        failed.push({
          id,
          message: error instanceof Error ? error.message : 'Send failed',
        });
      }
    }

    const allRecipients = [...new Set(sent.flatMap((row) => row.toEmails))];
    return successResponse({
      sent: sent.length,
      failed,
      recipients: allRecipients,
      items: sent,
    });
  }

  private async assertRafLinesHaveRates(header: {
    _id?: Types.ObjectId;
    invoiceCategory?: string;
  }) {
    if (String(header.invoiceCategory ?? '').trim().toUpperCase() !== 'RAF') {
      return;
    }
    const lines = await this.lineModel.find({ invoiceId: header._id }).lean();
    const missing = lines.filter((line) => !(Number(line.unitPrice) > 0));
    if (missing.length > 0) {
      throw new BadRequestException(
        'Save a Rate/Unit for every RAF particular (custom or adhoc) before generating the invoice PDF.',
      );
    }
  }

  private async resolveAirlineEmails(
    ctx: StationScopeContext,
    customerCode: string,
    customer?: BillingCustomer | null,
  ): Promise<string[]> {
    const activeFilter = {
      ...StationScope.filter({}, ctx),
      type: { $nin: ['Inactive', 'inactive'] },
    };

    if (customer?.gatewayScheduledAirlineId) {
      const linked = await this.gatewayModel.findById(customer.gatewayScheduledAirlineId).lean();
      const emails = parseEmailList(String((linked as { emailId?: string })?.emailId ?? ''));
      if (emails.length > 0) return [...new Set(emails)];
    }

    const code = customerCode.trim().toUpperCase();
    if (code) {
      const byCode = await this.gatewayModel
        .findOne({
          ...activeFilter,
          code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
        })
        .lean()
        .exec();
      const emails = parseEmailList(String((byCode as { emailId?: string })?.emailId ?? ''));
      if (emails.length > 0) return [...new Set(emails)];
    }

    const name = String(customer?.name ?? '').trim();
    if (name) {
      const byName = await this.gatewayModel
        .findOne({
          ...activeFilter,
          airlines: new RegExp(`^${escapeRegex(name)}$`, 'i'),
        })
        .lean()
        .exec();
      const emails = parseEmailList(String((byName as { emailId?: string })?.emailId ?? ''));
      if (emails.length > 0) return [...new Set(emails)];
    }

    return [];
  }

  private async buildPdfSnapshotForInvoice(ctx: StationScopeContext, id: string) {
    const initial = await this.getHeaderDoc(ctx, id);
    const hasCustomBill = Boolean(initial.customBillOverrides?.updatedAt);

    // View / generate PDF reads the saved draft. Rebuilding here rewrites every
    // line inside a Mongo transaction and times out Atlas (the browser then
    // shows a 404). Latest contracts and rates are applied by Regenerate invoice.
    const headerDoc = initial;

    const partRate = await this.invoiceDraftsService.fortnightExchangeRateForHeader(ctx, headerDoc);
    if (partRate != null && !headerDoc.totalReceivableInUsd) {
      if (partRate !== headerDoc.currencyFactor) {
        headerDoc.currencyFactor = partRate;
        await headerDoc.save();
      }
    } else if (
      !headerDoc.totalReceivableInUsd &&
      (headerDoc.currencyCode === 'USD' || Number(headerDoc.currencyFactor) > 1)
    ) {
      try {
        const factor = await this.currencyEngine.resolveFactor(
          ctx,
          'USD',
          headerDoc.documentDate,
          headerDoc.billingPeriodStart,
        );
        if (factor > 0 && factor !== headerDoc.currencyFactor) {
          headerDoc.currencyFactor = factor;
          await headerDoc.save();
        } else if (factor > 0) {
          headerDoc.currencyFactor = factor;
        }
      } catch {
        // Keep existing factor if no master rate exists yet.
      }
    }

    const header = headerDoc.toObject();
    const lines = await this.lineModel.find({ invoiceId: headerDoc._id }).sort({ lineNo: 1 }).lean();
    if (lines.length === 0) {
      throw new BadRequestException('Invoice has no lines — cannot build PDF');
    }

    const [settingsDoc, customer, serviceCatalog, contract] = await Promise.all([
      this.settingsModel
        .findOne({ stationCode: header.stationCode })
        .select('-airportCommercial -royaltyMaster')
        .lean(),
      this.customerModel
        .findOne({ stationCode: header.stationCode, customerCode: header.customerCode })
        .lean(),
      this.catalogModel.find({ stationCode: header.stationCode, active: true }).lean(),
      resolveActiveContractForInvoice(this.contractModel, ctx, header),
    ]);

    const customerForPdf = hasCustomBill
      ? {
          name: header.customerName,
          address: header.customerAddress?.trim() || undefined,
          gstRegistrationNo: header.customBillOverrides?.billToGstin?.trim() || undefined,
          showPanOnInvoice: customer?.showPanOnInvoice === true,
          panNumber: customer?.panNumber,
          showVatOnInvoice: customer?.showVatOnInvoice === true,
          vatNumber: customer?.vatNumber,
        }
      : customer
        ? {
            ...customer,
            name: customer.name ?? header.customerName,
            address:
              customer.address?.trim() ||
              customer.globalDimension2?.trim() ||
              header.customerAddress?.trim() ||
              undefined,
          }
        : header.customerAddress?.trim()
          ? {
              name: header.customerName,
              address: header.customerAddress.trim(),
              gstRegistrationNo: undefined,
              showPanOnInvoice: false,
              showVatOnInvoice: false,
            }
          : null;

    const concessionTotals = concessionTotalsFromSavedHeader(header);

    const settings = billingSettingsForInvoicing(settingsDoc);
    return this.pdfEngine.buildInvoiceSnapshot({
      header,
      lines,
      settings,
      customer: customerForPdf,
      serviceCatalog,
      contractCategory: contract?.category,
      fortnightBilling: contract?.fortnightBillingEnabled === true,
      inrUsdInvoiceCategories:
        contract?.inrUsdInvoiceEnabled === true ? contract.inrUsdInvoiceCategories ?? [] : [],
      hasAnnexures: lines.length > 0,
      concessionTotals,
    });
  }

  private async getHeader(ctx: StationScopeContext, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invoice not found');
    }
    const doc = await this.invoiceModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(doc, ctx);
    return doc;
  }

  private async getHeaderDoc(ctx: StationScopeContext, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invoice not found');
    }
    const doc = await this.invoiceModel.findById(id);
    if (!doc) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(doc, ctx);
    return doc;
  }
}
