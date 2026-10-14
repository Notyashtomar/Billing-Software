import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingContract,
  BillingContractDocument,
  BillingCreditMemo,
  BillingCreditMemoDocument,
  BillingCustomer,
  BillingCustomerDocument,
  BillingExchangeRate,
  BillingExchangeRateDocument,
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
  BillingRateCard,
  BillingRateCardDocument,
  BillingSequence,
  BillingSequenceDocument,
  BillingServiceCatalog,
  BillingServiceCatalogDocument,
  BillingSettings,
  BillingSettingsDocument,
  BillingTaxRule,
  BillingTaxRuleDocument,
} from '../schemas/billing.schemas';
import type {
  BillingDashboardKpis,
  BillingSetupItemStatus,
  BillingSetupStatus,
} from '../shared/types';
import type { StationScopeContext } from '../common/station-scope';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import { StationScope, successResponse } from '../common/station-scope';
import { withPreparationVisibility } from '../common/billing-personal-workspace';
import { AuditEngineService } from '../engines/audit-engine.service';

type CountByKey = Record<string, number>;

function countMap(rows: { _id: string; count: number }[]): CountByKey {
  return rows.reduce<CountByKey>((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});
}

function setupStatus(complete: boolean, partial: boolean): BillingSetupStatus {
  if (complete) return 'complete';
  if (partial) return 'partial';
  return 'missing';
}

