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
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import {
  StationScope,
  paginatedResponse,
  parsePagination,
  successResponse,
} from '../common/station-scope';
import { withPreparationVisibility } from '../common/billing-personal-workspace';
import {
  InvoiceEngineService,
  splitBhsPreparationByUnitRate,
} from '../engines/invoice-engine.service';
import { CurrencyEngineService } from '../engines/currency-engine.service';
import {
  resolveBillingCustomerAddress,
  resolveBillingCustomerInvoiceName,
} from '../utils/customer-address.util';
import { TaxEngineService } from '../engines/tax-engine.service';
import { ApprovalWorkflowService } from '../engines/approval-workflow.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import type { BillingPreparationService } from './billing-preparation.service';
import type { BillingSourcesMaaFhrAdsService } from './sources/billing-sources-usage.service';
import { lazyService } from 'src/common/nestjs/lazy-service.util';
import {
  AddInvoiceLineDto,
  CreateDraftsFromPreparationDto,
  CreateInvoiceDraftDto,
  ListInvoicesQueryDto,
  UpdateCustomInvoiceDraftDto,
  UpdateCustomBillDraftDto,
  UpdateInvoiceDraftDto,
  UpdateInvoiceLineDto,
  UpdateInvoiceLinesDto,
} from '../dto/billing-invoice.dto';
import { AddDraftPreparationRemarkDto } from '../dto/billing-preparation.dto';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import {
  applyConcessionTotalsToHeader,
  invalidateInvoiceContractCache,
  isCeilingParticularLine,
  resolveActiveContractForInvoice,
} from '../utils/invoice-concession.util';
import { BILLING_INVOICE_IGNORED_MASTERS } from '../shared/ignored-billing-masters';
import {
  inheritForCustomer,
  shapeContractForAdditionalCustomer,
} from '../utils/additional-customer-inherit.util';
import {
  commercialCustomerCode,
  resolveBillingCurrency,
  shouldApplyUsdRoeToLineAmounts,
} from '../utils/billing-currency.util';
import {
  exactBillingPeriodMatch,
  OPEN_INVOICE_DRAFT_STATUSES,
  preparationInvoiceCategory,
  preparationInvoiceGroupKey,
  preparationListPeriodFilter,
} from '../common/billing-invoice-period.util';
import { stationFlightConcessionPercents } from '../utils/station-flight-concession.util';
import { isAdsFamilySourceType } from '../shared/ads-adhoc-tariff';
import {
  ataCalendarDay,
  extractPreparationFlightYmd,
  fortnightExchangeRateForPart,
  normalizeContractFortnightBillingConfig,
  assignFortnightAta,
  fortnightExchangeRateForBillingPeriod,
  resolveFortnightPartForFlights,
  resolveFortnightPartRangeForMonth,
} from '../utils/contract-fortnight-billing.util';

const DRAFT_STATUSES = ['draft', 'pending_approval', 'approved', 'generated'];

