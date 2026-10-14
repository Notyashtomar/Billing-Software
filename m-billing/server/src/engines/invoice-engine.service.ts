import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BillingPreparationRecordDocument,
  BillingPriceCardAirline,
  BillingPriceCardAirlineDocument,
} from '../schemas/billing.schemas';
import {
  StationScope,
  type StationScopeContext,
} from '../common/station-scope';
import {
  FhrCollectionRead,
  type FhrCollectionReadDocument,
} from '../schemas/operational.schemas';
import { TaxEngineService } from './tax-engine.service';
import { CurrencyEngineService } from './currency-engine.service';
import {
  ferryKindFromFhrDocument,
  inferConcessionScenarioFromLine,
  actualGroundMinutes,
  resolveLineAdditionalChargePercent,
  resolveLineConcessionPercent,
  resolveLineFeeConcessionPercent,
  shouldApplyConcessionToBhsUnitPrice,
  type ContractConcessionRatesShape,
  type ContractConditionalChargesShape,
} from '../utils/invoice-concession.util';
import { isAdsFamilySourceType } from '../shared/ads-adhoc-tariff';
import {
  aircraftKeysMatch,
  ataAtdFromFhrMain,
  calendarDayKey,
  incrementalSecondFlightIds,
} from '../utils/incremental-flight-price.util';
import {
  resolveAdsPricingFromContractRule,
  type AdsEquipmentInclusionContract,
  type AdsEquipmentInclusionRule,
} from '../shared/ads-equipment-inclusion.util';
import { preparationInvoiceCategory } from '../common/billing-invoice-period.util';
import {
  isAdditionalBhsFlight,
} from '../utils/bhs-package-price.util';
import {
  capTurnaroundCrewCoachUsedUnits,
  computeAdsUsedUnits,
  isCrewCoachEquipmentLabel,
  isTurnaroundFlightContext,
  parseAdsRemarksQuantity,
  toWholeAdsUnits,
} from '../shared/fhr-equipment-to-ads-row';
import {
  categoriesOfFlightFromSnapshots,
  pickCategoryOfFlight,
} from '../utils/invoice-flight-category.util';
import {
  bhsVolumeFlightId,
  resolveBhsVolumePrices,
  splitComprehensiveUnitPrice,
  type BhsVolumePriceHit,
  type BhsVolumeSchedule,
  type SplitComprehensivePrice,
} from '../utils/bhs-volume-schedule.util';

export interface ComposedInvoiceLine {
  lineNo: number;
  lineType: string;
  serviceCode: string;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  lineDiscountPercent?: number;
  lineAmountExclTax: number;
  gstPercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineAmountInclTax: number;
  sourceType?: string;
  sourceRef?: Record<string, unknown>;
  preparationRecordIds?: Types.ObjectId[];
  /** @deprecated Prefer preparationRecordIds — kept for older callers. */
  preparationRecordId?: Types.ObjectId;
}

export interface ComposedInvoice {
  customerCode: string;
  customerName: string;
  currencyCode: 'INR' | 'USD';
  currencyFactor: number;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  contractId?: Types.ObjectId;
  /** BHS | ADS | RAF — separate draft / PDF paths */
  invoiceCategory?: string;
  lines: ComposedInvoiceLine[];
  subtotalExclTax: number;
  taxTotal: number;
  totalInclTax: number;
  preparationRecordIds: Types.ObjectId[];
}

type AggregateBucket = {
  serviceCode: string;
  unitPrice: number;
  effectiveUnitPrice: number;
  chargePercent: number;
  additionalChargePercent: number;
  feeConcessionPercent: number;
  concessionAppliedToUnitPrice: boolean;
  cancellationChargeablePercent: number | null;
  aircraftType: string;
  uom: string;
  sourceType: string;
  records: BillingPreparationRecordDocument[];
  volumeHit?: BhsVolumePriceHit;
  splitPrice?: SplitComprehensivePrice;
  /** +% applied because actual ground time is beyond 75 minutes. */
  groundSurchargeApplied?: boolean;
  /** Particular stem from FHR type of flight, e.g. "Charges for Originate handling". */
  handlingPhrase: string;
};

export type InvoiceChargeContractLike = {
  royaltyAtGross?: number | null;
  concessionRates?: ContractConcessionRatesShape | null;
  conditionalCharges?: ContractConditionalChargesShape | null;
  cancellationWithinHours?: number | null;
  /** ADS compose re-checks these so stale prep cannot bill non-contract equipment. */
  adsBillingEnabled?: boolean;
  adsEquipmentRules?: AdsEquipmentInclusionRule[];
  aircraftTypes?: string[];
  /** Comprehensive volume bands. INR invoices only; replaces the saved BHS rate. */
  bhsVolumeSchedules?: BhsVolumeSchedule[] | null;
  /** Fixed charge per scheduled flight, from the airline contract. */
  ceilingRatePerFlightINR?: number | null;
  ceilingRatePerFlightUSD?: number | null;
} | null;

export type BhsVolumeComposeOptions = {
  /** Whole-month scheduled flights used to rank volume bands. Defaults to `records`. */
  volumePopulation?: BillingPreparationRecordDocument[];
  /** Fortnight part USD→INR rate. Used for INR and USD invoices. */
  currencyFactorOverride?: number;
};

@Injectable()
export class InvoiceEngineService {
  constructor(
    private readonly taxEngine: TaxEngineService,
    private readonly currencyEngine: CurrencyEngineService,
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectModel(BillingPriceCardAirline.name)
    private readonly priceCardAirlineModel: Model<BillingPriceCardAirlineDocument>,
  ) {}

