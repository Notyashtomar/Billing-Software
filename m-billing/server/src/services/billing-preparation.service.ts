import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { ValidationResult } from '../shared/types';
import type { PreparationStatus } from '../shared/enums';
import { PREPARATION_STATUSES } from '../shared/enums';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  successResponse,
} from '../common/station-scope';
import {
  preparationRowVisibleToCurrentUser,
  withPreparationSentMarker,
  withPreparationVisibility,
} from '../common/billing-personal-workspace';
import { withBillingTransaction } from '../common/billing-transaction';
import {
  BillingCustomer,
  BillingCustomerDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
} from '../schemas/billing.schemas';
import {
  AdsUsageData,
  AdsUsageDataDocument,
  FhrCollectionRead,
  FhrCollectionReadDocument,
  RawFlightDataRead,
  RawFlightDataReadDocument,
} from '../schemas/operational.schemas';
import { ValidationEngineService } from '../engines/validation-engine.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import {
  BillingSourceEnrichmentService,
  type EnrichSourceInput,
} from './sources/billing-source-enrichment.service';
import type { BillingSourceRow } from '../shared/billing-sources';
import { allChecklistConfirmed } from '../shared/preparation-checklist';
import { defaultServiceCodeForSource } from '../shared/preparation-source-defaults';
import type { BillingActor } from './billing-customers.service';
import {
  BulkDeletePreparationDto,
  BulkDeleteByFilterPreparationDto,
  BulkReadyByFilterPreparationDto,
  BulkReadyPreparationDto,
  IngestPreparationDto,
  UnsendPreparationBySourceDto,
  ListPreparationQueryDto,
  RejectPreparationDto,
  AddPreparationRemarkDto,
  SendBackPreparationDto,
  UpdatePreparationChecklistDto,
  UpdateCustomBillingDto,
  SubmitCustomBillingDto,
} from '../dto/billing-preparation.dto';
import {
  preparationIdentitiesMatch,
  preparationSourceIdentity,
  type PreparationSourceLike,
} from '../utils/preparation-source-identity.util';
import {
  preparationInvoiceCategory,
  preparationPeriodBoundEnd,
  preparationPeriodBoundStart,
} from '../common/billing-invoice-period.util';
import { isBillingOperationalRowCancelled } from '../utils/billing-date.util';
import {
  mapFhrToInvoicingFlightReportRow,
  reportDateYmd,
} from '../utils/invoicing-flight-report.mapper';
import {
  buildAdsCatalogIndex,
  mapFhrDocToAdsRows,
} from '../shared/fhr-equipment-to-ads-row';
import { isAdsFamilySourceType } from '../shared/ads-adhoc-tariff';
import { EQUIPMENT_MANPOWER_CATALOG_SERIAL } from 'src/equipment-manpower/schema/equipment-manpower.schema';
import type { BillingInvoiceDraftsService } from './billing-invoice-drafts.service';
import { lazyService } from 'src/common/nestjs/lazy-service.util';
import {
  buildPreparationAggregateActivity,
  buildPreparationAggregateMetadata,
  preparationActivityTab,
} from '../utils/billing-audit-activity.util';

type IngestRow = IngestPreparationDto['rows'][number];

const TAB_STATUSES = PREPARATION_STATUSES;

/** BHS vs ADS vs RAF vs CUSTOM stay independent for prep ingest dedupe. */
function ingestCategorySourceTypes(
  sourceType: string): string[] {
  const category = preparationInvoiceCategory(sourceType);
  if (category === 'BHS') return ['scheduled_flight'];
  if (category === 'ADS') return ['ads', 'equipment', 'manpower', 'cleaning'];
  if (category === 'RAF') return ['raf'];
  if (category === 'CUSTOM') return ['custom'];
  return [String(sourceType ?? '').trim()].filter(Boolean);
}

function ingestDedupeKey(row: {
  sourceType: string;
  sourceRef?: PreparationSourceLike['sourceRef'];
  operationalData?: Record<string, unknown>;
  operationalSnapshot?: Record<string, unknown>;
}): string {
  const category = preparationInvoiceCategory(row.sourceType);
  const identity = preparationSourceIdentity(row);
  return `${category}|${identity}`;
}

