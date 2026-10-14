import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { normalizeAdditionalCustomerInherit } from '../utils/additional-customer-inherit.util';
import {
  BillingContract,
  BillingContractDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingPriceCardAirline,
  BillingPriceCardAirlineDocument,
  BillingRateCard,
  BillingRateCardDocument,
} from '../schemas/billing.schemas';
import {
  legacyClauseFields,
  normalizeContractClauses,
} from '../shared/contract-clauses';
import { normalizePriceCardReference } from '../shared/price-card-references';
import { sanitizeBhsVolumeSchedules } from '../utils/bhs-volume-schedule.util';
import { normalizeContractFortnightBillingConfig } from '../utils/contract-fortnight-billing.util';
import { invalidateInvoiceContractCache } from '../utils/invoice-concession.util';
import {
  StationScope,
  successResponse,
  type StationScopeContext,
} from '../common/station-scope';
import {
  CreateBillingContractDto,
  CreateBillingRateCardDto,
  MatchRateCardQueryDto,
  UpdateBillingContractDto,
  UpdateBillingRateCardDto,
  type ContractAdsEquipmentRuleDto,
} from '../dto/billing-contract.dto';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import { mergeHandlingTypes } from '../shared/price-card-handling';
import {
  isAdsHourlyUom,
  normalizeBillingScope,
} from '../shared/rate-card-billing-scope';
import { BillingPreparationService } from './billing-preparation.service';
import { BillingInvoiceDraftsService } from './billing-invoice-drafts.service';
import { BillingKycService } from './billing-kyc.service';
import {
  sanitizeAdsRuleAircraftTypes,
  sanitizeContractAircraftTypes,
} from '../shared/contract-aircraft-type.util';

type AdsRuleSyncContract = {
  _id: Types.ObjectId;
  customerCode: string;
  stationCode: string;
  category: string;
  aircraftTypes?: string[];
  priceValidFrom: Date;
  priceValidTo: Date;
  adsBillingEnabled?: boolean;
  adsEquipmentRules?: ContractAdsEquipmentRuleDto[];
};

/** Expand ADS rule → Dom/Int rate-card categories (Both contract duplicates when rule omits category). */
function resolveAdsRuleFlightCategories(
  contractCategory: string,
  ruleCategory?: string | null,
): Array<'Dom' | 'Int'> {
  const rule = String(ruleCategory ?? '').trim();
  if (rule === 'Dom' || rule === 'Int') return [rule];
  const contract = String(contractCategory ?? '').trim() || 'Int';
  if (contract === 'Both') return ['Dom', 'Int'];
  if (contract === 'Dom') return ['Dom'];
  return ['Int'];
}

function sanitizeContractAdsRules(
  rules?: ContractAdsEquipmentRuleDto[],
): ContractAdsEquipmentRuleDto[] {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => sanitizeAdsRuleAircraftTypes(rule));
}

@Injectable()
export class BillingContractsService {
  private readonly logger = new Logger(BillingContractsService.name);

  constructor(
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    private readonly auditEngine: AuditEngineService,
    @Inject(forwardRef(() => BillingPreparationService))
    private readonly preparationService: BillingPreparationService,
    @Inject(forwardRef(() => BillingInvoiceDraftsService))
    private readonly invoiceDraftsService: BillingInvoiceDraftsService,
    private readonly kycService: BillingKycService,
  ) {}

  async list(ctx: StationScopeContext, customerCode?: string) {
    const code = customerCode?.trim().toUpperCase();
    const filter = StationScope.filter(
      code
        ? { $or: [{ customerCode: code }, { additionalCustomerCodes: code }] }
        : {},
      ctx,
    );
    const items = await this.contractModel.find(filter).sort({ priceValidFrom: -1 }).lean();
    return successResponse({
      items: items.map((item) => this.presentContract(item)),
      total: items.length,
    });
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.contractModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Contract not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(this.presentContract(doc));
  }