  async composeFromPreparation(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
    documentDate: Date,
    currencyCode: 'INR' | 'USD' = 'INR',
    contract?: InvoiceChargeContractLike,
    options?: BhsVolumeComposeOptions,
  ): Promise<ComposedInvoice> {
    if (records.length === 0) {
      throw new Error('No preparation records to compose');
    }

    const customerCode = records[0].customerCode;
    const customerName = records[0].customerName ?? customerCode;
    const periodStart = records[0].billingPeriodStart;
    const periodEnd = records[0].billingPeriodEnd;
    const currencyFactor = await this.resolveInvoiceCurrencyFactor(
      ctx,
      records,
      currencyCode,
      documentDate,
      periodStart,
      options?.currencyFactorOverride,
    );

    const adsRecords = records.filter((r) => isAdsFamilySourceType(r.sourceType));
    const customRecords = records.filter(
      (r) => String(r.sourceType ?? '').trim().toLowerCase() === 'custom',
    );
    const rafRecords = records.filter(
      (r) => String(r.sourceType ?? '').trim().toLowerCase() === 'raf',
    );
    const otherRecords = records.filter(
      (r) =>
        !isAdsFamilySourceType(r.sourceType) &&
        String(r.sourceType ?? '').trim().toLowerCase() !== 'custom' &&
        String(r.sourceType ?? '').trim().toLowerCase() !== 'raf',
    );

    // Prefer pure ADS compose when the draft group is ADS-only (group key separates categories).
    const lines: ComposedInvoiceLine[] = [];
    let lineNo = 0;

    if (customRecords.length > 0 && adsRecords.length === 0 && otherRecords.length === 0 && rafRecords.length === 0) {
      const customLines = await this.composeCustomLines(
        ctx,
        customRecords,
        documentDate,
        contract,
      );
      for (const line of customLines) {
        lineNo += 1;
        lines.push({ ...line, lineNo });
      }
    } else if (
      adsRecords.length > 0 &&
      otherRecords.length === 0 &&
      customRecords.length === 0 &&
      rafRecords.length === 0
    ) {
      const adsLines = await this.composeAdsLines(
        ctx,
        adsRecords,
        documentDate,
        contract,
        currencyCode,
      );
      for (const line of adsLines) {
        lineNo += 1;
        lines.push({ ...line, lineNo });
      }
    } else if (
      rafRecords.length > 0 &&
      adsRecords.length === 0 &&
      otherRecords.length === 0 &&
      customRecords.length === 0
    ) {
      const rafLines = await this.composeRafLines(ctx, rafRecords, documentDate);
      for (const line of rafLines) {
        lineNo += 1;
        lines.push({ ...line, lineNo });
      }
    } else {
      if (rafRecords.length > 0) {
        const rafLines = await this.composeRafLines(ctx, rafRecords, documentDate);
        for (const line of rafLines) {
          lineNo += 1;
          lines.push({ ...line, lineNo });
        }
      }
      const volumeSchedules =
        currencyCode === 'INR' && Array.isArray(contract?.bhsVolumeSchedules)
          ? contract.bhsVolumeSchedules.filter((row) => row?.chargeKind === 'comprehensive')
          : [];
      const volumePopulation =
        options?.volumePopulation && options.volumePopulation.length > 0
          ? options.volumePopulation
          : otherRecords;
      await this.stampFhrMovement(ctx, uniquePreparationRecords([
        ...otherRecords,
        ...volumePopulation,
      ]));
      await this.stampFerryKindFromFhr(ctx, otherRecords);
      const incrementalPriceById = await this.incrementalPricesFromFhr(
        ctx,
        otherRecords,
      );
      const buckets = aggregateBuckets(
        otherRecords.length > 0 ? otherRecords : [],
        contract,
        volumeSchedules.length > 0
          ? {
              schedules: volumeSchedules,
              population: volumePopulation,
            }
          : undefined,
        incrementalPriceById,
      );
      for (const bucket of buckets) {
        lineNo += 1;
        const quantity = bucket.records.length;
        const lineAmountExclTax = round2(bucket.effectiveUnitPrice * quantity);

        const tax = await this.taxEngine.calculateLine(ctx, {
          lineAmountExclTax,
          serviceCode: bucket.serviceCode,
          documentDate,
        });

        const preparationRecordIds = bucket.records.map((r) => r._id as Types.ObjectId);
        const sourceRefs = bucket.records.map((r) => r.sourceRef as Record<string, unknown>);
        // Flight category (Dom/Int) only lives on the snapshot — carry it onto the
        // aggregated line so the invoice PDF can print it without re-reading prep.
        const categoriesOfFlight = categoriesOfFlightFromSnapshots(
          bucket.records.map(
            (r) => r.operationalSnapshot as Record<string, unknown> | undefined,
          ),
        );

        lines.push({
          lineNo,
          lineType: 'service',
          serviceCode: bucket.serviceCode,
          description: buildAggregatedDescription(bucket),
          quantity,
          uom: bucket.uom,
          unitPrice: bucket.effectiveUnitPrice,
          lineDiscountPercent: 0,
          lineAmountExclTax,
          ...tax,
          sourceType: bucket.sourceType,
          sourceRef: {
            aircraftType: bucket.aircraftType || undefined,
            flightCount: quantity,
            categoryOfFlight: categoriesOfFlight[0],
            categoriesOfFlight: categoriesOfFlight.length > 0 ? categoriesOfFlight : undefined,
            usedQuantity: quantity,
            flights: bucket.records.map(flightLabel).filter(Boolean),
            preparationRecordIds,
            sourceRefs,
            bhsPackageRate: bucket.unitPrice,
            ...(bucket.volumeHit
              ? {
                  bhsVolumeOverride: true,
                  bhsVolumeScope: bucket.volumeHit.flightScope,
                  bhsVolumeFromCount: bucket.volumeHit.fromCount,
                  bhsVolumeToCount: bucket.volumeHit.toCount,
                  savedComprehensiveRate: bucket.volumeHit.savedUnitPrice || undefined,
                }
              : {}),
            ...(bucket.splitPrice
              ? {
                  splitTurnaround: bucket.splitPrice.kind,
                  splitBaseScope: bucket.splitPrice.baseScope,
                  splitBaseRate: bucket.splitPrice.baseUnitPrice,
                  splitAdditionalPercent: bucket.splitPrice.additionalPercent,
                }
              : {}),
            concessionPercent: bucket.chargePercent,
            additionalChargePercent: bucket.additionalChargePercent || undefined,
            concessionFeePercent: bucket.feeConcessionPercent || undefined,
            concessionAppliedToUnitPrice: bucket.concessionAppliedToUnitPrice || undefined,
            chargeAmountPerFlight: bucket.unitPrice,
            cancellationChargeablePercent:
              bucket.cancellationChargeablePercent == null
                ? undefined
                : bucket.cancellationChargeablePercent,
          },
          preparationRecordIds,
          preparationRecordId: preparationRecordIds[0],
        });
      }

      // Ceiling is not a particular. Concession totals add it from the contract rate
      // once per scheduled flight on these lines.

      // If a mixed batch somehow arrives, append ADS lines after BHS (should be rare).
      if (adsRecords.length > 0) {
        const adsLines = await this.composeAdsLines(
          ctx,
          adsRecords,
          documentDate,
          contract,
          currencyCode,
        );
        for (const line of adsLines) {
          lineNo += 1;
          lines.push({ ...line, lineNo });
        }
      }
      if (customRecords.length > 0) {
        const customLines = await this.composeCustomLines(
          ctx,
          customRecords,
          documentDate,
          contract,
        );
        for (const line of customLines) {
          lineNo += 1;
          lines.push({ ...line, lineNo });
        }
      }
    }

    if (lines.length === 0) {
      throw new BadRequestException(
        'No billable invoice lines could be built from the selected preparation records.',
      );
    }

    const subtotalExclTax = round2(lines.reduce((s, l) => s + l.lineAmountExclTax, 0));
    const taxTotal = round2(
      lines.reduce((s, l) => s + l.cgstAmount + l.sgstAmount + l.igstAmount, 0),
    );
    const totalInclTax = round2(subtotalExclTax + taxTotal);

    const contractMatch = records[0].contractMatch as { contractId?: string } | undefined;
    const resolvedContractId =
      (contract && typeof contract === 'object' && '_id' in contract
        ? (contract as { _id?: Types.ObjectId | string })._id
        : undefined) ?? contractMatch?.contractId;

    return {
      customerCode,
      customerName,
      currencyCode,
      currencyFactor,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      contractId: resolvedContractId ? new Types.ObjectId(String(resolvedContractId)) : undefined,
      invoiceCategory: preparationInvoiceCategory(records[0]?.sourceType),
      lines,
      subtotalExclTax,
      taxTotal,
      totalInclTax,
      preparationRecordIds: records.map((r) => r._id as Types.ObjectId),
    };
  }