@Injectable()
export class BillingPreparationService {
  constructor(
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectModel(RawFlightDataRead.name)
    private readonly rawFlightModel: Model<RawFlightDataReadDocument>,
    @InjectModel(AdsUsageData.name)
    private readonly adsUsageModel: Model<AdsUsageDataDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly validationEngine: ValidationEngineService,
    private readonly auditEngine: AuditEngineService,
    private readonly enrichment: BillingSourceEnrichmentService,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('./billing-invoice-drafts.service')
              .BillingInvoiceDraftsService as typeof import('./billing-invoice-drafts.service').BillingInvoiceDraftsService,
        ),
      ),
    )
    private readonly invoiceDraftsService: BillingInvoiceDraftsService,
  ) {}

  async list(ctx: StationScopeContext, query: ListPreparationQueryDto) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(
      10000,
      Math.max(1, parseInt(query.limit ?? '50', 10) || 50),
    );
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = StationScope.filter({}, ctx);

    const sourceType = String(query.sourceType ?? '').trim().toLowerCase();
    const isCustomTab = sourceType === 'custom' && !query.status;

    if (isCustomTab) {
      // Custom rates are filled on the form; include pending + validation_error so
      // ingest failures are visible (not orphaned from status tabs, which exclude custom).
      filter.sourceType = 'custom';
      filter.status = { $nin: ['rejected', 'invoiced'] };
    } else {
      if (query.status) filter.status = query.status;
      if (sourceType) filter.sourceType = sourceType;
      else filter.sourceType = { $ne: 'custom' };
    }
    if (query.customerCode?.trim()) {
      filter.customerCode = query.customerCode.trim().toUpperCase();
    }
    if (query.from || query.to) {
      const period: Record<string, Date> = {};
      if (query.from) period.$gte = this.periodBoundStart(query.from);
      if (query.to) period.$lte = this.periodBoundEnd(query.to);
      filter.billingPeriodStart = period;
    }

    const scopeFilter: Record<string, unknown> = withPreparationVisibility(
      StationScope.filter({}, ctx),
    );
    if (query.customerCode?.trim()) {
      scopeFilter.customerCode = query.customerCode.trim().toUpperCase();
    }
    if (query.from || query.to) {
      const period: Record<string, Date> = {};
      if (query.from) period.$gte = this.periodBoundStart(query.from);
      if (query.to) period.$lte = this.periodBoundEnd(query.to);
      scopeFilter.billingPeriodStart = period;
    }

    const visibleFilter = withPreparationVisibility(filter);
    const [items, total, tabCounts, scopedTabCounts, scopedCustomCount] =
      await Promise.all([
        this.preparationModel
          .find(visibleFilter)
          .select('-workflowNotes')
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.preparationModel.countDocuments(visibleFilter),
        this.countByStatus(ctx),
        this.countByStatusScoped(scopeFilter),
        this.preparationModel.countDocuments({
          ...scopeFilter,
          sourceType: 'custom',
          status: { $nin: ['rejected', 'invoiced'] },
        }),
      ]);
    const scopedReadyCount = scopedTabCounts.ready_for_invoice ?? 0;
    const visibleStatuses = TAB_STATUSES.filter((s) => s !== 'invoiced');
    const scopedTotal =
      visibleStatuses.reduce(
        (sum, status) => sum + (scopedTabCounts[status] ?? 0),
        0,
      ) + scopedCustomCount;

    return paginatedResponse(
      items.map((item) =>
        this.sanitizePreparationItemForResponse(
          item as unknown as Record<string, unknown>,
        ),
      ) as unknown as typeof items,
      total,
      page,
      limit,
      {
        tabCounts,
        scopedTabCounts: { ...scopedTabCounts, custom: scopedCustomCount },
        scopedReadyCount,
        scopedTotal,
        scopedCustomCount,
      },
    );
  }

  /**
   * Preparation source rows already ingested for a billing period (for sent marking).
   */
  async getIngestedSourceSnapshots(
    ctx: StationScopeContext,
    billingPeriodStart: Date | undefined,
    sourceType: string,
  ): Promise<PreparationSourceLike[]> {
    return this.getIngestedSourceSnapshotsForTypes(
      ctx,
      billingPeriodStart,
      [sourceType],
    );
  }

  /** One query for multiple source types (ADS / equipment / manpower). */
  async getIngestedSourceSnapshotsForTypes(
    ctx: StationScopeContext,
    billingPeriodStart: Date | undefined,
    sourceTypes: readonly string[],
  ): Promise<PreparationSourceLike[]> {
    const types = [...new Set(sourceTypes.map((t) => t.trim()).filter(Boolean))];
    if (types.length === 0) return [];

    const filter: Record<string, unknown> = {
      sourceType: types.length === 1 ? types[0] : { $in: types },
      status: { $nin: ['rejected'] },
    };
    if (billingPeriodStart) {
      const ymd = billingPeriodStart.toISOString().slice(0, 10);
      filter.billingPeriodStart = {
        $gte: preparationPeriodBoundStart(ymd),
        $lte: preparationPeriodBoundEnd(ymd),
      };
    }
    const docs = await this.preparationModel
      .find(withPreparationSentMarker(StationScope.filter(filter, ctx)))
      .select('sourceRef operationalSnapshot')
      .lean();

    return docs.map((doc) => ({
      sourceRef: doc.sourceRef as PreparationSourceLike['sourceRef'],
      operationalSnapshot: (doc.operationalSnapshot ?? {}) as Record<
        string,
        unknown
      >,
    }));
  }

  /**
   * Fast sent-marker for ADS/RAF rows: usageRowId is always set on ingest.
   * Avoids loading full operationalSnapshot blobs for thousands of prep rows.
   *
   * @param periodStartYmd Inclusive start of the billing window (YYYY-MM-DD).
   * @param periodEndYmd Optional inclusive end — when set, matches prep rows whose
   *   billingPeriodStart falls anywhere in [start, end] (needed for multi-month RAF).
   */
  async getIngestedAdsUsageRowIds(
    ctx: StationScopeContext,
    periodStartYmd: string,
    sourceTypes: readonly string[] = ['ads', 'equipment', 'manpower'],
    periodEndYmd?: string,
  ): Promise<Set<string>> {
    const types = [...new Set(sourceTypes.map((t) => t.trim()).filter(Boolean))];
    if (types.length === 0) return new Set();

    const endYmd = String(periodEndYmd ?? periodStartYmd).trim() || periodStartYmd;
    const filter: Record<string, unknown> = {
      sourceType: types.length === 1 ? types[0] : { $in: types },
      status: { $nin: ['rejected'] },
      'sourceRef.usageRowId': { $exists: true, $nin: [null, ''] },
      billingPeriodStart: {
        $gte: preparationPeriodBoundStart(periodStartYmd),
        $lte: preparationPeriodBoundEnd(endYmd),
      },
    };
    const docs = await this.preparationModel
      .find(withPreparationSentMarker(StationScope.filter(filter, ctx)))
      .select('sourceRef.usageRowId')
      .lean();

    const out = new Set<string>();
    for (const doc of docs) {
      const id = String(
        (doc.sourceRef as { usageRowId?: string } | undefined)?.usageRowId ?? '',
      ).trim();
      if (id) out.add(id);
    }
    return out;
  }

  async findOne(ctx: StationScopeContext, id: string) {
    // Guard invalid ids (e.g. a stray GET on a reserved path like "create-drafts")
    // so we return a clean 404 instead of an unhandled Mongoose CastError → 500.
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Preparation record not found');
    }
    const doc = await this.preparationModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Preparation record not found');
    StationScope.assertOwnership(doc, ctx);
    if (!preparationRowVisibleToCurrentUser(doc.ownerUserId)) {
      throw new NotFoundException('Preparation record not found');
    }
    return successResponse(
      this.sanitizePreparationItemForResponse(
        doc as unknown as Record<string, unknown>,
      ),
    );
  }

  async ingest(
    ctx: StationScopeContext,
    dto: IngestPreparationDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const periodStart = preparationPeriodBoundStart(dto.billingPeriodStart);
    const periodEnd = preparationPeriodBoundEnd(dto.billingPeriodEnd);

    const skipped: Array<{ sourceRef: unknown; reason: string }> = [];
    const batchSeen = new Set<string>();
    const candidateRows: IngestRow[] = [];

    for (const row of dto.rows) {
      const batchKey = ingestDedupeKey(row);
      if (!preparationSourceIdentity(row) || batchSeen.has(batchKey)) {
        skipped.push({
          sourceRef: row.sourceRef,
          reason: !preparationSourceIdentity(row)
            ? 'Missing source identity (serial or usage row id)'
            : 'Duplicate row in this send batch',
        });
        continue;
      }
      batchSeen.add(batchKey);

      candidateRows.push(row);
    }

    const existingByKey = await this.loadExistingIngestKeys(
      ctx,
      candidateRows,
      periodStart,
      periodEnd,
    );

    const documentsToInsert: Record<string, unknown>[] = [];

    for (const row of candidateRows) {
      const identityKey = ingestDedupeKey(row);
      const existing = existingByKey.get(identityKey);
      if (existing) {
        const onDraftOrInvoice =
          existing.status === 'invoiced' || Boolean(existing.invoiceDraftId);
        skipped.push({
          sourceRef: row.sourceRef,
          reason: onDraftOrInvoice
            ? 'Already on an invoice draft — open Invoice drafts (Preparation → On invoice)'
            : `Already in preparation (${existing.status.replace(/_/g, ' ')}) for this period`,
        });
        continue;
      }

      const customerCode = this.resolveIngestCustomerCode(
        row.operationalData,
        row.sourceRef,
      );
      if (!customerCode) {
        skipped.push({
          sourceRef: row.sourceRef,
          reason:
            'Missing customer code — set airline code on the flight or filter by customer before sending',
        });
        continue;
      }
      existingByKey.set(identityKey, { status: 'pending' });

      const validationResults = this.buildValidationResults(
        row,
        false,
        periodStart,
        periodEnd,
      );
      const status = this.deriveStatus(validationResults, row);
      const customerName = String(
        row.operationalData.customerName ?? '',
      ).trim();

      documentsToInsert.push(
        StationScope.stampCreate(
          {
            sourceType: row.sourceType,
            sourceRef: row.sourceRef,
            customerCode,
            customerName: customerName || undefined,
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            status,
            contractMatch: {
              contractId: row.contractMatch?.contractId,
              rateCardId: row.contractMatch?.rateCardId,
              matched: Boolean(row.contractMatch?.matched),
              cancellationWithinHours:
                row.contractMatch?.cancellationWithinHours != null
                  ? Number(row.contractMatch.cancellationWithinHours)
                  : undefined,
              royaltyAtGross:
                row.contractMatch?.royaltyAtGross != null
                  ? Number(row.contractMatch.royaltyAtGross)
                  : undefined,
              concessionRates:
                row.contractMatch?.concessionRates &&
                typeof row.contractMatch.concessionRates === 'object'
                  ? row.contractMatch.concessionRates
                  : undefined,
              message: row.contractMatch?.message,
            },
            rateMatch: {
              serviceCode: row.rateMatch?.serviceCode,
              unitPrice: row.rateMatch?.unitPrice,
              currency: row.rateMatch?.currency,
              matched: Boolean(row.rateMatch?.matched),
              rateCardId: row.rateMatch?.rateCardId,
              usedUnits: row.rateMatch?.usedUnits,
              freeAllowance: row.rateMatch?.freeAllowance,
              pricingBasis: row.rateMatch?.pricingBasis,
              particular: row.rateMatch?.particular,
              aircraftType: row.rateMatch?.aircraftType,
              uom: row.rateMatch?.uom,
            },
            validationResults,
            operationalSnapshot: row.operationalData,
            ownerUserId: String(actor.userId ?? '').trim() || undefined,
          },
          ctx,
        ),
      );
    }

    let inserted: BillingPreparationRecordDocument[] = [];
    if (documentsToInsert.length > 0) {
      inserted = await withBillingTransaction(
        this.connection,
        async (session, afterCommit) => {
          const docs = await this.preparationModel.insertMany(documentsToInsert, {
            ordered: false,
            session,
          });
          await this.auditEngine.logBulk(
            docs.map((doc) => ({
              entityType: 'preparation',
              entityId: doc._id as Types.ObjectId,
              action: 'created',
              userId: actor.userId,
              userName: actor.userName,
              actor,
              stationCode,
              changes: {
                sourceType: doc.sourceType,
                status: doc.status,
              },
            })),
            { session, afterCommit },
          );

          const statusBreakdownInner: Record<string, number> = {};
          for (const doc of docs) {
            const key = String(doc.status);
            statusBreakdownInner[key] = (statusBreakdownInner[key] ?? 0) + 1;
          }
          const tab = preparationActivityTab(docs);
          afterCommit(() => {
            this.auditEngine.emitActivity(
              buildPreparationAggregateActivity({
                actor,
                action: 'Sent billing records to preparation',
                summary: `${actor.userName} sent ${docs.length} billing record(s) to preparation.`,
                stationCode,
                page: 'Preparation',
                tab,
                metadata: buildPreparationAggregateMetadata({
                  affected: docs,
                  failures: skipped.map((entry) => ({
                    sourceRef: entry.sourceRef,
                    reason: entry.reason,
                  })),
                  counts: {
                    requested: dto.rows.length,
                    created: docs.length,
                    skipped: skipped.length,
                    failed: 0,
                  },
                  page: 'Preparation',
                  tab,
                  scope: {
                    stationCode,
                    billingPeriodStart: dto.billingPeriodStart,
                    billingPeriodEnd: dto.billingPeriodEnd,
                  },
                  statusBreakdown: statusBreakdownInner,
                }),
              }),
            );
          });
          return docs;
        },
      );
    }

    const statusBreakdown: Record<string, number> = {};
    for (const doc of inserted) {
      const key = String(doc.status);
      statusBreakdown[key] = (statusBreakdown[key] ?? 0) + 1;
    }

    return successResponse({
      created: inserted.length,
      skipped,
      skippedCount: skipped.length,
      statusBreakdown,
    });
  }

  async validate(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (['rejected', 'invoiced'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot refresh validation for record in status "${doc.status}"`,
      );
    }

    await this.applyEnrichmentAndValidation(ctx, doc);
    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { status: doc.status, action: 'validate' },
    });

    return successResponse(
      this.sanitizePreparationItemForResponse(
        doc.toObject() as unknown as Record<string, unknown>,
      ),
    );
  }

  /**
   * Persist custom billing line items (particulars / used / charged / rate).
   * Independent of BHS checklist and ADS rate-card matching.
   */
  async updateCustomBilling(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateCustomBillingDto,
    actor: BillingActor,
  ) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (String(doc.sourceType ?? '').trim().toLowerCase() !== 'custom') {
      throw new BadRequestException('Custom billing form applies only to custom preparation rows');
    }
    if (['rejected', 'invoiced'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot edit custom billing for record in status "${doc.status}"`,
      );
    }

    this.assertCustomConcessionPercent(dto.concessionPercent);
    this.assertCustomConversionRate(dto.conversionRate);
    this.applyCustomLinesToDoc(doc, dto.lines, dto.concessionPercent, dto.conversionRate);
    if (doc.status === 'validation_error') {
      // Keep validation_error if flight rules failed; otherwise pending for form work.
      const stillFailed = !this.validationEngine.allPassed(
        this.validationResultsForReadiness(doc),
      );
      if (!stillFailed) doc.status = 'pending';
    } else if (doc.status !== 'ready_for_invoice') {
      doc.status = 'pending';
    }
    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { action: 'custom_billing', lineCount: dto.lines.length },
    });

    return successResponse(doc.toObject());
  }

  /**
   * Custom billing → invoice draft.
   * - Standalone (Preferred): customer + period + lines, no flights.
   * - Legacy: preparationRecordIds from Custom ops send (still supported).
   */
  async submitCustomBilling(
    ctx: StationScopeContext,
    dto: SubmitCustomBillingDto,
    actor: BillingActor,
  ) {
    const lines = dto.lines ?? [];
    if (lines.length === 0) {
      throw new BadRequestException('Add at least one custom billing line');
    }
    this.assertCustomConcessionPercent(dto.concessionPercent);
    this.assertCustomConversionRate(dto.conversionRate);
    for (const line of lines) {
      if (!String(line.particular ?? '').trim()) {
        throw new BadRequestException('Particulars is required on every custom line');
      }
      if (!(Number(line.ratePerUnit) > 0)) {
        throw new BadRequestException('Rate/Unit must be greater than zero');
      }
      if (!(Number(line.charged) > 0) && !(Number(line.used) > 0)) {
        throw new BadRequestException('Used or Charged quantity is required');
      }
    }

    const ids = [
      ...new Set(
        (dto.preparationRecordIds ?? []).map((id) => String(id).trim()).filter(Boolean),
      ),
    ];

    let docs: BillingPreparationRecordDocument[];

    if (ids.length === 0) {
      const created = await this.createStandaloneCustomPreparation(ctx, dto, lines, actor);
      docs = [created];
    } else {
      docs = await this.preparationModel
        .find(
          withPreparationVisibility(
            StationScope.filter(
              {
                _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
                sourceType: 'custom',
                status: { $nin: ['rejected', 'invoiced'] },
              },
              ctx,
            ),
          ),
        )
        .exec();

      if (docs.length === 0) {
        throw new BadRequestException('No custom preparation flights found to submit');
      }

      for (const doc of docs) {
        this.applyCustomLinesToDoc(doc, lines, dto.concessionPercent, dto.conversionRate);
        doc.status = 'ready_for_invoice';
        await doc.save();
      }
    }

    const readyIds = docs.map((d) => String(d._id));
    return this.invoiceDraftsService.createFromPreparation(
      ctx,
      { preparationRecordIds: readyIds, mergeOpenDraft: false },
      actor,
    );
  }

  /** Create one custom prep row (no flight) then mark ready for draft compose. */
  private async createStandaloneCustomPreparation(
    ctx: StationScopeContext,
    dto: SubmitCustomBillingDto,
    lines: NonNullable<SubmitCustomBillingDto['lines']>,
    actor: BillingActor,
  ) {
    const customerCode = String(dto.customerCode ?? '')
      .trim()
      .toUpperCase();
    if (!customerCode) {
      throw new BadRequestException('Customer is required for custom billing');
    }
    const periodStartYmd = String(dto.billingPeriodStart ?? '').trim();
    const periodEndYmd = String(dto.billingPeriodEnd ?? '').trim();
    if (!periodStartYmd || !periodEndYmd) {
      throw new BadRequestException('Billing period from/to is required');
    }
    const billingPeriodStart = this.periodBoundStart(periodStartYmd);
    const billingPeriodEnd = this.periodBoundEnd(periodEndYmd);
    if (
      Number.isNaN(billingPeriodStart.getTime()) ||
      Number.isNaN(billingPeriodEnd.getTime())
    ) {
      throw new BadRequestException('Invalid billing period dates');
    }
    if (billingPeriodEnd < billingPeriodStart) {
      throw new BadRequestException('Period to must be on or after period from');
    }

    const customer = await this.customerModel
      .findOne(StationScope.filter({ customerCode }, ctx))
      .lean();
    if (!customer) {
      throw new BadRequestException(
        `Customer ${customerCode} not found for this station — add them under Customers first`,
      );
    }

    const serialNo = `CUSTOM-${Date.now()}`;
    const flightNo =
      String(dto.flightNo ?? '')
        .trim()
        .toUpperCase() || 'CUSTOM';
    const bookingNo = String(dto.bookingNo ?? '').trim();
    const registrationNo = String(dto.registrationNo ?? '').trim();
    const routing = String(dto.routing ?? '').trim();
    const opsType = String(dto.opsType ?? '').trim();
    const aircraftType = String(dto.aircraftType ?? '').trim();
    const categoryOfFlight = String(dto.categoryOfFlight ?? '').trim();
    const linkedToFlight = flightNo !== 'CUSTOM';

    const payload = StationScope.stampCreate(
      {
        sourceType: 'custom',
        sourceRef: {
          serialNo,
          flightNo,
          standalone: true,
          ...(bookingNo ? { bookingNo } : {}),
        },
        customerCode,
        customerName: String(customer.name ?? '').trim() || customerCode,
        billingPeriodStart,
        billingPeriodEnd,
        status: 'ready_for_invoice',
        contractMatch: {
          matched: true,
          message: linkedToFlight
            ? `Custom billing — flight ${flightNo}`
            : 'Custom billing — standalone charges',
        },
        rateMatch: {
          matched: true,
          pricingBasis: 'custom',
          serviceCode: 'Custom Billing',
          currency: customer.currencyCode === 'USD' ? 'USD' : 'INR',
          message: 'Custom billing lines',
        },
        validationResults: [
          {
            rule: 'custom_standalone',
            passed: true,
            message: linkedToFlight
              ? `Custom billing for flight ${flightNo}`
              : 'Standalone custom billing (no flight)',
          },
        ],
        operationalSnapshot: {
          customerCode,
          customerName: String(customer.name ?? '').trim() || customerCode,
          flightNoEquipmentNo: flightNo,
          standaloneCustom: true,
          ...(linkedToFlight
            ? {
                nonScheduledCustom: true,
                bookingNo: bookingNo || undefined,
                registrationNo: registrationNo || undefined,
                routing: routing || undefined,
                opsType: opsType || undefined,
                aircraftType: aircraftType || undefined,
                categoryOfFlight: categoryOfFlight || undefined,
              }
            : {}),
        },
        ownerUserId: String(actor.userId ?? '').trim() || undefined,
      },
      ctx,
    );

    const [doc] = await this.preparationModel.create([payload]);
    this.applyCustomLinesToDoc(doc, lines, dto.concessionPercent, dto.conversionRate);
    doc.status = 'ready_for_invoice';
    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: {
        action: 'custom_standalone_submit',
        lineCount: lines.length,
        customerCode,
      },
    });

    return doc;
  }

  private readCustomLines(
    doc: BillingPreparationRecordDocument,
  ): Array<{
    particular: string;
    used: number;
    charged: number;
    aircraftType?: string;
    unit: string;
    ratePerUnit: number;
  }> {
    const rateMatch = (doc.rateMatch ?? {}) as Record<string, unknown>;
    const raw = rateMatch.customLines;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((entry) => {
        const line = (entry ?? {}) as Record<string, unknown>;
        return {
          particular: String(line.particular ?? '').trim(),
          used: Number(line.used ?? 0),
          charged: Number(line.charged ?? line.used ?? 0),
          aircraftType: String(line.aircraftType ?? '').trim() || undefined,
          unit: String(line.unit ?? line.uom ?? 'Per Service').trim() || 'Per Service',
          ratePerUnit: Number(line.ratePerUnit ?? line.unitPrice ?? 0),
        };
      });
    }
    const particular = String(rateMatch.particular ?? '').trim();
    if (!particular) return [];
    return [
      {
        particular,
        used: Number(rateMatch.usedUnits ?? 0),
        charged: Number(rateMatch.chargedUnits ?? rateMatch.usedUnits ?? 0),
        aircraftType: String(rateMatch.aircraftType ?? '').trim() || undefined,
        unit: String(rateMatch.uom ?? 'Per Service').trim() || 'Per Service',
        ratePerUnit: Number(rateMatch.unitPrice ?? 0),
      },
    ];
  }

  private assertCustomConcessionPercent(raw?: number) {
    if (raw == null || raw === undefined) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BadRequestException('Concession % must be between 0 and 100');
    }
  }

  private normalizeCustomConcessionPercent(raw?: number): number {
    if (raw == null || raw === undefined) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(100, Math.max(0, n));
  }

  private assertCustomConversionRate(raw?: number) {
    if (raw == null || raw === undefined) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('Conversion rate must be greater than zero when set');
    }
  }

  private normalizeCustomConversionRate(raw?: number): number | undefined {
    if (raw == null || raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  }

  private applyCustomLinesToDoc(
    doc: BillingPreparationRecordDocument,
    lines: Array<{
      particular: string;
      used: number;
      charged: number;
      aircraftType?: string;
      unit: string;
      ratePerUnit: number;
    }>,
    concessionPercent?: number,
    conversionRate?: number | null,
  ) {
    const snap = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const normalized = lines.map((line) => {
      const particular = String(line.particular ?? '').trim();
      const used = Number(line.used ?? 0);
      const charged = Number(line.charged ?? used);
      const aircraftType =
        String(line.aircraftType ?? '').trim() ||
        String(snap.aircraftType ?? snap.ACType ?? '').trim();
      const unit = String(line.unit ?? '').trim() || 'Per Service';
      const ratePerUnit = Number(line.ratePerUnit ?? 0);
      return { particular, used, charged, aircraftType, unit, ratePerUnit };
    });
    const first = normalized[0];
    const prev = (doc.rateMatch ?? {}) as Record<string, unknown>;
    const concession =
      concessionPercent !== undefined
        ? this.normalizeCustomConcessionPercent(concessionPercent)
        : this.normalizeCustomConcessionPercent(
            Number(prev.customConcessionPercent ?? 0),
          );
    const resolvedConversionRate =
      conversionRate === null
        ? undefined
        : conversionRate !== undefined
          ? this.normalizeCustomConversionRate(conversionRate)
          : this.normalizeCustomConversionRate(Number(prev.customConversionRate ?? 0));
    const nextRateMatch: Record<string, unknown> = {
      ...prev,
      matched: true,
      pricingBasis: 'custom',
      serviceCode: 'Custom Billing',
      customLines: normalized,
      customConcessionPercent: concession,
      particular: first?.particular,
      usedUnits: first?.used,
      chargedUnits: first?.charged,
      aircraftType: first?.aircraftType,
      uom: first?.unit,
      unitPrice: first?.ratePerUnit,
      message: 'Custom billing lines',
    };
    if (resolvedConversionRate != null) {
      nextRateMatch.customConversionRate = resolvedConversionRate;
    } else {
      delete nextRateMatch.customConversionRate;
    }
    doc.rateMatch = nextRateMatch;
  }

  /**
   * Re-enrich preparation rows with current contracts, rate cards, and
   * validation rules only (does not reload ops/FHR snapshots).
   * Scoped to the active tab status when provided.
   */
  async refresh(
    ctx: StationScopeContext,
    query: ListPreparationQueryDto,
    actor: BillingActor,
  ) {
    const filter = this.buildPeriodFilter(ctx, query);
    // Prefer explicit tab status from the UI; otherwise all open (non-final) rows.
    if (query.status && !['rejected', 'invoiced'].includes(query.status)) {
      filter.status = query.status;
    } else {
      filter.status = { $nin: ['rejected', 'invoiced'] };
    }

    const docs = await this.preparationModel
      .find(withPreparationVisibility(filter))
      .exec();
    if (docs.length === 0) {
      return successResponse({
        refreshed: 0,
        statusChanged: 0,
        snapshotsUpdated: 0,
        failed: 0,
        total: 0,
      });
    }

    const enrichInputs = docs.map((doc) => this.toEnrichInput(doc));
    const enrichedRows = await this.enrichment.enrichBatch(ctx, enrichInputs);

    let refreshed = 0;
    let statusChanged = 0;
    let failed = 0;

    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      const enriched = enrichedRows[i];
      if (!doc || !enriched) {
        failed += 1;
        continue;
      }
      const before = doc.status;
      try {
        await this.applyEnrichedRowAndSaveWithRetry(ctx, doc, enriched);
        refreshed += 1;
        if (before !== doc.status) statusChanged += 1;
      } catch {
        failed += 1;
      }
    }

    if (refreshed > 0) {
      const stationCode = StationScope.require(ctx);
      await this.auditEngine.log({
        entityType: 'preparation',
        entityId: docs[0]._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode,
        changes: {
          action: 'refresh',
          mode: 'enrich-only',
          statusFilter: query.status,
          refreshed,
          statusChanged,
          failed,
          total: docs.length,
          from: query.from,
          to: query.to,
        },
      });
    }

    return successResponse({
      refreshed,
      statusChanged,
      snapshotsUpdated: 0,
      failed,
      total: docs.length,
    });
  }

  /**
   * Re-enrich open ADS-family preparation rows for one airline (used after
   * contract ADS rules / concessions change).
   */
  async refreshAdsForCustomer(
    ctx: StationScopeContext,
    opts: { customerCode: string; from?: Date | string; to?: Date | string },
    actor: BillingActor,
  ) {
    const customerCode = opts.customerCode.trim().toUpperCase();
    if (!customerCode) {
      return successResponse({ refreshed: 0, statusChanged: 0, failed: 0 });
    }

    const filter: Record<string, unknown> = StationScope.filter(
      {
        customerCode,
        sourceType: { $in: ['ads', 'equipment', 'manpower', 'cleaning'] },
        status: { $nin: ['rejected', 'invoiced'] },
      },
      ctx,
    );

    if (opts.from || opts.to) {
      const period: Record<string, Date> = {};
      if (opts.from) {
        const from =
          opts.from instanceof Date ? opts.from : new Date(String(opts.from));
        if (!Number.isNaN(from.getTime())) period.$gte = from;
      }
      if (opts.to) {
        const to = opts.to instanceof Date ? opts.to : new Date(String(opts.to));
        if (!Number.isNaN(to.getTime())) {
          // Inclusive end of contract validity day.
          const end = new Date(to);
          if (
            end.getUTCHours() === 0 &&
            end.getUTCMinutes() === 0 &&
            end.getUTCSeconds() === 0
          ) {
            end.setUTCHours(23, 59, 59, 999);
          }
          period.$lte = end;
        }
      }
      if (Object.keys(period).length > 0) {
        filter.billingPeriodStart = period;
      }
    }

    const docs = await this.preparationModel.find(filter).exec();
    if (docs.length === 0) {
      return successResponse({ refreshed: 0, statusChanged: 0, failed: 0 });
    }

    const enrichInputs = docs.map((doc) => this.toEnrichInput(doc));
    const enrichedRows = await this.enrichment.enrichBatch(ctx, enrichInputs);

    let refreshed = 0;
    let statusChanged = 0;
    let failed = 0;

    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      const enriched = enrichedRows[i];
      if (!doc || !enriched) {
        failed += 1;
        continue;
      }
      const before = doc.status;
      try {
        await this.applyEnrichedRowAndSaveWithRetry(ctx, doc, enriched);
        refreshed += 1;
        if (before !== doc.status) statusChanged += 1;
      } catch {
        failed += 1;
      }
    }

    if (refreshed > 0) {
      await this.auditEngine.log({
        entityType: 'preparation',
        entityId: docs[0]._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode: StationScope.require(ctx),
        changes: {
          action: 'refresh_ads_for_customer',
          customerCode,
          refreshed,
          statusChanged,
          failed,
        },
      });
    }

    return successResponse({ refreshed, statusChanged, failed });
  }

  /**
   * Re-enrich specific preparation rows from live ops + masters (used before
   * rebuilding linked invoice drafts). Safe no-op when ids are missing.
   */
  async refreshByIds(
    ctx: StationScopeContext,
    ids: string[],
    actor: BillingActor,
  ): Promise<{ refreshed: number; failed: number; total: number }> {
    const objectIds = [
      ...new Set(
        ids
          .map((id) => String(id ?? '').trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) {
      return { refreshed: 0, failed: 0, total: 0 };
    }

    const docs = await this.preparationModel
      .find(
        withPreparationVisibility({
          _id: { $in: objectIds },
          ...StationScope.filter({}, ctx),
        }),
      )
      .exec();
    if (docs.length === 0) {
      return { refreshed: 0, failed: 0, total: 0 };
    }

    const periodYmds = docs.flatMap((doc) =>
      [doc.billingPeriodStart, doc.billingPeriodEnd]
        .map((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : ''))
        .filter((ymd) => /^\d{4}-\d{2}-\d{2}$/.test(ymd)),
    );
    if (periodYmds.length > 0) {
      periodYmds.sort();
      try {
        await this.reloadOperationalSnapshotsFromSources(ctx, docs, {
          from: periodYmds[0],
          to: periodYmds[periodYmds.length - 1],
        });
      } catch {
        // Pricing still refreshes from the snapshot already on the preparation row.
      }
    }

    const enrichInputs = docs.map((doc) => this.toEnrichInput(doc));
    const enrichedRows = await this.enrichment.enrichBatch(ctx, enrichInputs);

    let refreshed = 0;
    let failed = 0;
    const ops: Array<{
      updateOne: {
        filter: { _id: Types.ObjectId };
        update: { $set: Record<string, unknown> };
      };
    }> = [];
    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      const enriched = enrichedRows[i];
      if (!doc || !enriched) {
        failed += 1;
        continue;
      }
      try {
        // Linked invoice rows are already invoiced. A per-row duplicate query
        // here is one round trip per flight (tens of thousands) and does not
        // change an invoiced status. Price, concession, and FX still update.
        const linked =
          doc.status === 'invoiced' ||
          doc.status === 'rejected' ||
          Boolean(doc.invoiceDraftId);
        if (linked) {
          this.applyEnrichedPricingInMemory(doc, enriched, { skipDuplicateCheck: true });
          doc.status = this.deriveStatusAfterRefresh(doc.validationResults, doc);
        } else {
          await this.applyEnrichedRowToDoc(ctx, doc, enriched);
        }
        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                customerCode: doc.customerCode,
                contractMatch: doc.contractMatch,
                rateMatch: doc.rateMatch,
                operationalSnapshot: doc.operationalSnapshot,
                validationResults: doc.validationResults,
                status: doc.status,
              },
            },
          },
        });
      } catch {
        failed += 1;
      }
    }

    const chunkSize = 500;
    for (let i = 0; i < ops.length; i += chunkSize) {
      try {
        await this.preparationModel.bulkWrite(ops.slice(i, i + chunkSize), {
          ordered: false,
        });
        refreshed += Math.min(chunkSize, ops.length - i);
      } catch {
        failed += Math.min(chunkSize, ops.length - i);
      }
    }

    if (refreshed > 0) {
      await this.auditEngine.log({
        entityType: 'preparation',
        entityId: docs[0]._id,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode: StationScope.require(ctx),
        changes: {
          action: 'refresh_by_ids',
          refreshed,
          failed,
          total: docs.length,
        },
      });
    }

    return { refreshed, failed, total: docs.length };
  }

  /** Re-apply enrichment and save; retry once on optimistic-lock VersionError. */
  private async applyEnrichmentAndSaveWithRetry(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
  ): Promise<boolean> {
    try {
      await this.applyEnrichmentAndValidation(ctx, doc);
      await doc.save();
      return true;
    } catch (err) {
      const name = String((err as { name?: string })?.name ?? '');
      if (name !== 'VersionError') throw err;
      const fresh = await this.preparationModel.findById(doc._id).exec();
      if (!fresh) return false;
      StationScope.assertOwnership(fresh, ctx);
      if (['rejected', 'invoiced'].includes(fresh.status)) return false;
      await this.applyEnrichmentAndValidation(ctx, fresh);
      await fresh.save();
      // Keep caller’s status-change check accurate when retry path used.
      doc.status = fresh.status;
      return true;
    }
  }

  private async applyEnrichedRowAndSaveWithRetry(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
    enriched: BillingSourceRow,
  ): Promise<void> {
    try {
      await this.applyEnrichedRowToDoc(ctx, doc, enriched);
      await doc.save();
    } catch (err) {
      const name = String((err as { name?: string })?.name ?? '');
      if (name !== 'VersionError') throw err;
      const fresh = await this.preparationModel.findById(doc._id).exec();
      if (!fresh) throw err;
      StationScope.assertOwnership(fresh, ctx);
      if (['rejected', 'invoiced'].includes(fresh.status)) return;
      const [reEnriched] = await this.enrichment.enrichBatch(ctx, [
        this.toEnrichInput(fresh),
      ]);
      if (!reEnriched) throw err;
      await this.applyEnrichedRowToDoc(ctx, fresh, reEnriched);
      await fresh.save();
      doc.status = fresh.status;
      doc.contractMatch = fresh.contractMatch;
      doc.rateMatch = fresh.rateMatch;
      doc.validationResults = fresh.validationResults;
      doc.operationalSnapshot = fresh.operationalSnapshot;
    }
  }

  private toEnrichInput(doc: BillingPreparationRecordDocument,
  ): EnrichSourceInput {
    const snapshot = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const sourceRef = doc.sourceRef as {
      serialNo?: string;
      flightNo?: string;
      usageRowId?: string;
      batchId?: string;
    };
    const existingRate = doc.rateMatch as { serviceCode?: string } | undefined;
    const serviceCode = defaultServiceCodeForSource(
      doc.sourceType,
      existingRate?.serviceCode,
    );
    return {
      sourceType: doc.sourceType,
      sourceRef,
      operationalData: snapshot,
      customerCode: doc.customerCode,
      serviceCode,
      billingDate: this.resolveRecordBillingDateYmd(doc, snapshot),
      cancelled: isBillingOperationalRowCancelled(
        snapshot,
        String(sourceRef.flightNo ?? snapshot.flightNoEquipmentNo ?? ''),
      ),
      atdDate:
        snapshot.atdDate instanceof Date
          ? snapshot.atdDate.toISOString()
          : (snapshot.atdDate as string | null | undefined),
    };
  }

  /**
   * Pull latest operational data from FHR / raw / ADS usage so flight fixes
   * (flight no, aircraft, cancellation, equipment lines) land in preparation.
   */
  private async reloadOperationalSnapshotsFromSources(
    ctx: StationScopeContext,
    docs: BillingPreparationRecordDocument[],
    query: ListPreparationQueryDto,
  ): Promise<number> {
    const fromYmd =
      reportDateYmd(query.from) ??
      (docs[0]?.billingPeriodStart
        ? docs[0].billingPeriodStart.toISOString().slice(0, 10)
        : '');
    const toYmd =
      reportDateYmd(query.to) ??
      (docs[0]?.billingPeriodEnd
        ? docs[0].billingPeriodEnd.toISOString().slice(0, 10)
        : fromYmd);
    if (!fromYmd || !toYmd) return 0;

    const serialNums = new Set<number>();
    const adsObjectIds: Types.ObjectId[] = [];

    for (const doc of docs) {
      const ref = doc.sourceRef as {
        serialNo?: string;
        usageRowId?: string;
      };
      const serial = Number(String(ref.serialNo ?? '').trim());
      if (Number.isFinite(serial) && serial > 0) serialNums.add(serial);

      const usageRowId = String(ref.usageRowId ?? '').trim();
      if (
        usageRowId &&
        Types.ObjectId.isValid(usageRowId) &&
        isAdsFamilySourceType(doc.sourceType)
      ) {
        adsObjectIds.push(new Types.ObjectId(usageRowId));
      }
    }

    const serialList = [...serialNums];
    const [fhrs, rawDocs, adsDocs, catalogItems] = await Promise.all([
      serialList.length
        ? this.fhrModel
            .find(StationScope.filter({ SerialNo: { $in: serialList } }, ctx))
            .lean()
        : Promise.resolve([]),
      serialList.length
        ? this.rawFlightModel
            .find({
              $or: [
                { 'data.Serial No': { $in: serialList.map(String) } },
                { 'data.SlNo': { $in: serialList.map(String) } },
                { 'data.serialNo': { $in: serialList.map(String) } },
                {
                  'data.SlNo': {
                    $in: serialList.filter((n) => Number.isFinite(n)),
                  },
                },
              ],
            })
            .lean()
        : Promise.resolve([]),
      adsObjectIds.length
        ? this.adsUsageModel.find({ _id: { $in: adsObjectIds } }).lean()
        : Promise.resolve([]),
      this.loadAdsCatalogItems(ctx),
    ]);

    const fhrBySerial = new Map<number, Record<string, unknown>>();
    for (const fhr of fhrs) {
      const n = Number((fhr as { SerialNo?: unknown }).SerialNo);
      if (Number.isFinite(n) && n > 0) {
        fhrBySerial.set(n, fhr as unknown as Record<string, unknown>);
      }
    }

    const rawBySerial = new Map<number, Record<string, unknown>>();
    for (const raw of rawDocs) {
      const data = ((raw as { data?: Record<string, unknown> }).data ??
        {}) as Record<string, unknown>;
      const n = Number(
        String(data['Serial No'] ?? data.SlNo ?? data.serialNo ?? '').trim(),
      );
      if (Number.isFinite(n) && n > 0 && !rawBySerial.has(n)) {
        rawBySerial.set(n, data);
      }
    }

    const adsById = new Map<string, Record<string, unknown>>();
    for (const doc of adsDocs) {
      adsById.set(String(doc._id), doc as unknown as Record<string, unknown>);
    }
    const catalog = buildAdsCatalogIndex(catalogItems);
    const fhrAdsRowsByUsageId = new Map<
      string,
      ReturnType<typeof mapFhrDocToAdsRows>[number]
    >();
    for (const fhr of fhrs) {
      const mapped = mapFhrDocToAdsRows(
        fhr as {
          SerialNo?: unknown;
          mainDetails?: Record<string, unknown> | null;
          terminalDetails?: Record<string, unknown> | null;
          rampDetails1?: Record<string, unknown> | null;
          equipmentDetails?: unknown;
          equipmentManpower?: Record<string, unknown> | null;
        },
        catalog,
        { fromYmd, toYmd },
      );
      for (const row of mapped) {
        const usageId = String(row.sourceRef.usageRowId ?? '').trim();
        if (usageId) fhrAdsRowsByUsageId.set(usageId, row);
      }
    }

    let updated = 0;
    for (const doc of docs) {
      const ref = (doc.sourceRef ?? {}) as {
        serialNo?: string;
        flightNo?: string;
        usageRowId?: string;
        batchId?: string;
      };
      const serial = Number(String(ref.serialNo ?? '').trim());
      const usageRowId = String(ref.usageRowId ?? '').trim();
      let changed = false;

      if (doc.sourceType === 'scheduled_flight' && Number.isFinite(serial) && serial > 0) {
        const fhr = fhrBySerial.get(serial);
        if (fhr) {
          const op = mapFhrToInvoicingFlightReportRow(
            serial,
            fhr,
            rawBySerial.get(serial),
          ) as Record<string, unknown>;
          const prev = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
          doc.operationalSnapshot = {
            ...prev,
            ...op,
            billingDateYmd:
              reportDateYmd(op.billingDateYmd) ??
              reportDateYmd(op.atdDate) ??
              reportDateYmd(op.staDate) ??
              prev.billingDateYmd,
          };
          doc.markModified('operationalSnapshot');
          const flightNo = String(op.flightNoEquipmentNo ?? '').trim();
          if (flightNo) ref.flightNo = flightNo;
          const customer = this.normalizeCustomerCode(
            op.customerCode ?? prev.customerCode,
          );
          if (customer) doc.customerCode = customer;
          doc.sourceRef = ref;
          doc.markModified('sourceRef');
          changed = true;
        }
      } else if (isAdsFamilySourceType(doc.sourceType)) {
        if (usageRowId && Types.ObjectId.isValid(usageRowId) && adsById.has(usageRowId)) {
          const adsDoc = adsById.get(usageRowId) as Record<string, unknown>;
          const prev = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
          doc.operationalSnapshot = { ...prev, ...adsDoc };
          doc.markModified('operationalSnapshot');
          const flightNo = String(
            adsDoc.flightNo ?? adsDoc.flightNoEquipmentNo ?? '',
          ).trim();
          if (flightNo) ref.flightNo = flightNo;
          doc.sourceRef = ref;
          doc.markModified('sourceRef');
          changed = true;
        } else if (usageRowId && fhrAdsRowsByUsageId.has(usageRowId)) {
          const mapped = fhrAdsRowsByUsageId.get(usageRowId)!;
          const prev = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
          doc.operationalSnapshot = {
            ...prev,
            ...mapped.operationalData,
          };
          doc.markModified('operationalSnapshot');
          if (mapped.sourceRef.flightNo) ref.flightNo = mapped.sourceRef.flightNo;
          if (mapped.customerCode) {
            doc.customerCode = this.normalizeCustomerCode(mapped.customerCode);
          }
          doc.sourceRef = { ...ref, ...mapped.sourceRef };
          doc.markModified('sourceRef');
          changed = true;
        } else if (Number.isFinite(serial) && serial > 0 && fhrBySerial.has(serial)) {
          const fhr = fhrBySerial.get(serial)!;
          const main = (fhr.mainDetails ?? {}) as Record<string, unknown>;
          const flightNo = String(
            mapFhrToInvoicingFlightReportRow(serial, fhr).flightNoEquipmentNo ?? '',
          ).trim();
          const prev = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
          if (flightNo && flightNo !== String(prev.flightNo ?? prev.flightNoEquipmentNo ?? '')) {
            doc.operationalSnapshot = {
              ...prev,
              flightNo,
              flightNoEquipmentNo: flightNo,
              customerCode:
                this.normalizeCustomerCode(
                  main.Arline_Code ?? main.airlineCode ?? prev.customerCode,
                ) || prev.customerCode,
              aircraftType:
                String(main.TypeCraft ?? main.typeCraft ?? prev.aircraftType ?? '',
                ).trim() ||
                prev.aircraftType,
            };
            doc.markModified('operationalSnapshot');
            ref.flightNo = flightNo;
            doc.sourceRef = ref;
            doc.markModified('sourceRef');
            changed = true;
          }
        }
      }

      if (changed) updated += 1;
    }

    return updated;
  }

  private async loadAdsCatalogItems(ctx: StationScopeContext): Promise<
    Array<{
      abbr: string;
      description: string;
      unit_type: string;
      category: string;
    }>
  > {
    try {
      const col = this.connection.collection('equipmentManpower');
      const doc = await col.findOne(
        StationScope.filter(
          {
            serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
            isEquipmentManpowerCatalog: true,
          },
          ctx,
        ),
        { projection: { catalogItems: 1 } },
      );
      const raw = doc?.catalogItems;
      if (!Array.isArray(raw) || raw.length === 0) return [];
      return raw.map((row) => ({
        abbr: String((row as { abbr?: unknown }).abbr ?? '').trim(),
        description: String((row as { description?: unknown }).description ?? '',
        ).trim(),
        unit_type: String((row as { unit_type?: unknown }).unit_type ?? '',
        ).trim(),
        category: String((row as { category?: unknown }).category ?? '').trim(),
      }));
    } catch {
      return [];
    }
  }

  async updateChecklist(
    ctx: StationScopeContext,
    id: string,
    dto: UpdatePreparationChecklistDto,
    actor: BillingActor,
  ) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (['invoiced', 'rejected'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot update checklist for record in status "${doc.status}"`,
      );
    }

    if (dto.manualOverrides !== undefined) {
      doc.manualOverrides = dto.manualOverrides;
      doc.markModified('manualOverrides');
    }
    if (dto.customChecks !== undefined) {
      doc.customChecks = dto.customChecks;
      doc.markModified('customChecks');
    }
    if (dto.cancellationBilling !== undefined) {
      const enabled = Boolean(dto.cancellationBilling.enabled);
      const rawPercent = Number(dto.cancellationBilling.bhsChargeablePercent ?? 0,
      );
      const boundedPercent = Number.isFinite(rawPercent)
        ? Math.max(0, Math.min(100, rawPercent))
        : 0;
      if (enabled && boundedPercent <= 0) {
        throw new BadRequestException(
          'BHS chargeable percent must be greater than 0 when cancelled billing is enabled',
        );
      }
      doc.cancellationBilling = {
        enabled,
        bhsChargeablePercent: enabled ? boundedPercent : 0,
      };
      doc.markModified('cancellationBilling');
    }

    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { action: 'checklist_updated' },
    });

    return successResponse(doc.toObject());
  }

  async sendBack(
    ctx: StationScopeContext,
    id: string,
    dto: SendBackPreparationDto,
    actor: BillingActor,
  ) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (doc.status !== 'ready_for_invoice') {
      throw new BadRequestException(
        'Only ready-for-invoice rows can be sent back to a checkpoint',
      );
    }
    if (doc.invoiceDraftId) {
      throw new BadRequestException(
        'This row is linked to an invoice draft — use the draft page to coordinate changes',
      );
    }

    const validationResults = await this.revalidateRecord(ctx, doc);
    doc.validationResults = validationResults;
    doc.status = dto.targetStatus;
    this.appendWorkflowNote(
      doc,
      {
        body:
          dto.reason?.trim() ||
          `Sent back to ${dto.targetStatus.replace(/_/g, ' ')} for rework`,
        audience: 'all',
        context: `send_back:${dto.targetStatus}`,
      },
      actor,
    );

    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { action: 'send_back', targetStatus: dto.targetStatus },
    });

    return successResponse(doc.toObject());
  }

  async addRemark(
    ctx: StationScopeContext,
    id: string,
    dto: AddPreparationRemarkDto,
    actor: BillingActor,
  ) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (doc.status === 'rejected') {
      throw new BadRequestException('Cannot add remarks to rejected records');
    }

    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Remark cannot be empty');
    }

    this.appendWorkflowNote(
      doc,
      {
        body,
        audience: dto.audience,
        directedToUserId: dto.directedToUserId?.trim() || undefined,
        directedToUserName: dto.directedToUserName?.trim() || undefined,
        context: 'remark',
      },
      actor,
    );

    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { action: 'remark_added', audience: dto.audience },
    });

    return successResponse(doc.toObject());
  }

  async reject(
    ctx: StationScopeContext,
    id: string,
    dto: RejectPreparationDto,
    actor: BillingActor,
  ) {
    const doc = await this.getOwnedDoc(ctx, id);
    if (!['pending', 'validation_error', 'eligible'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot reject record in status "${doc.status}"`,
      );
    }

    doc.status = 'rejected';
    if (dto.reason) {
      doc.validationResults = [
        ...doc.validationResults,
        {
          rule: 'finance_rejected',
          passed: false,
          message: dto.reason,
        },
      ];
    }
    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'rejected',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { reason: dto.reason },
    });

    return successResponse(doc.toObject());
  }

  async markReady(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor) {
    const doc = await this.getOwnedDoc(ctx, id);

    if (this.canFastMarkReady(doc)) {
      return this.fastMarkReady(doc, actor);
    }

    await this.applyEnrichmentAndValidation(ctx, doc);

    if (!allChecklistConfirmed(doc)) {
      await doc.save();
      throw new BadRequestException(
        'Complete every item on the billing readiness checklist before marking ready',
      );
    }

    if (!['pending', 'eligible', 'validation_error'].includes(doc.status)) {
      throw new BadRequestException(
        `Cannot mark ready from status "${doc.status}"`,
      );
    }

    if (!this.validationEngine.allPassed(this.validationResultsForReadiness(doc))) {
      await doc.save();
      throw new BadRequestException(
        'Validation must pass before marking ready — use Refresh to re-check contract and rate matches',
      );
    }

    return this.fastMarkReady(doc, actor);
  }

  async bulkReadyByFilter(
    ctx: StationScopeContext,
    dto: BulkReadyByFilterPreparationDto,
    actor: BillingActor,
  ) {
    const filter: Record<string, unknown> = StationScope.filter(
      { status: dto.status },
      ctx,
    );
    if (dto.customerCode?.trim()) {
      filter.customerCode = dto.customerCode.trim().toUpperCase();
    }
    if (dto.from || dto.to) {
      const period: Record<string, Date> = {};
      if (dto.from) period.$gte = preparationPeriodBoundStart(dto.from);
      if (dto.to) period.$lte = preparationPeriodBoundEnd(dto.to);
      filter.billingPeriodStart = period;
    }

    const idDocs = await this.preparationModel
      .find(withPreparationVisibility(filter))
      .select('_id')
      .lean();
    return this.bulkReady(
      ctx,
      { ids: idDocs.map((doc) => String(doc._id)) },
      actor,
    );
  }

  async bulkReady(
    ctx: StationScopeContext,
    dto: BulkReadyPreparationDto,
    actor: BillingActor,
  ) {
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))];
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    if (ids.length === 0) {
      return successResponse({ succeeded: 0, failed: 0, results });
    }

    const docs = await this.preparationModel
      .find(
        withPreparationVisibility({
          _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
          ...StationScope.filter({}, ctx),
        }),
      )
      .select(
        'status validationResults manualOverrides customChecks cancellationBilling sourceType contractMatch rateMatch operationalSnapshot sourceRef customerCode',
      )
      .exec();

    const docById = new Map(docs.map((doc) => [String(doc._id), doc]));
    const fastIds: Types.ObjectId[] = [];
    const slowIds: string[] = [];

    for (const id of ids) {
      const doc = docById.get(id);
      if (!doc) {
        results.push({ id, ok: false, message: 'Preparation record not found' });
        continue;
      }
      if (this.canFastMarkReady(doc)) {
        fastIds.push(doc._id as Types.ObjectId);
      } else {
        slowIds.push(id);
      }
    }

    if (fastIds.length > 0) {
      await withBillingTransaction(this.connection, async (session, afterCommit) => {
        await this.preparationModel.updateMany(
          { _id: { $in: fastIds } },
          { $set: { status: 'ready_for_invoice' } },
          { session },
        );
        const stationCode = StationScope.require(ctx);
        await this.auditEngine.logBulk(
          fastIds.map((entityId) => ({
            entityType: 'preparation',
            entityId,
            action: 'updated',
            userId: actor.userId,
            userName: actor.userName,
            actor,
            stationCode,
            changes: { status: 'ready_for_invoice', bulkReady: true },
          })),
          { session, afterCommit },
        );
      });
      for (const entityId of fastIds) {
        results.push({ id: String(entityId), ok: true });
      }
    }

    if (slowIds.length > 0) {
      const slowDocs = slowIds
        .map((id) => docById.get(id))
        .filter(Boolean) as BillingPreparationRecordDocument[];
      const enrichedRows = await this.enrichment.enrichBatch(
        ctx,
        slowDocs.map((doc) => this.toEnrichInput(doc)),
      );
      for (let i = 0; i < slowDocs.length; i += 1) {
        const doc = slowDocs[i];
        const id = String(doc._id);
        try {
          await this.applyEnrichedRowToDoc(ctx, doc, enrichedRows[i]);
          if (!allChecklistConfirmed(doc)) {
            await doc.save();
            results.push({
              id,
              ok: false,
              message:
                'Complete every item on the billing readiness checklist before marking ready',
            });
            continue;
          }
          if (!['pending', 'eligible', 'validation_error'].includes(doc.status)) {
            results.push({
              id,
              ok: false,
              message: `Cannot mark ready from status "${doc.status}"`,
            });
            continue;
          }
          if (
            !this.validationEngine.allPassed(
              this.validationResultsForReadiness(doc),
            )
          ) {
            await doc.save();
            results.push({
              id,
              ok: false,
              message:
                'Validation must pass before marking ready — use Refresh to re-check contract and rate matches',
            });
            continue;
          }
          await this.fastMarkReady(doc, actor);
          results.push({ id, ok: true });
        } catch (e) {
          results.push({
            id,
            ok: false,
            message: this.httpExceptionMessage(e),
          });
        }
      }
    }

    return successResponse({
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  }

  private httpExceptionMessage(err: unknown): string {
    if (err instanceof BadRequestException) {
      const res = err.getResponse();
      if (typeof res === 'string') return res;
      if (res && typeof res === 'object' && 'message' in res) {
        const msg = (res as { message?: string | string[] }).message;
        if (Array.isArray(msg)) return msg.join(' ');
        if (typeof msg === 'string' && msg.trim()) return msg;
      }
    }
    return err instanceof Error ? err.message : 'Failed';
  }

  private canFastMarkReady(doc: BillingPreparationRecordDocument): boolean {
    if (!['pending', 'eligible', 'validation_error'].includes(doc.status)) {
      return false;
    }
    if (!allChecklistConfirmed(doc)) return false;
    if (!this.validationEngine.allPassed(this.validationResultsForReadiness(doc))) {
      return false;
    }
    return true;
  }

  private async fastMarkReady(
    doc: BillingPreparationRecordDocument,
    actor: BillingActor,
  ) {
    doc.status = 'ready_for_invoice';
    await doc.save();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { status: 'ready_for_invoice' },
    });

    return successResponse(doc.toObject());
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.getOwnedDoc(ctx, id);

    if (doc.invoiceId) {
      throw new BadRequestException(
        'Cannot unsend — preparation is linked to a final invoice',
      );
    }

    if (doc.invoiceDraftId) {
      await this.invoiceDraftsService.detachPreparationsForUnsend(ctx, [doc], actor,
      );
      return successResponse({ deleted: true });
    }

    if (doc.status === 'invoiced') {
      throw new BadRequestException('Cannot delete invoiced preparation records',
      );
    }

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'preparation',
      entityId: snapshot._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: {
        deleted: true,
        status: snapshot.status,
        sourceType: snapshot.sourceType,
        sourceRef: snapshot.sourceRef,
      },
    });

    return successResponse({ deleted: true });
  }

  /**
   * Remove preparation rows by operational source identity (e.g. scheduled flight serial).
   * Used from operational source pages to "unsend" flights back to the intake queue.
   */
  async unsendBySource(
    ctx: StationScopeContext,
    dto: UnsendPreparationBySourceDto,
    actor: BillingActor,
  ) {
    const periodStart = new Date(dto.billingPeriodStart);
    const serials = [
      ...new Set((dto.serialNos ?? []).map((s) => String(s).trim()).filter(Boolean)),
    ];
    const usageRowIds = [
      ...new Set((dto.usageRowIds ?? []).map((s) => String(s).trim()).filter(Boolean)),
    ];
    if (serials.length === 0 && usageRowIds.length === 0) {
      throw new BadRequestException(
        'At least one serial number or usage row id is required',
      );
    }

    const identityFilter: Array<Record<string, unknown>> = [];
    if (usageRowIds.length > 0) {
      identityFilter.push({ 'sourceRef.usageRowId': { $in: usageRowIds } });
    }
    if (serials.length > 0) {
      identityFilter.push({ 'sourceRef.serialNo': { $in: serials } });
    }

    const docs = await this.preparationModel
      .find(
        withPreparationVisibility(
          StationScope.filter(
            {
              sourceType:
                dto.sourceType === 'ads'
                  ? { $in: ['ads', 'equipment', 'manpower', 'cleaning'] }
                  : dto.sourceType,
              billingPeriodStart: periodStart,
              status: { $nin: ['rejected'] },
              $or: identityFilter,
            },
            ctx,
          ),
        ),
      )
      .exec();

    const foundSerials = new Set(
      docs
        .map((doc) =>
          String(
            (doc.sourceRef as { serialNo?: string } | undefined)?.serialNo ?? '',
          ).trim(),
        )
        .filter(Boolean),
    );
    const foundUsageIds = new Set(
      docs
        .map((doc) =>
          String(
            (doc.sourceRef as { usageRowId?: string } | undefined)?.usageRowId ??
              '',
          ).trim(),
        )
        .filter(Boolean),
    );

    let unsent = 0;
    const failed: Array<{ serialNo: string; message: string }> = [];

    if (usageRowIds.length > 0) {
      for (const usageRowId of usageRowIds) {
        if (!foundUsageIds.has(usageRowId)) {
          failed.push({
            serialNo: usageRowId,
            message: 'Not in preparation for this period',
          });
        }
      }
    } else {
      for (const serialNo of serials) {
        if (!foundSerials.has(serialNo)) {
          failed.push({
            serialNo,
            message: 'Not in preparation for this period',
          });
        }
      }
    }

    const standalone: BillingPreparationRecordDocument[] = [];
    const byDraft = new Map<string, BillingPreparationRecordDocument[]>();

    for (const doc of docs) {
      if (doc.invoiceDraftId) {
        const draftKey = String(doc.invoiceDraftId);
        const group = byDraft.get(draftKey) ?? [];
        group.push(doc);
        byDraft.set(draftKey, group);
      } else {
        standalone.push(doc);
      }
    }

    const unsentSerialNos: string[] = [];
    const unsentUsageRowIds: string[] = [];

    const trackUnsent = (doc: BillingPreparationRecordDocument) => {
      const ref = doc.sourceRef as
        | { serialNo?: string; usageRowId?: string }
        | undefined;
      const serialNo = String(ref?.serialNo ?? '').trim();
      const usageRowId = String(ref?.usageRowId ?? '').trim();
      if (serialNo) unsentSerialNos.push(serialNo);
      if (usageRowId) unsentUsageRowIds.push(usageRowId);
    };

    // Fast path: batch-delete standalone (no draft) records in ONE query instead
    // of N sequential this.remove() calls (each did a redundant find + delete +
    // audit — hundreds of ADS rows stalled the request). Invoice-linked rows are
    // still blocked, matching remove()'s guard.
    const removableStandalone: BillingPreparationRecordDocument[] = [];
    for (const doc of standalone) {
      if (doc.invoiceId || doc.status === 'invoiced') {
        const ref = doc.sourceRef as
          | { serialNo?: string; usageRowId?: string }
          | undefined;
        failed.push({
          serialNo:
            String(ref?.usageRowId ?? '').trim() ||
            String(ref?.serialNo ?? '').trim() ||
            doc._id.toString(),
          message: 'Cannot unsend — preparation is linked to a final invoice',
        });
        continue;
      }
      removableStandalone.push(doc);
    }

    if (removableStandalone.length > 0) {
      const ids = removableStandalone.map((doc) => doc._id);
      await this.preparationModel
        .deleteMany(StationScope.filter({ _id: { $in: ids } }, ctx))
        .exec();
      unsent += removableStandalone.length;
      for (const doc of removableStandalone) trackUnsent(doc);
      // Audit each deletion, but in parallel — never serialise the response.
      await Promise.allSettled(
        removableStandalone.map((doc) => {
          const snapshot = doc.toObject();
          return this.auditEngine.log({
            entityType: 'preparation',
            entityId: snapshot._id,
            action: 'cancelled',
            userId: actor.userId,
            userName: actor.userName,
            actor,
            stationCode: doc.stationCode,
            changes: { deleted: true, record: snapshot },
          });
        }),
      );
    }

    for (const [, draftDocs] of byDraft) {
      try {
        const detachResult =
          await this.invoiceDraftsService.detachPreparationsForUnsend(
            ctx,
            draftDocs,
            actor,
          );
        unsent += detachResult.deletedCount;
        const detachedIds = new Set(detachResult.deletedIds);
        for (const doc of draftDocs) {
          if (detachedIds.has(String(doc._id))) {
            trackUnsent(doc);
            continue;
          }
          const ref = doc.sourceRef as
            | { serialNo?: string; usageRowId?: string }
            | undefined;
          failed.push({
            serialNo:
              String(ref?.usageRowId ?? '').trim() ||
              String(ref?.serialNo ?? '').trim() ||
              doc._id.toString(),
            message: 'Unsend failed',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unsend failed';
        for (const doc of draftDocs) {
          const ref = doc.sourceRef as
            | { serialNo?: string; usageRowId?: string }
            | undefined;
          failed.push({
            serialNo:
              String(ref?.usageRowId ?? '').trim() ||
              String(ref?.serialNo ?? '').trim() ||
              doc._id.toString(),
            message,
          });
        }
      }
    }

    return successResponse({
      unsent,
      failed,
      requested: usageRowIds.length > 0 ? usageRowIds.length : serials.length,
      unsentSerialNos: [...new Set(unsentSerialNos)],
      unsentUsageRowIds: [...new Set(unsentUsageRowIds)],
    });
  }

  async bulkDeleteByFilter(
    ctx: StationScopeContext,
    dto: BulkDeleteByFilterPreparationDto,
    actor: BillingActor,
  ) {
    const filter: Record<string, unknown> = StationScope.filter(
      { status: dto.status, sourceType: { $ne: 'custom' } },
      ctx,
    );
    if (dto.customerCode?.trim()) {
      filter.customerCode = dto.customerCode.trim().toUpperCase();
    }
    if (dto.from || dto.to) {
      const period: Record<string, Date> = {};
      if (dto.from) period.$gte = this.periodBoundStart(dto.from);
      if (dto.to) period.$lte = this.periodBoundEnd(dto.to);
      filter.billingPeriodStart = period;
    }

    const idDocs = await this.preparationModel
      .find(withPreparationVisibility(filter))
      .select('_id')
      .lean();
    const ids = idDocs.map((doc) => String(doc._id));
    if (ids.length === 0) {
      return successResponse({
        deleted: 0,
        failed: [],
        failedCount: 0,
        requested: 0,
      });
    }

    // Chunk so a huge tab (10k+ lines) stays within memory / Mongo $in comfort.
    const CHUNK = 2000;
    let deleted = 0;
    const failed: Array<{ id: string; message: string }> = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const res = await this.bulkDelete(ctx, { ids: chunk }, actor);
      const data = (res as { data?: { deleted?: number; failed?: Array<{ id: string; message: string }> } })
        .data;
      deleted += data?.deleted ?? 0;
      failed.push(...(data?.failed ?? []));
    }

    return successResponse({
      deleted,
      failed: failed.slice(0, 100),
      failedCount: failed.length,
      requested: ids.length,
    });
  }

  async bulkDelete(
    ctx: StationScopeContext,
    dto: BulkDeletePreparationDto,
    actor: BillingActor,
  ) {
    const uniqueIds = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean)),
    ];
    let deleted = 0;
    const failed: Array<{ id: string; message: string }> = [];

    if (uniqueIds.length === 0) {
      return successResponse({ deleted: 0, failed, requested: 0 });
    }

    const validIds = uniqueIds.filter((id) => {
      if (Types.ObjectId.isValid(id)) return true;
      failed.push({ id, message: 'Invalid preparation record id' });
      return false;
    });
    // Lean + projected — never load operationalSnapshot / validationResults for bulk delete.
    type PrepDeleteLean = {
      _id: Types.ObjectId;
      stationCode?: string;
      status?: string;
      sourceType?: string;
      customerCode?: string;
      customerName?: string;
      sourceRef?: Record<string, unknown>;
      invoiceId?: Types.ObjectId;
      invoiceDraftId?: Types.ObjectId;
    };
    const docs = (await this.preparationModel
      .find(
        withPreparationVisibility({
          _id: { $in: validIds.map((id) => new Types.ObjectId(id)) },
          ...StationScope.filter({}, ctx),
        }),
      )
      .select(
        '_id stationCode status sourceType customerCode customerName sourceRef invoiceId invoiceDraftId',
      )
      .lean()
      .exec()) as PrepDeleteLean[];

    const docById = new Map(docs.map((doc) => [String(doc._id), doc]));
    const simpleDelete: PrepDeleteLean[] = [];
    const byDraft = new Map<string, PrepDeleteLean[]>();
    const successfulSnapshots: PrepDeleteLean[] = [];

    for (const id of validIds) {
      const doc = docById.get(id);
      if (!doc) {
        failed.push({ id, message: 'Preparation record not found' });
        continue;
      }
      if (doc.invoiceId) {
        failed.push({
          id,
          message: 'Cannot delete — preparation is linked to a final invoice',
        });
        continue;
      }
      if (doc.status === 'invoiced') {
        failed.push({ id, message: 'Cannot delete invoiced preparation records',
        });
        continue;
      }
      if (doc.invoiceDraftId) {
        const draftKey = String(doc.invoiceDraftId);
        const group = byDraft.get(draftKey) ?? [];
        group.push(doc);
        byDraft.set(draftKey, group);
      } else {
        simpleDelete.push(doc);
      }
    }

    if (simpleDelete.length > 0) {
      const deleteIds = simpleDelete.map((doc) => doc._id);
      const result = await this.preparationModel.deleteMany({
        _id: { $in: deleteIds },
      });
      const deletedCount = result.deletedCount ?? 0;
      const remaining = await this.preparationModel
        .find({ _id: { $in: deleteIds } })
        .select('_id')
        .lean();
      const remainingIds = new Set(remaining.map((doc) => String(doc._id)));
      const deletedDocs = simpleDelete.filter(
        (doc) => !remainingIds.has(String(doc._id)),
      );
      const stationCode = StationScope.require(ctx);
      // One aggregate audit row — per-row cancelled audits previously bloated `billing`
      // (~100MB) and made large deletes timeout / starve list GETs.
      if (deletedDocs.length > 0) {
        const first = deletedDocs[0];
        await this.auditEngine.log({
          entityType: 'preparation',
          entityId: first._id,
          action: 'cancelled',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: first.stationCode ?? stationCode,
          changes: {
            deleted: true,
            bulkDelete: true,
            deletedCount: deletedDocs.length,
            sampleIds: deletedDocs.slice(0, 25).map((doc) => String(doc._id)),
            sourceTypes: [
              ...new Set(
                deletedDocs
                  .map((doc) => String(doc.sourceType ?? '').trim())
                  .filter(Boolean),
              ),
            ],
          },
        });
      }
      deleted += deletedCount;
      successfulSnapshots.push(...deletedDocs);
      for (const doc of simpleDelete.filter((item) =>
        remainingIds.has(String(item._id)),
      )) {
        failed.push({
          id: String(doc._id),
          message: 'Preparation record was not deleted',
        });
      }
    }

    for (const [, draftDocs] of byDraft) {
      try {
        // Re-hydrate minimal mongoose docs for detach (needs .deleteOne / draft rebuild).
        const hydrated = await this.preparationModel
          .find({
            _id: { $in: draftDocs.map((doc) => doc._id) },
            ...StationScope.filter({}, ctx),
          })
          .select(
            '_id stationCode status sourceType customerCode customerName sourceRef invoiceId invoiceDraftId operationalSnapshot',
          )
          .exec();
        const detachResult =
          await this.invoiceDraftsService.detachPreparationsForUnsend(
            ctx,
            hydrated,
            actor,
            { aggregateAudit: true },
          );
        deleted += detachResult.deletedCount;
        const detachedIds = new Set(detachResult.deletedIds);
        successfulSnapshots.push(
          ...draftDocs.filter((doc) => detachedIds.has(String(doc._id))),
        );
        for (const doc of draftDocs.filter(
          (item) => !detachedIds.has(String(item._id)),
        )) {
          failed.push({
            id: String(doc._id),
            message: 'Preparation record was not deleted',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        for (const doc of draftDocs) {
          failed.push({ id: String(doc._id), message });
        }
      }
    }

    if (deleted > 0) {
      const stationCode = StationScope.require(ctx);
      const tab = preparationActivityTab(successfulSnapshots);
      this.auditEngine.emitActivity(
        buildPreparationAggregateActivity({
          actor,
          action: 'Bulk deleted billing preparation records',
          summary: `${actor.userName} deleted ${deleted} billing preparation record(s).`,
          stationCode,
          method: 'DELETE',
          path: '/billing/preparation/bulk',
          page: 'Preparation',
          tab,
          metadata: buildPreparationAggregateMetadata({
            affected: successfulSnapshots,
            failures: failed,
            counts: {
              requested: uniqueIds.length,
              deleted,
              skipped: 0,
              failed: failed.length,
            },
            page: 'Preparation',
            tab,
            scope: {
              stationCode,
              requestedIds: uniqueIds.length,
            },
          }),
        }),
      );
    }

    return successResponse({
      deleted,
      failed: failed.slice(0, 100),
      failedCount: failed.length,
      requested: uniqueIds.length,
    });
  }

  private async countByStatus(ctx: StationScopeContext) {
    const base = withPreparationVisibility(StationScope.filter({}, ctx));
    return this.countByStatusScoped(base);
  }

  private async countByStatusScoped(
    scopeFilter: Record<string, unknown>,
  ): Promise<Record<string, number>> {
    const grouped = await this.preparationModel.aggregate<{ _id: string; count: number;
    }>([
      // Custom bills have their own Preparation tab — keep status badges BHS/ADS-clean.
      { $match: { ...scopeFilter, sourceType: { $ne: 'custom' } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result = Object.fromEntries(
      PREPARATION_STATUSES.map((status) => [status, 0]),
    );
    for (const row of grouped) {
      if (
        row._id &&
        PREPARATION_STATUSES.includes(row._id as (typeof PREPARATION_STATUSES)[number],
        )
      ) {
        result[row._id] = row.count;
      }
    }
    return result;
  }

  private async getOwnedDoc(ctx: StationScopeContext, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Preparation record not found');
    }
    const doc = await this.preparationModel.findById(id);
    if (!doc) throw new NotFoundException('Preparation record not found');
    StationScope.assertOwnership(doc, ctx);
    if (!preparationRowVisibleToCurrentUser(doc.ownerUserId)) {
      throw new NotFoundException('Preparation record not found');
    }
    return doc;
  }

  private async loadExistingIngestKeys(
    ctx: StationScopeContext,
    rows: IngestRow[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, { status: string; invoiceDraftId?: string }>> {
    if (rows.length === 0) return new Map();

    const sourceTypes = [
      ...new Set(rows.flatMap((r) => ingestCategorySourceTypes(r.sourceType))),
    ];
    if (sourceTypes.length === 0) return new Map();

    const usageIds = [
      ...new Set(
        rows.map((r) => String(r.sourceRef.usageRowId ?? '').trim()).filter(Boolean),
      ),
    ];
    const serials = [
      ...new Set(
        rows
          .map((r) =>
            String(
              r.sourceRef.serialNo ??
                (r.operationalData as { serialNumber?: unknown })?.serialNumber ??
                '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];
    const identityFilter: Array<Record<string, unknown>> = [];
    if (usageIds.length > 0) {
      identityFilter.push({ 'sourceRef.usageRowId': { $in: usageIds } });
    }
    if (serials.length > 0) {
      identityFilter.push({ 'sourceRef.serialNo': { $in: serials } });
    }
    if (identityFilter.length === 0) return new Map();

    const existing = await this.preparationModel
      .find(
        withPreparationSentMarker(
          StationScope.filter(
            {
              sourceType: { $in: sourceTypes },
              billingPeriodStart: { $gte: periodStart, $lte: periodEnd },
              status: { $nin: ['rejected'] },
              $or: identityFilter,
            },
            ctx,
          ),
        ),
      )
      .select('sourceType sourceRef operationalSnapshot status invoiceDraftId')
      .lean();

    const keys = new Map<string, { status: string; invoiceDraftId?: string }>();
    for (const doc of existing) {
      const key = ingestDedupeKey({
        sourceType: String(doc.sourceType ?? ''),
        sourceRef: doc.sourceRef as PreparationSourceLike['sourceRef'],
        operationalSnapshot: (doc.operationalSnapshot ?? {}) as Record<
          string,
          unknown
        >,
      });
      const draftId = (doc as { invoiceDraftId?: unknown }).invoiceDraftId;
      keys.set(key, {
        status: String(doc.status ?? 'pending'),
        invoiceDraftId: draftId ? String(draftId) : undefined,
      });
    }
    return keys;
  }

  private async isDuplicate(
    ctx: StationScopeContext,
    row: IngestRow,
    periodStart: Date,
  ) {
    const base = StationScope.filter(
      {
        sourceType: { $in: ingestCategorySourceTypes(row.sourceType) },
        billingPeriodStart: periodStart,
        status: { $nin: ['rejected'] },
      },
      ctx,
    );

    if (row.sourceRef.usageRowId) {
      return Boolean(
        await this.preparationModel.exists({
          ...base,
          'sourceRef.usageRowId': row.sourceRef.usageRowId,
        }),
      );
    }

    const serial = String(
      row.sourceRef.serialNo ?? row.operationalData?.serialNumber ?? '',
    ).trim();
    if (!serial) return false;

    return Boolean(
      await this.preparationModel.exists({
        ...base,
        'sourceRef.serialNo': serial,
      }),
    );
  }

  private isRowCancelled(row: IngestRow): boolean {
    const snapshot = row.operationalData ?? {};
    const flightNo = String(
      row.sourceRef?.flightNo ?? snapshot.flightNoEquipmentNo ?? '',
    );
    return isBillingOperationalRowCancelled(snapshot, flightNo);
  }

  private cancellationValidationResult(row: IngestRow): ValidationResult {
    const cancelled = this.isRowCancelled(row);
    return cancelled
      ? {
          rule: 'not_cancelled',
          passed: false,
          message: 'Cancelled flights are excluded from billing',
        }
      : {
          rule: 'not_cancelled',
          passed: true,
          message: 'Active movement',
        };
  }

  private buildValidationResults(
    row: IngestRow,
    isDuplicate: boolean,
    billingPeriodStart?: Date,
    billingPeriodEnd?: Date,
  ): ValidationResult[] {
    const fromClient = (
      row.validationResults ??
      row.validationStatus?.errors ??
      []
    ).filter((result) => result.rule !== 'not_cancelled');
    const hasValidClientResults =
      fromClient.length > 0 &&
      fromClient.every((r) => typeof r.passed === 'boolean');

    if (hasValidClientResults) {
      const duplicateRule = this.validationEngine.validateDuplicate(isDuplicate);
      const invoiceLineRules = this.invoiceLineRulesFromIngestRow(
        row,
        billingPeriodStart,
        billingPeriodEnd,
      );
      const merged = this.validationEngine.merge(fromClient, invoiceLineRules, [
        duplicateRule,
        this.cancellationValidationResult(row),
      ]);
      const byRule = new Map<string, ValidationResult>();
      for (const r of merged) byRule.set(r.rule, r);
      return this.stripInapplicableValidationRules(row.sourceType, [
        ...byRule.values(),
      ]);
    }

    return this.buildValidationResultsFromRow(
      row,
      isDuplicate,
      billingPeriodStart,
      billingPeriodEnd,
    );
  }

  private buildValidationResultsFromRow(
    row: IngestRow,
    isDuplicate: boolean,
    billingPeriodStart?: Date,
    billingPeriodEnd?: Date,
  ): ValidationResult[] {
    const snapshot = row.operationalData ?? {};
    const sourceRef = row.sourceRef ?? {};
    const isCustom = String(row.sourceType ?? '').trim().toLowerCase() === 'custom';

    const flightRules = this.validationEngine.validateFlightReadiness({
      serialNo:
        sourceRef.serialNo ?? String(snapshot.serialNumber ?? snapshot.serialNo ?? ''),
      atdDate: snapshot.atdDate as string | Date | null | undefined,
      cancelled: this.isRowCancelled(row),
    });

    // Custom bills: rates entered later on Preparation → Custom form — skip contract/rate gates.
    if (isCustom) {
      const invoiceLineRules = this.invoiceLineRulesFromIngestRow(
        row,
        billingPeriodStart,
        billingPeriodEnd,
      );
      const merged = this.validationEngine.merge(flightRules, invoiceLineRules, [
        this.validationEngine.validateDuplicate(isDuplicate),
      ]);
      const byRule = new Map<string, ValidationResult>();
      for (const r of merged) byRule.set(r.rule, r);
      return [...byRule.values()];
    }

    const isRaf = String(row.sourceType ?? '').trim().toLowerCase() === 'raf';
    const rateRules = this.validationEngine.validateContractAndRate({
      hasContract: isRaf ? true : Boolean(row.contractMatch?.matched),
      hasRate: Boolean(row.rateMatch?.matched),
      unitPrice: row.rateMatch?.unitPrice,
      pricingSource: isRaf
        ? 'adhoc'
        : isAdsFamilySourceType(row.sourceType)
          ? 'ads_contract'
          : 'rate_card',
    });

    const invoiceLineRules = this.invoiceLineRulesFromIngestRow(
      row,
      billingPeriodStart,
      billingPeriodEnd,
    );

    const merged = this.validationEngine.merge(flightRules, rateRules, invoiceLineRules, [
      this.validationEngine.validateDuplicate(isDuplicate)],
    );
    const byRule = new Map<string, ValidationResult>();
    for (const r of merged) byRule.set(r.rule, r);
    return this.stripInapplicableValidationRules(row.sourceType, [...byRule.values()]);
  }

  private deriveStatus(
    validationResults: ValidationResult[],
    row: IngestRow,
  ): PreparationStatus {
    if (!this.validationEngine.allPassed(validationResults)) {
      return 'validation_error';
    }
    if (String(row.sourceType ?? '').trim().toLowerCase() === 'custom') {
      return 'pending';
    }
    const isRaf = String(row.sourceType ?? '').trim().toLowerCase() === 'raf';
    if ((!isRaf && !row.contractMatch?.matched) || !row.rateMatch?.matched) {
      return 'eligible';
    }
    return 'pending';
  }

  private deriveStatusFromRecord(
    validationResults: ValidationResult[],
    doc: BillingPreparationRecordDocument,
  ): PreparationStatus {
    if (doc.status === 'rejected' || doc.status === 'ready_for_invoice') {
      return doc.status;
    }
    if (!this.validationEngine.allPassed(validationResults)) {
      return 'validation_error';
    }
    if (String(doc.sourceType ?? '').trim().toLowerCase() === 'custom') {
      return 'pending';
    }
    const isRaf = String(doc.sourceType ?? '').trim().toLowerCase() === 'raf';
    const contractMatched = isRaf
      ? true
      : Boolean((doc.contractMatch as { matched?: boolean } | undefined)?.matched);
    const rateMatched = Boolean(
      (doc.rateMatch as { matched?: boolean } | undefined)?.matched,
    );
    if (!contractMatched || !rateMatched) return 'eligible';
    return 'pending';
  }

  private buildPeriodFilter(
    ctx: StationScopeContext,
    query: Pick<ListPreparationQueryDto, 'from' | 'to' | 'customerCode'>,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = StationScope.filter({}, ctx);
    if (query.customerCode?.trim()) {
      filter.customerCode = query.customerCode.trim().toUpperCase();
    }
    if (query.from || query.to) {
      const period: Record<string, Date> = {};
      if (query.from) period.$gte = this.periodBoundStart(query.from);
      if (query.to) period.$lte = this.periodBoundEnd(query.to);
      filter.billingPeriodStart = period;
    }
    return filter;
  }

  /** Inclusive UTC start of YYYY-MM-DD. */
  private periodBoundStart(ymd: string): Date {
    return preparationPeriodBoundStart(ymd);
  }

  /** Inclusive UTC end of YYYY-MM-DD (avoids excluding same-day period starts). */
  private periodBoundEnd(ymd: string): Date {
    return preparationPeriodBoundEnd(ymd);
  }

  private async applyEnrichmentAndValidation(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
  ) {
    const enriched = await this.enrichment.enrich(ctx, this.toEnrichInput(doc));
    await this.applyEnrichedRowToDoc(ctx, doc, enriched);
  }

  private async applyEnrichedRowToDoc(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
    enriched: BillingSourceRow,
  ) {
    this.applyEnrichedPricingInMemory(doc, enriched, { skipDuplicateCheck: true });
    const duplicate = await this.isDuplicateForRecord(ctx, doc);
    const snapshot = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const sourceRef = doc.sourceRef as {
      serialNo?: string;
      flightNo?: string;
      usageRowId?: string;
      batchId?: string;
    };
    doc.validationResults = this.buildValidationResults(
      {
        sourceType: doc.sourceType,
        sourceRef,
        operationalData: snapshot,
        contractMatch: doc.contractMatch as IngestRow['contractMatch'],
        rateMatch: doc.rateMatch as IngestRow['rateMatch'],
        validationResults: enriched.validationStatus.errors,
        validationStatus: enriched.validationStatus,
      },
      duplicate,
      doc.billingPeriodStart,
      doc.billingPeriodEnd,
    );
    doc.status = this.deriveStatusAfterRefresh(doc.validationResults, doc);
  }

  /**
   * Apply contract/rate enrichment onto a prep doc without saving.
   * Mark-ready bulk path skips the duplicate DB query (823× would hang).
   */
  private applyEnrichedPricingInMemory(
    doc: BillingPreparationRecordDocument,
    enriched: BillingSourceRow,
    opts: { skipDuplicateCheck: boolean },
  ) {
    const snapshot = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const sourceRef = doc.sourceRef as {
      serialNo?: string;
      flightNo?: string;
      usageRowId?: string;
      batchId?: string;
    };
    const existingRate = (doc.rateMatch ?? {}) as Record<string, unknown>;
    const isCustom = String(doc.sourceType ?? '').trim().toLowerCase() === 'custom';

    // Custom: keep user-entered lines; only refresh concession metadata from contract.
    if (isCustom) {
      doc.contractMatch = {
        matched: true,
        contractId: enriched.contractMatch.contractId ?? (doc.contractMatch as { contractId?: string } | undefined)?.contractId,
        concessionRates:
          (enriched.contractMatch as { concessionRates?: unknown }).concessionRates &&
          typeof (enriched.contractMatch as { concessionRates?: unknown }).concessionRates ===
            'object'
            ? ((enriched.contractMatch as { concessionRates?: Record<string, unknown> })
                .concessionRates as Record<string, unknown>)
            : (doc.contractMatch as { concessionRates?: Record<string, unknown> } | undefined)
                ?.concessionRates,
        royaltyAtGross:
          (enriched.contractMatch as { royaltyAtGross?: unknown }).royaltyAtGross != null
            ? Number((enriched.contractMatch as { royaltyAtGross?: unknown }).royaltyAtGross)
            : (doc.contractMatch as { royaltyAtGross?: number } | undefined)?.royaltyAtGross,
        message: 'Custom billing — charges entered in preparation',
      };
      doc.rateMatch = {
        ...existingRate,
        matched: true,
        pricingBasis: 'custom',
        serviceCode: existingRate.serviceCode ?? 'Custom Billing',
        message: 'Custom billing lines',
      };
      doc.markModified('contractMatch');
      doc.markModified('rateMatch');
      void opts;
      return;
    }

    const serviceCode = defaultServiceCodeForSource(
      doc.sourceType,
      existingRate?.serviceCode as string | undefined,
    );

    doc.contractMatch = {
      matched: enriched.contractMatch.matched,
      contractId: enriched.contractMatch.contractId,
      rateCardId: enriched.rateMatch.rateCardId,
      cancellationWithinHours:
        (enriched.contractMatch as { cancellationWithinHours?: unknown })
          .cancellationWithinHours != null
          ? Number(
              (enriched.contractMatch as { cancellationWithinHours?: unknown })
                .cancellationWithinHours,
            )
          : undefined,
      royaltyAtGross:
        (enriched.contractMatch as { royaltyAtGross?: unknown }).royaltyAtGross != null
          ? Number((enriched.contractMatch as { royaltyAtGross?: unknown }).royaltyAtGross)
          : undefined,
      concessionRates:
        (enriched.contractMatch as { concessionRates?: unknown }).concessionRates &&
        typeof (enriched.contractMatch as { concessionRates?: unknown }).concessionRates ===
          'object'
          ? ((enriched.contractMatch as { concessionRates?: Record<string, unknown> })
              .concessionRates as Record<string, unknown>)
          : undefined,
      message: enriched.contractMatch.message,
    };
    doc.rateMatch = {
      matched: enriched.rateMatch.matched,
      serviceCode: enriched.rateMatch.serviceCode ?? serviceCode,
      unitPrice: enriched.rateMatch.unitPrice,
      currency: enriched.rateMatch.currency,
      rateCardId: enriched.rateMatch.rateCardId,
      usedUnits: enriched.rateMatch.usedUnits,
      freeAllowance: enriched.rateMatch.freeAllowance,
      pricingBasis: enriched.rateMatch.pricingBasis,
      particular: enriched.rateMatch.particular,
      aircraftType: enriched.rateMatch.aircraftType,
      uom: enriched.rateMatch.uom,
    };
    doc.markModified('contractMatch');
    doc.markModified('rateMatch');

    const enrichedCustomer = this.normalizeCustomerCode(
      enriched.operationalData?.customerCode ?? doc.customerCode,
    );
    if (enrichedCustomer) doc.customerCode = enrichedCustomer;

    if (enriched.operationalData) {
      const adsPatch = Object.fromEntries(
        Object.entries(enriched.operationalData).filter(
          ([k]) =>
            k.startsWith('ads') ||
            k === 'aircraftType' ||
            k === 'customerCode' ||
            k === 'customerName',
        ),
      );
      doc.operationalSnapshot = { ...snapshot, ...adsPatch };
      doc.markModified('operationalSnapshot');
    }

    doc.validationResults = this.buildValidationResults(
      {
        sourceType: doc.sourceType,
        sourceRef,
        operationalData: (doc.operationalSnapshot ?? snapshot) as Record<string, unknown>,
        contractMatch: doc.contractMatch as IngestRow['contractMatch'],
        rateMatch: doc.rateMatch as IngestRow['rateMatch'],
        validationResults: enriched.validationStatus.errors,
        validationStatus: enriched.validationStatus,
      },
      false,
      doc.billingPeriodStart,
      doc.billingPeriodEnd,
    );

    // Full refresh may change pending ↔ eligible; mark-ready keeps status until ready set.
    if (!opts.skipDuplicateCheck) {
      doc.status = this.deriveStatusAfterRefresh(doc.validationResults, doc);
    }
  }

  private resolveRecordBillingDateYmd(
    doc: BillingPreparationRecordDocument,
    snapshot: Record<string, unknown>,
  ): string {
    const preferred = [
      snapshot.billingDateYmd,
      snapshot.staDate,
      snapshot.STADate,
      snapshot['STA Date'],
      snapshot.ataDate,
      snapshot.ATADate,
      snapshot['ATA Date'],
      snapshot.atdDate,
      snapshot.ATDDate,
      snapshot['ATD Date'],
    ];
    for (const candidate of preferred) {
      const ymd = reportDateYmd(candidate);
      if (ymd) return ymd;
    }
    return doc.billingPeriodStart?.toISOString().slice(0, 10);
  }

  private deriveStatusAfterRefresh(
    validationResults: ValidationResult[],
    doc: BillingPreparationRecordDocument,
  ): PreparationStatus {
    if (doc.status === 'rejected' || doc.status === 'invoiced') {
      return doc.status;
    }
    if (!this.validationEngine.allPassed(validationResults)) {
      return 'validation_error';
    }
    const contractMatched = Boolean(
      (doc.contractMatch as { matched?: boolean } | undefined)?.matched,
    );
    const rateMatched = Boolean(
      (doc.rateMatch as { matched?: boolean } | undefined)?.matched,
    );
    const isRaf = String(doc.sourceType ?? '').trim().toLowerCase() === 'raf';
    if ((!isRaf && !contractMatched) || !rateMatched) return 'eligible';
    if (doc.status === 'ready_for_invoice') return 'ready_for_invoice';
    return 'pending';
  }

  private normalizeCustomerCode(raw: unknown): string {
    const text = String(raw ?? '').trim().toUpperCase();
    if (!text) return '';
    // Arline_Code / flight fields may be flight numbers (IX2718, SG9151A/SG9151D).
    const fromCancelledFlight = text.match(/(?:CANC\s*-\s*)?([A-Z]{2,3})\d{2,5}/,
    );
    if (fromCancelledFlight?.[1]) return fromCancelledFlight[1];
    const fromFlight = text.match(/\b([A-Z]{2,3})\d{2,5}\b/);
    if (fromFlight?.[1]) return fromFlight[1];
    if (/^[A-Z0-9]{2,10}$/.test(text)) return text;
    return '';
  }

  private resolveIngestCustomerCode(
    op: Record<string, unknown>,
    sourceRef?: { flightNo?: string; serialNo?: string },
  ): string {
    const candidates = [
      op.customerCode,
      op.Arline_Code,
      op.airlineCode,
      op.AirlineCode,
      op['Airline Code'],
      op['Arline Code'],
      op.flightNoEquipmentNo,
      op.flightNo,
      op.ArrivalFltNo,
      op.DepartureFltNo,
      sourceRef?.flightNo,
    ];
    for (const candidate of candidates) {
      const code = this.normalizeCustomerCode(candidate);
      if (code) return code;
    }
    return '';
  }

  private async revalidateRecord(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
  ): Promise<ValidationResult[]> {
    const snapshot = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const sourceRef = doc.sourceRef as {
      serialNo?: string;
      usageRowId?: string;
    };

    const duplicate = await this.isDuplicateForRecord(ctx, doc);
    const flightRules = this.validationEngine.validateFlightReadiness({
      serialNo: sourceRef.serialNo,
      atdDate: snapshot.atdDate as string | Date | null | undefined,
      cancelled: isBillingOperationalRowCancelled(
        snapshot,
        String(
          (doc.sourceRef as { flightNo?: string }).flightNo ??
            snapshot.flightNoEquipmentNo ??
            '',
        ),
      ),
    });

    const contractMatch = doc.contractMatch as
      | {
      matched?: boolean;
      contractId?: string;
    } | undefined;
    const rateMatch = doc.rateMatch as
      | {
      matched?: boolean;
      unitPrice?: number;
      serviceCode?: string;
      currency?: string;
      rateCardId?: string;
    } | undefined;
    const isRaf = String(doc.sourceType ?? '').trim().toLowerCase() === 'raf';
    const rateRules = this.validationEngine.validateContractAndRate({
      hasContract: isRaf ? true : Boolean(contractMatch?.matched),
      hasRate: Boolean(rateMatch?.matched),
      unitPrice: rateMatch?.unitPrice,
      pricingSource: isRaf
        ? 'adhoc'
        : isAdsFamilySourceType(doc.sourceType)
          ? 'ads_contract'
          : 'rate_card',
    });

    const invoiceLineRules = this.invoiceLineRulesFromDoc(doc);

    const merged = this.validationEngine.merge(flightRules, rateRules, invoiceLineRules, [
      this.validationEngine.validateDuplicate(duplicate)],
    );
    const byRule = new Map<string, ValidationResult>();
    for (const r of merged) byRule.set(r.rule, r);
    return this.stripInapplicableValidationRules(doc.sourceType, [...byRule.values()]);
  }

  private invoiceLineRulesFromIngestRow(
    row: IngestRow,
    billingPeriodStart?: Date,
    billingPeriodEnd?: Date,
  ) {
    const snapshot = row.operationalData ?? {};
    const sourceRef = row.sourceRef ?? {};
    const isAds = isAdsFamilySourceType(row.sourceType);
    const isCustom = String(row.sourceType ?? '').trim().toLowerCase() === 'custom';
    const isRaf = String(row.sourceType ?? '').trim().toLowerCase() === 'raf';
    return this.validationEngine.validateInvoiceLineReadiness({
      sourceType: row.sourceType,
      customerCode: String(
        snapshot.customerCode ?? snapshot.customerName ?? '',
      ).trim(),
      flightNo: String(
        sourceRef.flightNo ?? snapshot.flightNoEquipmentNo ?? '',
      ).trim(),
      serviceCode: row.rateMatch?.serviceCode,
      unitPrice: row.rateMatch?.unitPrice,
      currency: row.rateMatch?.currency,
      categoryOfFlight: String(snapshot.categoryOfFlight ?? ''),
      contractMatched: isRaf ? true : Boolean(row.contractMatch?.matched),
      rateMatched: Boolean(row.rateMatch?.matched),
      contractId: isRaf ? undefined : row.contractMatch?.contractId,
      rateCardId: row.rateMatch?.rateCardId,
      billingPeriodStart,
      billingPeriodEnd,
      pricingSource: isCustom
        ? 'custom'
        : isRaf
          ? 'adhoc'
          : isAds
            ? 'ads_contract'
            : 'rate_card',
    });
  }

  private invoiceLineRulesFromDoc(doc: BillingPreparationRecordDocument) {
    const snapshot = (doc.operationalSnapshot ?? {}) as Record<string, unknown>;
    const sourceRef = doc.sourceRef as { flightNo?: string };
    const contractMatch = doc.contractMatch as {
      matched?: boolean;
      contractId?: string;
    };
    const rateMatch = doc.rateMatch as {
      matched?: boolean;
      serviceCode?: string;
      unitPrice?: number;
      currency?: string;
      rateCardId?: string;
    };
    const isCustom =
      String(doc.sourceType ?? '').trim().toLowerCase() === 'custom';
    const isRaf = String(doc.sourceType ?? '').trim().toLowerCase() === 'raf';
    return this.validationEngine.validateInvoiceLineReadiness({
      sourceType: doc.sourceType,
      customerCode: doc.customerCode,
      flightNo: String(sourceRef.flightNo ?? snapshot.flightNoEquipmentNo ?? '',
      ),
      serviceCode: rateMatch?.serviceCode,
      unitPrice: rateMatch?.unitPrice,
      currency: rateMatch?.currency,
      categoryOfFlight: String(snapshot.categoryOfFlight ?? ''),
      contractMatched: isRaf ? true : Boolean(contractMatch?.matched),
      rateMatched: Boolean(rateMatch?.matched),
      contractId: isRaf ? undefined : contractMatch?.contractId,
      rateCardId: rateMatch?.rateCardId,
      billingPeriodStart: doc.billingPeriodStart,
      billingPeriodEnd: doc.billingPeriodEnd,
      pricingSource: isCustom
        ? 'custom'
        : isRaf
          ? 'adhoc'
          : isAdsFamilySourceType(doc.sourceType)
            ? 'ads_contract'
            : 'rate_card',
    });
  }

  /** RAF has no contract concept — drop stale contract rules from stored / merged results. */
  private stripInapplicableValidationRules(
    sourceType: string | undefined,
    results: ValidationResult[],
  ): ValidationResult[] {
    if (String(sourceType ?? '').trim().toLowerCase() !== 'raf') return results;
    return results.filter(
      (r) => r.rule !== 'contract_match' && r.rule !== 'contract_linked',
    );
  }

  /**
   * Strip RAF contract rules from list/read payloads so the UI does not show
   * stale "Contract not linked" until the user hits Refresh.
   * Also clear validation_error when only those rules were failing.
   */
  private sanitizePreparationItemForResponse<T extends Record<string, unknown>>(
    item: T,
  ): T {
    const sourceType = String(item.sourceType ?? '').trim().toLowerCase();
    if (sourceType !== 'raf') return item;
    const rawResults = Array.isArray(item.validationResults)
      ? (item.validationResults as ValidationResult[])
      : [];
    const validationResults = this.stripInapplicableValidationRules(
      sourceType,
      rawResults,
    );
    if (validationResults === rawResults) return item;

    const next: Record<string, unknown> = {
      ...item,
      validationResults,
      contractMatch: {
        matched: true,
        message: 'Not applicable — RAF billed on adhoc rates only',
      },
    };
    if (
      String(item.status ?? '') === 'validation_error' &&
      this.validationEngine.allPassed(validationResults)
    ) {
      const rateMatched = Boolean(
        (item.rateMatch as { matched?: boolean } | undefined)?.matched,
      );
      next.status = rateMatched ? 'pending' : 'eligible';
    }
    return next as T;
  }

  private async isDuplicateForRecord(
    ctx: StationScopeContext,
    doc: BillingPreparationRecordDocument,
  ) {
    const sourceRef = doc.sourceRef as {
      serialNo?: string;
      usageRowId?: string;
    };
    const identity = preparationSourceIdentity({
      sourceRef: {
        serialNo: sourceRef.serialNo,
        usageRowId: sourceRef.usageRowId,
      },
      operationalSnapshot: (doc.operationalSnapshot ?? {}) as Record<string, unknown>,
    });
    if (!identity) return false;

    const serial = String(sourceRef.serialNo ?? '').trim();
    const usage = String(sourceRef.usageRowId ?? '').trim();
    const identityFilter: Array<Record<string, unknown>> = [];
    if (usage) identityFilter.push({ 'sourceRef.usageRowId': usage });
    if (serial) identityFilter.push({ 'sourceRef.serialNo': serial });
    if (identityFilter.length === 0) return false;

    const candidates = await this.preparationModel
      .find(
        withPreparationSentMarker(
          StationScope.filter(
            {
              _id: { $ne: doc._id },
              sourceType: doc.sourceType,
              status: { $nin: ['rejected'] },
              $or: identityFilter,
            },
            ctx,
          ),
        ),
      )
      .select('sourceRef operationalSnapshot')
      .lean();

    return candidates.some((candidate) =>
      preparationIdentitiesMatch(
        {
          sourceRef: {
            serialNo: sourceRef.serialNo,
            usageRowId: sourceRef.usageRowId,
          },
          operationalSnapshot: (doc.operationalSnapshot ?? {}) as Record<string, unknown>,
        },
        {
          sourceRef: candidate.sourceRef as PreparationSourceLike['sourceRef'],
          operationalSnapshot: (candidate.operationalSnapshot ?? {}) as Record<string, unknown>,
        },
      ),
    );
  }

  private validationResultsForReadiness(
    doc: BillingPreparationRecordDocument,
    validationResults: ValidationResult[] = doc.validationResults ?? [],
  ): ValidationResult[] {
    let results = this.stripInapplicableValidationRules(
      doc.sourceType,
      validationResults,
    );
    const cancellationBilling = (doc as BillingPreparationRecordDocument & {
      cancellationBilling?: { enabled?: boolean; bhsChargeablePercent?: number;
        };
    }).cancellationBilling;
    if (!cancellationBilling?.enabled) return results;
    const pct = Number(cancellationBilling.bhsChargeablePercent ?? 0);
    if (!Number.isFinite(pct) || pct < 0) return results;
    return results.map((result) =>
      result.rule === 'not_cancelled'
        ? {
            ...result,
            passed: true,
            message: `Cancelled flight marked billable (${Math.min(100, Math.max(0, pct)).toFixed(2)}% BHS chargeable)`,
          }
        : result,
    );
  }

  private appendWorkflowNote(
    doc: BillingPreparationRecordDocument,
    note: {
      body: string;
      audience: string;
      directedToUserId?: string;
      directedToUserName?: string;
      context?: string;
    },
    actor: BillingActor,
  ) {
    const entry = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      at: new Date(),
      userId: actor.userId,
      userName: actor.userName,
      ...note,
    };
    doc.workflowNotes = [...(doc.workflowNotes ?? []), entry];
    doc.markModified('workflowNotes');
  }
}