  async create(ctx: StationScopeContext, dto: CreateBillingContractDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const exists = await this.contractModel.exists({
      stationCode,
      contractNumber: dto.contractNumber,
    });
    if (exists) throw new ConflictException('Contract number already exists');

    const clauses = normalizeContractClauses(dto.clauses, {
      xxlnClause: dto.xxlnClause,
      delayClause: dto.delayClause,
    });
    const fortnightBilling = this.normalizeFortnightBillingOrThrow({
      enabled: dto.fortnightBillingEnabled,
      partCount: dto.fortnightBillingPartCount,
      ranges: dto.fortnightBillingRanges,
      monthRates: dto.fortnightBillingMonthRates,
      edgeDayCap: dto.fortnightEdgeDayCap,
    });
    const legacy = legacyClauseFields(clauses);

    const created = await this.contractModel.create(
      StationScope.stampCreate(
        {
          ...dto,
          customerCode: dto.customerCode.toUpperCase(),
          category: legacyCategoryFromSectors(
            normalizeContractSectors(dto.categories, dto.category),
          ),
          categories: normalizeContractSectors(dto.categories, dto.category),
          additionalCustomerCodes: normalizeAdditionalCustomerCodes(
            dto.customerCode,
            dto.additionalCustomerCodes,
          ),
          additionalCustomerInherit: normalizeAdditionalCustomerInherit(
            dto.customerCode,
            normalizeAdditionalCustomerCodes(dto.customerCode, dto.additionalCustomerCodes),
            dto.additionalCustomerInherit,
          ),
          priceValidFrom: new Date(dto.priceValidFrom),
          priceValidTo: new Date(dto.priceValidTo),
          aircraftTypes: sanitizeContractAircraftTypes(dto.aircraftTypes ?? []),
          clauses,
          xxlnClause: legacy.xxlnClause,
          delayClause: legacy.delayClause,
          adsBillingEnabled:
            Boolean(dto.adsBillingEnabled) ||
            (dto.adsEquipmentRules?.length ?? 0) > 0,
          adsEquipmentRules: sanitizeContractAdsRules(dto.adsEquipmentRules),
          bhsVolumeSchedules: sanitizeBhsVolumeSchedules(dto.bhsVolumeSchedules),
          fortnightBillingEnabled: fortnightBilling.enabled,
          fortnightEdgeDayCap: fortnightBilling.edgeDayCap === true,
          fortnightBillingPartCount: fortnightBilling.partCount,
          fortnightBillingRanges: fortnightBilling.ranges ?? [],
          fortnightBillingMonthRates: fortnightBilling.monthRates ?? [],
          contractPdfFileName: dto.contractPdfFileName,
          contractPdfContentType: dto.contractPdfContentType,
          contractPdfBase64: dto.contractPdfBase64,
          contractPdfUploadedAt: dto.contractPdfBase64
            ? dto.contractPdfUploadedAt
              ? new Date(dto.contractPdfUploadedAt)
              : new Date()
            : undefined,
          status: 'active',
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'contract',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    // Heavy ADS sync runs after response — keep create/save snappy.
    this.scheduleAdsSideEffects(
      ctx,
      created.toObject() as AdsRuleSyncContract,
      actor,
    );

    return successResponse(this.presentContract(created.toObject()));
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateBillingContractDto,
    actor: BillingActor,
  ) {
    const doc = await this.contractModel.findById(id);
    if (!doc) throw new NotFoundException('Contract not found');
    StationScope.assertOwnership(doc, ctx);

    if (dto.categories !== undefined || dto.category === 'Dom' || dto.category === 'Int' || dto.category === 'Both') {
      const sectors = normalizeContractSectors(
        dto.categories,
        dto.category ?? doc.category,
      );
      doc.categories = sectors;
      doc.category = legacyCategoryFromSectors(sectors);
      doc.markModified('categories');
    } else if (doc.category !== 'Dom' && doc.category !== 'Int' && doc.category !== 'Both') {
      // Delhi price-card imports omit category when sectors differ by aircraft.
      doc.category = 'Both';
    }
    if (dto.additionalCustomerCodes !== undefined) {
      doc.additionalCustomerCodes = normalizeAdditionalCustomerCodes(
        doc.customerCode,
        dto.additionalCustomerCodes,
      );
      doc.markModified('additionalCustomerCodes');
    }
    if (dto.additionalCustomerCodes !== undefined || dto.additionalCustomerInherit !== undefined) {
      const codes = doc.additionalCustomerCodes ?? [];
      doc.additionalCustomerInherit = normalizeAdditionalCustomerInherit(
        doc.customerCode,
        codes,
        dto.additionalCustomerInherit ?? doc.additionalCustomerInherit,
      );
      doc.markModified('additionalCustomerInherit');
    }
    if (dto.priceValidTo) doc.priceValidTo = new Date(dto.priceValidTo);
    if (dto.priceValidFrom) doc.priceValidFrom = new Date(dto.priceValidFrom);
    if (dto.aircraftTypes) {
      doc.aircraftTypes = sanitizeContractAircraftTypes(dto.aircraftTypes);
    }
    if (dto.ceilingRatePerFlightINR !== undefined) {
      applyContractCeilingField(doc, 'ceilingRatePerFlightINR', dto.ceilingRatePerFlightINR);
    }
    if (dto.ceilingRatePerFlightUSD !== undefined) {
      applyContractCeilingField(doc, 'ceilingRatePerFlightUSD', dto.ceilingRatePerFlightUSD);
    }
    if (dto.royaltyAtGross !== undefined) doc.royaltyAtGross = dto.royaltyAtGross;
    if (dto.royaltyInclusive !== undefined) doc.royaltyInclusive = dto.royaltyInclusive;
    if (dto.bhsConcessionCoverage !== undefined) {
      doc.bhsConcessionCoverage = dto.bhsConcessionCoverage;
    }
    if (dto.extendedRoyaltyEnabled !== undefined) {
      doc.extendedRoyaltyEnabled = Boolean(dto.extendedRoyaltyEnabled);
    }
    if (dto.bhsConcessionNote !== undefined) doc.bhsConcessionNote = dto.bhsConcessionNote;
    if (dto.cancellationWithinHours !== undefined) {
      doc.cancellationWithinHours = dto.cancellationWithinHours;
    }
    if (dto.concessionRates !== undefined) {
      doc.concessionRates = dto.concessionRates;
      doc.markModified('concessionRates');
    }
    if (dto.conditionalCharges !== undefined) {
      doc.conditionalCharges = dto.conditionalCharges;
      doc.markModified('conditionalCharges');
    }
    if (
      dto.fortnightBillingEnabled !== undefined ||
      dto.fortnightEdgeDayCap !== undefined ||
      dto.fortnightBillingPartCount !== undefined ||
      dto.fortnightBillingRanges !== undefined ||
      dto.fortnightBillingMonthRates !== undefined
    ) {
      const fortnightBilling = this.normalizeFortnightBillingOrThrow({
        enabled: dto.fortnightBillingEnabled ?? doc.fortnightBillingEnabled,
        partCount: dto.fortnightBillingPartCount ?? doc.fortnightBillingPartCount,
        ranges: dto.fortnightBillingRanges ?? doc.fortnightBillingRanges,
        monthRates: dto.fortnightBillingMonthRates ?? doc.fortnightBillingMonthRates,
        edgeDayCap: dto.fortnightEdgeDayCap ?? doc.fortnightEdgeDayCap,
      });
      doc.fortnightBillingEnabled = fortnightBilling.enabled;
      doc.fortnightEdgeDayCap = fortnightBilling.edgeDayCap === true;
      doc.fortnightBillingPartCount = fortnightBilling.partCount;
      doc.fortnightBillingRanges = fortnightBilling.ranges ?? [];
      doc.fortnightBillingMonthRates = fortnightBilling.monthRates ?? [];
      doc.markModified('fortnightBillingRanges');
      doc.markModified('fortnightBillingMonthRates');
    }
    if (dto.bhsVolumeSchedules !== undefined) {
      doc.bhsVolumeSchedules = sanitizeBhsVolumeSchedules(dto.bhsVolumeSchedules);
      doc.markModified('bhsVolumeSchedules');
    }
    if (dto.clauses !== undefined || dto.xxlnClause !== undefined || dto.delayClause !== undefined) {
      const clauses = normalizeContractClauses(dto.clauses, {
        xxlnClause: dto.xxlnClause ?? doc.xxlnClause,
        delayClause: dto.delayClause ?? doc.delayClause,
      });
      const legacy = legacyClauseFields(clauses);
      doc.clauses = clauses;
      doc.xxlnClause = legacy.xxlnClause;
      doc.delayClause = legacy.delayClause;
    }
    if (dto.adsBillingEnabled !== undefined) doc.adsBillingEnabled = dto.adsBillingEnabled;
    if (dto.adsEquipmentRules !== undefined) {
      doc.adsEquipmentRules = sanitizeContractAdsRules(dto.adsEquipmentRules);
    }
    if (dto.contractPdfBase64 !== undefined) {
      if (!dto.contractPdfBase64) {
        doc.contractPdfBase64 = undefined;
        doc.contractPdfFileName = undefined;
        doc.contractPdfContentType = undefined;
        doc.contractPdfUploadedAt = undefined;
      } else {
        doc.contractPdfBase64 = dto.contractPdfBase64;
        if (dto.contractPdfFileName !== undefined) {
          doc.contractPdfFileName = dto.contractPdfFileName;
        }
        if (dto.contractPdfContentType !== undefined) {
          doc.contractPdfContentType = dto.contractPdfContentType;
        }
        doc.contractPdfUploadedAt = dto.contractPdfUploadedAt
          ? new Date(dto.contractPdfUploadedAt)
          : new Date();
      }
    } else {
      if (dto.contractPdfFileName !== undefined) {
        doc.contractPdfFileName = dto.contractPdfFileName;
      }
      if (dto.contractPdfContentType !== undefined) {
        doc.contractPdfContentType = dto.contractPdfContentType;
      }
      if (dto.contractPdfUploadedAt !== undefined) {
        doc.contractPdfUploadedAt = new Date(dto.contractPdfUploadedAt);
      }
    }
    if (dto.status) doc.status = dto.status;
    await doc.save();
    invalidateInvoiceContractCache();

    const saved = doc.toObject() as AdsRuleSyncContract;

    await this.auditEngine.log({
      entityType: 'contract',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: dto as Record<string, unknown>,
    });

    // Do not block Save on rate-card upsert / prep re-enrich / draft rebuild.
    if (this.shouldSyncAdsAfterUpdate(dto)) {
      this.scheduleAdsSideEffects(ctx, saved, actor);
    }

    return successResponse(this.presentContract(doc.toObject()));
  }

  async activate(
    ctx: StationScopeContext,
    id: string,
    actor: BillingActor,
    kycOpts: { kycOverride?: boolean; kycOverrideReason?: string } = {},
  ) {
    const doc = await this.contractModel.findById(id);
    if (!doc) throw new NotFoundException('Contract not found');
    StationScope.assertOwnership(doc, ctx);
    await this.kycService.assertSoftGateOrThrow(
      ctx,
      doc.customerCode,
      kycOpts,
      actor,
      'contract_activate',
    );
    doc.status = 'active';
    await doc.save();

    await this.auditEngine.log({
      entityType: 'contract',
      entityId: doc._id,
      action: 'approved',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
    });

    return successResponse(doc.toObject());
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.contractModel.findById(id);
    if (!doc) throw new NotFoundException('Contract not found');
    StationScope.assertOwnership(doc, ctx);

    const rateCardCount = await this.rateCardModel.countDocuments(
      StationScope.filter({ contractId: doc._id }, ctx),
    );
    if (rateCardCount > 0) {
      throw new ConflictException(
        `Cannot delete ${doc.contractNumber}: remove linked rate cards first`,
      );
    }

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'contract',
      entityId: snapshot._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: snapshot.stationCode,
      changes: { deleted: true, contract: snapshot },
    });

    return successResponse({ deleted: true });
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
        const doc = await this.contractModel.findById(id).lean();
        failed.push({
          id,
          label: doc?.contractNumber,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  async removeAll(ctx: StationScopeContext, actor: BillingActor) {
    const contracts = await this.contractModel
      .find(StationScope.filter({}, ctx))
      .select('_id')
      .lean();
    const ids = contracts.map((c) => String(c._id));
    return this.removeMany(ctx, ids, actor);
  }

  async findActiveForCustomer(
    ctx: StationScopeContext,
    customerCode: string,
    date: Date,
    category?: string,
  ) {
    const code = customerCode.toUpperCase();
    const filter = StationScope.filter(
      {
        $or: [{ customerCode: code }, { additionalCustomerCodes: code }],
        status: 'active',
        priceValidFrom: { $lte: date },
        priceValidTo: { $gte: date },
        ...(category ? { category } : {}),
      },
      ctx,
    );
    return this.contractModel.findOne(filter).lean();
  }

  private presentContract<T extends { aircraftTypes?: string[]; adsEquipmentRules?: ContractAdsEquipmentRuleDto[] }>(
    doc: T,
  ): T {
    return {
      ...doc,
      aircraftTypes: sanitizeContractAircraftTypes(doc.aircraftTypes ?? []),
      ...(Array.isArray(doc.adsEquipmentRules)
        ? { adsEquipmentRules: sanitizeContractAdsRules(doc.adsEquipmentRules) }
        : {}),
    };
  }

  private normalizeFortnightBillingOrThrow(input: {
    enabled?: boolean;
    partCount?: number;
    ranges?: Array<{ startDay: number; endDay: number; exchangeRatePerUsd?: number }>;
    monthRates?: Array<{
      month: string;
      parts: Array<{ startDay: number; exchangeRatePerUsd: number }>;
    }>;
    edgeDayCap?: boolean;
  }) {
    try {
      return normalizeContractFortnightBillingConfig(input);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid fortnight billing settings',
      );
    }
  }

  /**
   * Fields that affect ADS pricing / prep / drafts. Pure status edits skip sync.
   */
  private shouldSyncAdsAfterUpdate(dto: UpdateBillingContractDto): boolean {
    return (
      dto.adsBillingEnabled !== undefined ||
      dto.adsEquipmentRules !== undefined ||
      dto.category !== undefined ||
      dto.priceValidFrom !== undefined ||
      dto.priceValidTo !== undefined ||
      dto.aircraftTypes !== undefined ||
      dto.conditionalCharges !== undefined ||
      dto.concessionRates !== undefined
    );
  }

  /** Fire-and-forget so HTTP Save returns after contract write only. */
  private scheduleAdsSideEffects(
    ctx: StationScopeContext,
    contract: AdsRuleSyncContract,
    actor: BillingActor,
  ) {
    void this.runAdsSideEffects(ctx, contract, actor).catch((err) => {
      this.logger.warn(
        `Background ADS sync failed for ${contract.customerCode}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async runAdsSideEffects(
    ctx: StationScopeContext,
    contract: AdsRuleSyncContract,
    _actor: BillingActor,
  ) {
    // Keep Rate Cards dual-count UI in sync; skip prep/draft refresh (ADS fetch-only).
    await this.syncAdsEquipmentRulesToRateCards(ctx, contract);
  }

  /**
   * After ADS rules / concessions change: re-enrich open ADS prep rows and
   * rebuild open ADS invoice drafts so invoices stay in sync.
   */
  private async syncAdsPreparationAndDrafts(
    ctx: StationScopeContext,
    contract: AdsRuleSyncContract,
    actor: BillingActor,
  ) {
    try {
      await this.preparationService.refreshAdsForCustomer(ctx, {
        customerCode: contract.customerCode,
        from: contract.priceValidFrom,
        to: contract.priceValidTo,
      }, actor);
    } catch (err) {
      this.logger.warn(
        `ADS prep refresh failed for ${contract.customerCode}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.invoiceDraftsService.refreshOpenAdsDraftsForCustomer(
        ctx,
        contract.customerCode,
        actor,
      );
    } catch (err) {
      this.logger.warn(
        `ADS draft refresh failed for ${contract.customerCode}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Upsert inclusive/exclusive rate cards from contract ADS equipment rules.
   * freePerFlight → inclusive.serviceCount; prices + alwaysChargeable → exclusive.
   */
  private async syncAdsEquipmentRulesToRateCards(
    ctx: StationScopeContext,
    contract: AdsRuleSyncContract,
  ) {
    const rules = contract.adsEquipmentRules ?? [];
    if (rules.length === 0) return;

    const stationCode = StationScope.require(ctx);
    const customerCode = contract.customerCode.toUpperCase();
    const validFrom = new Date(contract.priceValidFrom);
    const validTo = new Date(contract.priceValidTo);
    const defaultCategory = String(contract.category || 'Int').trim() || 'Int';
    const aircraftList = sanitizeContractAircraftTypes(contract.aircraftTypes ?? []);

    for (const rule of rules) {
      const serviceCode = String(rule.serviceCode ?? '').trim();
      if (!serviceCode) continue;

      const ruleValidFrom = validFrom;
      const ruleValidTo = validTo;

      const uom = String(rule.uom ?? 'EA').trim() || 'EA';
      const hourly = isAdsHourlyUom(uom);
      const alwaysChargeable = Boolean(rule.alwaysChargeable) || hourly;
      const freePerFlight =
        rule.freePerFlight != null && Number.isFinite(Number(rule.freePerFlight))
          ? Math.max(0, Math.floor(Number(rule.freePerFlight)))
          : undefined;

      const aircraftTypes = (() => {
        const multi = sanitizeContractAircraftTypes(rule.aircraftTypes ?? []);
        if (multi.length > 0) return multi;
        if (rule.aircraftType?.trim()) {
          const legacy = sanitizeContractAircraftTypes([rule.aircraftType]);
          if (legacy.length > 0) return legacy;
        }
        return aircraftList.length > 0 ? aircraftList : [''];
      })();
      const flightCategories = resolveAdsRuleFlightCategories(defaultCategory, rule.category);

      for (const category of flightCategories) {
        for (const aircraftType of aircraftTypes) {
        const scopeFilter: Record<string, unknown> = {
          stationCode,
          contractId: contract._id,
          customerCode,
          serviceCode,
          category,
          validFrom: ruleValidFrom,
          validTo: ruleValidTo,
        };
        if (aircraftType) {
          scopeFilter.aircraftType = aircraftType;
        }

        const includedForAds = rule.includedForAds !== false;

        // Not included for ADS — stamp exclusive marker so enrichment never charges
        // (blocks rate + adhoc), regardless of used quantity.
        if (!includedForAds) {
          const exclusive = await this.rateCardModel.findOne({
            ...scopeFilter,
            billingScope: 'exclusive',
          });
          if (exclusive) {
            exclusive.uom = uom;
            exclusive.alwaysChargeable = false;
            exclusive.adsExcluded = true;
            exclusive.unitPriceINR = 0;
            exclusive.unitPriceUSD = 0;
            exclusive.serviceCount = 0;
            if (rule.remarks != null) exclusive.remarks = rule.remarks;
            await exclusive.save();
          } else {
            await this.rateCardModel.create(
              StationScope.stampCreate(
                {
                  contractId: contract._id,
                  customerCode,
                  serviceCode,
                  category,
                  aircraftType: aircraftType || undefined,
                  billingReference: 'PU',
                  currency: 'INR',
                  uom,
                  unitPriceINR: 0,
                  unitPriceUSD: 0,
                  billingScope: 'exclusive',
                  serviceCount: 0,
                  alwaysChargeable: false,
                  adsExcluded: true,
                  remarks: rule.remarks,
                  validFrom: ruleValidFrom,
                  validTo: ruleValidTo,
                },
                ctx,
              ),
            );
          }
          // Clear stale inclusive free units for the same scope.
          await this.rateCardModel.updateMany(
            { ...scopeFilter, billingScope: 'inclusive' },
            { $set: { adsExcluded: true, serviceCount: 0, alwaysChargeable: false } },
          );
          continue;
        }

        // Inclusive = free units per flight (skipped when always chargeable / hourly).
        if (!alwaysChargeable && freePerFlight != null) {
          const inclusive = await this.rateCardModel.findOne({
            ...scopeFilter,
            billingScope: 'inclusive',
          });
          if (inclusive) {
            inclusive.serviceCount = freePerFlight;
            inclusive.uom = uom;
            inclusive.alwaysChargeable = false;
            inclusive.adsExcluded = false;
            if (rule.remarks != null) inclusive.remarks = rule.remarks;
            await inclusive.save();
          } else {
            await this.rateCardModel.create(
              StationScope.stampCreate(
                {
                  contractId: contract._id,
                  customerCode,
                  serviceCode,
                  category,
                  aircraftType: aircraftType || undefined,
                  billingReference: 'PU',
                  currency: 'INR',
                  uom,
                  billingScope: 'inclusive',
                  serviceCount: freePerFlight,
                  alwaysChargeable: false,
                  adsExcluded: false,
                  remarks: rule.remarks,
                  validFrom: ruleValidFrom,
                  validTo: ruleValidTo,
                },
                ctx,
              ),
            );
          }
        }

        const needsExclusive =
          alwaysChargeable ||
          rule.unitPriceINR != null ||
          rule.unitPriceUSD != null ||
          (freePerFlight != null && !alwaysChargeable);

        if (!needsExclusive) continue;

        const exclusive = await this.rateCardModel.findOne({
          ...scopeFilter,
          billingScope: 'exclusive',
        });
        const currency =
          rule.unitPriceUSD != null && rule.unitPriceINR == null ? 'USD' : 'INR';

        if (exclusive) {
          exclusive.uom = uom;
          exclusive.alwaysChargeable = alwaysChargeable;
          exclusive.adsExcluded = false;
          if (rule.unitPriceINR != null) exclusive.unitPriceINR = rule.unitPriceINR;
          if (rule.unitPriceUSD != null) exclusive.unitPriceUSD = rule.unitPriceUSD;
          if (alwaysChargeable) {
            exclusive.serviceCount = 0;
          } else if (freePerFlight != null && !exclusive.serviceCount) {
            // Prefer inclusive free count; exclusive free only when no inclusive path.
            exclusive.serviceCount = freePerFlight;
          }
          if (rule.remarks != null) exclusive.remarks = rule.remarks;
          await exclusive.save();
        } else {
          await this.rateCardModel.create(
            StationScope.stampCreate(
              {
                contractId: contract._id,
                customerCode,
                serviceCode,
                category,
                aircraftType: aircraftType || undefined,
                billingReference: 'PU',
                currency,
                uom,
                unitPriceINR: rule.unitPriceINR,
                unitPriceUSD: rule.unitPriceUSD,
                billingScope: 'exclusive',
                serviceCount: alwaysChargeable ? 0 : freePerFlight,
                alwaysChargeable,
                adsExcluded: false,
                remarks: rule.remarks,
                validFrom: ruleValidFrom,
                validTo: ruleValidTo,
              },
              ctx,
            ),
          );
        }
      }
    }
  }
  }
}

@Injectable()
export class BillingRateCardsService {
  constructor(
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    @InjectModel(BillingPriceCardAirline.name)
    private readonly priceCardAirlineModel: Model<BillingPriceCardAirlineDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext, customerCode?: string, serviceCode?: string) {
    const filter = StationScope.filter(
      {
        ...(customerCode ? { customerCode: customerCode.toUpperCase() } : {}),
        ...(serviceCode ? { serviceCode: serviceCode.trim() } : {}),
      },
      ctx,
    );
    const items = await this.rateCardModel.find(filter).sort({ validFrom: -1 }).lean();
    return successResponse({ items, total: items.length });
  }

  async create(ctx: StationScopeContext, dto: CreateBillingRateCardDto, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const billingScope = normalizeBillingScope(dto.billingScope);
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);
    const created = await this.rateCardModel.create(
      StationScope.stampCreate(
        {
          ...dto,
          billingScope,
          billingReference: normalizePriceCardReference(dto.billingReference),
          contractId: new Types.ObjectId(dto.contractId),
          customerCode: dto.customerCode.toUpperCase(),
          aircraftType: dto.aircraftType?.trim().toUpperCase() || undefined,
          validFrom,
          validTo,
        },
        ctx,
      ),
    );

    if (dto.aircraftType?.trim() && dto.category?.trim()) {
      await this.ensureAdsPriceCardRowForExclusive(ctx, {
        customerCode: dto.customerCode,
        aircraftType: dto.aircraftType,
        category: dto.category,
        validFrom,
        validTo,
      });
    }

    await this.auditEngine.log({
      entityType: 'rate_card',
      entityId: created._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
    });

    return successResponse(created.toObject());
  }

  async update(
    ctx: StationScopeContext,
    id: string,
    dto: UpdateBillingRateCardDto,
    actor: BillingActor,
  ) {
    const doc = await this.rateCardModel.findById(id);
    if (!doc) throw new NotFoundException('Rate card not found');
    StationScope.assertOwnership(doc, ctx);

    if (dto.category !== undefined) doc.category = dto.category;
    if (dto.billingReference !== undefined) {
      doc.billingReference = normalizePriceCardReference(dto.billingReference);
    }
    if (dto.unitPriceINR !== undefined) doc.unitPriceINR = dto.unitPriceINR;
    if (dto.unitPriceUSD !== undefined) doc.unitPriceUSD = dto.unitPriceUSD;
    if (dto.ceilingRateINR !== undefined) doc.ceilingRateINR = dto.ceilingRateINR;
    if (dto.ceilingRateUSD !== undefined) doc.ceilingRateUSD = dto.ceilingRateUSD;
    if (dto.currency) doc.currency = dto.currency;
    if (dto.uom) doc.uom = dto.uom;
    if (dto.minBillableUnits !== undefined) doc.minBillableUnits = dto.minBillableUnits;
    if (dto.remarks !== undefined) doc.remarks = dto.remarks.trim() || undefined;
    if (dto.billingScope !== undefined) doc.billingScope = normalizeBillingScope(dto.billingScope);
    if (dto.serviceCount !== undefined) doc.serviceCount = dto.serviceCount;
    if (dto.alwaysChargeable !== undefined) doc.alwaysChargeable = dto.alwaysChargeable;
    if (dto.validFrom) doc.validFrom = new Date(dto.validFrom);
    if (dto.validTo) doc.validTo = new Date(dto.validTo);
    await doc.save();

    if (doc.aircraftType?.trim() && doc.category?.trim()) {
      await this.ensureAdsPriceCardRowForExclusive(ctx, {
        customerCode: doc.customerCode,
        aircraftType: doc.aircraftType,
        category: doc.category,
        validFrom: doc.validFrom,
        validTo: doc.validTo,
      });
    }

    await this.auditEngine.log({
      entityType: 'rate_card',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: dto as Record<string, unknown>,
    });

    return successResponse(doc.toObject());
  }

  async remove(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.rateCardModel.findById(id);
    if (!doc) throw new NotFoundException('Rate card not found');
    StationScope.assertOwnership(doc, ctx);

    const snapshot = doc.toObject();
    await doc.deleteOne();

    await this.auditEngine.log({
      entityType: 'rate_card',
      entityId: snapshot._id,
      action: 'cancelled',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: snapshot.stationCode,
      changes: { deleted: true, rateCard: snapshot },
    });

    return successResponse({ deleted: true });
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
        const doc = await this.rateCardModel.findById(id).lean();
        failed.push({
          id,
          label: doc ? `${doc.customerCode} · ${doc.serviceCode}` : undefined,
          message: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }

    return successResponse({ deleted, failed, requested: uniqueIds.length });
  }

  async removeAll(ctx: StationScopeContext, actor: BillingActor) {
    const cards = await this.rateCardModel
      .find(StationScope.filter({}, ctx))
      .select('_id')
      .lean();
    const ids = cards.map((c) => String(c._id));
    return this.removeMany(ctx, ids, actor);
  }

  async match(ctx: StationScopeContext, query: MatchRateCardQueryDto) {
    const date = new Date(query.date);
    const filter = StationScope.filter(
      {
        customerCode: query.customerCode.toUpperCase(),
        serviceCode: query.serviceCode,
        validFrom: { $lte: date },
        validTo: { $gte: date },
        ...(query.category ? { category: query.category } : {}),
      },
      ctx,
    );
    const card = await this.rateCardModel.findOne(filter).sort({ validFrom: -1 }).lean();
    return successResponse({ matched: Boolean(card), rateCard: card ?? null });
  }

  private async ensureAdsPriceCardRowForExclusive(
    ctx: StationScopeContext,
    params: {
      customerCode: string;
      aircraftType: string;
      category: string;
      validFrom: Date;
      validTo: Date;
    },
  ) {
    const stationCode = StationScope.require(ctx);
    const customerCode = params.customerCode.trim().toUpperCase();
    const aircraftType = params.aircraftType.trim().toUpperCase();
    const category = params.category.trim();

    const existing = await this.priceCardAirlineModel.findOne({
      stationCode,
      handlingType: 'ADS',
      customerCode,
      aircraftType,
      category,
      validFrom: params.validFrom,
      validTo: params.validTo,
      active: true,
    });
    if (existing) return;

    const customer = await this.customerModel.findOne({ stationCode, customerCode }).lean();
    const airlineName = customer?.name?.trim() || customerCode;

    await this.priceCardAirlineModel.create(
      StationScope.stampCreate(
        {
          handlingType: 'ADS',
          customerCode,
          airlineName,
          aircraftType,
          category,
          validFrom: params.validFrom,
          validTo: params.validTo,
          active: true,
        },
        ctx,
      ),
    );

    if (customer) {
      const nextTypes = mergeHandlingTypes(customer.priceCardHandlingTypes, 'ADS');
      if (JSON.stringify(nextTypes) !== JSON.stringify(customer.priceCardHandlingTypes ?? [])) {
        await this.customerModel.updateOne(
          { _id: customer._id },
          { $set: { priceCardHandlingTypes: nextTypes } },
        );
      }
    }
  }
}

function positiveCeilingPerFlight(value: number | null | undefined): number | undefined {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 10000) / 10000;
}

const CONTRACT_SECTORS = ['Dom', 'Int', 'DomCargo', 'IntCargo'] as const;
type ContractSector = (typeof CONTRACT_SECTORS)[number];

function normalizeContractSectors(
  categories: string[] | undefined,
  legacy?: string,
): ContractSector[] {
  const allowed = new Set<string>(CONTRACT_SECTORS);
  const picked = (categories ?? []).map((value) => String(value).trim()).filter((value) => allowed.has(value));
  if (picked.length > 0) return [...new Set(picked)] as ContractSector[];
  if (legacy === 'Dom' || legacy === 'Int') return [legacy];
  if (legacy === 'Both') return ['Dom', 'Int'];
  return ['Int'];
}

function legacyCategoryFromSectors(sectors: ContractSector[]): 'Dom' | 'Int' | 'Both' {
  const passenger = sectors.filter((sector) => sector === 'Dom' || sector === 'Int');
  if (passenger.length === 1 && sectors.length === 1) return passenger[0];
  return 'Both';
}

function normalizeAdditionalCustomerCodes(
  primary: string,
  codes: string[] | undefined,
): string[] {
  const owner = primary.trim().toUpperCase();
  const seen = new Set<string>();
  for (const raw of codes ?? []) {
    const code = String(raw ?? '').trim().toUpperCase();
    if (!code || code === owner || seen.has(code)) continue;
    seen.add(code);
  }
  return [...seen];
}

function applyContractCeilingField(
  doc: BillingContractDocument,
  key: 'ceilingRatePerFlightINR' | 'ceilingRatePerFlightUSD',
  raw: number | null | undefined,
) {
  if (raw === null) {
    doc.set(key, undefined);
    return;
  }
  const amount = positiveCeilingPerFlight(raw);
  doc.set(key, amount);
}