@Injectable()
export class BillingDashboardService {
  constructor(
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectModel(BillingServiceCatalog.name)
    private readonly catalogModel: Model<BillingServiceCatalogDocument>,
    @InjectModel(BillingContract.name)
    private readonly contractModel: Model<BillingContractDocument>,
    @InjectModel(BillingRateCard.name)
    private readonly rateCardModel: Model<BillingRateCardDocument>,
    @InjectModel(BillingTaxRule.name)
    private readonly taxRuleModel: Model<BillingTaxRuleDocument>,
    @InjectModel(BillingExchangeRate.name)
    private readonly exchangeRateModel: Model<BillingExchangeRateDocument>,
    @InjectModel(BillingSequence.name)
    private readonly sequenceModel: Model<BillingSequenceDocument>,
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    @InjectModel(BillingCreditMemo.name)
    private readonly creditMemoModel: Model<BillingCreditMemoDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async getKpis(ctx: StationScopeContext) {
    const base = StationScope.filter({}, ctx);
    const prepBase = withPreparationVisibility(base);
    const invoiceBase = { ...base, ...NOT_IN_BIN_FILTER };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [
      prepByStatus,
      prepBySourceStatus,
      invoiceByStatus,
      postedAgg,
      customerCounts,
      catalogCounts,
      contractCounts,
      rateCardCount,
      taxRuleCount,
      exchangeRateCount,
      sequences,
      settings,
      creditMemoByStatus,
      recentActivity,
    ] = await Promise.all([
      this.preparationModel.aggregate<{ _id: string; count: number }>([
        { $match: prepBase },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.preparationModel.aggregate<{
        _id: { sourceType: string; status: string };
        count: number;
      }>([
        { $match: prepBase },
        {
          $group: {
            _id: { sourceType: '$sourceType', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.invoiceModel.aggregate<{ _id: string; count: number }>([
        { $match: invoiceBase },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.invoiceModel.aggregate([
        {
          $match: {
            ...invoiceBase,
            status: 'posted',
            postingDate: { $gte: monthStart, $lte: monthEnd },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalInclTax: { $sum: '$totalInclTax' },
          },
        },
      ]),
      Promise.all([
        this.customerModel.countDocuments(base),
        this.customerModel.countDocuments({ ...base, blocked: { $ne: true } }),
      ]),
      Promise.all([
        this.catalogModel.countDocuments(base),
        this.catalogModel.countDocuments({ ...base, active: true }),
      ]),
      Promise.all([
        this.contractModel.countDocuments(base),
        this.contractModel.countDocuments({ ...base, status: 'active' }),
        this.contractModel.countDocuments({ ...base, status: 'draft' }),
      ]),
      this.rateCardModel.countDocuments(base),
      this.taxRuleModel.countDocuments(base),
      this.exchangeRateModel.countDocuments(base),
      this.sequenceModel.find(base).select('documentType').lean(),
      this.settingsModel.findOne(base).lean(),
      this.creditMemoModel.aggregate<{ _id: string; count: number }>([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.auditEngine.listRecent(ctx, 10),
    ]);

    const prep = countMap(prepByStatus);
    const inv = countMap(invoiceByStatus);
    const credit = countMap(creditMemoByStatus);
    const posted = postedAgg[0] ?? { count: 0, totalInclTax: 0 };
    const [customersTotal, customersActive] = customerCounts;
    const [catalogTotal, catalogActive] = catalogCounts;
    const [contractsTotal, contractsActive, contractsDraft] = contractCounts;

    const hasInvoiceSequence = sequences.some((s) => s.documentType === 'invoice');
    const hasCreditMemoSequence = sequences.some((s) => s.documentType === 'credit_memo');

    const stationProfile = this.assessStationProfile(settings);
    const setupItems = this.buildSetupItems({
      stationProfile,
      customersTotal,
      catalogActive,
      contractsActive,
      contractsDraft,
      rateCardCount,
      taxRuleCount,
      exchangeRateCount,
      hasInvoiceSequence,
      hasCreditMemoSequence,
    });

    const setupComplete = setupItems.filter((i) => i.status === 'complete').length;
    const setupTotal = setupItems.length;

    const pendingPreparation = (prep.eligible ?? 0) + (prep.pending ?? 0);
    const validationErrors = prep.validation_error ?? 0;
    const readyForInvoice = prep.ready_for_invoice ?? 0;
    const draftsAwaitingApproval =
      (inv.draft ?? 0) + (inv.pending_approval ?? 0);

    const payload: BillingDashboardKpis = {
      pendingPreparation,
      validationErrors,
      draftsAwaitingApproval,
      readyForInvoice,
      postedThisMonth: {
        count: posted.count,
        totalInclTax: posted.totalInclTax ?? 0,
      },
      maker: {
        eligible: prep.eligible ?? 0,
        pending: prep.pending ?? 0,
        validationErrors,
        rejected: prep.rejected ?? 0,
        readyForInvoice,
        invoiced: prep.invoiced ?? 0,
        draftInvoices: inv.draft ?? 0,
      },
      checker: {
        pendingApproval: inv.pending_approval ?? 0,
        approved: inv.approved ?? 0,
        generated: inv.generated ?? 0,
        postedThisMonth: posted.count,
        postedTotalInclTax: posted.totalInclTax ?? 0,
        creditMemosDraft: credit.draft ?? 0,
        creditMemosPosted: credit.posted ?? 0,
      },
      masterData: {
        stationCode: ctx.stationCode ?? '—',
        cutoverPhase: settings?.cutoverPhase ?? 'parallel',
        nativeBillingEnabled: settings?.nativeBillingEnabled ?? false,
        customers: { total: customersTotal, active: customersActive },
        serviceCatalog: { total: catalogTotal, active: catalogActive },
        contracts: { total: contractsTotal, active: contractsActive, draft: contractsDraft },
        rateCards: rateCardCount,
        taxRules: taxRuleCount,
        exchangeRates: exchangeRateCount,
        sequences: {
          total: sequences.length,
          hasInvoice: hasInvoiceSequence,
          hasCreditMemo: hasCreditMemoSequence,
        },
        stationProfile,
        setupItems,
        readinessPercent: setupTotal
          ? Math.round((setupComplete / setupTotal) * 100)
          : 0,
      },
      operationalSources: this.buildOperationalSources(prepBySourceStatus),
      recentActivity,
    };

    return successResponse(payload);
  }

  private buildOperationalSources(
    rows: { _id: { sourceType: string; status: string }; count: number }[],
  ): BillingDashboardKpis['operationalSources'] {
    const bySource = new Map<string, CountByKey>();
    for (const row of rows) {
      const sourceType = String(row._id?.sourceType ?? '').trim() || 'unknown';
      const status = String(row._id?.status ?? '').trim() || 'unknown';
      const bucket = bySource.get(sourceType) ?? {};
      bucket[status] = (bucket[status] ?? 0) + row.count;
      bySource.set(sourceType, bucket);
    }

    const catalog: Array<{
      sourceType: string;
      label: string;
      href: string;
    }> = [
      {
        sourceType: 'scheduled_flight',
        label: 'BHS',
        href: '/billing/scheduled-flights',
      },
      { sourceType: 'ads', label: 'ADS', href: '/billing/ads' },
      {
        sourceType: 'equipment',
        label: 'Equipment',
        href: '/billing/equipment',
      },
      {
        sourceType: 'manpower',
        label: 'Manpower',
        href: '/billing/manpower',
      },
      { sourceType: 'raf', label: 'RAF', href: '/billing/raf' },
      { sourceType: 'maas', label: 'MAAS', href: '/billing/maas' },
    ];

    const known = new Set(catalog.map((c) => c.sourceType));
    for (const sourceType of bySource.keys()) {
      if (known.has(sourceType)) continue;
      catalog.push({
        sourceType,
        label: sourceType.replace(/_/g, ' ').toUpperCase(),
        href: '/billing/preparation',
      });
    }

    return catalog.map((entry) => {
      const counts = bySource.get(entry.sourceType) ?? {};
      const eligible = counts.eligible ?? 0;
      const pending = counts.pending ?? 0;
      const validationErrors = counts.validation_error ?? 0;
      const readyForInvoice = counts.ready_for_invoice ?? 0;
      const invoiced = counts.invoiced ?? 0;
      const rejected = counts.rejected ?? 0;
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      return {
        ...entry,
        eligible,
        pending,
        validationErrors,
        readyForInvoice,
        invoiced,
        rejected,
        total,
      };
    });
  }

  private assessStationProfile(
    settings: (BillingSettings & { _id?: unknown }) | null,
  ): BillingDashboardKpis['masterData']['stationProfile'] {
    if (!settings) {
      return {
        status: 'missing',
        missingFields: ['Station profile not created'],
      };
    }

    const missingFields: string[] = [];
    const entity = settings.companyLegalEntity;
    const bank = settings.bankDetails;

    if (!entity?.name?.trim()) missingFields.push('Company name');
    if (!entity?.address?.trim()) missingFields.push('Company address');
    if (!entity?.gstin?.trim()) missingFields.push('GSTIN');
    if (!bank?.bankName?.trim()) missingFields.push('Bank name');
    if (!bank?.accountNumber?.trim()) missingFields.push('Account number');
    if (!bank?.ifscCode?.trim()) missingFields.push('IFSC code');

    const status: BillingSetupStatus =
      missingFields.length === 0
        ? 'complete'
        : missingFields.length <= 2 && entity?.name?.trim()
          ? 'partial'
          : 'missing';

    return { status, missingFields };
  }

  private buildSetupItems(input: {
    stationProfile: BillingDashboardKpis['masterData']['stationProfile'];
    customersTotal: number;
    catalogActive: number;
    contractsActive: number;
    contractsDraft: number;
    rateCardCount: number;
    taxRuleCount: number;
    exchangeRateCount: number;
    hasInvoiceSequence: boolean;
    hasCreditMemoSequence: boolean;
  }): BillingSetupItemStatus[] {
    const {
      stationProfile,
      customersTotal,
      catalogActive,
      contractsActive,
      contractsDraft,
      rateCardCount,
      taxRuleCount,
      exchangeRateCount,
      hasInvoiceSequence,
      hasCreditMemoSequence,
    } = input;

    return [
      {
        id: 'station-profile',
        label: 'Airport Setup',
        href: '/billing/settings',
        status: stationProfile.status,
        detail:
          stationProfile.missingFields.length > 0
            ? `${stationProfile.missingFields.length} field(s) missing`
            : 'Letterhead & bank details saved',
      },
      {
        id: 'customers',
        label: 'Customers',
        href: '/billing/customers',
        status: setupStatus(customersTotal > 0, false),
        detail: customersTotal ? `${customersTotal} customer(s)` : 'No customers yet',
      },
      {
        id: 'service-catalog',
        label: 'Service catalog',
        href: '/billing/service-catalog',
        status: setupStatus(catalogActive > 0, false),
        detail: catalogActive ? `${catalogActive} active service(s)` : 'No active services',
      },
      {
        id: 'contracts',
        label: 'Contracts',
        href: '/billing/contracts',
        status: setupStatus(contractsActive > 0, contractsDraft > 0 && contractsActive === 0),
        detail: contractsActive
          ? `${contractsActive} active contract(s)`
          : contractsDraft
            ? `${contractsDraft} draft contract(s)`
            : 'No contracts',
      },
      {
        id: 'rate-cards',
        label: 'Rate cards',
        href: '/billing/rate-cards',
        status: setupStatus(rateCardCount > 0, false),
        detail: rateCardCount ? `${rateCardCount} rate row(s)` : 'No rates entered',
      },
      {
        id: 'tax-rules',
        label: 'Tax rules',
        href: '/billing/settings/taxes',
        status: setupStatus(taxRuleCount > 0, false),
        detail: taxRuleCount ? `${taxRuleCount} rule(s)` : 'No GST rules',
      },
      {
        id: 'exchange-rates',
        label: 'Conversion rates',
        href: '/billing/conversion-rates',
        status: setupStatus(exchangeRateCount > 0, false),
        detail: exchangeRateCount ? `${exchangeRateCount} rate(s)` : 'No exchange rates',
      },
      {
        id: 'sequences',
        label: 'Invoice sequences',
        href: '/billing/settings/sequences',
        status: setupStatus(hasInvoiceSequence, hasCreditMemoSequence && !hasInvoiceSequence),
        detail: hasInvoiceSequence
          ? hasCreditMemoSequence
            ? 'Invoice & credit memo sequences'
            : 'Invoice sequence only'
          : 'No invoice sequence',
      },
    ];
  }
}