function extractHttpExceptionMessage(err: unknown): string {
  if (err instanceof BadRequestException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const msg = (res as { message?: string | string[] }).message;
      if (Array.isArray(msg)) return msg.join(' ');
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return 'Failed to compose invoice draft';
}

function normalizedInvoiceLineToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function adsInvoiceLineKey(line: BillingInvoiceLineDocument): string {
  const sourceRef = (line.sourceRef ?? {}) as Record<string, unknown>;
  return [
    normalizedInvoiceLineToken(sourceRef.particular ?? line.description),
    normalizedInvoiceLineToken(sourceRef.aircraftType),
    normalizedInvoiceLineToken(line.uom),
    Number(line.unitPrice).toFixed(4),
    Number(line.lineDiscountPercent ?? 0).toFixed(4),
    Number(line.gstPercent ?? 0).toFixed(4),
  ].join('|');
}

function invoiceLinePreparationIds(
  line: Pick<BillingInvoiceLineDocument, 'preparationRecordIds' | 'sourceRef'>,
): string[] {
  const fromField = Array.isArray(line.preparationRecordIds)
    ? line.preparationRecordIds
    : [];
  const sourceRef = (line.sourceRef ?? {}) as Record<string, unknown>;
  const fromRef = Array.isArray(sourceRef.preparationRecordIds)
    ? sourceRef.preparationRecordIds
    : [];
  return [
    ...new Set(
      [...fromField, ...fromRef]
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function collectPreparationIdsFromLines(
  lines: Array<Pick<BillingInvoiceLineDocument, 'preparationRecordIds' | 'sourceRef'>>,
): string[] {
  const ids = new Set<string>();
  for (const line of lines) {
    for (const prepId of invoiceLinePreparationIds(line)) {
      ids.add(prepId);
    }
  }
  return [...ids].sort();
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length > 0 &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type ContractLikeWithFortnight = {
  fortnightBillingEnabled?: boolean;
  fortnightBillingPartCount?: number;
  fortnightBillingRanges?: Array<{
    startDay: number;
    endDay: number;
    exchangeRatePerUsd?: number;
  }>;
  fortnightBillingMonthRates?: Array<{
    month: string;
    parts: Array<{ startDay: number; exchangeRatePerUsd: number }>;
  }>;
  fortnightEdgeDayCap?: boolean;
};

function splitPreparationGroupByFortnightConfig(
  records: BillingPreparationRecordDocument[],
  contract?: ContractLikeWithFortnight | null,
): Array<{
  records: BillingPreparationRecordDocument[];
  billingPeriodStart?: Date;
  billingPeriodEnd?: Date;
  exchangeRatePerUsd?: number;
}> {
  if (!contract || records.length === 0) return [{ records }];
  const config = normalizeContractFortnightBillingConfig({
    enabled: contract.fortnightBillingEnabled,
    partCount: contract.fortnightBillingPartCount,
    ranges: contract.fortnightBillingRanges,
    monthRates: contract.fortnightBillingMonthRates,
    edgeDayCap: contract.fortnightEdgeDayCap,
  });
  if (!config.enabled || !config.ranges || config.ranges.length === 0) return [{ records }];

  const dated = records.map((record) => {
    const flightYmd = extractPreparationFlightYmd({
      sourceRef: (record.sourceRef ?? null) as Record<string, unknown> | null,
      operationalSnapshot: (record.operationalSnapshot ?? null) as Record<string, unknown> | null,
    });
    if (!flightYmd) {
      throw new BadRequestException(
        `Fortnight billing is enabled, but a flight record is missing an ATA date for ${record.customerCode}.`,
      );
    }
    return { record, flightYmd, day: ataCalendarDay(flightYmd) };
  });
  const monthBuckets: Array<{
    range: (typeof config.ranges)[number];
    monthRange: { start: Date; end: Date };
    exchangeRatePerUsd: number;
    records: BillingPreparationRecordDocument[];
  }> = [];

  for (const item of dated) {
    const assigned = assignFortnightAta(config, item.flightYmd);
    if (!assigned) {
      throw new BadRequestException(
        `ATA ${item.flightYmd} (the ${item.day}${ordinal(item.day)}) is outside the fortnight parts for ${item.record.customerCode}. A part of 1–15 includes the 1st through the 15th, and the closing part includes the last day of that month.`,
      );
    }
    const range = assigned.range;
    const monthKey = assigned.monthKey;
    const exchangeRatePerUsd = fortnightExchangeRateForPart(config, monthKey, range.startDay);
    if (exchangeRatePerUsd == null) {
      throw new BadRequestException(
        `Add a USD to INR rate for ${monthKey} on the contract for ${item.record.customerCode} (part starting day ${range.startDay}). That rate is used only in ${monthKey}.`,
      );
    }
    let bucket = monthBuckets.find(
      (part) =>
        part.range.startDay === range.startDay &&
        part.monthRange.start.toISOString().slice(0, 7) === monthKey,
    );
    if (!bucket) {
      const monthRange = resolveFortnightPartRangeForMonth(`${monthKey}-01`, range);
      bucket = { range, monthRange, exchangeRatePerUsd, records: [] };
      monthBuckets.push(bucket);
    }
    bucket.records.push(item.record);
  }

  return monthBuckets
    .filter((bucket) => bucket.records.length > 0)
    .map((bucket) => ({
      records: bucket.records,
      billingPeriodStart: bucket.monthRange.start,
      billingPeriodEnd: bucket.monthRange.end,
      exchangeRatePerUsd: bucket.exchangeRatePerUsd,
    }));
}

function periodYmd(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}

@Injectable()
export class BillingInvoiceDraftsService {
  constructor(
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingInvoiceLine.name)
    private readonly lineModel: Model<BillingInvoiceLineDocument>,
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    private readonly invoiceEngine: InvoiceEngineService,
    private readonly currencyEngine: CurrencyEngineService,
    private readonly taxEngine: TaxEngineService,
    private readonly approvalWorkflow: ApprovalWorkflowService,
    private readonly auditEngine: AuditEngineService,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('./billing-preparation.service')
              .BillingPreparationService as typeof import('./billing-preparation.service').BillingPreparationService,
        ),
      ),
    )
    private readonly preparationService: BillingPreparationService,
    @Inject(
      forwardRef(
        lazyService(
          () =>
            require('./sources/billing-sources-usage.service')
              .BillingSourcesMaaFhrAdsService as typeof import('./sources/billing-sources-usage.service').BillingSourcesMaaFhrAdsService,
        ),
      ),
    )
    private readonly adsSources: BillingSourcesMaaFhrAdsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(ctx: StationScopeContext, query: ListInvoicesQueryDto) {
    const { page, limit, skip } = parsePagination({
      ...query,
      // Default page size is 50. Newer drafts then hide earlier months.
      limit: query.limit ?? '5000',
    });
    const filter: Record<string, unknown> = StationScope.filter(
      { status: { $in: DRAFT_STATUSES }, ...NOT_IN_BIN_FILTER },
      ctx,
    );
    if (query.status) filter.status = query.status;
    if (query.customerCode) filter.customerCode = query.customerCode.toUpperCase();

    const [items, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      this.invoiceModel.countDocuments(filter),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const header = await this.getHeader(ctx, id);
    let responseHeader = header;
    if (!header.customerAddress?.trim()) {
      const customer = await this.customerModel
        .findOne(StationScope.filter({ customerCode: header.customerCode }, ctx),
        )
        .lean();
      const address = resolveBillingCustomerAddress(customer);
      if (address) {
        responseHeader = { ...header, customerAddress: address,
        } as typeof header;
      }
    }
    const lines = await this.lineModel
      .find({ invoiceId: header._id })
      .sort({ lineNo: 1 })
      .lean();
    const prepIds = header.preparationRecordIds ?? [];
    const preparationRecords =
      prepIds.length > 0
        ? await this.preparationModel
            .find({
              _id: { $in: prepIds },
              ...StationScope.filter({}, ctx),
            })
            .lean()
        : [];
    return successResponse({ header: responseHeader, lines, preparationRecords,
    });
  }

  async addDraftRemark(
    ctx: StationScopeContext,
    draftId: string,
    dto: AddDraftPreparationRemarkDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeader(ctx, draftId);
    const prepIds = (header.preparationRecordIds ?? []).map(String);
    if (prepIds.length === 0) {
      throw new BadRequestException('No preparation records linked to this draft',
      );
    }

    const targetIds = dto.preparationRecordId?.trim()
      ? [dto.preparationRecordId.trim()]
      : prepIds;

    for (const prepId of targetIds) {
      if (!prepIds.includes(prepId)) {
        throw new BadRequestException(
          `Preparation record ${prepId} is not linked to this draft`,
        );
      }
    }

    const updated: unknown[] = [];
    for (const prepId of targetIds) {
      const res = await this.preparationService.addRemark(ctx, prepId, dto, actor,
      );
      updated.push(res.data);
    }

    return successResponse({
      updated: updated.length,
      preparationRecords: updated,
    });
  }

  async createManual(
    ctx: StationScopeContext,
    dto: CreateInvoiceDraftDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const draftNumber = await this.nextDraftNumber(stationCode);
    const customerCode = dto.customerCode.toUpperCase();
    const customer = await this.customerModel
      .findOne(StationScope.filter({ customerCode }, ctx))
      .lean();

    const header = await this.invoiceModel.create(
      StationScope.stampCreate(
        {
          draftNumber,
          customerCode,
          customerName:
            dto.customerName.trim() ||
            resolveBillingCustomerInvoiceName(customer, customerCode),
          customerAddress: resolveBillingCustomerAddress(customer),
          status: 'draft',
          documentDate: new Date(dto.documentDate),
          currencyCode: dto.currencyCode ?? 'INR',
          currencyFactor: 1,
          billingPeriodStart: new Date(dto.billingPeriodStart),
          billingPeriodEnd: new Date(dto.billingPeriodEnd),
          subtotalExclTax: 0,
          taxTotal: 0,
          totalInclTax: 0,
          approvalStatus: 'pending',
        },
        ctx,
      ),
    );

    if (dto.preparationRecordIds?.length) {
      await this.attachPreparationRecords(ctx, header, dto.preparationRecordIds, new Date(dto.documentDate), actor,
      );
    }

    await this.audit(ctx, header._id, 'created', actor, { draftNumber });
    return this.findOne(ctx, String(header._id));
  }

  async createFromPreparation(
    ctx: StationScopeContext,
    dto: CreateDraftsFromPreparationDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const periodScoped = Boolean(dto.billingPeriodStart?.trim() || dto.billingPeriodEnd?.trim(),
    );

    const filter: Record<string, unknown> = StationScope.filter(
      { status: 'ready_for_invoice' },
      ctx,
    );

    const listPeriod = preparationListPeriodFilter(
      dto.billingPeriodStart,
      dto.billingPeriodEnd,
    );
    if (listPeriod) {
      filter.billingPeriodStart = listPeriod;
    }
    if (dto.customerCode?.trim()) {
      filter.customerCode = dto.customerCode.trim().toUpperCase();
    }
    if (dto.preparationRecordIds?.length) {
      filter._id = {
        $in: dto.preparationRecordIds.map((id) => new Types.ObjectId(id)),
      };
    }

    const records = await this.preparationModel.find(withPreparationVisibility(filter)).lean();
    if (records.length === 0) {
      throw new BadRequestException(
        periodScoped
          ? 'No ready preparation flights found for the selected billing period'
          : 'No ready preparation records found',
      );
    }

    const documentDate = new Date(dto.documentDate ?? new Date().toISOString().slice(0, 10),
    );
    // Always create a new draft per airline/group — never merge into an open draft.
    void dto.mergeOpenDraft;
    const mergeOpenDraft = false;
    const groups =
      dto.groupByCustomer === false && !periodScoped
        ? new Map([['__single__', records]])
        : groupBy(records, (r) => preparationInvoiceGroupKey(r));

    const created: string[] = [];
    const merged: string[] = [];
    const flightCounts: Record<string, number> = {};
    const skippedGroups: Array<{
      customerCode: string;
      recordCount: number;
      reason: string;
    }> = [];

    for (const [, group] of groups) {
      const customerCode = String(group[0]?.customerCode ?? '').trim().toUpperCase();
      try {
        const customer = await this.customerModel
          .findOne(StationScope.filter({ customerCode: group[0].customerCode }, ctx))
          .lean();
        const contract = await resolveActiveContractForInvoice(this.contractModel, ctx, {
          contractId: group[0].contractMatch?.contractId,
          customerCode: group[0].customerCode,
          documentDate,
          stationCode: ctx.stationCode ?? group[0].stationCode,
        });
        const currencyCode = await this.resolveCommercialInvoiceCurrency(
          ctx,
          group[0].customerCode,
          contract,
          customer?.currencyCode,
        );
        const invoiceContract = await this.contractWithStationFlightConcession(
          ctx,
          shapeContractForAdditionalCustomer(contract, group[0].customerCode) ?? contract,
          documentDate,
          {
            start: group[0]?.billingPeriodStart,
            end: group[0]?.billingPeriodEnd,
          },
        );
        const periodGroups = splitPreparationGroupByFortnightConfig(group, invoiceContract);
        for (const periodGroup of periodGroups) {
          const volumeOptions = await this.bhsVolumeComposeOptions(
            ctx,
            invoiceContract,
            currencyCode,
            periodGroup.records,
          );
          const composeOptions = {
            ...volumeOptions,
            currencyFactorOverride: periodGroup.exchangeRatePerUsd,
          };
          const rateGroups = splitBhsPreparationByUnitRate(periodGroup.records, invoiceContract, {
            currencyCode,
            volumePopulation: composeOptions?.volumePopulation,
          });
          for (const rateGroup of rateGroups) {
        const composed = await this.invoiceEngine.composeFromPreparation(
          ctx,
          rateGroup,
          documentDate,
          currencyCode,
          invoiceContract,
          composeOptions,
        );
        if (periodGroup.billingPeriodStart) {
          composed.billingPeriodStart = periodGroup.billingPeriodStart;
        }
        if (periodGroup.billingPeriodEnd) {
          composed.billingPeriodEnd = periodGroup.billingPeriodEnd;
        }

        const existingDraft = mergeOpenDraft
          ? await this.findOpenDraftForPeriod(ctx, composed)
          : null;

        if (existingDraft) {
          const existingIds = (existingDraft.preparationRecordIds ?? []).map((id) =>
            String(id),
          );
          const newIds = rateGroup.map((r) => String(r._id));
          const allIds = [...new Set([...existingIds, ...newIds])];
          const allRecords = await this.preparationModel
            .find({
              _id: { $in: allIds.map((id) => new Types.ObjectId(id)) },
              ...StationScope.filter({}, ctx),
            })
            .exec();

          await withBillingTransaction(this.connection, async (session, afterCommit) => {
            await this.rebuildDraftFromPreparationRecords(
              ctx,
              existingDraft,
              allRecords,
              documentDate,
              actor,
              { mergedFromPreparation: rateGroup.length },
              { session, afterCommit },
            );
          });
          const draftId = String(existingDraft._id);
          merged.push(draftId);
          flightCounts[draftId] = allRecords.length;
          continue;
        }

        const draftNumber = await this.nextDraftNumber(stationCode);
        await withBillingTransaction(this.connection, async (session, afterCommit) => {
          const sessionOpts: BillingSessionOptions = { session, afterCommit };
          const [header] = await this.invoiceModel.create(
            [
              StationScope.stampCreate(
                {
                  draftNumber,
                  customerCode: composed.customerCode,
                  customerName: resolveBillingCustomerInvoiceName(
                    customer,
                    composed.customerName,
                  ),
                  customerAddress: resolveBillingCustomerAddress(customer),
                  status: 'draft',
                  documentDate,
                  currencyCode: composed.currencyCode,
                  currencyFactor: composed.currencyFactor,
                  billingPeriodStart: composed.billingPeriodStart,
                  billingPeriodEnd: composed.billingPeriodEnd,
                  contractId: composed.contractId,
                  invoiceCategory: composed.invoiceCategory ?? 'BHS',
                  subtotalExclTax: composed.subtotalExclTax,
                  taxTotal: composed.taxTotal,
                  totalInclTax: composed.totalInclTax,
                  approvalStatus: 'pending',
                  preparationRecordIds: composed.preparationRecordIds,
                },
                ctx,
              ),
            ],
            { session },
          );

          await this.insertComposedLines(header, composed, stationCode, sessionOpts);
          if (
            shouldApplyUsdRoeToLineAmounts(
              composed.currencyCode,
              composed.invoiceCategory,
              rateGroup,
            ) &&
            composed.currencyFactor > 0
          ) {
            await this.applyUsdFactorToLineAmounts(
              ctx,
              header,
              composed.currencyFactor,
              undefined,
              sessionOpts,
            );
          }
          await this.recalculateHeader(header, ctx, sessionOpts);

          // Keep linked prep as invoiced so drafts can refresh from live flight/master
          // data. Final PDF generate (and boot orphan purge) still clear leftovers.
          await this.preparationModel.updateMany(
            { _id: { $in: composed.preparationRecordIds } },
            {
              $set: {
                status: 'invoiced',
                invoiceDraftId: header._id,
              },
            },
            { session },
          );

          await this.audit(ctx, header._id, 'created', actor, {
            fromPreparation: composed.preparationRecordIds.length,
          }, sessionOpts);
          const draftId = String(header._id);
          created.push(draftId);
          flightCounts[draftId] = composed.preparationRecordIds.length;
        });
        }
        }
      } catch (err) {
        const reason = extractHttpExceptionMessage(err);
        // One airline must not 500 the whole Ready-for-invoice run.
        // ADS with nothing billable, and contracts whose fortnight parts lack a
        // USD rate (or ATA outside the parts), are skipped; other customers continue.
        const skipGroup =
          /no billable/i.test(reason) ||
          /fortnight billing/i.test(reason) ||
          err instanceof BadRequestException;
        if (skipGroup) {
          skippedGroups.push({
            customerCode: customerCode || 'UNKNOWN',
            recordCount: group.length,
            reason,
          });
          if (/no billable/i.test(reason)) {
            const adsIds = group
              .filter((r) => isAdsFamilySourceType(String(r.sourceType ?? '')))
              .map((r) => r._id);
            if (adsIds.length > 0) {
              await this.preparationModel.updateMany(
                { _id: { $in: adsIds }, status: 'ready_for_invoice' },
                { $set: { status: 'pending' } },
              );
            }
          }
          continue;
        }
        throw err;
      }
    }

    if (created.length + merged.length === 0) {
      const detail =
        skippedGroups.length > 0
          ? skippedGroups
              .map((g) => `${g.customerCode} (${g.recordCount} rows): ${g.reason}`)
              .join(' · ')
          : 'No ready preparation groups produced invoice lines.';
      throw new BadRequestException(detail);
    }

    const billedRecordCount = [...created, ...merged].reduce(
      (sum, id) => sum + (flightCounts[id] ?? 0),
      0,
    );
    return successResponse({
      created,
      merged,
      count: created.length + merged.length,
      totalFlights: billedRecordCount,
      flightCounts,
      skippedGroups,
    });
  }

  /** Airlines that still have ready flights for this period. Create-invoice runs one airline at a time. */
  async listReadyCustomerCodes(
    ctx: StationScopeContext,
    query: { from?: string; to?: string; customerCode?: string },
  ) {
    const filter: Record<string, unknown> = StationScope.filter(
      { status: 'ready_for_invoice' },
      ctx,
    );
    const listPeriod = preparationListPeriodFilter(query.from, query.to);
    if (listPeriod) filter.billingPeriodStart = listPeriod;
    if (query.customerCode?.trim()) {
      filter.customerCode = query.customerCode.trim().toUpperCase();
    }
    const codes = await this.preparationModel.distinct(
      'customerCode',
      withPreparationVisibility(filter),
    );
    const data = [
      ...new Set(
        codes
          .map((code) => String(code ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ].sort();
    return successResponse(data);
  }

  /**
   * Move selected ADS equipment/service lines into a new sibling draft.
   * Unchecked lines remain together on the current draft.
   */
  async splitAdsLines(
    ctx: StationScopeContext,
    id: string,
    lineNos: number[],
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const selectedLineNos = [...new Set(lineNos.filter((lineNo) => Number.isInteger(lineNo)))];
    if (selectedLineNos.length === 0) {
      throw new BadRequestException('Select at least one ADS equipment or service line');
    }

    let createdDraftId = '';
    await withBillingTransaction(this.connection, async (session, afterCommit) => {
      const options: BillingSessionOptions = { session, afterCommit };
      const header = await this.invoiceModel.findById(id).session(session);
      if (!header) throw new NotFoundException('Invoice not found');
      StationScope.assertOwnership(header, ctx);
      if (header.status !== 'draft') {
        throw new BadRequestException('Only draft ADS invoices can be split');
      }

      const lines = await this.lineModel
        .find({ invoiceId: header._id })
        .sort({ lineNo: 1 })
        .session(session);
      const isAds =
        String(header.invoiceCategory ?? '').trim().toUpperCase() === 'ADS' ||
        (lines.length > 0 &&
          lines.every((line) => String(line.sourceType ?? '').trim().toLowerCase() === 'ads'));
      if (!isAds) {
        throw new BadRequestException('Separate billing is available only for ADS drafts');
      }

      const selected = lines.filter((line) => selectedLineNos.includes(line.lineNo));
      if (selected.length !== selectedLineNos.length) {
        throw new BadRequestException('One or more selected ADS lines no longer exist');
      }
      if (selected.length >= lines.length) {
        throw new BadRequestException(
          'Leave at least one line unchecked on the current bill',
        );
      }

      const remaining = lines.filter((line) => !selectedLineNos.includes(line.lineNo));
      const selectedPrepIds = collectPreparationIdsFromLines(selected);
      const remainingPrepIds = collectPreparationIdsFromLines(remaining);
      const missingProvenance = [...selected, ...remaining].filter(
        (line) =>
          normalizedInvoiceLineToken(line.sourceType) === 'ads' &&
          invoiceLinePreparationIds(line).length === 0,
      );
      if (missingProvenance.length > 0) {
        throw new BadRequestException(
          'Cannot split ADS draft — one or more lines are missing preparation provenance. Recompute the draft from preparation first.',
        );
      }
      const overlappingPrepIds = selectedPrepIds.filter((id) =>
        remainingPrepIds.includes(id),
      );
      if (overlappingPrepIds.length > 0) {
        throw new BadRequestException(
          'Cannot split ADS draft — selected and remaining lines share preparation records',
        );
      }

      const familyId = header.adsSplitFamilyId?.trim() || String(header._id);
      if (!header.adsSplitFamilyId) header.adsSplitFamilyId = familyId;
      if (!header.adsSplitGroupKey) {
        header.adsSplitGroupKey = new Types.ObjectId().toHexString();
      }

      const draftNumber = await this.nextDraftNumber(stationCode);
      const [newHeader] = await this.invoiceModel.create(
        [
          StationScope.stampCreate(
            {
              draftNumber,
              customerCode: header.customerCode,
              customerName: header.customerName,
              customerAddress: header.customerAddress,
              billToCustomerCode: header.billToCustomerCode,
              status: 'draft',
              documentDate: header.documentDate,
              currencyCode: header.currencyCode,
              currencyFactor: header.currencyFactor,
              billingPeriodStart: header.billingPeriodStart,
              billingPeriodEnd: header.billingPeriodEnd,
              contractId: header.contractId,
              approvalStatus: 'pending',
              preparationRecordIds: selectedPrepIds.map((prepId) => new Types.ObjectId(prepId)),
              invoiceCategory: 'ADS',
              adsSplitFamilyId: familyId,
              adsSplitGroupKey: new Types.ObjectId().toHexString(),
              subtotalExclTax: 0,
              taxTotal: 0,
              totalInclTax: 0,
            },
            ctx,
          ),
        ],
        { session },
      );

      await this.lineModel.updateMany(
        { _id: { $in: selected.map((line) => line._id) } },
        { $set: { invoiceId: newHeader._id } },
        { session },
      );

      header.preparationRecordIds = remainingPrepIds.map(
        (prepId) => new Types.ObjectId(prepId),
      );
      await header.save({ session });

      if (selectedPrepIds.length > 0) {
        await this.preparationModel.updateMany(
          {
            _id: { $in: selectedPrepIds.map((prepId) => new Types.ObjectId(prepId)) },
            ...StationScope.filter({}, ctx),
          },
          { $set: { status: 'invoiced', invoiceDraftId: newHeader._id } },
          { session },
        );
      }
      if (remainingPrepIds.length > 0) {
        await this.preparationModel.updateMany(
          {
            _id: { $in: remainingPrepIds.map((prepId) => new Types.ObjectId(prepId)) },
            ...StationScope.filter({}, ctx),
          },
          { $set: { status: 'invoiced', invoiceDraftId: header._id } },
          { session },
        );
      }

      await this.renumberInvoiceLines(header._id, options);
      await this.renumberInvoiceLines(newHeader._id, options);
      await this.recalculateHeader(header, ctx, options);
      await this.recalculateHeader(newHeader, ctx, options);

      await this.audit(
        ctx,
        header._id,
        'updated',
        actor,
        {
          adsLinesSplitOut: selectedLineNos,
          splitDraftId: String(newHeader._id),
          splitDraftNumber: newHeader.draftNumber,
        },
        options,
      );
      await this.audit(
        ctx,
        newHeader._id,
        'created',
        actor,
        {
          splitFromDraftId: String(header._id),
          splitFromDraftNumber: header.draftNumber,
          adsLineCount: selected.length,
        },
        options,
      );
      createdDraftId = String(newHeader._id);
    });

    return successResponse({
      sourceDraftId: id,
      createdDraftId,
      created: await this.getHeader(ctx, createdDraftId),
    });
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateInvoiceDraftDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Draft cannot be edited');
    }
    if (dto.customerName) header.customerName = dto.customerName;
    if (dto.documentDate) header.documentDate = new Date(dto.documentDate);
    if (dto.currencyCode) header.currencyCode = dto.currencyCode;
    await header.save();
    await this.audit(ctx, header._id, 'updated', actor, dto as Record<string, unknown>,
    );
    return this.findOne(ctx, id);
  }

  async addLine(
    ctx: StationScopeContext,
    id: string,
    dto: AddInvoiceLineDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Cannot add lines');
    }
    const stationCode = StationScope.require(ctx);
    const last = await this.lineModel
      .findOne({ invoiceId: header._id })
      .sort({ lineNo: -1 })
      .lean();
    const lineNo = (last?.lineNo ?? 0) + 1;
    const lineAmountExclTax = round2(dto.quantity * dto.unitPrice);
    const tax = await this.taxEngine.calculateLine(ctx, {
      lineAmountExclTax,
      serviceCode: dto.serviceCode,
      documentDate: header.documentDate,
    });

    await this.lineModel.create({
      invoiceId: header._id,
      lineNo,
      lineType: 'service',
      serviceCode: dto.serviceCode,
      description: dto.description,
      quantity: dto.quantity,
      uom: dto.uom ?? 'Per Flight',
      unitPrice: dto.unitPrice,
      lineAmountExclTax,
      ...tax,
      stationCode,
    });

    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, { addLine: lineNo });
    return this.findOne(ctx, id);
  }

  async updateLine(
    ctx: StationScopeContext,
    id: string,
    lineNo: number,
    dto: UpdateInvoiceLineDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Invoice cannot be edited in its current status');
    }
    if (header.inBin) {
      throw new BadRequestException('Restore the draft from the invoice bin before editing');
    }
    const line = await this.lineModel.findOne({ invoiceId: header._id, lineNo,
    });
    if (!line) throw new NotFoundException('Line not found');

    this.applyInvoiceLinePatch(line, dto);
    line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
    const tax = await this.taxEngine.calculateLine(ctx, {
      lineAmountExclTax: line.lineAmountExclTax,
      serviceCode: line.serviceCode,
      documentDate: header.documentDate,
    });
    Object.assign(line, tax);
    await line.save();
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, { updateLine: lineNo });
    return this.findOne(ctx, id);
  }

  async updateLines(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateInvoiceLinesDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Invoice cannot be edited in its current status');
    }
    if (header.inBin) {
      throw new BadRequestException('Restore the draft from the invoice bin before editing');
    }
    const category = String(header.invoiceCategory ?? '').trim().toUpperCase();
    if (category === 'CUSTOM') {
      throw new BadRequestException(
        'Custom Bills use the custom-lines editor — open Edit invoice on a Custom draft',
      );
    }

    const items = dto.lines ?? [];
    if (items.length === 0) {
      throw new BadRequestException('No invoice lines to update');
    }

    for (const item of items) {
      const lineNo = Number(item.lineNo);
      if (!Number.isFinite(lineNo) || lineNo <= 0) {
        throw new BadRequestException('Each line must include a valid line number');
      }
      const line = await this.lineModel.findOne({ invoiceId: header._id, lineNo });
      if (!line) throw new NotFoundException(`Line ${lineNo} not found`);

      if (item.unitPrice != null && !(Number(item.unitPrice) > 0)) {
        throw new BadRequestException(`Line ${lineNo}: Rate/Unit must be greater than zero`);
      }
      if (item.quantity != null && !(Number(item.quantity) > 0)) {
        throw new BadRequestException(`Line ${lineNo}: Charged quantity must be greater than zero`);
      }

      this.applyInvoiceLinePatch(line, item);
      line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax: line.lineAmountExclTax,
        serviceCode: line.serviceCode,
        documentDate: header.documentDate,
      });
      Object.assign(line, tax);
      await line.save();
    }

    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      updateLines: items.map((item) => item.lineNo),
      source: 'invoice-detail-edit',
    });
    return this.findOne(ctx, id);
  }

  private applyInvoiceLinePatch(
    line: {
      description: string;
      quantity: number;
      unitPrice: number;
      uom?: string;
      sourceRef?: Record<string, unknown>;
      markModified?: (path: string) => void;
    },
    dto: UpdateInvoiceLineDto,
  ) {
    if (dto.description != null) {
      line.description = String(dto.description).trim() || line.description;
    }
    if (dto.quantity != null) line.quantity = dto.quantity;
    if (dto.unitPrice != null) line.unitPrice = dto.unitPrice;
    if (dto.uom != null) {
      const trimmed = String(dto.uom).trim();
      if (trimmed) line.uom = trimmed;
    }

    if (dto.usedQuantity != null || dto.quantity != null || dto.pricingBasis != null) {
      const ref = {
        ...((line.sourceRef ?? {}) as Record<string, unknown>),
      };
      if (dto.usedQuantity != null) ref.usedQuantity = dto.usedQuantity;
      if (dto.quantity != null) ref.chargedQuantity = dto.quantity;
      if (dto.pricingBasis != null) {
        const basis = String(dto.pricingBasis).trim();
        if (basis) ref.pricingBasis = basis;
      }
      line.sourceRef = ref;
      if (line.markModified) line.markModified('sourceRef');
    }
  }

  async deleteLine(
    ctx: StationScopeContext,
    id: string,
    lineNo: number,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    await this.lineModel.deleteOne({ invoiceId: header._id, lineNo });
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, { deleteLine: lineNo });
    return this.findOne(ctx, id);
  }

  async recalculate(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    const lines = await this.lineModel.find({ invoiceId: header._id });
    for (const line of lines) {
      line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax: line.lineAmountExclTax,
        serviceCode: line.serviceCode,
        documentDate: header.documentDate,
      });
      Object.assign(line, tax);
      await line.save();
    }
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, { recalculate: true });
    return this.findOne(ctx, id);
  }

  /**
   * ADS page totals (including wheelchair pax) count every flight in the period.
   * A draft only had the flights sent earlier, so regenerate under-counted.
   * Pull the same FHR ADS lines the billed-services page shows and attach any
   * that are not already on this draft.
   */
  private async ingestUnsentAdsUsageForDraft(
    ctx: StationScopeContext,
    header: BillingInvoiceHeaderDocument,
    actor: BillingActor,
  ): Promise<BillingPreparationRecordDocument[]> {
    const fromYmd = periodYmd(header.billingPeriodStart);
    const toYmd = periodYmd(header.billingPeriodEnd);
    const customerCode = String(header.customerCode ?? '').trim().toUpperCase();
    if (!fromYmd || !toYmd || !customerCode) return [];

    let rows: Awaited<ReturnType<BillingSourcesMaaFhrAdsService['list']>>['data']['rows'] =
      [];
    try {
      const listed = await this.adsSources.list(
        ctx,
        {
          from: fromYmd,
          to: toYmd,
          customerCode,
          dateBasis: 'schedule-date',
        },
        'ads',
      );
      rows = listed.data.rows.filter((row) => {
        if (row.sentToPreparation === true) return false;
        const code = String(row.operationalData?.customerCode ?? '')
          .trim()
          .toUpperCase();
        return !code || code === customerCode;
      });
    } catch {
      return [];
    }
    if (rows.length === 0) return [];

    const usageIds = [
      ...new Set(
        rows
          .map((row) =>
            String(
              (row.sourceRef as { usageRowId?: unknown } | undefined)?.usageRowId ?? '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    ];
    if (usageIds.length === 0) return [];

    const ingestRows = rows.map((row) => {
      const sourceRef = (row.sourceRef ?? {}) as {
        serialNo?: string;
        flightNo?: string;
        usageRowId?: string;
      };
      const operationalData = {
        ...((row.operationalData ?? {}) as Record<string, unknown>),
      };
      if (!String(operationalData.customerCode ?? '').trim()) {
        operationalData.customerCode = customerCode;
      }
      const validation = (row.validationStatus ?? {}) as {
        passed?: boolean;
        errors?: unknown[];
      };
      return {
        sourceType: String(row.sourceType ?? 'ads'),
        sourceRef: {
          serialNo: sourceRef.serialNo,
          flightNo: sourceRef.flightNo,
          usageRowId: sourceRef.usageRowId,
        },
        operationalData,
        contractMatch: row.contractMatch as never,
        rateMatch: row.rateMatch as never,
        validationStatus: validation,
        validationResults: validation.errors,
      };
    });

    for (let i = 0; i < ingestRows.length; i += 2000) {
      await this.preparationService.ingest(
        ctx,
        {
          billingPeriodStart: fromYmd,
          billingPeriodEnd: toYmd,
          rows: ingestRows.slice(i, i + 2000) as never,
        },
        actor,
      );
    }

    return this.preparationModel
      .find({
        ...StationScope.filter(
          {
            'sourceRef.usageRowId': { $in: usageIds },
            status: { $ne: 'rejected' },
            $or: [
              { invoiceDraftId: { $exists: false } },
              { invoiceDraftId: null },
              { invoiceDraftId: header._id },
            ],
          },
          ctx,
        ),
      })
      .exec();
  }

  /**
   * Recompute Invoice: re-enrich linked prep from live contracts / rate cards /
   * rules for this airline, then rebuild lines. ADS drafts also pull unsent
   * flights from the billed-services ADS page (same FHR wheelchair counts).
   *
   * Royalty Setup, Airport Setup → Configure rules, Aircraft Master, and
   * Equipment Master are never read. See BILLING_INVOICE_IGNORED_MASTERS.
   */
  async recomputeFromPreparation(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Only editable drafts can be recomputed');
    }
    if (header.adsSplitFamilyId) {
      throw new BadRequestException(
        'Split ADS drafts keep their selected line combinations and cannot be recomputed',
      );
    }
    if (String(header.invoiceCategory ?? '').trim().toUpperCase() === 'RAF') {
      throw new BadRequestException(
        'RAF drafts keep saved custom / adhoc rates. Edit Rate/Unit on the invoice instead of regenerating from preparation.',
      );
    }

    const prepIds = (header.preparationRecordIds ?? []).map((prepId) => String(prepId),
    );
    if (prepIds.length === 0) {
      throw new BadRequestException(
        'No preparation records are linked to this draft for recompute',
      );
    }

    invalidateInvoiceContractCache();
    this.currencyEngine.clearCache();
    this.taxEngine.clearCache();
    this.volumePopulationCache.clear();

    try {
      await this.preparationService.refreshByIds(ctx, prepIds, actor);
    } catch {
      // Still rebuild from current prep + live contract compose.
    }

    const linked = await this.preparationModel
      .find({
        _id: { $in: prepIds.map((prepId) => new Types.ObjectId(prepId)) },
        ...StationScope.filter({}, ctx),
      })
      .exec();

    if (linked.length === 0) {
      throw new BadRequestException(
        'Linked preparation records are missing or outside your station scope',
      );
    }

    const records: BillingPreparationRecordDocument[] = [...linked];
    if (String(header.invoiceCategory ?? '').trim().toUpperCase() === 'ADS') {
      const extras = await this.ingestUnsentAdsUsageForDraft(ctx, header, actor);
      const seen = new Set(records.map((record) => String(record._id)));
      for (const extra of extras) {
        const id = String(extra._id);
        if (seen.has(id)) continue;
        seen.add(id);
        records.push(extra);
      }
    }

    await this.rebuildDraftFromPreparationRecords(
      ctx,
      header,
      records,
      header.documentDate,
      actor,
      {
        recomputeInvoice: true,
        recomputeFromPreparation: true,
        customerCode: header.customerCode,
        source: 'invoice-detail-recompute-button',
        ignoredMasters: [...BILLING_INVOICE_IGNORED_MASTERS],
      },
    );

    return this.findOne(ctx, id);
  }

  /**
   * Refresh draft ROE from master Conversion Rates (prep month).
   * Prefers full prep rebuild for ADS/BHS so line pricing stays consistent with
   * the new factor; falls back to header-only ROE refresh when rebuild is not possible.
   * USD BHS/ADS drafts re-apply ROE to line unit prices after prep rebuild (prep stores INR).
   */
  /**
   * Primary customer currency applies only when the added airline opted into Customer master.
   * Bill-to stays the added customer.
   */
  private async resolveCommercialInvoiceCurrency(
    ctx: StationScopeContext,
    billedCustomerCode: string,
    contract: {
      customerCode?: string | null;
      additionalCustomerCodes?: string[] | null;
      additionalCustomerInherit?: Array<{ customerCode?: string; customer?: boolean }> | null;
    } | null,
    fallbackCurrency?: string | null,
  ): Promise<'INR' | 'USD'> {
    const flags = inheritForCustomer(billedCustomerCode, contract);
    const commercialCode = commercialCustomerCode(billedCustomerCode, contract);
    const billed = String(billedCustomerCode ?? '').trim().toUpperCase();
    if (!flags.customer || !commercialCode || commercialCode === billed) {
      return resolveBillingCurrency(fallbackCurrency);
    }
    const primary = await this.customerModel
      .findOne(StationScope.filter({ customerCode: commercialCode }, ctx))
      .select('currencyCode')
      .lean();
    return resolveBillingCurrency(primary?.currencyCode ?? fallbackCurrency);
  }

  async fortnightExchangeRateForHeader(
    ctx: StationScopeContext,
    header: { contractId?: unknown; customerCode?: string; stationCode?: string; documentDate?: Date; billingPeriodStart?: Date | null; billingPeriodEnd?: Date | null },
  ): Promise<number | null> {
    const customerCode = String(header.customerCode ?? '').trim().toUpperCase();
    const linked = await resolveActiveContractForInvoice(this.contractModel, ctx, {
      contractId: header.contractId,
      customerCode,
      documentDate: header.documentDate ?? new Date(),
      stationCode: header.stationCode ?? ctx.stationCode,
    });
    const contract = shapeContractForAdditionalCustomer(linked, customerCode) ?? linked;
    return fortnightExchangeRateForBillingPeriod(
      contract
        ? {
            enabled: contract.fortnightBillingEnabled,
            partCount: contract.fortnightBillingPartCount,
            ranges: contract.fortnightBillingRanges,
            monthRates: contract.fortnightBillingMonthRates,
          }
        : null,
      header.billingPeriodStart,
      header.billingPeriodEnd,
    );
  }

  async refreshRates(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Only editable drafts can refresh conversion rates');
    }
    if (header.inBin) {
      throw new BadRequestException('Restore the draft from the invoice bin before refreshing rates');
    }

    invalidateInvoiceContractCache();
    this.currencyEngine.clearCache();
    this.taxEngine.clearCache();
    this.volumePopulationCache.clear();

    const previousFactor = Number(header.currencyFactor) || null;
    const prepIds = (header.preparationRecordIds ?? []).map((prepId) => String(prepId));
    const canRebuildFromPrep = prepIds.length > 0 && !header.adsSplitFamilyId;

    const partRate = await this.fortnightExchangeRateForHeader(ctx, header);
    let factor: number;
    if (partRate != null) {
      factor = partRate;
    } else {
      try {
        factor = await this.currencyEngine.resolveFactor(
          ctx,
          'USD',
          header.documentDate,
          header.billingPeriodStart,
        );
      } catch {
        throw new BadRequestException(
          'No conversion rate found for this draft billing period. Add one under Conversion Rates, then retry.',
        );
      }
    }
    if (!(factor > 0)) {
      throw new BadRequestException('Resolved conversion rate is invalid');
    }

    if (canRebuildFromPrep) {
      const records = await this.preparationModel
        .find({
          _id: { $in: prepIds.map((prepId) => new Types.ObjectId(prepId)) },
          ...StationScope.filter({}, ctx),
        })
        .exec();

      if (records.length > 0) {
        await this.rebuildDraftFromPreparationRecords(
          ctx,
          header,
          records,
          header.documentDate,
          actor,
          {
            refreshRates: true,
            source: 'invoice-detail-refresh-rates-button',
            previousCurrencyFactor: previousFactor,
            currencyFactor: factor,
          },
        );

        const refreshedHeader = await this.getHeaderDoc(ctx, id);
        refreshedHeader.currencyFactor = factor;
        if (
          shouldApplyUsdRoeToLineAmounts(
            refreshedHeader.currencyCode,
            refreshedHeader.invoiceCategory,
            records,
          )
        ) {
          await this.applyUsdFactorToLineAmounts(ctx, refreshedHeader, factor);
        }
        await this.recalculateHeader(refreshedHeader, ctx);
        await this.audit(ctx, refreshedHeader._id, 'updated', actor, {
          refreshRates: true,
          rebuiltFromPreparation: true,
          previousCurrencyFactor: previousFactor,
          currencyFactor: factor,
          source: 'invoice-detail-refresh-rates-button',
        });
        return this.findOne(ctx, id);
      }
    }

    header.currencyFactor = factor;
    if (!header.customBillOverrides) {
      const customer = await this.customerModel
        .findOne(StationScope.filter({ customerCode: header.customerCode }, ctx))
        .lean();
      if (customer) {
        const name = resolveBillingCustomerInvoiceName(customer);
        if (name) header.customerName = name;
        const address = resolveBillingCustomerAddress(customer);
        if (address) header.customerAddress = address;
        header.pdfSnapshot = undefined;
      }
    }
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      refreshRates: true,
      headerOnly: true,
      previousCurrencyFactor: previousFactor,
      currencyFactor: factor,
      source: 'invoice-detail-refresh-rates-button',
    });
    return this.findOne(ctx, id);
  }

  /**
   * Universal refresh for all open (editable, not-in-bin) drafts:
   * - When linked preparation rows still exist: re-enrich from live ops/masters,
   *   then rebuild lines end-to-end.
   * - Otherwise: sync customer master + conversion rate + contract concessions
   *   onto the existing draft (lines stay as composed).
   * Posted invoices and bin drafts are never touched.
   */
  async refreshAllOpenDrafts(ctx: StationScopeContext, actor: BillingActor) {
    const drafts = await this.invoiceModel
      .find(
        StationScope.filter(
          {
            status: { $in: [...OPEN_INVOICE_DRAFT_STATUSES] },
            ...NOT_IN_BIN_FILTER,
          },
          ctx,
        ),
      )
      .select('_id draftNumber preparationRecordIds adsSplitFamilyId invoiceCategory')
      .lean();

    const prepIds = new Set<string>();
    for (const draft of drafts) {
      const ids = (draft.preparationRecordIds ?? []).map((prepId) => String(prepId));
      const category = String(draft.invoiceCategory ?? '').trim().toUpperCase();
      const canRebuild =
        ids.length > 0 && !draft.adsSplitFamilyId && category !== 'RAF';
      if (!canRebuild) continue;
      for (const prepId of ids) prepIds.add(prepId);
    }

    invalidateInvoiceContractCache();
    this.currencyEngine.clearCache();
    this.taxEngine.clearCache();
    this.volumePopulationCache.clear();

    let prepAlreadyRefreshed = prepIds.size === 0;
    if (prepIds.size > 0) {
      try {
        await this.preparationService.refreshByIds(ctx, [...prepIds], actor);
        prepAlreadyRefreshed = true;
      } catch {
        // Per-draft refresh still runs so one batch failure does not skip prices.
      }
    }

    let refreshed = 0;
    let rebuilt = 0;
    let mastersOnly = 0;
    let skipped = 0;
    const failed: Array<{ id: string; draftNumber?: string; message: string }> =
      [];

    const prepById = new Map<string, BillingPreparationRecordDocument>();
    if (prepIds.size > 0) {
      const loaded = await this.preparationModel
        .find({
          _id: { $in: [...prepIds].map((id) => new Types.ObjectId(id)) },
          ...StationScope.filter({}, ctx),
        })
        .exec();
      for (const row of loaded) prepById.set(String(row._id), row);
    }

    const concurrency = Math.min(8, Math.max(drafts.length, 1));
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < drafts.length) {
        const draft = drafts[cursor];
        cursor += 1;
        if (!draft) continue;
        const id = String(draft._id);
        try {
          const mode = await this.refreshOneOpenDraftFromMasters(ctx, id, actor, {
            prepAlreadyRefreshed,
            prepById,
          });
          if (mode === 'skipped') {
            skipped += 1;
            continue;
          }
          refreshed += 1;
          if (mode === 'rebuilt') rebuilt += 1;
          else mastersOnly += 1;
        } catch (err) {
          failed.push({
            id,
            draftNumber: draft.draftNumber
              ? String(draft.draftNumber)
              : undefined,
            message: err instanceof Error ? err.message : 'Refresh failed',
          });
        }
      }
    });
    await Promise.all(workers);

    return successResponse({
      refreshed,
      rebuilt,
      mastersOnly,
      skipped,
      failed,
      total: drafts.length,
    });
  }

  /**
   * Refresh a single open draft from masters / linked preparation.
   * Returns mode so bulk callers can aggregate without failing the batch.
   */
  private async refreshOneOpenDraftFromMasters(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
    options?: {
      prepAlreadyRefreshed?: boolean;
      prepById?: Map<string, BillingPreparationRecordDocument>;
    },
  ): Promise<'rebuilt' | 'masters' | 'skipped'> {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status) || header.inBin) {
      return 'skipped';
    }

    const prepIds = (header.preparationRecordIds ?? []).map((prepId) =>
      String(prepId),
    );
    const canRebuildFromPrep =
      prepIds.length > 0 &&
      !header.adsSplitFamilyId &&
      String(header.invoiceCategory ?? '').trim().toUpperCase() !== 'RAF';

    if (canRebuildFromPrep) {
      // Prices for every open draft are refreshed in one batch above.
      // Fall back to this draft only when that batch did not run.
      if (!options?.prepAlreadyRefreshed) {
        try {
          await this.preparationService.refreshByIds(ctx, prepIds, actor);
        } catch {
          // Fall through — rebuild may still succeed with existing prep snapshots.
        }
      }

      const records = options?.prepById
        ? prepIds
            .map((prepId) => options.prepById?.get(prepId))
            .filter((row): row is BillingPreparationRecordDocument => Boolean(row))
        : await this.preparationModel
            .find({
              _id: { $in: prepIds.map((prepId) => new Types.ObjectId(prepId)) },
              ...StationScope.filter({}, ctx),
            })
            .exec();

      if (records.length > 0) {
        await this.rebuildDraftFromPreparationRecords(
          ctx,
          header,
          records,
          header.documentDate instanceof Date
            ? header.documentDate
            : new Date(header.documentDate),
          actor,
          {
            refreshAllOpenDrafts: true,
            rebuiltFromPreparation: true,
            recomputeFromPreparation: true,
            customerCode: header.customerCode,
            source: 'invoice-drafts-refresh-all-button',
          },
        );
        return 'rebuilt';
      }
    }

    // Masters-only path (prep already cleared after compose, or ADS split drafts).
    if (!header.customBillOverrides) {
      const customer = await this.customerModel
        .findOne(
          StationScope.filter({ customerCode: header.customerCode }, ctx),
        )
        .lean();
      if (customer) {
        const name = resolveBillingCustomerInvoiceName(customer);
        if (name) header.customerName = name;
        const address = resolveBillingCustomerAddress(customer);
        if (address) header.customerAddress = address;
      }
    }

    if (!header.totalReceivableInUsd) {
      const partRate = await this.fortnightExchangeRateForHeader(ctx, header);
      if (partRate != null) {
        header.currencyFactor = partRate;
      } else {
        try {
          const factor = await this.currencyEngine.resolveFactor(
            ctx,
            'USD',
            header.documentDate,
            header.billingPeriodStart,
          );
          if (factor > 0) header.currencyFactor = factor;
        } catch {
          // Keep existing factor when no master conversion rate exists.
        }
      }
    }

    header.pdfSnapshot = undefined;
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      refreshAllOpenDrafts: true,
      mastersOnly: true,
      source: 'invoice-drafts-refresh-all-button',
    });
    return 'masters';
  }

  /**
   * Custom Bills only: update linked prep custom lines, then rebuild draft.
   * Works while draft is editable even if prep rows are already marked invoiced.
   */
  async updateCustomLines(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateCustomInvoiceDraftDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Draft cannot be edited in its current status');
    }
    if (header.inBin) {
      throw new BadRequestException('Restore the draft from the invoice bin before editing');
    }
    const category = String(header.invoiceCategory ?? '').trim().toUpperCase();
    if (category !== 'CUSTOM') {
      throw new BadRequestException('Custom line editing applies only to Custom Bills drafts');
    }

    const lines = dto.lines ?? [];
    if (lines.length === 0) {
      throw new BadRequestException('Add at least one custom billing line');
    }
    if (dto.concessionPercent != null) {
      const n = Number(dto.concessionPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new BadRequestException('Concession % must be between 0 and 100');
      }
    }
    if (dto.conversionRate != null && dto.conversionRate !== undefined) {
      const n = Number(dto.conversionRate);
      if (!Number.isFinite(n) || n <= 0) {
        throw new BadRequestException('Conversion rate must be greater than zero when set');
      }
    }
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

    const prepIds = (header.preparationRecordIds ?? []).map((prepId) => String(prepId));
    if (prepIds.length === 0) {
      throw new BadRequestException('No preparation records are linked to this Custom draft');
    }

    const records = await this.preparationModel
      .find({
        _id: { $in: prepIds.map((prepId) => new Types.ObjectId(prepId)) },
        sourceType: 'custom',
        ...StationScope.filter({}, ctx),
      })
      .exec();

    if (records.length === 0) {
      throw new BadRequestException(
        'Linked custom preparation records are missing or outside your station scope',
      );
    }

    await withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };
      for (const doc of records) {
        this.applyCustomLinesToPrepDoc(doc, lines, dto.concessionPercent, dto.conversionRate);
        await doc.save({ session });
      }
      await this.rebuildDraftFromPreparationRecords(
        ctx,
        header,
        records,
        header.documentDate,
        actor,
        {
          updateCustomLines: true,
          lineCount: lines.length,
          source: 'custom-invoice-edit',
        },
        sessionOpts,
      );
    });

    return this.findOne(ctx, id);
  }

  /**
   * Correct bill-to, GSTIN/PAN/state, location, service title, and line particulars
   * on an open draft without re-ingesting preparation (BHS/ADS/RAF). CUSTOM drafts
   * with line edits still rebuild from linked custom preparation records.
   */
  async updateCustomBill(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateCustomBillDraftDto,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canEdit(header.status)) {
      throw new BadRequestException('Draft cannot be edited in its current status');
    }
    if (header.inBin) {
      throw new BadRequestException('Restore the draft from the invoice bin before editing');
    }

    const category = String(header.invoiceCategory ?? '').trim().toUpperCase();
    const savedName = dto.billToName?.trim() || header.customerName;
    const savedAddress =
      dto.billToAddress !== undefined
        ? dto.billToAddress.trim() || undefined
        : header.customerAddress?.trim() || undefined;

    header.customBillOverrides = {
      billToGstin: dto.billToGstin?.trim() || undefined,
      billToPan: dto.billToPan?.trim() || undefined,
      billToStateCode: dto.billToStateCode?.trim() || undefined,
      placeOfSupply: dto.placeOfSupply?.trim() || undefined,
      serviceStation: dto.serviceStation?.trim() || undefined,
      serviceTableTitle: dto.serviceTableTitle?.trim() || undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.userName,
    };
    header.customerName = savedName;
    header.customerAddress = savedAddress;
    header.pdfSnapshot = undefined;

    const lineOverrides = dto.lines ?? [];
    if (lineOverrides.length > 0) {
      if (category === 'CUSTOM') {
        const customLines = lineOverrides.map((line) => {
          const particular = String(line.particular ?? line.description ?? '').trim();
          const used = Number(line.used ?? line.quantity ?? 0);
          const charged = Number(line.charged ?? line.quantity ?? used);
          return {
            particular,
            used,
            charged,
            aircraftType: String(line.aircraftType ?? '').trim(),
            unit: String(line.uom ?? 'Per Service').trim() || 'Per Service',
            ratePerUnit: Number(line.ratePerUnit ?? line.unitPrice ?? 0),
          };
        });
        await this.updateCustomLines(ctx, id, {
          lines: customLines,
          concessionPercent: dto.concessionPercent,
        }, actor);
        const refreshed = await this.getHeaderDoc(ctx, id);
        refreshed.customBillOverrides = header.customBillOverrides;
        refreshed.customerName = savedName;
        refreshed.customerAddress = savedAddress;
        refreshed.pdfSnapshot = undefined;
        await refreshed.save();
        await this.audit(ctx, refreshed._id, 'updated', actor, {
          customBill: true,
          lineCount: customLines.length,
        });
        return this.findOne(ctx, id);
      }

      for (const lineDto of lineOverrides) {
        const lineNo = Number(lineDto.lineNo);
        if (!Number.isFinite(lineNo) || lineNo < 1) {
          throw new BadRequestException('Each line override requires a valid line number');
        }
        const line = await this.lineModel.findOne({ invoiceId: header._id, lineNo });
        if (!line) {
          throw new BadRequestException(`Line ${lineNo} not found on this draft`);
        }
        if (lineDto.description?.trim()) line.description = lineDto.description.trim();
        if (lineDto.uom?.trim()) line.uom = lineDto.uom.trim();
        if (lineDto.quantity != null) line.quantity = Number(lineDto.quantity);
        if (lineDto.unitPrice != null) line.unitPrice = Number(lineDto.unitPrice);
        line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
        const tax = await this.taxEngine.calculateLine(ctx, {
          lineAmountExclTax: line.lineAmountExclTax,
          serviceCode: line.serviceCode,
          documentDate: header.documentDate,
        });
        Object.assign(line, tax);
        await line.save();
      }
      await this.recalculateHeader(header, ctx);
    } else {
      await header.save();
    }

    await this.audit(ctx, header._id, 'updated', actor, {
      customBill: true,
      lineCount: lineOverrides.length,
    });
    return this.findOne(ctx, id);
  }

  private applyCustomLinesToPrepDoc(
    doc: BillingPreparationRecordDocument,
    lines: UpdateCustomInvoiceDraftDto['lines'],
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
        ? Math.min(100, Math.max(0, Number(concessionPercent) || 0))
        : Math.min(100, Math.max(0, Number(prev.customConcessionPercent ?? 0) || 0));
    const resolvedConversionRate =
      conversionRate === null
        ? undefined
        : conversionRate !== undefined
          ? (() => {
              const n = Number(conversionRate);
              return Number.isFinite(n) && n > 0 ? n : undefined;
            })()
          : (() => {
              const n = Number(prev.customConversionRate ?? 0);
              return Number.isFinite(n) && n > 0 ? n : undefined;
            })();
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
   * Convert an INR draft to USD using the month-wise station exchange rate for the billing period,
   * then recalculate line amounts and header totals (GST remains on INR gross via ROE).
   */
  async convertToUsd(ctx: StationScopeContext, id: string, actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canConvertCurrency(header.status)) {
      throw new BadRequestException('Invoice currency cannot be changed in its current status',
      );
    }

    const partRate = await this.fortnightExchangeRateForHeader(ctx, header);
    const factor =
      partRate ??
      (await this.currencyEngine.resolveFactor(
        ctx,
        'USD',
        header.documentDate,
        header.billingPeriodStart,
      ));

    if (header.currencyCode === 'USD') {
      header.currencyFactor = factor;
      await this.recalculateHeader(header, ctx);
      await this.audit(ctx, header._id, 'updated', actor, {
        convertToUsd: true,
        refreshedRateOnly: true,
        currencyFactor: factor,
      });
      return this.findOne(ctx, id);
    }

    const lines = await this.lineModel.find({ invoiceId: header._id });
    if (lines.length === 0) {
      throw new BadRequestException('Draft has no lines to convert');
    }

    await this.applyUsdFactorToLineAmounts(ctx, header, factor, lines);

    header.currencyCode = 'USD';
    header.currencyFactor = factor;
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      convertToUsd: true,
      currencyFactor: factor,
      lineCount: lines.length,
    });
    return this.findOne(ctx, id);
  }

  /**
   * Convert line amounts to USD when needed, then apply concession and CGST/SGST on the USD gross.
   */
  async setTotalReceivableInUsd(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
  ) {
    let header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canConvertCurrency(header.status)) {
      throw new BadRequestException(
        'Invoice receivable currency cannot be changed in its current status',
      );
    }
    if (header.currencyCode !== 'USD') {
      await this.convertToUsd(ctx, id, actor);
      header = await this.getHeaderDoc(ctx, id);
    }

    header.totalReceivableInUsd = true;
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      totalReceivableInUsd: true,
      currencyFactor: header.currencyFactor,
    });
    return this.findOne(ctx, id);
  }

  /**
   * Convert line amounts to INR when needed, then apply concession and CGST/SGST on the INR gross.
   */
  async setTotalReceivableInInr(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canConvertCurrency(header.status)) {
      throw new BadRequestException(
        'Invoice receivable currency cannot be changed in its current status',
      );
    }
    if (header.currencyCode !== 'INR') {
      return this.convertToInr(ctx, id, actor);
    }

    header.totalReceivableInUsd = false;
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      totalReceivableInInr: true,
      currencyFactor: header.currencyFactor,
    });
    return this.findOne(ctx, id);
  }

  /**
   * Convert a USD draft to INR using the month-wise station exchange rate for the billing period,
   * converting Rate/Unit and Amount only — totals/concession stay in the new currency and GST is on INR.
   */
  async convertToInr(ctx: StationScopeContext, id: string, actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!this.approvalWorkflow.canConvertCurrency(header.status)) {
      throw new BadRequestException('Invoice currency cannot be changed in its current status',
      );
    }

    const factor = await this.currencyEngine.resolveFactor(
      ctx,
      'USD',
      header.documentDate,
      header.billingPeriodStart,
    );

    if (header.currencyCode === 'INR') {
      header.currencyFactor = factor;
      await this.recalculateHeader(header, ctx);
      await this.audit(ctx, header._id, 'updated', actor, {
        convertToInr: true,
        refreshedRateOnly: true,
        currencyFactor: factor,
      });
      return this.findOne(ctx, id);
    }

    const lines = await this.lineModel.find({ invoiceId: header._id });
    if (lines.length === 0) {
      throw new BadRequestException('Draft has no lines to convert');
    }

    for (const line of lines) {
      line.unitPrice = round2(line.unitPrice * factor);
      line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax: line.lineAmountExclTax,
        serviceCode: line.serviceCode,
        documentDate: header.documentDate,
      });
      Object.assign(line, tax);
      await line.save();
    }

    header.currencyCode = 'INR';
    // Keep ROE so Convert to USD can reverse; INR tax path ignores factor.
    header.currencyFactor = factor;
    header.totalReceivableInUsd = false;
    await this.recalculateHeader(header, ctx);
    await this.audit(ctx, header._id, 'updated', actor, {
      convertToInr: true,
      currencyFactor: factor,
      lineCount: lines.length,
    });
    return this.findOne(ctx, id);
  }

  async submitApproval(ctx: StationScopeContext, id: string, actor: BillingActor,
  ) {
    const header = await this.getHeaderDoc(ctx, id);
    const settings = await this.settingsModel
      .findOne({ stationCode: header.stationCode })
      .lean();
    if (!this.approvalWorkflow.canSubmit(header.status, settings?.approvalRequired ?? true,
      )) {
      throw new BadRequestException('Cannot submit for approval');
    }
    header.status = this.approvalWorkflow.submitForApproval(header.status);
    header.approvalStatus = 'pending';
    await header.save();
    await this.audit(ctx, header._id, 'updated', actor, { submitApproval: true,
    });
    return this.findOne(ctx, id);
  }

  async deleteDraft(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const header = await this.getHeaderDoc(ctx, id);
    if (!['draft', 'pending_approval'].includes(header.status)) {
      throw new BadRequestException('Only draft or pending-approval invoices can be deleted',
      );
    }
    return withBillingTransaction(this.connection, async (session, afterCommit) => {
      const sessionOpts: BillingSessionOptions = { session, afterCommit };
      await this.releasePreparationRecords(header, sessionOpts);
      await this.lineModel.deleteMany({ invoiceId: header._id }, { session });
      await header.deleteOne({ session });
      await this.audit(ctx, header._id, 'cancelled', actor, { deleteDraft: true },
        sessionOpts);
      return successResponse({ deleted: true });
    });
  }

  /**
   * Detach preparation rows from an open invoice draft and delete them
   * (scheduled flights "unsend" when flights are already on a draft).
   */
  async detachPreparationsForUnsend(
    ctx: StationScopeContext,
    prepDocs: BillingPreparationRecordDocument[],
    actor: BillingActor,
    options?: { aggregateAudit?: boolean },
  ): Promise<{ deletedCount: number; deletedIds: string[] }> {
    if (prepDocs.length === 0) {
      return { deletedCount: 0, deletedIds: [] };
    }

    const aggregateAudit = options?.aggregateAudit === true || prepDocs.length > 50;

    const draftIds = [
      ...new Set(
        prepDocs
          .map((doc) => (doc.invoiceDraftId ? String(doc.invoiceDraftId) : ''))
          .filter(Boolean),
      ),
    ];
    if (draftIds.length !== 1) {
      throw new BadRequestException(
        'Selected preparation rows must belong to the same open invoice draft',
      );
    }

    const removeIds = new Set(prepDocs.map((doc) => String(doc._id)));
    const header = await this.invoiceModel.findById(draftIds[0]);
    if (!header) {
      let deleted = 0;
      const deletedIds: string[] = [];
      for (const prep of prepDocs) {
        const result = await prep.deleteOne();
        const deletedCount = result.deletedCount ?? 0;
        deleted += deletedCount;
        if (deletedCount > 0) deletedIds.push(String(prep._id));
      }
      const deletedPreps = prepDocs.filter((prep) =>
        deletedIds.includes(String(prep._id)),
      );
      if (deletedPreps.length > 0) {
        if (aggregateAudit) {
          await this.auditEngine.log({
            entityType: 'preparation',
            entityId: deletedPreps[0]._id as Types.ObjectId,
            action: 'cancelled',
            userId: actor.userId,
            userName: actor.userName,
            actor,
            stationCode: deletedPreps[0].stationCode,
            changes: {
              deleted: true,
              missingInvoiceDraft: draftIds[0],
              bulkDetach: true,
              deletedCount: deletedPreps.length,
              sampleIds: deletedPreps.slice(0, 25).map((p) => String(p._id)),
            },
          });
        } else {
          await this.auditEngine.logBulk(
            deletedPreps.map((prep) => ({
              entityType: 'preparation',
              entityId: prep._id as Types.ObjectId,
              action: 'cancelled',
              userId: actor.userId,
              userName: actor.userName,
              actor,
              stationCode: prep.stationCode,
              changes: {
                deleted: true,
                missingInvoiceDraft: draftIds[0],
                bulkDetach: prepDocs.length > 1,
                status: prep.status,
                sourceType: prep.sourceType,
              },
            })),
          );
        }
      }
      return { deletedCount: deleted, deletedIds };
    }

    StationScope.assertOwnership(header, ctx);
    const draftId = String(header._id);

    if (!['draft', 'pending_approval'].includes(header.status)) {
      throw new BadRequestException(
        `Cannot unsend — flights are on ${header.status.replace(/_/g, ' ')} invoice ${header.draftNumber ?? header.invoiceNumber ?? ''}`,
      );
    }

    const remainingIds = (header.preparationRecordIds ?? [])
      .map((id) => String(id))
      .filter((id) => !removeIds.has(id));

    if (remainingIds.length === 0) {
      await this.lineModel.deleteMany({ invoiceId: header._id });
      await header.deleteOne();
      await this.audit(ctx, header._id, 'cancelled', actor, {
        deleteDraft: true,
        reason: 'All preparation rows unsent from scheduled flights',
      });
    } else {
      const remainingRecords = await this.preparationModel
        .find({
          _id: { $in: remainingIds.map((id) => new Types.ObjectId(id)) },
          ...StationScope.filter({}, ctx),
        })
        .exec();

      try {
        await this.rebuildDraftFromPreparationRecords(
          ctx,
          header,
          remainingRecords,
          header.documentDate,
          actor,
          {
            unsentPreparationIds: [...removeIds],
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        // Leftover rows produced no billable lines. Drop the open draft so the
        // selected preparation rows can still leave the station.
        if (!/no billable/i.test(message)) throw err;
        await this.lineModel.deleteMany({ invoiceId: header._id });
        await header.deleteOne();
        if (remainingIds.length > 0) {
          await this.preparationModel.updateMany(
            { _id: { $in: remainingIds.map((id) => new Types.ObjectId(id)) } },
            { $unset: { invoiceDraftId: '' }, $set: { status: 'pending' } },
          );
        }
      }
    }

    const result = await this.preparationModel.deleteMany({
      _id: { $in: [...removeIds].map((id) => new Types.ObjectId(id)) },
    });
    const remaining = await this.preparationModel
      .find({ _id: { $in: [...removeIds].map((id) => new Types.ObjectId(id)) } })
      .select('_id')
      .lean();
    const remainingSet = new Set(remaining.map((doc) => String(doc._id)));
    const deletedDocs = prepDocs.filter(
      (prep) => !remainingSet.has(String(prep._id)),
    );

    if (deletedDocs.length > 0) {
      if (aggregateAudit) {
        await this.auditEngine.log({
          entityType: 'preparation',
          entityId: deletedDocs[0]._id as Types.ObjectId,
          action: 'cancelled',
          userId: actor.userId,
          userName: actor.userName,
          actor,
          stationCode: deletedDocs[0].stationCode,
          changes: {
            deleted: true,
            unsentFromDraft: draftId,
            bulkDetach: true,
            deletedCount: deletedDocs.length,
            sampleIds: deletedDocs.slice(0, 25).map((p) => String(p._id)),
          },
        });
      } else {
        await this.auditEngine.logBulk(
          deletedDocs.map((prep) => ({
            entityType: 'preparation',
            entityId: prep._id as Types.ObjectId,
            action: 'cancelled',
            userId: actor.userId,
            userName: actor.userName,
            actor,
            stationCode: prep.stationCode,
            changes: {
              deleted: true,
              unsentFromDraft: draftId,
              bulkDetach: prepDocs.length > 1,
              status: prep.status,
              sourceType: prep.sourceType,
            },
          })),
        );
      }
    }
    return {
      deletedCount: result.deletedCount ?? 0,
      deletedIds: deletedDocs.map((doc) => String(doc._id)),
    };
  }

  async bulkDeleteDrafts(ctx: StationScopeContext, ids: string[], actor: BillingActor,
  ) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let deleted = 0;
    const failed: Array<{ id: string; message: string; label?: string }> = [];

    for (const id of uniqueIds) {
      try {
        await this.deleteDraft(ctx, id, actor);
        deleted += 1;
      } catch (err) {
        const header = await this.invoiceModel.findById(id).lean();
        failed.push({
          id,
          label: header?.draftNumber ?? header?.invoiceNumber,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  /**
   * Merge selected open drafts into one invoice for the same airline / period / category.
   * Selected drafts become one bill; sibling headers are removed.
   */
  async mergeSelectedDrafts(
    ctx: StationScopeContext,
    ids: string[],
    actor: BillingActor,
  ) {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Select at least two drafts to merge');
    }

    const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));
    const headers = await this.invoiceModel
      .find(
        StationScope.filter(
          {
            _id: { $in: objectIds },
            ...NOT_IN_BIN_FILTER,
          },
          ctx,
        ),
      )
      .exec();

    if (headers.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more selected drafts were not found in your station scope',
      );
    }

    for (const header of headers) {
      if (
        !OPEN_INVOICE_DRAFT_STATUSES.includes(
          header.status as (typeof OPEN_INVOICE_DRAFT_STATUSES)[number],
        )
      ) {
        throw new BadRequestException(
          `Cannot merge ${header.draftNumber ?? header.invoiceNumber ?? 'invoice'} — status is ${header.status}`,
        );
      }
    }

    const customerCodes = new Set(
      headers.map((h) => String(h.customerCode ?? '').trim().toUpperCase()),
    );
    if (customerCodes.size !== 1) {
      throw new BadRequestException('Selected drafts must belong to the same airline');
    }

    const periodKeys = new Set(
      headers.map(
        (h) =>
          `${toPeriodDay(h.billingPeriodStart)}|${toPeriodDay(h.billingPeriodEnd)}`,
      ),
    );
    if (periodKeys.size !== 1) {
      throw new BadRequestException('Selected drafts must share the same billing period');
    }

    const categories = new Set(
      headers.map((h) => String(h.invoiceCategory ?? 'BHS').trim().toUpperCase() || 'BHS'),
    );
    if (categories.size !== 1) {
      throw new BadRequestException(
        'Selected drafts must be the same invoice category (BHS, ADS, or RAF)',
      );
    }

    const sorted = [...headers].sort((a, b) => {
      const aTime = new Date(
        (a as { updatedAt?: Date }).updatedAt ?? a.documentDate,
      ).getTime();
      const bTime = new Date(
        (b as { updatedAt?: Date }).updatedAt ?? b.documentDate,
      ).getTime();
      return bTime - aTime;
    });
    const primary = sorted[0];
    const siblings = sorted.slice(1);

    const prepIdSet = new Set<string>();
    for (const inv of sorted) {
      for (const prepId of inv.preparationRecordIds ?? []) {
        prepIdSet.add(String(prepId));
      }
    }

    const selectedSplitFamilyIds = [
      ...new Set(
        headers
          .map((header) => header.adsSplitFamilyId?.trim())
          .filter((familyId): familyId is string => Boolean(familyId)),
      ),
    ];
    const remainingSplitSiblings =
      selectedSplitFamilyIds.length > 0
        ? await this.invoiceModel
            .find(
              StationScope.filter(
                {
                  _id: { $nin: objectIds },
                  adsSplitFamilyId: { $in: selectedSplitFamilyIds },
                  // Generated/posted and binned siblings still own their moved
                  // lines. Keep the family guard while any live sibling exists.
                  status: { $nin: ['cancelled', 'archived'] },
                },
                ctx,
              ),
            )
            .select('_id adsSplitFamilyId')
            .lean()
        : [];
    const remainingSplitFamilyIds = [
      ...new Set(
        remainingSplitSiblings
          .map((header) => header.adsSplitFamilyId?.trim())
          .filter((familyId): familyId is string => Boolean(familyId)),
      ),
    ];
    if (remainingSplitFamilyIds.length > 1) {
      throw new BadRequestException(
        'Select all drafts from each split ADS family before merging across split families',
      );
    }
    if (
      remainingSplitFamilyIds.length === 1 &&
      headers.some(
        (header) => header.adsSplitFamilyId?.trim() !== remainingSplitFamilyIds[0],
      )
    ) {
      throw new BadRequestException(
        'When partially merging split ADS bills, select drafts from the same split family only',
      );
    }
    const preserveSplitLineOwnership = selectedSplitFamilyIds.length > 0;

    await withBillingTransaction(this.connection, async (session, afterCommit) => {
      const options: BillingSessionOptions = { session, afterCommit };

      if (preserveSplitLineOwnership) {
        await this.moveInvoiceLinesWithoutCollisions(primary._id, siblings, options);
        await this.consolidateAdsInvoiceLines(primary._id, options);
        await this.renumberInvoiceLines(primary._id, options);
        const ownedPrepIds = collectPreparationIdsFromLines(
          await this.lineModel
            .find({ invoiceId: primary._id })
            .select('preparationRecordIds sourceRef')
            .session(session)
            .lean(),
        );
        primary.preparationRecordIds = ownedPrepIds.map(
          (prepId) => new Types.ObjectId(prepId),
        );
        if (ownedPrepIds.length > 0) {
          await this.preparationModel.updateMany(
            {
              _id: { $in: ownedPrepIds.map((prepId) => new Types.ObjectId(prepId)) },
              ...StationScope.filter({}, ctx),
            },
            { $set: { status: 'invoiced', invoiceDraftId: primary._id } },
            { session },
          );
        }
        if (remainingSplitFamilyIds.length === 1) {
          primary.adsSplitFamilyId = remainingSplitFamilyIds[0];
          primary.adsSplitGroupKey =
            primary.adsSplitGroupKey?.trim() || new Types.ObjectId().toHexString();
        } else {
          primary.adsSplitFamilyId = undefined;
          primary.adsSplitGroupKey = undefined;
        }
        await this.recalculateHeader(primary, ctx, options);
        await this.audit(
          ctx,
          primary._id,
          'updated',
          actor,
          {
            mergedSelectedDrafts: true,
            mergedInvoiceIds: siblings.map((s) => String(s._id)),
            splitLineOwnershipPreserved: true,
          },
          options,
        );
      } else if (prepIdSet.size > 0) {
        const records = await this.preparationModel
          .find({
            _id: { $in: [...prepIdSet].map((id) => new Types.ObjectId(id)) },
            ...StationScope.filter({}, ctx),
          })
          .session(session)
          .exec();

        await this.rebuildDraftFromPreparationRecords(
          ctx,
          primary,
          records,
          primary.documentDate,
          actor,
          {
            mergedSelectedDrafts: true,
            mergedInvoiceIds: siblings.map((s) => String(s._id)),
          },
          options,
        );
      } else {
        for (const sibling of siblings) {
          await this.lineModel.updateMany(
            { invoiceId: sibling._id },
            { $set: { invoiceId: primary._id } },
            { session },
          );
        }
        await this.renumberInvoiceLines(primary._id, options);
        await this.recalculateHeader(primary, ctx, options);
        await this.audit(
          ctx,
          primary._id,
          'updated',
          actor,
          {
            mergedSelectedDrafts: true,
            mergedInvoiceIds: siblings.map((s) => String(s._id)),
            lineMoveOnly: true,
          },
          options,
        );
      }

      if (remainingSplitFamilyIds.length === 0) {
        await this.invoiceModel.updateOne(
          { _id: primary._id },
          { $unset: { adsSplitFamilyId: '', adsSplitGroupKey: '' } },
          { session },
        );
      }

      for (const sibling of siblings) {
        await this.lineModel.deleteMany({ invoiceId: sibling._id }, { session });
        await sibling.deleteOne({ session });
        await this.audit(
          ctx,
          sibling._id,
          'cancelled',
          actor,
          {
            mergedIntoInvoiceId: String(primary._id),
            reason: 'Merged into selected draft invoice',
          },
          options,
        );
      }
    });

    return successResponse({
      primaryDraftId: String(primary._id),
      draftNumber: primary.draftNumber,
      mergedInvoiceIds: siblings.map((s) => String(s._id)),
      mergedCount: siblings.length,
    });
  }

  private async moveInvoiceLinesWithoutCollisions(
    primaryInvoiceId: Types.ObjectId,
    siblings: BillingInvoiceHeaderDocument[],
    options?: BillingSessionOptions,
  ) {
    let temporaryLineNo = -1_000_000;
    for (const sibling of siblings) {
      const lines = await this.lineModel
        .find({ invoiceId: sibling._id })
        .sort({ lineNo: 1, _id: 1 })
        .session(options?.session ?? null);
      for (const line of lines) {
        line.lineNo = temporaryLineNo;
        temporaryLineNo -= 1;
        await line.save({ session: options?.session });
        line.invoiceId = primaryInvoiceId;
        await line.save({ session: options?.session });
      }
    }
  }

  /**
   * One ADS row per equipment + aircraft + rate. Exact source duplicates are
   * retained once; disjoint source sets are aggregated into one visible row.
   */
  private async consolidateAdsInvoiceLines(
    invoiceId: Types.ObjectId,
    options?: BillingSessionOptions,
  ) {
    const lines = await this.lineModel
      .find({ invoiceId })
      .sort({ lineNo: 1, _id: 1 })
      .session(options?.session ?? null);
    const grouped = new Map<
      string,
      { line: BillingInvoiceLineDocument; preparationIds: string[] }
    >();

    for (const line of lines) {
      if (normalizedInvoiceLineToken(line.sourceType) !== 'ads') continue;
      const key = adsInvoiceLineKey(line);
      const preparationIds = invoiceLinePreparationIds(line);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { line, preparationIds });
        continue;
      }

      if (sameStringSet(existing.preparationIds, preparationIds)) {
        if (Number(line.lineAmountInclTax) > Number(existing.line.lineAmountInclTax)) {
          Object.assign(existing.line, {
            serviceCode: line.serviceCode,
            description: line.description,
            quantity: line.quantity,
            lineAmountExclTax: line.lineAmountExclTax,
            cgstAmount: line.cgstAmount,
            sgstAmount: line.sgstAmount,
            igstAmount: line.igstAmount,
            lineAmountInclTax: line.lineAmountInclTax,
            sourceRef: line.sourceRef,
            preparationRecordIds: preparationIds.map((prepId) => new Types.ObjectId(prepId)),
          });
          await existing.line.save({ session: options?.session });
        }
        await line.deleteOne({ session: options?.session });
        continue;
      }

      const existingRef = (existing.line.sourceRef ?? {}) as Record<string, unknown>;
      const incomingRef = (line.sourceRef ?? {}) as Record<string, unknown>;
      const mergedPreparationIds = [
        ...new Set([...existing.preparationIds, ...preparationIds]),
      ].sort();
      const existingCharged = Number(
        existingRef.chargedQuantity ?? existing.line.quantity,
      );
      const incomingCharged = Number(incomingRef.chargedQuantity ?? line.quantity);
      existing.line.quantity = Number(existing.line.quantity) + Number(line.quantity);
      existing.line.lineAmountExclTax =
        Number(existing.line.lineAmountExclTax) + Number(line.lineAmountExclTax);
      existing.line.cgstAmount = Number(existing.line.cgstAmount) + Number(line.cgstAmount);
      existing.line.sgstAmount = Number(existing.line.sgstAmount) + Number(line.sgstAmount);
      existing.line.igstAmount = Number(existing.line.igstAmount) + Number(line.igstAmount);
      existing.line.lineAmountInclTax =
        Number(existing.line.lineAmountInclTax) + Number(line.lineAmountInclTax);
      existing.line.preparationRecordIds = mergedPreparationIds.map(
        (prepId) => new Types.ObjectId(prepId),
      );
      existing.line.sourceRef = {
        ...existingRef,
        preparationRecordIds: mergedPreparationIds,
        usedQuantity:
          Number(existingRef.usedQuantity ?? 0) + Number(incomingRef.usedQuantity ?? 0),
        chargedQuantity: existingCharged + incomingCharged,
      };
      existing.preparationIds = mergedPreparationIds;
      await existing.line.save({ session: options?.session });
      await line.deleteOne({ session: options?.session });
    }
  }

  private async releasePreparationRecords(
    header: BillingInvoiceHeaderDocument,
    options?: BillingSessionOptions,
  ) {
    if (header.adsSplitFamilyId) {
      const sibling = await this.invoiceModel
        .findOne({
          _id: { $ne: header._id },
          stationCode: header.stationCode,
          adsSplitFamilyId: header.adsSplitFamilyId,
          status: { $in: DRAFT_STATUSES },
          ...NOT_IN_BIN_FILTER,
        })
        .session(options?.session ?? null);
      if (sibling) {
        // Split drafts own disjoint prep sets. Releasing this draft must not
        // attach its equipment to the sibling (that would double-count later).
        const ownedPrepIds = (header.preparationRecordIds ?? []).map(
          (id) => new Types.ObjectId(String(id)),
        );
        const filter =
          ownedPrepIds.length > 0
            ? {
                $or: [
                  { _id: { $in: ownedPrepIds } },
                  { invoiceDraftId: header._id },
                ],
              }
            : { invoiceDraftId: header._id };
        await this.preparationModel.updateMany(
          filter,
          {
            $set: { status: 'ready_for_invoice' },
            $unset: { invoiceDraftId: '', invoiceId: '' },
          },
          { session: options?.session },
        );
        return;
      }
    }

    const prepIds = (header.preparationRecordIds ?? []).map((id) => new Types.ObjectId(id),
    );
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

  private async attachPreparationRecords(
    ctx: StationScopeContext,
    header: BillingInvoiceHeaderDocument,
    ids: string[],
    documentDate: Date,
    actor: BillingActor,
  ) {
    const newRecords = await this.preparationModel.find(
      withPreparationVisibility({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        status: 'ready_for_invoice',
        ...StationScope.filter({}, ctx),
      }),
    );

    const existingIds = (header.preparationRecordIds ?? []).map((id) => String(id));
    if (existingIds.length > 0) {
      const liveExisting = await this.preparationModel.countDocuments({
        _id: { $in: existingIds.map((id) => new Types.ObjectId(id)) },
        ...StationScope.filter({}, ctx),
      });
      if (liveExisting === 0) {
        throw new BadRequestException(
          'Cannot attach preparation to this draft — linked preparation was already cleared after invoicing. Create a new invoice instead.',
        );
      }
    }

    const newIds = newRecords.map((r) => String(r._id));
    const allIds = [...new Set([...existingIds, ...newIds])];
    const allRecords = await this.preparationModel
      .find({
        _id: { $in: allIds.map((id) => new Types.ObjectId(id)) },
        ...StationScope.filter({}, ctx),
      })
      .exec();

    await this.rebuildDraftFromPreparationRecords(
      ctx,
      header,
      allRecords,
      documentDate,
      actor,
      { attachPreparation: newRecords.length },
    );
  }

  private async findOpenDraftForPeriod(
    ctx: StationScopeContext,
    composed: Awaited<ReturnType<InvoiceEngineService['composeFromPreparation']>>,
  ) {
    const category = composed.invoiceCategory ?? 'BHS';
    return this.invoiceModel.findOne(
      StationScope.filter(
        {
          ...exactBillingPeriodMatch(
            composed.customerCode,
            composed.billingPeriodStart,
            composed.billingPeriodEnd,
          ),
          status: { $in: [...OPEN_INVOICE_DRAFT_STATUSES] },
          ...NOT_IN_BIN_FILTER,
          ...(category === 'ADS' ? { adsSplitFamilyId: { $exists: false } } : {}),
          $or: [
            { invoiceCategory: category },
            // Legacy drafts without category: only match BHS groups.
            ...(category === 'BHS'
              ? [{ invoiceCategory: { $exists: false } }, { invoiceCategory: null }, { invoiceCategory: '' },
                ]
              : []),
          ],
        },
        ctx,
      ),
    );
  }

  private async insertComposedLines(
    header: BillingInvoiceHeaderDocument,
    composed: Awaited<ReturnType<InvoiceEngineService['composeFromPreparation']>>,
    stationCode: string,
    options?: BillingSessionOptions,
  ) {
    await this.lineModel.insertMany(
      composed.lines.map((l) => {
        const preparationRecordIds = [
          ...new Set(
            (
              l.preparationRecordIds ??
              (Array.isArray(l.sourceRef?.preparationRecordIds)
                ? (l.sourceRef?.preparationRecordIds as unknown[])
                : l.preparationRecordId
                  ? [l.preparationRecordId]
                  : [])
            )
              .map(String)
              .filter(Boolean),
          ),
        ].map((prepId) => new Types.ObjectId(prepId));

        return {
          invoiceId: header._id,
          lineNo: l.lineNo,
          lineType: l.lineType,
          serviceCode: l.serviceCode,
          description: l.description,
          quantity: l.quantity,
          uom: l.uom,
          unitPrice: l.unitPrice,
          lineDiscountPercent: l.lineDiscountPercent,
          lineAmountExclTax: l.lineAmountExclTax,
          gstPercent: l.gstPercent,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          lineAmountInclTax: l.lineAmountInclTax,
          sourceType: l.sourceType,
          sourceRef: l.sourceRef,
          preparationRecordIds,
          stationCode,
        };
      }),
      { session: options?.session },
    );
  }

  private async renumberInvoiceLines(
    invoiceId: Types.ObjectId,
    options?: BillingSessionOptions,
  ) {
    const lines = await this.lineModel
      .find({ invoiceId })
      .sort({ lineNo: 1, _id: 1 })
      .session(options?.session ?? null);

    for (let index = 0; index < lines.length; index += 1) {
      lines[index].lineNo = -(index + 1);
      await lines[index].save({ session: options?.session });
    }
    for (let index = 0; index < lines.length; index += 1) {
      lines[index].lineNo = index + 1;
      await lines[index].save({ session: options?.session });
    }
  }

  private readonly volumePopulationCache = new Map<
    string,
    { at: number; rows: BillingPreparationRecordDocument[] }
  >();

  /** Station Royalty Setup fees ride on the contract so each flight category picks its percent. */
  private async contractWithStationFlightConcession<T extends object | null | undefined>(
    ctx: StationScopeContext,
    contract: T,
    documentDate: Date,
    billingPeriod?: { start?: Date | string | null; end?: Date | string | null },
  ): Promise<T> {
    const stationCode = String(
      ctx.stationCode ??
        (contract as { stationCode?: string } | null | undefined)?.stationCode ??
        '',
    ).trim();
    if (!stationCode && !contract) return contract;
    const settings = await this.settingsModel
      .findOne(stationCode ? { stationCode } : StationScope.filter({}, ctx))
      .select('airportCommercial royaltyMaster')
      .lean();
    const stationFlightConcession = stationFlightConcessionPercents(
      settings,
      documentDate,
      billingPeriod,
    );
    if (!stationFlightConcession) return contract;
    return { ...(contract ?? {}), stationFlightConcession } as T;
  }

  private async bhsVolumeComposeOptions(
    ctx: StationScopeContext,
    contract: { bhsVolumeSchedules?: unknown[] | null } | null | undefined,
    currencyCode: 'INR' | 'USD',
    records: BillingPreparationRecordDocument[],
  ) {
    const schedules = contract?.bhsVolumeSchedules;
    if (currencyCode !== 'INR' || !Array.isArray(schedules) || schedules.length === 0) {
      return undefined;
    }
    const first = records[0];
    if (!first?.customerCode || !first.billingPeriodStart || !first.billingPeriodEnd) {
      return undefined;
    }
    const cacheKey = [
      ctx.stationCode ?? '',
      String(first.customerCode).toUpperCase(),
      new Date(first.billingPeriodStart).toISOString(),
      new Date(first.billingPeriodEnd).toISOString(),
    ].join('|');
    const cached = this.volumePopulationCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 30_000) {
      return { volumePopulation: cached.rows };
    }
    const found = await this.preparationModel
      .find(
        StationScope.filter(
          {
            customerCode: first.customerCode,
            sourceType: 'scheduled_flight',
            billingPeriodStart: first.billingPeriodStart,
            billingPeriodEnd: first.billingPeriodEnd,
            status: { $ne: 'rejected' },
          },
          ctx,
        ),
      )
      .select({
        operationalSnapshot: 1,
        sourceRef: 1,
        sourceType: 1,
        rateMatch: 1,
        billingPeriodStart: 1,
        billingPeriodEnd: 1,
        customerCode: 1,
        status: 1,
        validationResults: 1,
      })
      .lean();
    const byId = new Map<string, BillingPreparationRecordDocument>();
    for (const row of found) {
      byId.set(String(row._id), row as BillingPreparationRecordDocument);
    }
    for (const rec of records) {
      if (String(rec.sourceType ?? '') !== 'scheduled_flight') continue;
      const id = String(rec._id ?? '');
      if (id && !byId.has(id)) byId.set(id, rec);
    }
    const rows = [...byId.values()] as BillingPreparationRecordDocument[];
    this.volumePopulationCache.set(cacheKey, { at: Date.now(), rows });
    return { volumePopulation: rows };
  }

  private async rebuildDraftFromPreparationRecords(
    ctx: StationScopeContext,
    header: BillingInvoiceHeaderDocument,
    records: BillingPreparationRecordDocument[],
    documentDate: Date,
    actor: BillingActor,
    auditMeta: Record<string, unknown>,
    options?: BillingSessionOptions & {
      /** When set, skip a second month-population query. */
      volumeResolved?: boolean;
      volumeOptions?: { volumePopulation: BillingPreparationRecordDocument[] };
    },
  ) {
    if (records.length === 0) return;

    const stationCode = StationScope.require(ctx);
    const linkedContract = await resolveActiveContractForInvoice(this.contractModel, ctx, {
      contractId: header.contractId,
      customerCode: header.customerCode,
      documentDate,
      stationCode: header.stationCode ?? stationCode,
    });
    const contract = await this.contractWithStationFlightConcession(
      ctx,
      shapeContractForAdditionalCustomer(linkedContract, header.customerCode) ?? linkedContract,
      documentDate,
      {
        start: header.billingPeriodStart,
        end: header.billingPeriodEnd,
      },
    );
    const previousCurrency = String(header.currencyCode ?? 'INR').trim().toUpperCase();
    const currencyCode = await this.resolveCommercialInvoiceCurrency(
      ctx,
      header.customerCode,
      contract,
      header.currencyCode,
    );
    header.currencyCode = currencyCode;
    const volumeOptions =
      options?.volumeResolved &&
      options.volumeOptions &&
      previousCurrency === currencyCode
        ? options.volumeOptions
        : await this.bhsVolumeComposeOptions(ctx, contract, currencyCode, records);
    const ataYmds = records
      .map((row) => extractPreparationFlightYmd(row))
      .filter((ymd): ymd is string => Boolean(ymd));
    const partWindow = resolveFortnightPartForFlights(
      contract
        ? {
            enabled: contract.fortnightBillingEnabled,
            partCount: contract.fortnightBillingPartCount,
            ranges: contract.fortnightBillingRanges,
            monthRates: contract.fortnightBillingMonthRates,
            edgeDayCap: contract.fortnightEdgeDayCap,
          }
        : null,
      ataYmds,
    );
    const partRate =
      partWindow?.exchangeRatePerUsd ??
      (await this.fortnightExchangeRateForHeader(ctx, header));
    const composed = await this.invoiceEngine.composeFromPreparation(
      ctx,
      records,
      documentDate,
      currencyCode,
      contract,
      { ...volumeOptions, currencyFactorOverride: partRate ?? undefined },
    );
    if (partWindow) {
      composed.billingPeriodStart = partWindow.start;
      composed.billingPeriodEnd = partWindow.end;
      composed.currencyFactor = partWindow.exchangeRatePerUsd;
    }
    const customer = await this.customerModel
      .findOne(StationScope.filter({ customerCode: composed.customerCode }, ctx))
      .lean();

    const run = async (sessionOpts: BillingSessionOptions) => {

      await this.lineModel.deleteMany(
        { invoiceId: header._id },
        { session: sessionOpts.session },
      );
      await this.insertComposedLines(header, composed, stationCode, sessionOpts);

      const rebuildCategory =
        composed.invoiceCategory ??
        preparationInvoiceCategory(records[0]?.sourceType) ??
        header.invoiceCategory;
      if (
        shouldApplyUsdRoeToLineAmounts(header.currencyCode, rebuildCategory, records) &&
        composed.currencyFactor > 0
      ) {
        await this.applyUsdFactorToLineAmounts(
          ctx,
          header,
          composed.currencyFactor,
          undefined,
          sessionOpts,
        );
      }

      Object.assign(header, {
        pdfSnapshot: undefined,
        customerName: resolveBillingCustomerInvoiceName(customer, composed.customerName),
        customerAddress: resolveBillingCustomerAddress(customer),
        preparationRecordIds: composed.preparationRecordIds,
        billingPeriodStart: composed.billingPeriodStart,
        billingPeriodEnd: composed.billingPeriodEnd,
        contractId: composed.contractId,
        currencyCode,
        currencyFactor: composed.currencyFactor,
        invoiceCategory:
          composed.invoiceCategory ??
          preparationInvoiceCategory(records[0]?.sourceType) ??
          header.invoiceCategory ??
          'BHS',
      });
      await this.recalculateHeader(header, ctx, sessionOpts);

      // Keep linked prep as invoiced so open drafts remain refreshable from
      // live ops + masters. Hard delete happens on final PDF generate / orphan purge.
      await this.preparationModel.updateMany(
        { _id: { $in: composed.preparationRecordIds } },
        {
          $set: {
            status: 'invoiced',
            invoiceDraftId: header._id,
          },
        },
        { session: sessionOpts.session },
      );
      await this.audit(ctx, header._id, 'updated', actor, auditMeta, sessionOpts);
    };

    if (options?.session) {
      await run(options);
      return;
    }

    await withBillingTransaction(this.connection, async (session, afterCommit) => {
      await run({ session, afterCommit });
    });
  }

  /**
   * Recompose open draft lines from linked preparation records so contract
   * concession % (Dom/Int/diverted/…) is applied before PDF / totals.
   */
  async refreshOpenDraftFromPreparation(
    ctx: StationScopeContext,
    invoiceId: string,
    actor?: BillingActor,
    extras?: { records?: BillingPreparationRecordDocument[] },
  ): Promise<boolean> {
    const header = await this.invoiceModel.findById(invoiceId).exec();
    if (!header) return false;
    StationScope.assertOwnership(header, ctx);
    if (header.customBillOverrides?.updatedAt) {
      return false;
    }
    // RAF drafts keep user-saved custom / adhoc rates — never recompose from prep.
    if (String(header.invoiceCategory ?? '').trim().toUpperCase() === 'RAF') {
      return false;
    }
    if (header.adsSplitFamilyId) return false;
    if (header.totalReceivableInUsd) return false;
    if (
      !OPEN_INVOICE_DRAFT_STATUSES.includes(
        header.status as (typeof OPEN_INVOICE_DRAFT_STATUSES)[number],
      )
    ) {
      return false;
    }

    const prepIds = (header.preparationRecordIds ?? []).map((id) => String(id));
    if (prepIds.length === 0 && !extras?.records?.length) return false;

    const records =
      extras?.records ??
      (await this.preparationModel
        .find({
          _id: { $in: prepIds.map((id) => new Types.ObjectId(id)) },
          ...StationScope.filter({}, ctx),
        })
        .exec());
    if (records.length === 0) return false;

    const documentDate =
      header.documentDate instanceof Date
        ? header.documentDate
        : new Date(header.documentDate);
    const refreshActor = actor ?? { userId: 'system', userName: 'system' };
    const linkedContract = await resolveActiveContractForInvoice(this.contractModel, ctx, {
      contractId: header.contractId,
      customerCode: header.customerCode,
      documentDate,
      stationCode: header.stationCode ?? ctx.stationCode,
    });
    const contract = await this.contractWithStationFlightConcession(
      ctx,
      shapeContractForAdditionalCustomer(linkedContract, header.customerCode) ?? linkedContract,
      documentDate,
      {
        start: header.billingPeriodStart,
        end: header.billingPeriodEnd,
      },
    );
    const currencyCode = await this.resolveCommercialInvoiceCurrency(
      ctx,
      header.customerCode,
      contract,
      header.currencyCode,
    );
    header.currencyCode = currencyCode;
    const volumeOptions = await this.bhsVolumeComposeOptions(
      ctx,
      contract,
      currencyCode,
      records,
    );
    const rateGroups = splitBhsPreparationByUnitRate(records, contract, {
      currencyCode,
      volumePopulation: volumeOptions?.volumePopulation,
    });
    const ordered =
      rateGroups.length <= 1
        ? rateGroups
        : [...rateGroups].sort((a, b) => b.length - a.length || String(a[0]?._id).localeCompare(String(b[0]?._id)));

    await this.rebuildDraftFromPreparationRecords(
      ctx,
      header,
      ordered[0] ?? records,
      documentDate,
      refreshActor,
      { refreshedForConcession: true, bhsRateGroups: ordered.length },
      { volumeResolved: true, volumeOptions },
    );

    if (ordered.length > 1) {
      const stationCode = StationScope.require(ctx);
      const customer = await this.customerModel
        .findOne(StationScope.filter({ customerCode: header.customerCode }, ctx))
        .lean();
      for (const rateGroup of ordered.slice(1)) {
        const composed = await this.invoiceEngine.composeFromPreparation(
          ctx,
          rateGroup,
          documentDate,
          currencyCode,
          contract,
          {
            ...volumeOptions,
            currencyFactorOverride:
              (await this.fortnightExchangeRateForHeader(ctx, header)) ?? undefined,
          },
        );
        const draftNumber = await this.nextDraftNumber(stationCode);
        await withBillingTransaction(this.connection, async (session, afterCommit) => {
          const sessionOpts: BillingSessionOptions = { session, afterCommit };
          const [created] = await this.invoiceModel.create(
            [
              StationScope.stampCreate(
                {
                  draftNumber,
                  customerCode: composed.customerCode,
                  customerName: resolveBillingCustomerInvoiceName(
                    customer,
                    composed.customerName,
                  ),
                  customerAddress: resolveBillingCustomerAddress(customer),
                  status: header.status,
                  documentDate,
                  currencyCode: composed.currencyCode,
                  currencyFactor: composed.currencyFactor,
                  billingPeriodStart: composed.billingPeriodStart,
                  billingPeriodEnd: composed.billingPeriodEnd,
                  contractId: composed.contractId,
                  invoiceCategory: composed.invoiceCategory ?? 'BHS',
                  subtotalExclTax: composed.subtotalExclTax,
                  taxTotal: composed.taxTotal,
                  totalInclTax: composed.totalInclTax,
                  approvalStatus: header.approvalStatus ?? 'pending',
                  preparationRecordIds: composed.preparationRecordIds,
                },
                ctx,
              ),
            ],
            { session },
          );
          await this.insertComposedLines(created, composed, stationCode, sessionOpts);
          if (
            shouldApplyUsdRoeToLineAmounts(
              composed.currencyCode,
              composed.invoiceCategory,
              rateGroup,
            ) &&
            composed.currencyFactor > 0
          ) {
            await this.applyUsdFactorToLineAmounts(
              ctx,
              created,
              composed.currencyFactor,
              undefined,
              sessionOpts,
            );
          }
          await this.recalculateHeader(created, ctx, sessionOpts);
          await this.preparationModel.updateMany(
            { _id: { $in: composed.preparationRecordIds } },
            { $set: { status: 'invoiced', invoiceDraftId: created._id } },
            { session },
          );
          await this.audit(ctx, created._id, 'created', refreshActor, {
            splitFromDraftId: String(header._id),
            reason: 'BHS drafts split by rate per unit',
          }, sessionOpts);
        });
      }
    }
    return true;
  }

  /**
   * Rebuild open ADS invoice drafts for an airline after contract ADS rules /
   * concessions change (lines + fee % stay in sync).
   */
  async refreshOpenAdsDraftsForCustomer(
    ctx: StationScopeContext,
    customerCode: string,
    actor?: BillingActor,
  ): Promise<{ refreshed: number }> {
    const code = customerCode.trim().toUpperCase();
    if (!code) return { refreshed: 0 };

    const drafts = await this.invoiceModel
      .find(
        StationScope.filter(
          {
            customerCode: code,
            status: { $in: [...OPEN_INVOICE_DRAFT_STATUSES] },
            $or: [
              { invoiceCategory: 'ADS' },
              { invoiceCategory: { $exists: false } },
              { invoiceCategory: null },
              { invoiceCategory: '' },
            ],
          },
          ctx,
        ),
      )
      .select('_id invoiceCategory preparationRecordIds')
      .lean();

    let refreshed = 0;
    for (const draft of drafts) {
      const category = String(draft.invoiceCategory ?? '').trim().toUpperCase();
      // Skip known non-ADS categories; refresh unknown/empty only if linked prep is ADS.
      if (category === 'BHS' || category === 'RAF') continue;
      if (category !== 'ADS') {
        const prepIds = (draft.preparationRecordIds ?? []).map((id) => String(id));
        if (prepIds.length === 0) continue;
        const adsPrep = await this.preparationModel
          .countDocuments({
            _id: { $in: prepIds.map((id) => new Types.ObjectId(id)) },
            sourceType: { $in: ['ads', 'equipment', 'manpower'] },
            ...StationScope.filter({}, ctx),
          })
          .exec();
        if (adsPrep === 0) continue;
      }
      const ok = await this.refreshOpenDraftFromPreparation(
        ctx,
        String(draft._id),
        actor,
      );
      if (ok) refreshed += 1;
    }
    return { refreshed };
  }

  /**
   * Merge sibling draft / pending-approval invoices for the same airline + billing period
   * into the invoice being approved, with quantities and totals re-summed.
   */
  async consolidateInvoicesForApproval(
    ctx: StationScopeContext,
    primaryInvoiceId: string,
    actor: BillingActor,
  ): Promise<{ mergedInvoiceIds: string[]; totalFlights: number }> {
    const primary = await this.getHeaderDoc(ctx, primaryInvoiceId);
    if (primary.adsSplitFamilyId) {
      return {
        mergedInvoiceIds: [],
        totalFlights: new Set((primary.preparationRecordIds ?? []).map(String)).size,
      };
    }

    const siblingDocs = await this.invoiceModel
      .find(
        StationScope.filter(
          {
            ...exactBillingPeriodMatch(
              primary.customerCode,
              primary.billingPeriodStart,
              primary.billingPeriodEnd,
            ),
            status: { $in: [...OPEN_INVOICE_DRAFT_STATUSES] },
            _id: { $ne: primary._id },
            ...NOT_IN_BIN_FILTER,
          },
          ctx,
        ),
      )
      .exec();
    const primaryCategory = String(primary.invoiceCategory ?? '').trim().toUpperCase();
    let siblings = siblingDocs.filter((sibling) => {
      const category = String(sibling.invoiceCategory ?? '').trim().toUpperCase();
      if (primaryCategory && category && category !== primaryCategory) return false;
      return true;
    });
    if (primaryCategory === 'BHS' && siblings.length > 0) {
      const primaryLines = await this.lineModel
        .find({ invoiceId: primary._id })
        .select('unitPrice')
        .lean();
      const primaryRate = bhsUnitRateSignature(primaryLines);
      const sameRate: typeof siblings = [];
      for (const sibling of siblings) {
        const lines = await this.lineModel
          .find({ invoiceId: sibling._id })
          .select('unitPrice')
          .lean();
        if (bhsUnitRateSignature(lines) === primaryRate) sameRate.push(sibling);
      }
      siblings = sameRate;
    }

    const prepIdSet = new Set<string>();
    for (const inv of [primary, ...siblings]) {
      for (const prepId of inv.preparationRecordIds ?? []) {
        prepIdSet.add(String(prepId));
      }
    }

    const allRecords =
      prepIdSet.size > 0
        ? await this.preparationModel
            .find({
              _id: { $in: [...prepIdSet].map((id) => new Types.ObjectId(id)) },
              ...StationScope.filter({}, ctx),
            })
            .exec()
        : [];

    if (siblings.length > 0 || allRecords.length > 0) {
      await this.rebuildDraftFromPreparationRecords(
        ctx,
        primary,
        allRecords,
        primary.documentDate,
        actor,
        {
          consolidatedForApproval: true,
          mergedInvoiceIds: siblings.map((s) => String(s._id)),
        },
      );
    }

    const mergedInvoiceIds: string[] = [];
    for (const sibling of siblings) {
      const siblingId = String(sibling._id);
      mergedInvoiceIds.push(siblingId);
      await this.lineModel.deleteMany({ invoiceId: sibling._id });
      await sibling.deleteOne();
      await this.audit(ctx, sibling._id, 'cancelled', actor, {
        mergedIntoInvoiceId: primaryInvoiceId,
        reason: 'Consolidated into single final invoice on approval',
      });
    }

    return {
      mergedInvoiceIds,
      totalFlights: allRecords.length,
    };
  }

  private async recalculateHeader(
    header: BillingInvoiceHeaderDocument,
    ctx: StationScopeContext,
    options?: BillingSessionOptions,
  ) {
    const lines = await this.lineModel
      .find({ invoiceId: header._id })
      .session(options?.session ?? null)
      .lean();
    const lineTotals = this.invoiceEngine.sumLines(lines);
    header.subtotalExclTax = lineTotals.subtotalExclTax;

    // USD receivable mode: keep line amounts + ROE as-is; only header tax totals change.
    // Fortnight parts keep the rate saved on that part. Other invoices use Conversion Rates.
    if (!header.totalReceivableInUsd) {
      const partRate = await this.fortnightExchangeRateForHeader(ctx, header);
      if (partRate != null) {
        header.currencyFactor = partRate;
      } else {
        try {
          const resolved = await this.currencyEngine.resolveFactor(
            ctx,
            'USD',
            header.documentDate,
            header.billingPeriodStart,
          );
          if (resolved > 0) header.currencyFactor = resolved;
        } catch {
          // Keep existing factor if no master rate exists yet.
        }
      }
    }

    const linkedContract = await resolveActiveContractForInvoice(this.contractModel, ctx, header);
    if (linkedContract?._id && !header.contractId) {
      header.contractId = linkedContract._id as Types.ObjectId;
    }
    const contract = await this.contractWithStationFlightConcession(
      ctx,
      linkedContract,
      header.documentDate instanceof Date ? header.documentDate : new Date(header.documentDate),
      {
        start: header.billingPeriodStart,
        end: header.billingPeriodEnd,
      },
    );

    const ceilingLineIds = lines
      .filter((line) => isCeilingParticularLine(line) && line._id)
      .map((line) => line._id);
    if (ceilingLineIds.length > 0) {
      await this.lineModel.deleteMany(
        { _id: { $in: ceilingLineIds } },
        { session: options?.session },
      );
    }

    const scheduledFlightCount = await this.countInvoiceScheduledFlights(header, lines, options);
    applyConcessionTotalsToHeader(header, lines, contract, {
      scheduledFlightCount,
      adsConcession: String(header.invoiceCategory ?? '').trim().toUpperCase() === 'ADS',
    });
    await header.save({ session: options?.session });
  }

  /** Scheduled flights linked to this invoice. Line quantities are the fallback. */
  private async countInvoiceScheduledFlights(
    header: BillingInvoiceHeaderDocument,
    lines: Array<{ quantity?: number; sourceType?: string; serviceCode?: string; description?: string; preparationRecordIds?: unknown[]; sourceRef?: Record<string, unknown> }>,
    options?: BillingSessionOptions,
  ): Promise<number> {
    const prepIds = (header.preparationRecordIds ?? [])
      .map((id) => String(id))
      .filter((id) => Types.ObjectId.isValid(id));
    if (prepIds.length > 0) {
      const count = await this.preparationModel
        .countDocuments({
          _id: { $in: prepIds.map((id) => new Types.ObjectId(id)) },
          sourceType: 'scheduled_flight',
        })
        .session(options?.session ?? null);
      if (count > 0) return count;
    }
    const ids = new Set<string>();
    let qty = 0;
    for (const line of lines) {
      if (isCeilingParticularLine(line)) continue;
      const nestedRaw =
        line.preparationRecordIds ??
        (Array.isArray(line.sourceRef?.preparationRecordIds)
          ? line.sourceRef.preparationRecordIds
          : []);
      const nested = nestedRaw.filter(
        (id) => {
          const key = String(id ?? '').trim();
          return key.length > 0 && key !== 'undefined' && key !== 'null';
        },
      );
      if (nested.length > 0) {
        for (const id of nested) ids.add(String(id).trim());
        continue;
      }
      const sourceType = String(line.sourceType ?? '').trim().toLowerCase();
      const service = String(line.serviceCode ?? '').trim().toLowerCase();
      const isFlight =
        sourceType === 'scheduled_flight' ||
        service === 'bhs' ||
        service === 'scheduled flight' ||
        service === 'trnd' ||
        /^charges for turnaround handling/i.test(String(line.description ?? ''));
      if (!isFlight) continue;
      const count = Number(line.quantity);
      if (Number.isFinite(count) && count > 0) qty += count;
    }
    return ids.size > 0 ? ids.size : qty;
  }

  private async applyUsdFactorToLineAmounts(
    ctx: StationScopeContext,
    header: BillingInvoiceHeaderDocument,
    factor: number,
    lines?: BillingInvoiceLineDocument[],
    options?: BillingSessionOptions,
  ) {
    if (!(factor > 0)) {
      throw new BadRequestException('Invalid conversion rate for USD line conversion');
    }
    const lineDocs =
      lines ??
      (await this.lineModel
        .find({ invoiceId: header._id })
        .session(options?.session ?? null)
        .exec());
    if (lineDocs.length === 0) {
      throw new BadRequestException('Draft has no lines to convert');
    }
    for (const line of lineDocs) {
      if (!line) continue;
      line.unitPrice = roundUsdPrice(line.unitPrice / factor);
      line.lineAmountExclTax = round2(line.quantity * line.unitPrice);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax: line.lineAmountExclTax,
        serviceCode: line.serviceCode,
        documentDate: header.documentDate,
      });
      Object.assign(line, tax);
      await line.save({ session: options?.session });
    }
  }

  private async nextDraftNumber(stationCode: string) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const tick = Date.now().toString().slice(-6);
      const random = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const candidate = `DRAFT/${stationCode}/${date}/${tick}${random}`;
      const exists = await this.invoiceModel.exists({
        stationCode,
        draftNumber: candidate,
      });
      if (!exists) return candidate;
    }
    throw new Error('Unable to allocate a unique draft number. Please retry.');
  }

  private async getHeader(ctx: StationScopeContext, id: string) {
    const doc = await this.invoiceModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(doc, ctx);
    return doc;
  }

  private async getHeaderDoc(ctx: StationScopeContext, id: string) {
    const doc = await this.invoiceModel.findById(id);
    if (!doc) throw new NotFoundException('Invoice not found');
    StationScope.assertOwnership(doc, ctx);
    return doc;
  }

  private async audit(
    ctx: StationScopeContext,
    entityId: Types.ObjectId,
    action: string,
    actor: BillingActor,
    changes?: Record<string, unknown>,
    options?: BillingSessionOptions,
  ) {
    await this.auditEngine.log(
      {
        entityType: 'invoice',
        entityId,
        action,
        userId: actor.userId,
        userName: actor.userName,
        actor,
        stationCode: StationScope.require(ctx),
        changes,
      },
      options,
    );
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function roundUsdPrice(n: number) {
  return Math.round(n * 10_000) / 10_000;
}

function toPeriodDay(value: Date | string | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function bhsUnitRateSignature(lines: Array<{ unitPrice?: number | null }>): string {
  const prices = [
    ...new Set(
      lines
        .map((line) => Number(line.unitPrice ?? 0))
        .filter((price) => Number.isFinite(price) && price > 0)
        .map((price) => price.toFixed(2)),
    ),
  ].sort();
  return prices.join('|');
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