  /**
   * RAF cleaning services: invoice service type = RAF; particulars = Deep / Night Halt /
   * Exterior Cleaning labels from ramp assistance forms; unit price from rate match.
   */
  private async composeRafLines(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
    documentDate: Date,
  ): Promise<Omit<ComposedInvoiceLine, 'lineNo'>[]> {
    type RafBucket = {
      particular: string;
      aircraftType: string;
      unitPrice: number;
      uom: string;
      records: BillingPreparationRecordDocument[];
    };

    const map = new Map<string, RafBucket>();

    for (const rec of records) {
      const rateMatch = (rec.rateMatch ?? {}) as Record<string, unknown>;
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const particular = String(
        rateMatch.particular ??
          snap.particular ??
          snap.rafCleaningLabel ??
          snap.adsParticular ??
          rateMatch.serviceCode ??
          '',
      ).trim();
      if (!particular) continue;

      const unitPrice = Number(rateMatch.unitPrice ?? 0);
      // Keep unpriced particulars on the draft so the user can set custom / adhoc
      // rates before PDF. Previously these rows were dropped and never billed.

      const aircraftType = String(
        rateMatch.aircraftType ??
          snap.aircraftType ??
          snap.TypeCraft ??
          snap.ACType ??
          snap.aircraft ??
          '',
      ).trim();
      const uom =
        String(rateMatch.uom ?? snap.adsUom ?? 'Per Service').trim() || 'Per Service';

      const key = `${particular.toLowerCase()}|${aircraftType.toLowerCase()}|${unitPrice}|${uom}`;
      const bucket =
        map.get(key) ??
        ({
          particular,
          aircraftType,
          unitPrice,
          uom,
          records: [],
        } satisfies RafBucket);
      bucket.records.push(rec);
      map.set(key, bucket);
    }

    const out: Omit<ComposedInvoiceLine, 'lineNo'>[] = [];
    for (const bucket of map.values()) {
      // Hourly / personnel UOMs bill summed usedUnits; turnaround/service rows bill 1 each.
      const quantity = round2(
        bucket.records.reduce((sum, rec) => sum + rafBillableUnits(rec, bucket.uom), 0),
      );
      if (!(quantity > 0)) continue;
      const lineAmountExclTax = round2(bucket.unitPrice * quantity);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax,
        serviceCode: 'RAF',
        documentDate,
      });
      const preparationRecordIds = bucket.records.map((r) => r._id as Types.ObjectId);
      const categoriesOfFlight = categoriesOfFlightFromSnapshots(
        bucket.records.map(
          (r) => r.operationalSnapshot as Record<string, unknown> | undefined,
        ),
      );

