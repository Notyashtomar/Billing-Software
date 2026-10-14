import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { BillingSourceRow } from '../../shared/billing-sources';
import type { StationScopeContext } from '../../common/station-scope';
import { StationScope, successResponse } from '../../common/station-scope';
import { ValidationEngineService } from '../../engines/validation-engine.service';
import {
  BillingContract,
  BillingContractDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingPriceCardAirline,
  BillingPriceCardAirlineDocument,
  BillingRafAdhocRate,
  BillingRafAdhocRateDocument,
  BillingRateCard,
  BillingRateCardDocument,
} from '../../schemas/billing.schemas';
import { reportDateYmd } from '../../utils/invoicing-flight-report.mapper';
import {
  normalizeBillingCustomerCode,
  resolveKnownBillingCustomerCode,
} from '../../utils/billing-customer-code.util';
import { isCargoFlightHint, pickPreferredHandlingContract } from '../../utils/billing-contract-pick.util';
import { isBillingOperationalRowCancelled } from '../../utils/billing-date.util';
import { stripCancelledFlightPrefix } from '../../utils/billing-flight-no.util';
import {
  pickBestRateCardForFlight,
} from '../../utils/aircraft-type-match.util';
import {
  isAdditionalBhsFlight,
  packagePriceFromEntry,
  pickBhsPackagePriceEntry,
  resolveBhsScheduledUnitPrice,
  selectBhsEntriesForFlightOperation,
  type BhsPackagePriceRow,
} from '../../utils/bhs-package-price.util';
import {
  inheritForCustomer,
  shapeContractForAdditionalCustomer,
} from '../../utils/additional-customer-inherit.util';
import {
  ceilingRateForBillingCurrency,
  resolveBillingCurrency,
  unitPriceForBillingCurrency,
} from '../../utils/billing-currency.util';
import {
  isAdsFamilySourceType,
} from '../../shared/ads-adhoc-tariff';
import {
  capTurnaroundCrewCoachUsedUnits,
  computeAdsUsedUnits,
  parseAdsRemarksQuantity,
} from '../../shared/fhr-equipment-to-ads-row';
import {
  isAdsHourlyUom,
  normalizeBillingScope,
  type RateCardBillingScope,
} from '../../shared/rate-card-billing-scope';
import { resolveAdsPricingFromContractRule } from '../../shared/ads-equipment-inclusion.util';
import { lookupRafAdhocRate } from '../../shared/raf-adhoc-lookup';

type EnrichmentCache = {
  customersByCode: Map<string, BillingCustomer & { _id?: unknown }>;
  customersList: Array<BillingCustomer & { _id?: unknown }>;
  contracts: Array<BillingContract & { _id?: unknown }>;
  rateCards: Array<BillingRateCard & { _id?: unknown }>;
  bhsEntries: Array<BillingPriceCardAirline & { _id?: unknown }>;
  contractsByCustomer: Map<string, Array<BillingContract & { _id?: unknown }>>;
  rateCardsByCustomer: Map<string, Array<BillingRateCard & { _id?: unknown }>>;
  bhsEntriesByCustomer: Map<string, Array<BillingPriceCardAirline & { _id?: unknown }>>;
  stationCode?: string;
  rafAdhoc: Array<{
    label: string;
    stationCode: string;
    validFrom: Date;
    validTo: Date;
    unitPriceINR?: number;
    unitPriceUSD?: number;
    uom: string;
    percentValue?: number;
  }>;
};

export interface EnrichSourceInput {
  sourceType: string;
  sourceRef: BillingSourceRow['sourceRef'];
  operationalData: Record<string, unknown>;
  customerCode: string;
  serviceCode: string;
  billingDate?: string;
  cancelled?: boolean;
  atdDate?: string | null;
}