      out.push({
        lineType: 'service',
        serviceCode: 'RAF',
        description: bucket.particular,
        quantity,
        uom: bucket.uom,
        unitPrice: bucket.unitPrice,
        lineDiscountPercent: 0,
        lineAmountExclTax,
        ...tax,
        sourceType: 'raf',
        sourceRef: {
          particular: bucket.particular,
          aircraftType: bucket.aircraftType || undefined,
          usedQuantity: quantity,
          chargedQuantity: quantity,
          flights: bucket.records.map(flightLabel).filter(Boolean),
          preparationRecordIds,
          sourceRefs: bucket.records.map((r) => r.sourceRef as Record<string, unknown>),
          invoiceCategory: 'RAF',
          categoryOfFlight: categoriesOfFlight[0],
          categoriesOfFlight: categoriesOfFlight.length > 0 ? categoriesOfFlight : undefined,
          pricingBasis: bucket.unitPrice > 0 ? 'adhoc' : 'pending',
        },
        preparationRecordIds,
        preparationRecordId: preparationRecordIds[0],
      });
    }

    return out;
  }

  /**
   * Custom billing: user-entered particulars / used / charged / rate per unit.
   * Rates are billed exactly as entered — no contract fee concession on unit price.
   */
  private async composeCustomLines(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
    documentDate: Date,
    _contract?: InvoiceChargeContractLike,
  ): Promise<Omit<ComposedInvoiceLine, 'lineNo'>[]> {
    const out: Omit<ComposedInvoiceLine, 'lineNo'>[] = [];

    for (const rec of records) {
      const rateMatch = (rec.rateMatch ?? {}) as Record<string, unknown>;
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const rawLines = Array.isArray(rateMatch.customLines)
        ? (rateMatch.customLines as Array<Record<string, unknown>>)
        : [];
      const lineDefs =
        rawLines.length > 0
          ? rawLines
          : [
              {
                particular: rateMatch.particular,
                used: rateMatch.usedUnits,
                charged: rateMatch.chargedUnits ?? rateMatch.usedUnits,
                aircraftType: rateMatch.aircraftType,
                unit: rateMatch.uom,
                ratePerUnit: rateMatch.unitPrice,
              },
            ];

      const feeConcessionPercent = (() => {
        const fromMatch = Number(rateMatch.customConcessionPercent ?? 0);
        if (Number.isFinite(fromMatch) && fromMatch > 0) {
          return Math.min(100, Math.max(0, fromMatch));
        }
        return 0;
      })();

      for (const raw of lineDefs) {
        const particular = String(raw.particular ?? '').trim();
        if (!particular) continue;
        const used = Number(raw.used ?? 0);
        const chargedRaw = Number(raw.charged ?? used);
        const charged = chargedRaw > 0 ? chargedRaw : used > 0 ? used : 0;
        const unitPrice = Number(raw.ratePerUnit ?? raw.unitPrice ?? 0);
        if (!(unitPrice > 0) || !(charged > 0)) continue;

        const aircraftType = String(
          raw.aircraftType ??
            rateMatch.aircraftType ??
            snap.aircraftType ??
            snap.ACType ??
            '',
        ).trim();
        const uom = String(raw.unit ?? raw.uom ?? 'Per Service').trim() || 'Per Service';
        // Rate/Unit stays exact; optional form concession % applies at invoice totals.
        const lineAmountExclTax = round2(unitPrice * charged);
        const tax = await this.taxEngine.calculateLine(ctx, {
          lineAmountExclTax,
          serviceCode: 'ADS',
          documentDate,
        });
        const preparationRecordIds = [rec._id as Types.ObjectId];

        out.push({
          lineType: 'service',
          serviceCode: 'ADS',
          description: particular,
          quantity: charged,
          uom,
          unitPrice,
          lineDiscountPercent: 0,
          lineAmountExclTax,
          ...tax,
          sourceType: 'custom',
          sourceRef: {
            particular,
            aircraftType: aircraftType || undefined,
            usedQuantity: used,
            chargedQuantity: charged,
            ratePerUnit: unitPrice,
            concessionFeePercent: feeConcessionPercent,
            flight: flightLabel(rec),
            preparationRecordIds,
            sourceRefs: [rec.sourceRef as Record<string, unknown>],
            pricingBasis: 'custom',
          },
          preparationRecordIds,
          preparationRecordId: preparationRecordIds[0],
        });
      }
    }

    return out;
  }

  private resolveCustomConversionRate(
    records: BillingPreparationRecordDocument[],
  ): number | undefined {
    for (const rec of records) {
      if (String(rec.sourceType ?? '').trim().toLowerCase() !== 'custom') continue;
      const rateMatch = (rec.rateMatch ?? {}) as Record<string, unknown>;
      const n = Number(rateMatch.customConversionRate ?? 0);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
  }

  private async resolveInvoiceCurrencyFactor(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
    currencyCode: 'INR' | 'USD',
    documentDate: Date,
    billingPeriodStart?: Date | null,
    currencyFactorOverride?: number,
  ): Promise<number> {
    const partRate = Number(currencyFactorOverride);
    if (Number.isFinite(partRate) && partRate > 0) return partRate;
    const override = this.resolveCustomConversionRate(records);
    if (override != null && override > 0) return override;
    if (currencyCode === 'INR') return 1;
    return this.currencyEngine.resolveFactor(
      ctx,
      'USD',
      documentDate,
      billingPeriodStart,
    );
  }

  /**
   * ADS / equipment / manpower: per-flight free allowance, then sum for the period.
   * Per flight: Charged = max(0, Used − freeAllowance); invoice line sums charged.
   */
  private async composeAdsLines(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
    documentDate: Date,
    contract?: InvoiceChargeContractLike,
    billingCurrency: 'INR' | 'USD' = 'INR',
  ): Promise<Omit<ComposedInvoiceLine, 'lineNo'>[]> {
    type AdsBucket = {
      particular: string;
      serviceCode: string;
      equipmentServiceCode: string;
      aircraftType: string;
      unitPrice: number;
      effectiveUnitPrice: number;
      uom: string;
      used: number;
      charged: number;
      freeAllowance: number;
      pricingBasis?: string;
      chargePercent: number;
      feeConcessionPercent: number;
      concessionAppliedToUnitPrice: boolean;
      records: BillingPreparationRecordDocument[];
    };

    const map = new Map<string, AdsBucket>();
    /** Turnaround flights: at most one Crew Coach charged unit per serial. */
    const turnaroundCrewCoachChargedByFlight = new Map<string, number>();

    for (const rec of records) {
      const rateMatch = (rec.rateMatch ?? {}) as {
        serviceCode?: string;
        unitPrice?: number;
        usedUnits?: number;
        freeAllowance?: number;
        particular?: string;
        aircraftType?: string;
        uom?: string;
        pricingBasis?: string;
      };
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const particular = String(
        rateMatch.particular ??
          snap.adsParticular ??
          snap.equipment ??
          rateMatch.serviceCode ??
          'ADS Service',
      ).trim();
      const aircraftType = String(
        rateMatch.aircraftType ??
          snap.aircraftType ??
          snap.ACType ??
          snap.aircraft ??
          '',
      ).trim();
      const unitPrice = Number(rateMatch.unitPrice ?? 0);
      let uom = String(rateMatch.uom ?? snap.adsUom ?? 'Per Service').trim() || 'Per Service';
      const usedRaw = Number(
        rateMatch.usedUnits ?? snap.adsUsedUnits ?? snap.chargeableUnits ?? snap.qty ?? 1,
      );
      const freeRaw = Number(
        rateMatch.freeAllowance ?? snap.adsFreeAllowance ?? 0,
      );
      const pricingBasis = String(
        rateMatch.pricingBasis ?? snap.adsPricingBasis ?? '',
      ).trim();

      const freeAllowance = toWholeAdsUnits(
        Number.isFinite(freeRaw) && freeRaw > 0 ? freeRaw : 0,
      );

      // Re-check live contract first. Stale prep often has package_inclusive /
      // unitPrice 0 when aircraftTypes were polluted with services (HYD toilet
      // cart etc.) even though a priced ADS rule exists for the real airframe.
      const liveAds = resolveAdsPricingFromContractRule(
        contract as AdsEquipmentInclusionContract,
        {
          serviceCode: String(rateMatch.serviceCode ?? '').trim(),
          particular,
          equipmentName: String(
            snap.equipment_name ??
              snap.equipmentName ??
              snap.equipmentCode ??
              snap.abbr ??
              '',
          ),
          aircraftType,
          aircraftBody: String(
            snap.aircraftBody ?? snap.AircraftBody ?? '',
          ),
          flightCategory: String(
            snap.categoryOfFlight ?? snap.Cate_of_Flight ?? snap.flightCategory ?? '',
          ),
          billingCurrency,
        },
      );
      if (contract && liveAds.matched && liveAds.excluded) {
        continue;
      }

      if (liveAds.matched && liveAds.uom) {
        uom = String(liveAds.uom).trim() || uom;
      }
      const qtyRaw = Number(snap.qty ?? snap.chargeableUnits ?? usedRaw);
      const hoursRaw = Number(snap.usageHours);
      const remarksQty =
        Number(snap.remarksQuantity) > 0
          ? Number(snap.remarksQuantity)
          : parseAdsRemarksQuantity(snap.remarks ?? snap.Remarks);
      const usedFromContractUom = computeAdsUsedUnits({
        qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : Number.isFinite(usedRaw) && usedRaw > 0 ? usedRaw : 1,
        usageHours: Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : null,
        uom,
        remarksQuantity: remarksQty && Number.isFinite(remarksQty) ? remarksQty : null,
      });
      const used = capTurnaroundCrewCoachUsedUnits(usedFromContractUom, snap, particular);

      const livePriced =
        liveAds.matched &&
        !liveAds.excluded &&
        liveAds.unitPrice != null &&
        liveAds.unitPrice > 0;

      if (
        !livePriced &&
        (pricingBasis === 'ads_excluded' ||
          pricingBasis === 'not_on_contract' ||
          pricingBasis === 'package_inclusive' ||
          !(unitPrice > 0))
      ) {
        continue;
      }

      // Per-flight overage — free allowance applies to this flight's used qty only.
      // Prefer the LIVE contract free-per-flight so editing "Free / flight" takes
      // effect immediately (stale prep freeAllowance was billing every use, e.g.
      // PBNB free=1 still charged 33). liveAds.freePerFlight already accounts for
      // Always-bill / excluded (→ 0). Fall back to prep free when live has no rule.
      const effectiveFree = liveAds.matched
        ? toWholeAdsUnits(
            Number.isFinite(liveAds.freePerFlight) && liveAds.freePerFlight > 0
              ? liveAds.freePerFlight
              : 0,
          )
        : freeAllowance;
      let charged = toWholeAdsUnits(Math.max(0, used - effectiveFree));

      // Turnaround: ARR+DEP Crew Coach lines must not bill twice for one coach.
      if (
        charged > 0 &&
        isCrewCoachEquipmentLabel(particular) &&
        isTurnaroundFlightContext(snap, snap.flightNo ?? snap.flightNoEquipmentNo)
      ) {
        const flightKey = String(
          (rec.sourceRef as { serialNo?: unknown } | undefined)?.serialNo ??
            snap.serialNumber ??
            snap.SerialNo ??
            '',
        ).trim();
        if (flightKey) {
          const already = turnaroundCrewCoachChargedByFlight.get(flightKey) ?? 0;
          const room = Math.max(0, 1 - already);
          charged = Math.min(charged, room);
          turnaroundCrewCoachChargedByFlight.set(flightKey, already + charged);
        } else {
          charged = Math.min(charged, 1);
        }
      }
      if (charged <= 0) continue;

      const billedUnitPrice =
        liveAds.matched && liveAds.unitPrice != null && liveAds.unitPrice > 0
          ? liveAds.unitPrice
          : unitPrice;
      const equipmentServiceCode =
        String(rateMatch.serviceCode ?? particular).trim() || particular;
      const sourceRef = {
        ...(rec.sourceRef as Record<string, unknown>),
        operationalSnapshot: snap,
        sourceType: rec.sourceType,
        categoryOfFlight: pickCategoryOfFlight(snap) || undefined,
        diverted: snap.diverted ?? snap.isDiverted,
        returnToRamp: snap.returnToRamp ?? snap.isReturnToRamp,
        aircraftType: aircraftType || undefined,
      } satisfies Record<string, unknown>;
      const recordLevelContract = contractFromPreparationRecord(rec, contract);
      // ADS additional: Concessions-page fee % only (Dom/Int/Div fees).
      // Never apply BHS package conditionalCharges to ADS equipment unit price.
      const chargePercent = 0;
      const feeConcessionPercent = resolveLineFeeConcessionPercent(
        { sourceRef },
        recordLevelContract,
      );
      const concessionAppliedToUnitPrice = false;
      const effectiveUnitPrice = round2(billedUnitPrice);

      const key = `${particular.toLowerCase()}|${aircraftType.toLowerCase()}|${billedUnitPrice}|${uom}|${chargePercent}|${feeConcessionPercent}|${concessionAppliedToUnitPrice ? 'unit' : 'header'}`;
      const bucket =
        map.get(key) ??
        ({
          particular,
          serviceCode: 'ADS',
          equipmentServiceCode,
          aircraftType,
          unitPrice: billedUnitPrice,
          effectiveUnitPrice,
          uom,
          used: 0,
          charged: 0,
          freeAllowance: 0,
          pricingBasis,
          chargePercent,
          feeConcessionPercent,
          concessionAppliedToUnitPrice,
          records: [],
        } satisfies AdsBucket);

      bucket.used += used;
      bucket.charged += charged;
      bucket.freeAllowance = Math.max(bucket.freeAllowance, effectiveFree);
      bucket.records.push(rec);
      if (!bucket.pricingBasis && pricingBasis) bucket.pricingBasis = pricingBasis;
      map.set(key, bucket);
    }

    const lines: Omit<ComposedInvoiceLine, 'lineNo'>[] = [];
    for (const bucket of map.values()) {
      const used = toWholeAdsUnits(bucket.used);
      const freeAllowance = toWholeAdsUnits(bucket.freeAllowance);
      const charged = toWholeAdsUnits(bucket.charged);
      if (charged <= 0 || !(bucket.effectiveUnitPrice > 0)) continue;

      const lineAmountExclTax = round2(bucket.effectiveUnitPrice * charged);
      const tax = await this.taxEngine.calculateLine(ctx, {
        lineAmountExclTax,
        serviceCode: bucket.serviceCode,
        documentDate,
      });
      const preparationRecordIds = bucket.records.map((r) => r._id as Types.ObjectId);
      const categoriesOfFlight = categoriesOfFlightFromSnapshots(
        bucket.records.map((r) => r.operationalSnapshot as Record<string, unknown> | undefined),
      );

      lines.push({
        lineType: 'service',
        serviceCode: 'ADS',
        description: bucket.particular,
        quantity: charged,
        uom: bucket.uom,
        unitPrice: bucket.effectiveUnitPrice,
        lineDiscountPercent: 0,
        lineAmountExclTax,
        ...tax,
        sourceType: 'ads',
        sourceRef: {
          particular: bucket.particular,
          equipmentServiceCode: bucket.equipmentServiceCode,
          aircraftType: bucket.aircraftType || undefined,
          usedQuantity: used,
          chargedQuantity: charged,
          freeAllowance,
          pricingBasis: bucket.pricingBasis || undefined,
          preparationRecordIds,
          invoiceCategory: 'ADS',
          categoryOfFlight: categoriesOfFlight[0],
          categoriesOfFlight: categoriesOfFlight.length > 0 ? categoriesOfFlight : undefined,
          concessionPercent: bucket.chargePercent,
          concessionFeePercent: bucket.feeConcessionPercent || undefined,
          concessionAppliedToUnitPrice: bucket.concessionAppliedToUnitPrice || undefined,
        },
        preparationRecordIds,
        preparationRecordId: preparationRecordIds[0],
      });
    }

    return lines;
  }

  /**
   * Copies departure, arrival, terminal, and handling type from fhr_collection
   * onto the snapshot so band order (ATD), ground time (ATD − ATA), and SGHA
   * percents use the flight report rather than a stale preparation copy.
   */
  private async stampFhrMovement(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
  ): Promise<void> {
    if (!String(ctx?.stationCode ?? '').trim()) return;
    const serials = [
      ...new Set(
        records
          .filter((rec) => rec.sourceType === 'scheduled_flight')
          .map((rec) => preparationSerial(rec))
          .filter((n): n is number => n != null),
      ),
    ];
    if (serials.length === 0) return;
    const docs = await this.fhrModel
      .find(StationScope.filter({ SerialNo: { $in: serials } }, ctx))
      .select('SerialNo mainDetails terminalDetails')
      .lean();
    const bySerial = new Map<number, Record<string, unknown>>();
    for (const doc of docs) {
      const serial = Number((doc as { SerialNo?: unknown }).SerialNo);
      if (!Number.isFinite(serial)) continue;
      const main = ((doc as { mainDetails?: Record<string, unknown> }).mainDetails ??
        {}) as Record<string, unknown>;
      const terminal = ((doc as { terminalDetails?: Record<string, unknown> }).terminalDetails ??
        {}) as Record<string, unknown>;
      bySerial.set(serial, { ...terminal, ...main });
    }
    if (bySerial.size === 0) return;
    for (const rec of records) {
      const serial = preparationSerial(rec);
      const row = serial == null ? undefined : bySerial.get(serial);
      if (!row) continue;
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const atdDate = calendarDayKey(row.ATDDate ?? row.atdDate);
      const atdTime = clockHm(row.ATDTime ?? row.atdTime);
      const ataDate = calendarDayKey(row.ATADate ?? row.ataDate);
      const ataTime = clockHm(row.ATATime ?? row.ataTime);
      const stdDate = calendarDayKey(row.STDDate ?? row.stdDate);
      const stdTime = clockHm(row.STDTime ?? row.stdTime);
      const terminal = String(row.Terminal ?? row.terminal ?? row.terminalCode ?? '').trim();
      const handling = String(
        row.TypeofHandling ?? row.typeOfHandling ?? row.ops ?? row.Typeofflight ?? row.typeOfFlight ?? '',
      ).trim();
      rec.operationalSnapshot = {
        ...snap,
        ...(atdDate ? { atdDate, ATDDate: atdDate } : {}),
        ...(atdTime ? { atdTime, ATDTime: atdTime } : {}),
        ...(ataDate ? { ataDate, ATADate: ataDate } : {}),
        ...(ataTime ? { ataTime, ATATime: ataTime } : {}),
        ...(stdDate ? { stdDate, STDDate: stdDate } : {}),
        ...(stdTime ? { stdTime, STDTime: stdTime } : {}),
        ...(terminal ? { terminal } : {}),
        ...(handling && !String(snap.typeOfHandling ?? snap.TypeofHandling ?? '').trim()
          ? { typeOfHandling: handling }
          : {}),
      };
    }
  }

  /** Marks FILO / LIFO from fhr_collection so SGHA ferry percents apply on regenerate. */
  private async stampFerryKindFromFhr(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
  ): Promise<void> {
    if (!String(ctx?.stationCode ?? '').trim()) return;
    const serials = [
      ...new Set(
        records
          .filter((rec) => rec.sourceType === 'scheduled_flight')
          .map((rec) => {
            const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
            const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
            const n = Number(ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo);
            return Number.isFinite(n) ? n : null;
          })
          .filter((n): n is number => n != null),
      ),
    ];
    if (serials.length === 0) return;
    const docs = await this.fhrModel
      .find(StationScope.filter({ SerialNo: { $in: serials } }, ctx))
      .select('SerialNo mainDetails terminalDetails rampDetails1 rampDetails3 loadControlDetails loadDetails')
      .lean();
    const bySerial = new Map<number, 'filo' | 'lifo'>();
    for (const doc of docs) {
      const serial = Number((doc as { SerialNo?: unknown }).SerialNo);
      const kind = ferryKindFromFhrDocument(doc as unknown as Record<string, unknown>);
      if (Number.isFinite(serial) && kind) bySerial.set(serial, kind);
    }
    if (bySerial.size === 0) return;
    for (const rec of records) {
      const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const serial = Number(ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo);
      const kind = bySerial.get(serial);
      if (!kind) continue;
      rec.operationalSnapshot = { ...snap, ferryKind: kind };
    }
  }

  /**
   * Second flight of the same airline and aircraft on the same ATA date
   * uses the rate-card incremental price. ATA date and ATD time come from
   * fhr_collection, then the preparation snapshot.
   */
  private async incrementalPricesFromFhr(
    ctx: StationScopeContext,
    records: BillingPreparationRecordDocument[],
  ): Promise<Map<string, number>> {
    if (!String(ctx?.stationCode ?? '').trim()) return new Map();
    const scheduled = records.filter((rec) => rec.sourceType === 'scheduled_flight');
    if (scheduled.length === 0) return new Map();

    const serials = [
      ...new Set(
        scheduled
          .map((rec) => {
            const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
            const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
            const raw = ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo;
            const n = Number(raw);
            return Number.isFinite(n) ? n : null;
          })
          .filter((n): n is number => n != null),
      ),
    ];
    const fhrBySerial = new Map<number, { ataDate: string; atdTime: string }>();
    if (serials.length > 0) {
      const docs = await this.fhrModel
        .find(StationScope.filter({ SerialNo: { $in: serials } }, ctx))
        .select('SerialNo mainDetails')
        .lean();
      for (const doc of docs) {
        const serial = Number((doc as { SerialNo?: unknown }).SerialNo);
        if (!Number.isFinite(serial)) continue;
        fhrBySerial.set(
          serial,
          ataAtdFromFhrMain(
            (doc as { mainDetails?: Record<string, unknown> }).mainDetails ?? null,
          ),
        );
      }
    }

    const customerCodes = [
      ...new Set(
        scheduled
          .map((rec) => String(rec.customerCode ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const cards =
      customerCodes.length === 0
        ? []
        : await this.priceCardAirlineModel
            .find(
              StationScope.filter(
                {
                  handlingType: 'BHS',
                  active: true,
                  incrementalFlightsActive: true,
                  customerCode: { $in: customerCodes },
                },
                ctx,
              ),
            )
            .select('customerCode aircraftType incrementalPrice validFrom validTo')
            .lean();

    const candidates = records.flatMap((rec, index) => {
      if (rec.sourceType !== 'scheduled_flight') return [];
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
      const rateMatch = rec.rateMatch as {
        incrementalFlightsActive?: boolean;
        incrementalPrice?: number;
      } | null;
      const serial = Number(ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo);
      const fhr = Number.isFinite(serial) ? fhrBySerial.get(serial) : undefined;
      const ataDate =
        fhr?.ataDate ||
        calendarDayKey(snap.ataDate ?? snap.ATADate ?? snap['ATA Date']);
      const atdTime =
        fhr?.atdTime ||
        String(snap.atdTime ?? snap.ATDTime ?? snap['ATD Time'] ?? '').trim();
      const aircraft = String(snap.aircraftType ?? snap.TypeCraft ?? snap.aircraft ?? '');
      const airline = String(rec.customerCode ?? '').trim().toUpperCase();
      const card = cards.find((row) => {
        if (String(row.customerCode ?? '').trim().toUpperCase() !== airline) return false;
        if (!aircraftKeysMatch(String(row.aircraftType ?? ''), aircraft)) return false;
        const price = Number(row.incrementalPrice);
        return price > 0;
      });
      const incrementalPrice = card
        ? Number(card.incrementalPrice)
        : Number(rateMatch?.incrementalPrice ?? 0);
      return [
        {
          id: String(rec._id ?? index),
          sourceType: rec.sourceType,
          customerCode: airline,
          aircraftType: aircraft,
          flightDate: ataDate,
          flightTime: atdTime,
          incrementalFlightsActive: Boolean(card) || rateMatch?.incrementalFlightsActive === true,
          incrementalPrice,
        },
      ];
    });

    const secondIds = incrementalSecondFlightIds(candidates);
    const prices = new Map<string, number>();
    for (const flight of candidates) {
      if (!secondIds.has(flight.id)) continue;
      const price = Number(flight.incrementalPrice);
      if (price > 0) prices.set(flight.id, price);
    }
    return prices;
  }

  sumLines(lines: Array<{ lineAmountExclTax: number; lineAmountInclTax: number; cgstAmount: number; sgstAmount: number; igstAmount: number }>) {
    const subtotalExclTax = round2(lines.reduce((s, l) => s + l.lineAmountExclTax, 0));
    const taxTotal = round2(
      lines.reduce((s, l) => s + l.cgstAmount + l.sgstAmount + l.igstAmount, 0),
    );
    return {
      subtotalExclTax,
      taxTotal,
      totalInclTax: round2(subtotalExclTax + taxTotal),
    };
  }
}

function aggregateBuckets(
  records: BillingPreparationRecordDocument[],
  contract?: InvoiceChargeContractLike,
  volume?: {
    schedules: BhsVolumeSchedule[];
    population: BillingPreparationRecordDocument[];
  },
  incrementalPriceById?: Map<string, number>,
): AggregateBucket[] {
  const map = new Map<string, AggregateBucket>();
  const volumeHits =
    volume && volume.schedules.length > 0
      ? resolveBhsVolumePrices(
          volume.population.map((rec, index) => ({
            id: bhsVolumeFlightId(rec, index),
            sourceType: rec.sourceType,
            billingPeriodStart: rec.billingPeriodStart,
            operationalSnapshot: (rec.operationalSnapshot ?? null) as Record<string, unknown> | null,
            sourceRef: (rec.sourceRef ?? null) as Record<string, unknown> | null,
            rateMatch: (rec.rateMatch ?? null) as { serviceCode?: string; unitPrice?: number } | null,
            validationResults: (rec.validationResults ?? null) as Array<{
              rule?: string;
              passed?: boolean;
            }> | null,
          })),
          volume.schedules,
        )
      : null;
  const scopeCounts = new Map<string, number>();
  if (volumeHits) {
    for (const hit of volumeHits.values()) {
      scopeCounts.set(hit.flightScope, (scopeCounts.get(hit.flightScope) ?? 0) + 1);
    }
  }
  const splitOrdinal = new Map<string, number>();
  const incrementalIds = incrementalSecondFlightIds(
    records.map((rec, index) => {
      const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
      const rateMatch = rec.rateMatch as {
        incrementalFlightsActive?: boolean;
        incrementalPrice?: number;
      } | null;
      const flightDate = calendarDayKey(
        snap.ataDate ?? snap.ATADate ?? snap['ATA Date'] ?? snap.billingDateYmd ?? '',
      );
      const flightTime = String(
        snap.atdTime ?? snap.ATDTime ?? snap['ATD Time'] ?? snap.ataTime ?? '',
      );
      return {
        id: String(rec._id ?? index),
        sourceType: rec.sourceType,
        customerCode: rec.customerCode,
        aircraftType: String(snap.aircraftType ?? snap.TypeCraft ?? snap.aircraft ?? ''),
        flightDate,
        flightTime,
        incrementalFlightsActive: rateMatch?.incrementalFlightsActive === true,
        incrementalPrice: rateMatch?.incrementalPrice,
      };
    }),
  );

  for (const [index, rec] of records.entries()) {
    const rateMatch = rec.rateMatch as {
      serviceCode?: string;
      unitPrice?: number;
      incrementalFlightsActive?: boolean;
      incrementalPrice?: number;
    } | undefined;
    const serviceCode = rateMatch?.serviceCode ?? 'SVC-UNK';
    const savedUnitPrice = Number(rateMatch?.unitPrice ?? 0);
    const recordId = String(rec._id ?? index);
    const fhrIncrementalPrice = incrementalPriceById?.get(recordId);
    const incrementalPrice =
      fhrIncrementalPrice != null && fhrIncrementalPrice > 0
        ? fhrIncrementalPrice
        : Number(rateMatch?.incrementalPrice ?? 0);
    const useIncremental =
      (fhrIncrementalPrice != null && fhrIncrementalPrice > 0) ||
      (incrementalIds.has(recordId) &&
        rateMatch?.incrementalFlightsActive === true &&
        incrementalPrice > 0);
    const volumeHit = volumeHits?.get(bhsVolumeFlightId(rec, index));
    const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
    const additionalPackage =
      rec.sourceType === 'scheduled_flight' &&
      isAdditionalBhsFlight(snap) &&
      savedUnitPrice > 0;
    const splitPrice = additionalPackage
      ? null
      : splitComprehensiveUnitPrice({
      category: String(
        snap.categoryOfFlight ?? snap.Cate_of_Flight ?? snap.flightCategory ?? '',
      ),
      stationCode: String(
        (rec as { stationCode?: string }).stationCode ??
          snap.stationCode ??
          snap.station ??
          '',
      ),
      snapshot: snap,
      schedules: volume?.schedules ?? [],
      scopeCounts,
      splitOrdinal,
      savedUnitPrice,
      intArrivalDomDeparturePercent:
        contract?.conditionalCharges?.splitIntArrivalDomDeparturePercent,
      domArrivalIntDeparturePercent:
        contract?.conditionalCharges?.splitDomArrivalIntDeparturePercent,
    });
    const unitPrice = useIncremental
      ? incrementalPrice
      : additionalPackage
        ? savedUnitPrice
        : splitPrice?.unitPrice ?? volumeHit?.unitPrice ?? savedUnitPrice;
    const aircraftType = aircraftTypeFromRecord(rec);
    const sourceRef = {
      ...(rec.sourceRef as Record<string, unknown>),
      operationalSnapshot: rec.operationalSnapshot as Record<string, unknown> | undefined,
      sourceType: rec.sourceType,
    } satisfies Record<string, unknown>;
    const recordLevelContract = contractFromPreparationRecord(rec, contract);
    const chargePercent = resolveLineConcessionPercent({ sourceRef }, recordLevelContract);
    const additionalChargePercent = resolveLineAdditionalChargePercent(
      { sourceRef },
      recordLevelContract,
    );
    const groundMinutes = actualGroundMinutes({ sourceRef });
    const groundPercent = Number(
      recordLevelContract?.conditionalCharges?.extraGroundTimeAdditionalPercent ?? 0,
    );
    const groundSurchargeApplied =
      groundMinutes != null &&
      groundMinutes > 75 &&
      groundPercent > 0 &&
      additionalChargePercent >= groundPercent;
    const feeConcessionPercent = resolveLineFeeConcessionPercent(
      { sourceRef },
      recordLevelContract,
    );
    const concessionScenario = inferConcessionScenarioFromLine(
      { sourceRef },
      recordLevelContract,
    );
    const concessionAppliedToUnitPrice =
      shouldApplyConcessionToBhsUnitPrice(concessionScenario, recordLevelContract) &&
      Number.isFinite(chargePercent) &&
      chargePercent >= 0;
    const concessionAdjustedUnitPrice = concessionAppliedToUnitPrice
      ? round2((unitPrice * chargePercent) / 100)
      : round2(unitPrice);
    const withAdditional =
      additionalChargePercent > 0
        ? round2(concessionAdjustedUnitPrice * (1 + additionalChargePercent / 100))
        : concessionAdjustedUnitPrice;
    const cancellationChargeablePercent = cancellationChargeablePercentForRecord(rec);
    const effectiveUnitPrice =
      cancellationChargeablePercent == null
        ? withAdditional
        : round2((withAdditional * cancellationChargeablePercent) / 100);
    const volumeKey = splitPrice
      ? `split:${splitPrice.kind}|${splitPrice.baseScope}|${splitPrice.monthIndex}`
      : volumeHit
        ? `${volumeHit.flightScope}|${volumeHit.fromCount}|${volumeHit.toCount ?? 'open'}`
        : 'card';
    const handlingPhrase = handlingChargePhrase(rec);
    const key = `${serviceCode}|${unitPrice}|${aircraftType}|${chargePercent}|${additionalChargePercent}|${feeConcessionPercent}|${concessionAppliedToUnitPrice ? 'unit' : 'header'}|${cancellationChargeablePercent ?? 'na'}|${volumeKey}|${handlingPhrase}`;

    const bucket =
      map.get(key) ??
      ({
        serviceCode,
        unitPrice,
        effectiveUnitPrice,
        chargePercent,
        additionalChargePercent,
        feeConcessionPercent,
        concessionAppliedToUnitPrice,
        cancellationChargeablePercent,
        aircraftType,
        uom: 'Per Flight',
        sourceType: rec.sourceType,
        records: [],
        volumeHit,
        splitPrice: splitPrice ?? undefined,
        groundSurchargeApplied,
        handlingPhrase,
      } satisfies AggregateBucket);

    bucket.records.push(rec);
    map.set(key, bucket);
  }

  return [...map.values()];
}

/**
 * BHS is one invoice per airline and billing period.
 * Different rates (volume bands, ground-time uplift) are particulars on that invoice,
 * not extra drafts. ADS, RAF, and other categories stay one group as well.
 */
export function splitBhsPreparationByUnitRate(
  records: BillingPreparationRecordDocument[],
  _contract?: InvoiceChargeContractLike,
  _options?: {
    currencyCode?: 'INR' | 'USD';
    volumePopulation?: BillingPreparationRecordDocument[];
  },
): BillingPreparationRecordDocument[][] {
  if (records.length === 0) return [];
  return [records];
}

function aircraftTypeFromRecord(rec: BillingPreparationRecordDocument): string {
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  return String(snap.aircraftType ?? snap.ACType ?? snap.aircraft ?? '').trim();
}

function cancellationChargeablePercentForRecord(
  rec: BillingPreparationRecordDocument,
): number | null {
  if (rec.sourceType !== 'scheduled_flight') return null;
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  const validationResults = (rec.validationResults ?? []) as Array<{
    rule?: string;
    passed?: boolean;
  }>;
  const cancelledByValidation = validationResults.some(
    (result) => result.rule === 'not_cancelled' && result.passed === false,
  );
  const cancelled =
    snap.isCancelled === true || snap.cancelled === true || snap.flightCancelled === true;
  if (!cancelled && !cancelledByValidation) return null;
  const cancellationBilling = (rec as BillingPreparationRecordDocument & {
    cancellationBilling?: { enabled?: boolean; bhsChargeablePercent?: number };
  }).cancellationBilling;
  if (!cancellationBilling?.enabled) return null;
  const pct = Number(cancellationBilling.bhsChargeablePercent ?? 0);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

function flightLabel(rec: BillingPreparationRecordDocument): string {
  const sourceRef = rec.sourceRef as {
    serialNo?: string;
    flightNo?: string;
    usageRowId?: string;
  };
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  const flightNo = String(sourceRef.flightNo ?? snap.flightNoEquipmentNo ?? '').trim();
  if (flightNo) return flightNo;
  if (sourceRef.serialNo) return `#${sourceRef.serialNo}`;
  if (sourceRef.usageRowId) return sourceRef.usageRowId;
  return '';
}

function volumeBandPhrase(hit: BhsVolumePriceHit | undefined): string {
  if (!hit || !Number.isFinite(hit.fromCount) || hit.fromCount < 1) return '';
  if (hit.toCount == null) return ` [${hit.fromCount} flights and above]`;
  return ` [${hit.fromCount} to ${hit.toCount} flights]`;
}

const SCHEDULED_HANDLING_WORDS = /^(scheduled|additional|sch|add)$/i;

function flightTypeText(rec: BillingPreparationRecordDocument): string {
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
  const nested = (ref.operationalSnapshot ?? {}) as Record<string, unknown>;
  for (const source of [snap, nested, ref]) {
    for (const key of ['typeOfFlight', 'Typeofflight', 'TypeOfFlight']) {
      const value = String(source[key] ?? '').trim();
      if (value) return value;
    }
  }
  for (const source of [snap, nested, ref]) {
    for (const key of ['typeOfHandling', 'TypeofHandling']) {
      const value = String(source[key] ?? '').trim();
      if (value && !SCHEDULED_HANDLING_WORDS.test(value)) return value;
    }
  }
  return 'Turnaround';
}

/** Invoice particular from FHR type of flight. SGHA % is applied separately on the rate. */
function handlingChargePhrase(rec: BillingPreparationRecordDocument): string {
  const label = flightTypeText(rec).replace(/\s+/g, ' ').trim();
  return `Charges for ${label} handling`;
}

function groundTimePhrase(bucket: AggregateBucket): string {
  const minutes = bucket.records
    .map((rec) => {
      const sourceRef = {
        ...(rec.sourceRef as Record<string, unknown>),
        operationalSnapshot: rec.operationalSnapshot as Record<string, unknown> | undefined,
      };
      return actualGroundMinutes({ sourceRef });
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  const rounded = [...new Set(minutes.map((value) => Math.round(value)))];
  const exact = rounded.length === 1 ? ` [ground time ${rounded[0]} min]` : '';
  const beyond = bucket.groundSurchargeApplied ? ' [beyond 75 minutes ground time]' : '';
  return `${exact}${beyond}`;
}

function buildAggregatedDescription(bucket: AggregateBucket): string {
  const code = String(bucket.serviceCode ?? '').trim();
  const band = volumeBandPhrase(bucket.volumeHit);
  const ground = groundTimePhrase(bucket);
  // BHS package rate stays in the amount columns; the particular does not repeat "@ price".
  if (
    bucket.volumeHit ||
    /^scheduled\s*flight$/i.test(code) ||
    /^trnd$/i.test(code) ||
    /^bhs$/i.test(code)
  ) {
    return `${bucket.handlingPhrase}${band}${ground}`;
  }
  const count = bucket.records.length;
  const flights = bucket.records.map(flightLabel).filter(Boolean);
  const flightPart =
    flights.length > 0
      ? flights.length <= 5
        ? flights.join(', ')
        : `${flights.slice(0, 4).join(', ')} +${flights.length - 4} more`
      : `${count} flight${count === 1 ? '' : 's'}`;
  const aircraftPart = bucket.aircraftType ? ` · ${bucket.aircraftType}` : '';
  return `${bucket.serviceCode}${aircraftPart} — ${flightPart}`;
}

function uniquePreparationRecords(
  records: BillingPreparationRecordDocument[],
): BillingPreparationRecordDocument[] {
  const seen = new Set<BillingPreparationRecordDocument>();
  const out: BillingPreparationRecordDocument[] = [];
  for (const rec of records) {
    if (seen.has(rec)) continue;
    seen.add(rec);
    out.push(rec);
  }
  return out;
}

function preparationSerial(rec: BillingPreparationRecordDocument): number | null {
  const ref = (rec.sourceRef ?? {}) as Record<string, unknown>;
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  const n = Number(ref.serialNo ?? snap.serialNumber ?? snap.serialNo ?? snap.SerialNo);
  return Number.isFinite(n) ? n : null;
}

function clockHm(raw: unknown): string {
  const match = String(raw ?? '').trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** RAF prep rows: meter by used hours when UOM is hourly; otherwise 1 event per row. */
function rafBillableUnits(
  rec: BillingPreparationRecordDocument,
  bucketUom: string,
): number {
  const rateMatch = (rec.rateMatch ?? {}) as Record<string, unknown>;
  const snap = (rec.operationalSnapshot ?? {}) as Record<string, unknown>;
  const uom = String(rateMatch.uom ?? snap.uom ?? bucketUom ?? '')
    .trim()
    .toLowerCase();
  const metered = /\/\s*hr|per\s*hr|hour|personnel|man\s*-?\s*hour/.test(uom);
  const raw = Number(
    rateMatch.usedUnits ??
      rateMatch.chargedUnits ??
      snap.usageHours ??
      snap.quantity ??
      NaN,
  );
  if (metered && Number.isFinite(raw) && raw > 0) return raw;
  return 1;
}

function contractFromPreparationRecord(
  rec: BillingPreparationRecordDocument,
  fallback?: InvoiceChargeContractLike,
): InvoiceChargeContractLike {
  const contractMatch = (rec.contractMatch ?? {}) as Record<string, unknown>;
  const concessionRatesRaw = contractMatch.concessionRates;
  const concessionRates =
    concessionRatesRaw && typeof concessionRatesRaw === 'object'
      ? (concessionRatesRaw as ContractConcessionRatesShape)
      : undefined;
  const conditionalChargesRaw = contractMatch.conditionalCharges;
  const conditionalCharges =
    conditionalChargesRaw && typeof conditionalChargesRaw === 'object'
      ? (conditionalChargesRaw as ContractConditionalChargesShape)
      : undefined;
  const cancellationWithinHours = Number(contractMatch.cancellationWithinHours);
  const royaltyAtGross = Number(contractMatch.royaltyAtGross);

  const hasConcessions = Boolean(concessionRates && Object.keys(concessionRates).length > 0);
  const hasConditional = Boolean(
    conditionalCharges && Object.keys(conditionalCharges).length > 0,
  );
  const liveConcessions = Boolean(
    fallback?.concessionRates && Object.keys(fallback.concessionRates).length > 0,
  );
  const liveConditional = Boolean(
    fallback?.conditionalCharges && Object.keys(fallback.conditionalCharges).length > 0,
  );
  const hasCancellation = Number.isFinite(cancellationWithinHours);
  const hasRoyalty = Number.isFinite(royaltyAtGross);
  if (
    !hasConcessions &&
    !hasConditional &&
    !hasCancellation &&
    !hasRoyalty &&
    !liveConcessions &&
    !liveConditional
  ) {
    return fallback ?? null;
  }
  // Live contract wins. Prep contractMatch is a snapshot from the last enrich
  // and must not keep an edited concession % off a regenerated invoice.
  return {
    royaltyAtGross:
      fallback?.royaltyAtGross != null && Number.isFinite(Number(fallback.royaltyAtGross))
        ? fallback.royaltyAtGross
        : hasRoyalty
          ? royaltyAtGross
          : null,
    cancellationWithinHours:
      fallback?.cancellationWithinHours != null &&
      Number.isFinite(Number(fallback.cancellationWithinHours))
        ? fallback.cancellationWithinHours
        : hasCancellation
          ? cancellationWithinHours
          : null,
    concessionRates: liveConcessions
      ? fallback?.concessionRates ?? null
      : hasConcessions
        ? concessionRates ?? null
        : null,
    conditionalCharges: {
      ...(hasConditional ? conditionalCharges : {}),
      ...(liveConditional ? fallback?.conditionalCharges ?? {} : {}),
    },
    adsBillingEnabled: fallback?.adsBillingEnabled,
    adsEquipmentRules: fallback?.adsEquipmentRules,
    aircraftTypes: fallback?.aircraftTypes,
  };
}