@Injectable()
export class BillingSourceEnrichmentService {
  constructor(
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingPriceCardAirline.name)
    private readonly priceCardAirlineModel: Model<BillingPriceCardAirlineDocument>,
    @InjectModel(BillingRafAdhocRate.name)
    private readonly rafAdhocModel: Model<BillingRafAdhocRateDocument>,
    private readonly validationEngine: ValidationEngineService,
  ) {}

  async enrich(
    ctx: StationScopeContext,
    input: EnrichSourceInput,
  ): Promise<BillingSourceRow> {
    const [row] = await this.enrichBatch(ctx, [input]);
    return row;
  }

  /** Preloads billing master data once, then enriches all rows in memory. */
  async enrichBatch(
    ctx: StationScopeContext,
    inputs: EnrichSourceInput[],
  ): Promise<BillingSourceRow[]> {
    if (inputs.length === 0) return [];

    const cache = await this.loadEnrichmentCache(ctx, inputs);
    const out: BillingSourceRow[] = [];
    const yieldEvery = 150;
    for (let i = 0; i < inputs.length; i += 1) {
      out.push(this.buildEnrichedRow(inputs[i], cache));
      if (i > 0 && i % yieldEvery === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
    return out;
  }

  private resolveBillingDate(input: EnrichSourceInput): Date {
    const billingDateYmd =
      input.billingDate ??
      reportDateYmd(input.operationalData.billingDateYmd) ??
      reportDateYmd(
        input.operationalData.staDate ??
          input.operationalData.STADate ??
          input.operationalData['STA Date'],
      ) ??
      reportDateYmd(
        input.operationalData.ataDate ??
          input.operationalData.ATADate ??
          input.operationalData['ATA Date'],
      ) ??
      reportDateYmd(input.atdDate) ??
      reportDateYmd(input.operationalData.atdDate) ??
      new Date().toISOString().slice(0, 10);
    return new Date(billingDateYmd);
  }

  private async loadEnrichmentCache(
    ctx: StationScopeContext,
    inputs: EnrichSourceInput[],
  ): Promise<EnrichmentCache> {
    const billingDates = inputs.map((input) => this.resolveBillingDate(input));
    const minDate = new Date(
      Math.min(...billingDates.map((d) => d.getTime())),
    );
    const maxDate = new Date(
      Math.max(...billingDates.map((d) => d.getTime())),
    );
    const statedCodes = [
      ...new Set(
        inputs
          .map(
            (input) =>
              normalizeBillingCustomerCode(input.customerCode) ||
              input.customerCode.trim().toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
    // Flight carrier (SZ109 → SZ) must be loaded with the operational code (SMR)
    // so the saved contract and BHS price card are in the cache.
    const flightCodes = inputs.flatMap((input) => {
      const op = input.operationalData ?? {};
      return [
        op.flightNoEquipmentNo,
        op.flightNo,
        input.sourceRef?.flightNo,
      ]
        .map((code) => normalizeBillingCustomerCode(code))
        .filter(Boolean);
    });
    const customerCodes =
      statedCodes.length > 0
        ? [...new Set([...statedCodes, ...flightCodes])]
        : [];

    const needsBhs = inputs.some((input) => input.sourceType === 'scheduled_flight');
    const needsAds = inputs.some((input) => isAdsFamilySourceType(input.sourceType));
    // ADS prices come from contract rules — skip Rate Cards load for ADS-only batches.
    const needsRateCards =
      needsBhs ||
      inputs.some(
        (input) =>
          !isAdsFamilySourceType(input.sourceType) &&
          input.sourceType !== 'scheduled_flight',
      );

    const needsRafAdhoc = inputs.some((input) => input.sourceType === 'raf');

    const [customers, contracts, rateCards, bhsEntries, rafAdhoc] = await Promise.all([
      needsAds || needsBhs
        ? customerCodes.length > 0
          ? this.customerModel
              .find(
                StationScope.filter(
                  { customerCode: { $in: customerCodes } },
                  ctx,
                ),
              )
              .lean()
          : this.customerModel.find(StationScope.filter({}, ctx)).lean()
        : customerCodes.length
          ? this.customerModel
              .find(
                StationScope.filter(
                  { customerCode: { $in: customerCodes } },
                  ctx,
                ),
              )
              .lean()
          : Promise.resolve([]),
      needsAds || needsBhs || customerCodes.length
        ? this.contractModel
            .find(
              StationScope.filter(
                {
                  ...(customerCodes.length > 0
                    ? {
                        $or: [
                          { customerCode: { $in: customerCodes } },
                          { additionalCustomerCodes: { $in: customerCodes } },
                        ],
                      }
                    : {}),
                  priceValidFrom: { $lte: maxDate },
                  priceValidTo: { $gte: minDate },
                },
                ctx,
              ),
            )
            .lean()
        : Promise.resolve([]),
      needsRateCards
        ? this.rateCardModel
            .find(
              StationScope.filter(
                {
                  ...(customerCodes.length > 0
                    ? { customerCode: { $in: customerCodes } }
                    : {}),
                  validFrom: { $lte: maxDate },
                  validTo: { $gte: minDate },
                },
                ctx,
              ),
            )
            .lean()
        : Promise.resolve([]),
      needsBhs && customerCodes.length
        ? this.priceCardAirlineModel
            .find(
              StationScope.filter(
                {
                  handlingType: 'BHS',
                  customerCode: { $in: customerCodes },
                  active: true,
                  validFrom: { $lte: maxDate },
                  validTo: { $gte: minDate },
                },
                ctx,
              ),
            )
            .lean()
        : Promise.resolve([]),
      needsRafAdhoc
        ? this.rafAdhocModel
            .find({
              validFrom: { $lte: maxDate },
              validTo: { $gte: minDate },
              stationCode: ctx.stationCode
                ? { $in: [String(ctx.stationCode).trim().toUpperCase(), '*', 'ALL'] }
                : { $in: ['*', 'ALL'] },
            })
            .lean()
        : Promise.resolve([]),
    ]);

    const loadedCodes = new Set(customerCodes);
    const ownerCodes = [
      ...new Set(
        contracts
          .map((contract) => String(contract.customerCode ?? '').trim().toUpperCase())
          .filter((code) => code && !loadedCodes.has(code)),
      ),
    ];
    let rateCardRows = rateCards;
    let bhsRows = bhsEntries;
    if (ownerCodes.length > 0 && (needsRateCards || needsBhs)) {
      const [extraCards, extraBhs] = await Promise.all([
        needsRateCards
          ? this.rateCardModel
              .find(
                StationScope.filter(
                  {
                    customerCode: { $in: ownerCodes },
                    validFrom: { $lte: maxDate },
                    validTo: { $gte: minDate },
                  },
                  ctx,
                ),
              )
              .lean()
          : Promise.resolve([]),
        needsBhs
          ? this.priceCardAirlineModel
              .find(
                StationScope.filter(
                  {
                    handlingType: 'BHS',
                    customerCode: { $in: ownerCodes },
                    active: true,
                    validFrom: { $lte: maxDate },
                    validTo: { $gte: minDate },
                  },
                  ctx,
                ),
              )
              .lean()
          : Promise.resolve([]),
      ]);
      rateCardRows = [...rateCards, ...extraCards];
      bhsRows = [...bhsEntries, ...extraBhs];
    }

    return {
      customersByCode: new Map(
        customers.map((customer) => {
          const code = String(customer.customerCode ?? '')
            .trim()
            .toUpperCase();
          return [code, customer] as [string, BillingCustomer & { _id?: unknown }];
        }),
      ),
      customersList: customers,
      contracts,
      rateCards: rateCardRows,
      bhsEntries: bhsRows,
      contractsByCustomer: this.groupContractsByCustomer(contracts),
      rateCardsByCustomer: this.groupByCustomerCode(rateCardRows),
      bhsEntriesByCustomer: this.groupByCustomerCode(bhsRows),
      stationCode: ctx.stationCode,
      rafAdhoc: rafAdhoc.map((row) => ({
        label: String(row.label ?? ''),
        stationCode: String(row.stationCode ?? '*').toUpperCase(),
        validFrom: row.validFrom instanceof Date ? row.validFrom : new Date(row.validFrom),
        validTo: row.validTo instanceof Date ? row.validTo : new Date(row.validTo),
        unitPriceINR: row.unitPriceINR,
        unitPriceUSD: row.unitPriceUSD,
        uom: String(row.uom ?? 'Per service'),
        percentValue: row.percentValue,
      })),
    };
  }

  private groupContractsByCustomer(
    rows: Array<BillingContract & { _id?: unknown; additionalCustomerCodes?: string[] }>,
  ): Map<string, Array<BillingContract & { _id?: unknown }>> {
    const map = this.groupByCustomerCode(rows);
    for (const row of rows) {
      const extras = Array.isArray(row.additionalCustomerCodes) ? row.additionalCustomerCodes : [];
      for (const raw of extras) {
        const key = String(raw ?? '').trim().toUpperCase();
        if (!key) continue;
        const list = map.get(key) ?? [];
        if (!list.includes(row)) list.push(row);
        map.set(key, list);
      }
    }
    return map;
  }

  private groupByCustomerCode<T extends { customerCode?: string }>(
    rows: T[],
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = String(row.customerCode ?? '')
        .trim()
        .toUpperCase();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }

  private pickContract(
    cache: EnrichmentCache,
    customerCode: string,
    billingDate: Date,
    opts?: { preferAdsEnabled?: boolean; categoryOfFlight?: string; aircraftType?: string },
  ): BillingContract & { _id?: unknown } | null {
    const scoped = cache.contractsByCustomer.get(customerCode) ?? [];
    const inValidity = scoped.filter(
      (contract) =>
        contract.priceValidFrom <= billingDate &&
        contract.priceValidTo >= billingDate,
    );
    if (inValidity.length === 0) return null;

    const flightSector = flightContractSector(opts?.categoryOfFlight, opts?.aircraftType);
    const categoryMatched = flightSector
      ? inValidity.filter((c) => contractCoversSector(c, flightSector))
      : [];
    const pool = categoryMatched.length > 0 ? categoryMatched : inValidity;

    const preferCargo = isCargoFlightHint(opts?.categoryOfFlight, opts?.aircraftType);
    if (opts?.preferAdsEnabled) {
      const adsPool = pool.filter(
        (c) =>
          Boolean(c.adsBillingEnabled) || (c.adsEquipmentRules?.length ?? 0) > 0,
      );
      const adsPick = pickPreferredHandlingContract(adsPool, preferCargo);
      if (adsPick) return adsPick;
    }

    return pickPreferredHandlingContract(pool, preferCargo);
  }

  private pickRateCard(
    cache: EnrichmentCache,
    customerCode: string,
    serviceCode: string,
    billingDate: Date,
    contractId: unknown,
    operationalData: Record<string, unknown>,
    opts?: { billingScope?: RateCardBillingScope | 'any' },
  ): (BillingRateCard & { _id?: unknown }) | null {
    const scopeWanted = opts?.billingScope ?? 'any';
    const serviceCodes =
      serviceCode === 'Scheduled Flight'
        ? ['Scheduled Flight', 'TRND']
        : [serviceCode];
    const contractKey = String(contractId ?? '');
    const particular = String(
      operationalData.equipment ??
        operationalData.particular ??
        operationalData.serviceName ??
        serviceCode,
    ).trim();
    const particularKey = particular.toLowerCase();

    const customerRateCards = cache.rateCardsByCustomer.get(customerCode) ?? [];
    const scopeOk = (rateCard: BillingRateCard & { _id?: unknown }) => {
      if (scopeWanted === 'any') return true;
      return normalizeBillingScope(rateCard.billingScope) === scopeWanted;
    };

    const inDate = (rateCard: BillingRateCard & { _id?: unknown }) =>
      rateCard.validFrom <= billingDate && rateCard.validTo >= billingDate;

    const sameContract = (rateCard: BillingRateCard & { _id?: unknown }) =>
      !contractKey || String(rateCard.contractId ?? '') === contractKey;

    const matchesServiceOrParticular = (
      rateCard: BillingRateCard & { _id?: unknown },
    ) => {
      const code = String(rateCard.serviceCode ?? '');
      const codeKey = code.toLowerCase();
      return (
        serviceCodes.includes(code) ||
        (particularKey.length > 0 &&
          (particularKey.includes(codeKey) ||
            codeKey.includes(particularKey.slice(0, 12)) ||
            particularKey === codeKey))
      );
    };

    let candidates = customerRateCards
      .filter(
        (rateCard) =>
          scopeOk(rateCard) &&
          sameContract(rateCard) &&
          inDate(rateCard) &&
          (serviceCodes.includes(rateCard.serviceCode) ||
            (serviceCode === 'Scheduled Flight' &&
              String(rateCard.billingReference ?? '').trim().toUpperCase() === 'TRND')),
      )
      .sort(
        (a, b) =>
          new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
      );

    // ADS / equipment / RAF cleaning: also match by particular / equipment name on serviceCode.
    if (candidates.length === 0 && (scopeWanted === 'exclusive' || scopeWanted === 'inclusive')) {
      candidates = customerRateCards
        .filter(
          (rateCard) =>
            scopeOk(rateCard) &&
            sameContract(rateCard) &&
            inDate(rateCard) &&
            matchesServiceOrParticular(rateCard),
        )
        .sort(
          (a, b) =>
            new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
        );
    }

    // RAF / cleaning labels (Deep Cleaning, …) often differ slightly from catalog codes.
    if (candidates.length === 0 && particularKey.length > 0) {
      candidates = customerRateCards
        .filter(
          (rateCard) =>
            scopeOk(rateCard) &&
            sameContract(rateCard) &&
            inDate(rateCard) &&
            matchesServiceOrParticular(rateCard),
        )
        .sort(
          (a, b) =>
            new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime(),
        );
    }

    if (candidates.length === 0) return null;

    const flightAircraft = String(
      operationalData.aircraftType ?? operationalData.TypeCraft ?? '',
    ).trim();
    const categoryOfFlight = String(
      operationalData.categoryOfFlight ?? '',
    ).trim();

    return pickBestRateCardForFlight(
      candidates,
      flightAircraft,
      categoryOfFlight,
    );
  }

  private resolveCustomerCode(
    cache: EnrichmentCache,
    input: EnrichSourceInput,
  ): string {
    const op = input.operationalData;
    const operationalName = String(
      op.customerName ?? op.Airline ?? op.airline ?? '',
    ).trim();
    const resolved = resolveKnownBillingCustomerCode({
      directCodes: [
        input.customerCode,
        op.customerCode,
        op.Arline_Code,
        op.airlineCode,
        op.AirlineCode,
      ].map((code) => (code == null ? undefined : String(code))),
      flightCodes: [
        op.flightNoEquipmentNo,
        op.flightNo,
        input.sourceRef?.flightNo,
      ].map((code) => (code == null ? undefined : String(code))),
      isKnown: (code) => cache.customersByCode.has(code),
      customerName: (code) =>
        String(cache.customersByCode.get(code)?.name ?? ''),
      operationalName,
    });
    if (resolved && cache.customersByCode.has(resolved)) return resolved;
    if (resolved) return resolved;

    const nameHint = operationalName.toLowerCase();
    if (nameHint) {
      const byName = cache.customersList.find((customer) => {
        const name = String(customer.name ?? '').trim().toLowerCase();
        return name.length >= 6 && (name === nameHint || nameHint.includes(name));
      });
      if (byName?.customerCode) return String(byName.customerCode).trim().toUpperCase();
    }
    return '';
  }

  private resolveAdsUsedUnits(
    operationalData: Record<string, unknown>,
    rateCard: (BillingRateCard & { _id?: unknown }) | null,
    uom?: string | null,
  ): number {
    const fromQty = Number(operationalData.qty);
    const fromChargeable = Number(operationalData.chargeableUnits);
    const qty =
      Number.isFinite(fromQty) && fromQty > 0
        ? fromQty
        : Number.isFinite(fromChargeable) && fromChargeable > 0
          ? fromChargeable
          : 1;
    const usageHoursRaw = Number(operationalData.usageHours);
    const usageHours =
      Number.isFinite(usageHoursRaw) && usageHoursRaw > 0 ? usageHoursRaw : null;
    const remarksFromField = Number(operationalData.remarksQuantity);
    const remarksQuantity =
      Number.isFinite(remarksFromField) && remarksFromField > 0
        ? remarksFromField
        : parseAdsRemarksQuantity(
            operationalData.remarks ??
              operationalData.Remarks ??
              operationalData.remark,
          );
    const resolvedUom = uom ?? rateCard?.uom ?? null;
    // When UOM unknown yet, prefer chargeableUnits (mapper provisional) if set.
    if (!resolvedUom && Number.isFinite(fromChargeable) && fromChargeable > 0) {
      const minBillable = Number(rateCard?.minBillableUnits);
      return Number.isFinite(minBillable) && minBillable > fromChargeable
        ? minBillable
        : fromChargeable;
    }
    const used = computeAdsUsedUnits({
      qty,
      usageHours,
      uom: resolvedUom,
      minBillableUnits: rateCard?.minBillableUnits,
      remarksQuantity,
    });
    return capTurnaroundCrewCoachUsedUnits(used, operationalData);
  }

  private resolveAdsParticular(
    input: EnrichSourceInput,
  ): string {
    const op = input.operationalData;
    return (
      String(op.equipment ?? '').trim() ||
      String(op.particular ?? '').trim() ||
      String(op.equipment_name ?? op.equipmentName ?? '').trim() ||
      String(op.serviceName ?? '').trim() ||
      String(input.serviceCode ?? '').trim() ||
      'ADS Service'
    );
  }

  private pickBhsPackagePrice(
    cache: EnrichmentCache,
    customerCode: string,
    billingDate: Date,
    operationalData: Record<string, unknown>,
  ): BhsPackagePriceRow | null {
    const entries = (cache.bhsEntriesByCustomer.get(customerCode) ?? []).filter(
      (entry) =>
        entry.validFrom <= billingDate &&
        entry.validTo >= billingDate,
    );
    if (entries.length === 0) return null;

    const flightAircraft = String(
      operationalData.aircraftType ?? operationalData.TypeCraft ?? '',
    ).trim();
    const categoryOfFlight = String(
      operationalData.categoryOfFlight ?? '',
    ).trim();

    return pickBhsPackagePriceEntry(
      selectBhsEntriesForFlightOperation(
        entries.map((entry) => ({
          aircraftType: entry.aircraftType,
          category: entry.category,
          price: entry.price,
          validFrom: entry.validFrom,
          remarks: entry.remarks,
          flightOperation: entry.flightOperation,
          incrementalFlightsActive: entry.incrementalFlightsActive,
          incrementalPrice: entry.incrementalPrice,
        })),
        isAdditionalBhsFlight(operationalData),
      ),
      flightAircraft,
      categoryOfFlight,
    );
  }

  private buildEnrichedRow(
    input: EnrichSourceInput,
    cache: EnrichmentCache,
  ): BillingSourceRow {
    const isAds = isAdsFamilySourceType(input.sourceType);
    const isRaf = input.sourceType === 'raf';
    // Resolve code via master + name hints for BHS and ADS (spaced FHR / missing codes).
    const customerCode = this.resolveCustomerCode(cache, input);
    const billingDate = this.resolveBillingDate(input);
    const customer = cache.customersByCode.get(customerCode) ?? null;
    const flightCategoryHint = String(
      input.operationalData.categoryOfFlight ??
        input.operationalData.CateofFlight ??
        input.operationalData.cateOfFlight ??
        input.operationalData.domInt ??
        '',
    );
    // RAF has no contract concept — billed only from RAF adhoc tariff.
    const contract = isRaf
      ? null
      : this.pickContract(cache, customerCode, billingDate, {
          preferAdsEnabled: isAds,
          categoryOfFlight: flightCategoryHint,
          aircraftType: String(
            input.operationalData.aircraftType ??
              input.operationalData.TypeCraft ??
              input.operationalData.aircraft ??
              '',
          ),
        });
    // ADS usage prices come from contract tick-marked rules only — never Rate Cards tab.
    // RAF never uses SGHA rate cards.
    const inherit = inheritForCustomer(customerCode, contract);
    const primaryCode = String(contract?.customerCode ?? customerCode).trim().toUpperCase() || customerCode;
    const rateOwner = inherit.isAdditional && inherit.rateCards ? primaryCode : customerCode;
    const rulesOwner = inherit.isAdditional && inherit.contract ? primaryCode : customerCode;
    const currencyCustomer =
      inherit.isAdditional && inherit.customer
        ? (cache.customersByCode.get(primaryCode) ?? customer)
        : customer;
    const rulesContract = inherit.isAdditional && !inherit.contract ? null : contract;
    const termsContract = shapeContractForAdditionalCustomer(contract, customerCode);
    const rateCard =
      isAds || isRaf
        ? null
        : contract
          ? this.pickRateCard(
              cache,
              rateOwner,
              input.serviceCode,
              billingDate,
              inherit.isAdditional
                ? inherit.rateCards
                  ? contract._id
                  : (cache.contractsByCustomer.get(customerCode) ?? []).find(
                      (row) => String(row.customerCode ?? '').trim().toUpperCase() === customerCode,
                    )?._id
                : contract?._id,
              input.operationalData,
            )
          : null;

    const billingCurrency = resolveBillingCurrency(
      currencyCustomer?.currencyCode,
      rateCard?.currency,
    );

    const bhsPackage =
      input.sourceType === 'scheduled_flight'
        ? this.pickBhsPackagePrice(
            cache,
            rulesOwner,
            billingDate,
            input.operationalData,
          )
        : null;
    const bhsPackagePrice = packagePriceFromEntry(bhsPackage);

    const unitPriceFromRateCard = unitPriceForBillingCurrency(
      rateCard,
      billingCurrency,
    );

    const particular = isAds
      ? this.resolveAdsParticular(input)
      : String(
          input.operationalData.particular ??
            input.operationalData.rafCleaningLabel ??
            input.serviceCode ??
            '',
        ).trim() || input.serviceCode;
    const aircraftType = String(
      input.operationalData.aircraftType ??
        input.operationalData.TypeCraft ??
        input.operationalData.aircraft ??
        '',
    ).trim();

    let pricingBasis:
      | 'rate_card'
      | 'adhoc'
      | 'row'
      | 'bhs_package'
      | 'package_inclusive'
      | 'ads_excluded'
      | 'not_on_contract'
      | undefined;
    let unitPrice: number | null | undefined;
    let adsUom = 'Per Service';
    let freeAllowance = 0;
    let usedUnits = 1;
    let fullyPackageIncluded = false;

    if (input.sourceType === 'scheduled_flight') {
      const scheduled = resolveBhsScheduledUnitPrice({
        bhsPackagePrice,
        unitPriceFromRateCard,
        billingCurrency,
      });
      unitPrice = scheduled.unitPrice;
      pricingBasis = scheduled.pricingBasis;
    } else if (isRaf) {
      // RAF: never inherit BHS package / SGHA rate-card prices — adhoc only.
      unitPrice = null;
      pricingBasis = undefined;
    } else {
      unitPrice = bhsPackagePrice ?? unitPriceFromRateCard;
      if (bhsPackagePrice != null) {
        pricingBasis = 'bhs_package';
      }
    }

    // ADS: only Contracts → ADS equipment rules (Included + unit price) are billable.
    // Everything else is free / included in BHS package (not invoiced on ADS).
    if (isAds) {
      const adsContractEnabled = Boolean(
        rulesContract &&
          ((rulesContract as { adsEquipmentRules?: unknown[] }).adsEquipmentRules?.length ??
            0) > 0,
      );
      adsUom = 'Per Service';
      freeAllowance = 0;
      fullyPackageIncluded = false;

      if (!rulesContract || !adsContractEnabled) {
        unitPrice = 0;
        pricingBasis = 'package_inclusive';
        fullyPackageIncluded = true;
        usedUnits = this.resolveAdsUsedUnits(input.operationalData, null, adsUom);
      } else {
        const rulePricing = resolveAdsPricingFromContractRule(rulesContract, {
          serviceCode: input.serviceCode,
          particular,
          equipmentName: String(
            input.operationalData.equipment_name ??
              input.operationalData.equipmentName ??
              input.operationalData.equipmentCode ??
              input.operationalData.abbr ??
              '',
          ),
          aircraftType,
          flightCategory: String(
            input.operationalData.categoryOfFlight ??
              input.operationalData.Cate_of_Flight ??
              input.operationalData.flightCategory ??
              '',
          ),
          aircraftBody: String(
            input.operationalData.aircraftBody ??
              input.operationalData.AircraftBody ??
              '',
          ),
          billingCurrency,
        });

        if (!rulePricing.matched) {
          // Used on flight but not on contract ADS list — free / BHS package.
          unitPrice = 0;
          pricingBasis = 'package_inclusive';
          fullyPackageIncluded = true;
          freeAllowance = 0;
          usedUnits = this.resolveAdsUsedUnits(input.operationalData, null, adsUom);
        } else if (rulePricing.excluded) {
          unitPrice = 0;
          pricingBasis = 'ads_excluded';
          freeAllowance = Number.MAX_SAFE_INTEGER;
          fullyPackageIncluded = true;
          adsUom = rulePricing.uom;
          usedUnits = this.resolveAdsUsedUnits(input.operationalData, null, adsUom);
        } else {
          adsUom = rulePricing.uom;
          let alwaysChargeable = rulePricing.alwaysChargeable;
          if (isAdsHourlyUom(adsUom)) alwaysChargeable = true;
          freeAllowance = alwaysChargeable ? 0 : rulePricing.freePerFlight;
          fullyPackageIncluded = false;
          usedUnits = this.resolveAdsUsedUnits(input.operationalData, null, adsUom);

          if (rulePricing.unitPrice != null && rulePricing.unitPrice > 0) {
            unitPrice = rulePricing.unitPrice;
            pricingBasis = 'rate_card';
            if (freeAllowance > 0 && usedUnits <= freeAllowance) {
              fullyPackageIncluded = true;
              pricingBasis = 'package_inclusive';
            }
          } else if (freeAllowance > 0) {
            unitPrice = 0;
            pricingBasis = 'package_inclusive';
            fullyPackageIncluded = true;
          } else {
            // On contract but no price — treat as free until price set.
            unitPrice = 0;
            pricingBasis = 'package_inclusive';
            fullyPackageIncluded = true;
          }
        }
      }
    }

    let rafAdhocUom = 'Per Service';
    let rafUsedUnits = 1;
    if (isRaf) {
      const lookupCandidates = [
        particular,
        input.serviceCode,
        String(input.operationalData.equipmentCode ?? '').trim(),
        String(input.operationalData.equipment_name ?? '').trim(),
      ].filter(Boolean);
      let rafHit: ReturnType<typeof lookupRafAdhocRate> = null;
      for (const candidate of lookupCandidates) {
        rafHit = lookupRafAdhocRate(candidate, cache.rafAdhoc, {
          stationCode: cache.stationCode,
          billingDate,
          domestic: billingCurrency !== 'USD',
        });
        if (rafHit) break;
      }
      if (rafHit) {
        unitPrice = rafHit.unitPrice;
        pricingBasis = 'adhoc';
        rafAdhocUom = rafHit.uom;
      }
      const uomHint =
        String(input.operationalData.uom ?? rafAdhocUom ?? '').toLowerCase();
      const hours = Number(input.operationalData.usageHours);
      const qty = Number(input.operationalData.quantity);
      if (/hour|hr/.test(uomHint) && Number.isFinite(hours) && hours > 0) {
        rafUsedUnits = Math.round(hours * 10000) / 10000;
      } else if (Number.isFinite(qty) && qty > 0) {
        rafUsedUnits = qty;
      } else {
        rafUsedUnits = 1;
      }
    }

    const ceilingRate = ceilingRateForBillingCurrency(
      rateCard,
      billingCurrency,
    );

    const adsNotBillable =
      isAds &&
      (pricingBasis === 'ads_excluded' ||
        pricingBasis === 'package_inclusive' ||
        fullyPackageIncluded ||
        !(typeof unitPrice === 'number' && unitPrice > 0));

    const hasRate = Boolean(
      (isAds &&
        (pricingBasis === 'package_inclusive' ||
          pricingBasis === 'ads_excluded' ||
          (typeof unitPrice === 'number' && unitPrice > 0))) ||
        (!isAds &&
          ((typeof unitPrice === 'number' && unitPrice > 0) ||
            (rateCard && unitPriceFromRateCard != null && unitPriceFromRateCard > 0) ||
            (pricingBasis === 'bhs_package' && bhsPackagePrice != null))),
    );

    const rawFlightNo = String(
      input.sourceRef.flightNo ?? input.operationalData.flightNoEquipmentNo ?? '',
    );
    const cancelled =
      input.cancelled ??
      isBillingOperationalRowCancelled(input.operationalData, rawFlightNo);
    const flightNo = stripCancelledFlightPrefix(rawFlightNo) || rawFlightNo;
    const rawOperationalName = String(input.operationalData.customerName ?? '').trim();
    const operationalNameUsable =
      Boolean(rawOperationalName) &&
      !/^[A-Z0-9]{2,3}$/i.test(rawOperationalName) &&
      rawOperationalName.toUpperCase() !== customerCode;

    const operationalData: Record<string, unknown> = {
      ...input.operationalData,
      ...(flightNo
        ? { flightNo, flightNoEquipmentNo: flightNo }
        : {}),
      isCancelled: cancelled,
      cancelled,
      customerCode,
      customerName:
        String(customer?.name ?? '').trim() ||
        (operationalNameUsable ? rawOperationalName : '') ||
        undefined,
      ...(isAds
        ? {
            adsParticular: particular,
            adsUsedUnits: usedUnits,
            adsFreeAllowance: freeAllowance,
            adsPricingBasis: pricingBasis,
            adsUom,
            adsPackageIncluded: fullyPackageIncluded || freeAllowance > 0,
            aircraftType: aircraftType || undefined,
          }
        : {}),
    };

    const flightRules = isAds
      ? this.validationEngine
          .validateFlightReadiness({
            // FHR-backed ADS has serialNo; Excel ads_usage_data may only have usageRowId.
            serialNo: input.sourceRef.serialNo
              ? String(input.sourceRef.serialNo)
              : '1',
            atdDate: billingDate,
            cancelled,
          })
          .map((r) =>
            r.rule === 'atd_present' ||
            (r.rule === 'serial_positive_integer' && !input.sourceRef.serialNo)
              ? {
                  ...r,
                  passed: true,
                  message:
                    r.rule === 'atd_present' ? 'ADS usage date' : 'usage row',
                }
              : r,
          )
      : this.validationEngine.validateFlightReadiness({
          serialNo: input.sourceRef.serialNo,
          atdDate: (input.atdDate ?? input.operationalData.atdDate) as
            | string
            | Date
            | null
            | undefined,
          cancelled,
        });

    const rafAdhocPriced = isRaf && pricingBasis === 'adhoc';
    const rateRules = this.validationEngine.validateContractAndRate({
      // RAF: contract is not part of the billing model — treat as satisfied.
      hasContract: isRaf ? true : Boolean(contract),
      hasRate: isAds ? true : hasRate,
      unitPrice: unitPrice ?? undefined,
      ceilingRate: isRaf ? undefined : ceilingRate,
      pricingSource: isAds ? 'ads_contract' : isRaf ? 'adhoc' : 'rate_card',
    });

    const invoiceLineRules = this.validationEngine.validateInvoiceLineReadiness({
      sourceType: input.sourceType,
      customerCode,
      flightNo:
        flightNo ||
        (isAds && input.sourceRef.usageRowId
          ? `ADS-${input.sourceRef.usageRowId}`
          : ''),
      serviceCode: input.serviceCode || (isAds ? particular : ''),
      unitPrice: unitPrice ?? undefined,
      currency: billingCurrency,
      categoryOfFlight: String(input.operationalData.categoryOfFlight ?? ''),
      contractMatched: isRaf ? true : Boolean(contract),
      rateMatched: isAds ? true : hasRate,
      contractId: isRaf ? undefined : contract?._id?.toString(),
      rateCardId: rateCard?._id?.toString(),
      pricingSource: isAds ? 'ads_contract' : isRaf ? 'adhoc' : 'rate_card',
    });

    const validationResults = this.validationEngine
      .merge(flightRules, rateRules, invoiceLineRules)
      .map((r) => {
        if (
          isAds &&
          (pricingBasis === 'package_inclusive' ||
            pricingBasis === 'ads_excluded' ||
            adsNotBillable) &&
          (r.rule === 'unit_price' ||
            r.rule === 'rate_match' ||
            r.rule === 'rate_card_linked' ||
            r.rule === 'ceiling_rate')
        ) {
          return {
            ...r,
            passed: true,
            message:
              pricingBasis === 'ads_excluded'
                ? 'Not included for ADS on contract — not charged'
                : 'Free / included in BHS package — not billed on ADS',
          };
        }
        if (
          isRaf &&
          (r.rule === 'contract_match' ||
            r.rule === 'contract_linked' ||
            r.rule === 'rate_card_linked')
        ) {
          return {
            ...r,
            passed: true,
            message:
              r.rule === 'rate_card_linked'
                ? rafAdhocPriced
                  ? 'RAF adhoc tariff applied'
                  : 'RAF uses adhoc rates (no rate card)'
                : 'RAF — contract not applicable (adhoc rates only)',
          };
        }
        if (
          isRaf &&
          rafAdhocPriced &&
          r.rule === 'rate_match'
        ) {
          return {
            ...r,
            passed: true,
            message: 'RAF adhoc tariff matched',
          };
        }
        if (
          isAds &&
          r.rule === 'rate_card_linked' &&
          typeof unitPrice === 'number' &&
          unitPrice > 0
        ) {
          return {
            ...r,
            passed: true,
            message: 'Contract ADS equipment rate applied',
          };
        }
        return r;
      })
      // Drop contract rules from RAF validation checklist — not part of RAF billing.
      .filter(
        (r) =>
          !(isRaf && (r.rule === 'contract_match' || r.rule === 'contract_linked')),
      );
    const passed = this.validationEngine.allPassed(validationResults);

    const eligible =
      passed &&
      !cancelled &&
      !adsNotBillable &&
      Boolean(customerCode) &&
      Boolean(input.sourceRef.serialNo || input.sourceRef.usageRowId);

    return {
      sourceType: input.sourceType,
      sourceRef: flightNo
        ? { ...input.sourceRef, flightNo }
        : input.sourceRef,
      operationalData,
      billingEligibility: {
        eligible,
        reason: eligible
          ? undefined
          : adsNotBillable
            ? pricingBasis === 'ads_excluded'
              ? 'Not included for ADS on contract — not charged'
              : 'Free / included in BHS package — not billed on ADS'
            : validationResults.find((r) => !r.passed)?.message ?? 'Not eligible',
      },
      contractMatch: isRaf
        ? {
            matched: true,
            message: 'Not applicable — RAF billed on adhoc rates only',
          }
        : {
            matched: Boolean(contract),
            contractId: contract?._id?.toString(),
            cancellationWithinHours:
              termsContract?.cancellationWithinHours != null
                ? Number(termsContract.cancellationWithinHours)
                : undefined,
            royaltyAtGross:
              termsContract?.royaltyAtGross != null ? Number(termsContract.royaltyAtGross) : undefined,
            concessionRates: termsContract
              ? extractContractConcessionRates(termsContract.concessionRates)
              : undefined,
            conditionalCharges: termsContract
              ? extractContractConditionalCharges(
                  (termsContract as { conditionalCharges?: unknown }).conditionalCharges,
                )
              : undefined,
            message: contract ? undefined : 'No active contract',
          },
      rateMatch: {
        matched: isAds ? true : hasRate,
        rateCardId: rateCard?._id?.toString(),
        serviceCode: input.serviceCode,
        unitPrice: unitPrice ?? undefined,
        currency: billingCurrency,
        incrementalFlightsActive: bhsPackage?.incrementalFlightsActive === true,
        incrementalPrice:
          bhsPackage?.incrementalPrice != null && Number(bhsPackage.incrementalPrice) > 0
            ? Number(bhsPackage.incrementalPrice)
            : undefined,
        message: hasRate
          ? pricingBasis === 'ads_excluded'
            ? 'Not included for ADS on contract — not charged'
            : pricingBasis === 'package_inclusive' || fullyPackageIncluded
              ? 'Free / included in BHS package — not billed on ADS'
              : freeAllowance > 0
                ? `Contract free allowance ${freeAllowance} unit(s) per flight`
                : isRaf
                  ? 'RAF adhoc tariff matched'
                  : undefined
          : isAds
            ? 'No ADS pricing resolved'
            : isRaf
              ? 'No RAF adhoc rate for this particular'
              : bhsPackagePrice == null && rateCard
                ? 'BHS package price missing on price card airline row'
                : 'No rate card for service',
        ...(!isAds && pricingBasis ? { pricingBasis } : {}),
        ...(isAds
          ? {
              usedUnits,
              freeAllowance,
              pricingBasis,
              particular,
              aircraftType: aircraftType || undefined,
              uom: adsUom,
            }
          : isRaf
            ? {
                particular,
                aircraftType: aircraftType || undefined,
                uom: rafAdhocUom,
                usedUnits: rafUsedUnits,
              }
            : {}),
      },
      validationStatus: { passed, errors: validationResults },
    };
  }

  summarize(rows: BillingSourceRow[]) {
    const eligible = rows.filter((r) => r.billingEligibility.eligible).length;
    const errors = rows.filter((r) => !r.validationStatus.passed).length;
    const ready = rows.filter(
      (r) => r.billingEligibility.eligible && r.validationStatus.passed,
    ).length;
    return { eligible, errors, ready, total: rows.length };
  }

  wrapResponse(
    sourceType: string,
    rows: BillingSourceRow[],
    from: string,
    to: string,
    dateBasis?: string,
  ) {
    return successResponse({
      rows,
      summary: this.summarize(rows),
      from,
      to,
      dateBasis,
      sourceType,
    });
  }
}

function extractContractConcessionRates(
  raw: unknown,
): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const keys = [
    'int',
    'dom',
    'divertedDom',
    'divertedInt',
    'domesticCargo',
    'internationalCargo',
  ];
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractContractConditionalCharges(
  raw: unknown,
): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const keys = [
    'divertedDom',
    'divertedInt',
    'returnToRamp',
    'originateTerminatePercent',
    'cancellationWithinHoursPercent',
    'technicalHandlingChargesPercent',
    'standbyChargesPercent',
    'filoLifoChargesPercent',
    'filoChargesPercent',
    'lifoChargesPercent',
    'ronAdditionalPercent',
    'lateArrivalAdditionalPercent',
    'extraGroundTimeAdditionalPercent',
    'delayChargesPercent',
    'splitIntArrivalDomDeparturePercent',
    'splitDomArrivalIntDeparturePercent',
  ];
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type ContractFlightSector = 'Dom' | 'Int' | 'DomCargo' | 'IntCargo';

function flightContractSector(
  categoryOfFlight?: string,
  aircraftType?: string,
): ContractFlightSector | '' {
  const value = String(categoryOfFlight ?? '').trim().toLowerCase();
  const cargo = isCargoFlightHint(categoryOfFlight, aircraftType);
  const domestic = value === 'dom' || value.startsWith('domestic');
  const international = value === 'int' || value.startsWith('international');
  if (cargo && domestic) return 'DomCargo';
  if (cargo && international) return 'IntCargo';
  if (domestic) return 'Dom';
  if (international) return 'Int';
  return '';
}

function contractCoversSector(
  contract: { category?: string; categories?: string[] },
  sector: ContractFlightSector,
): boolean {
  const allowed = new Set(['Dom', 'Int', 'DomCargo', 'IntCargo']);
  const stored = (contract.categories ?? []).filter((value) => allowed.has(value));
  if (stored.length > 0) return stored.includes(sector);
  const legacy = String(contract.category ?? '');
  const passenger = sector === 'DomCargo' ? 'Dom' : sector === 'IntCargo' ? 'Int' : sector;
  if (legacy === 'Both' || legacy === 'both') return true;
  return legacy === passenger;
}
