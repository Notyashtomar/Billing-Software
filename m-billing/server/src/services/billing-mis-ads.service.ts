import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  StationScope,
  successResponse,
  type StationScopeContext,
} from '../common/station-scope';
import { BillingMisAdsQueryDto } from '../dto/billing-mis-ads.dto';
import { BillingSourcesService } from './billing-sources.service';
import { BillingPriceCardAirlinesService } from './billing-price-card-airlines.service';
import {
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
} from '../schemas/billing.schemas';
import {
  buildAdsMisWorkbook,
  type AdsMisEquipmentRow,
  type AdsMisInvoiceRow,
} from './billing-mis-ads-export.util';
import { buildAdsMisPreviewSheets } from './billing-mis-ads-preview.util';
import {
  adsMisIndexedEquipmentRows,
  adsMisUsageDedupKey,
  buildAdsMisBillingSheet,
  flattenAdsMisBillingRows,
  type AdsMisBillingSheetPayload,
} from './billing-mis-ads-billing-sheet.util';
import type { BillingSourceRow } from '../shared/billing-sources';
import {
  formatMisMonthTitle,
  formatMisMonthToken,
  getAdsMisStationProfile,
  type AdsMisSheetDef,
} from './billing-mis-ads-profile.util';
import { BillingExchangeRatesService } from './billing-settings.service';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import { preparationListPeriodFilter } from '../common/billing-invoice-period.util';

export type AdsMisSheetStatus = {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'partial' | 'missing' | 'not_applicable';
  message: string;
  rowCount?: number;
  expectedCount?: number;
};

export type AdsMisStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  monthLabel: string;
  monthToken: string;
  layout: string;
  readyForExport: boolean;
  sheets: AdsMisSheetStatus[];
  missingBilling: Array<{
    customerCode: string;
    airlineName: string;
    reason: string;
  }>;
  summary: {
    scheduledFlights: number;
    equipmentLogEntries: number;
    priceCardAirlines: number;
    billedAirlines: number;
    adsInvoices: number;
  };
  previewSheets?: Array<{
    id: string;
    label: string;
    headers: string[];
    rows: Array<Array<string | number>>;
    rowKinds: Array<'airline' | 'equipment' | 'normal'>;
  }>;
};

const BILLABLE_INVOICE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'generated',
  'posted',
  'sent',
] as const;

export function buildAdsMisInvoiceQueryFilter(
  from: string,
  to: string,
): Record<string, unknown> {
  const period = preparationListPeriodFilter(from, to);
  return {
    ...NOT_IN_BIN_FILTER,
    cancelled: { $ne: true },
    status: { $in: [...BILLABLE_INVOICE_STATUSES] },
    ...(period ? { billingPeriodStart: period } : {}),
    $or: [
      { invoiceCategory: 'ADS' },
      { invoiceCategory: { $exists: false } },
      { invoiceCategory: null },
      { invoiceCategory: '' },
    ],
  };
}

@Injectable()
export class BillingMisAdsService {
  constructor(
    private readonly sourcesService: BillingSourcesService,
    private readonly priceCardService: BillingPriceCardAirlinesService,
    private readonly exchangeRatesService: BillingExchangeRatesService,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
  ) {}

  async getStatus(ctx: StationScopeContext, query: BillingMisAdsQueryDto) {
    const payload = await this.collectContext(ctx, query, { includeUsage: false });
    return successResponse(payload);
  }

  async getPreview(ctx: StationScopeContext, query: BillingMisAdsQueryDto) {
    const status = await this.collectContext(ctx, query, { includeUsage: true });
    const previewSheets = buildAdsMisPreviewSheets({
      billing: status._billingSheet,
      equipmentRows: status._equipmentRows,
      roeToInr: status._roeToInr,
    });
    const { _equipmentRows, _invoices, _billingRows, _billingSheet, _roeToInr, ...publicStatus } =
      status;
    return successResponse({ ...publicStatus, previewSheets });
  }

  async exportWorkbook(ctx: StationScopeContext, query: BillingMisAdsQueryDto): Promise<{
    buffer: Buffer;
    fileName: string;
    status: AdsMisStatusPayload;
  }> {
    const status = await this.collectContext(ctx, query, { includeUsage: true });
    const buffer = await buildAdsMisWorkbook({
      stationCode: status.stationCode,
      from: status.from,
      to: status.to,
      equipmentRows: status._equipmentRows,
      invoices: status._invoices,
      billingRows: status._billingRows,
      billingSheet: status._billingSheet,
      roeToInr: status._roeToInr,
    });
    const fileName = `ADS_MIS_${status.stationCode}_${status.monthToken}.xlsx`;
    const { _equipmentRows, _invoices, _billingRows, _billingSheet, _roeToInr, ...publicStatus } =
      status;
    return { buffer, fileName, status: publicStatus };
  }

  private async collectContext(
    ctx: StationScopeContext,
    query: BillingMisAdsQueryDto,
    opts: { includeUsage: boolean },
  ): Promise<
    AdsMisStatusPayload & {
      _equipmentRows: AdsMisEquipmentRow[];
      _invoices: AdsMisInvoiceRow[];
      _billingRows: Array<Record<string, unknown>>;
      _billingSheet: AdsMisBillingSheetPayload;
      _roeToInr: number;
    }
  > {
    const stationCode = StationScope.require(ctx);
    const profile = getAdsMisStationProfile(stationCode);
    const from = query.from;
    const to = query.to;

    const [adsRowsRaw, priceCardRes, invoices, roeRes] = await Promise.all([
      opts.includeUsage
        ? this.sourcesService.adsForMis(ctx, {
            from,
            to,
            dateBasis: 'schedule-date',
          })
        : Promise.resolve([] as BillingSourceRow[]),
      this.priceCardService.list(ctx, { handlingType: 'ADS' }),
      this.loadAdsInvoices(ctx, from, to),
      this.exchangeRatesService
        .getEffective(ctx, { currencyCode: 'USD', date: to })
        .catch(() => null),
    ]);

    const uniqueAds = new Map<string, BillingSourceRow>();
    for (const row of adsRowsRaw) {
      uniqueAds.set(adsMisUsageDedupKey(row), row);
    }
    const adsRows = [...uniqueAds.values()];
    const priceCardPayload = priceCardRes as unknown as {
      data?: { items?: Array<Record<string, unknown>> };
    };
    const billingSheet = buildAdsMisBillingSheet(
      adsRows,
      invoices.map((inv) => ({
        customerCode: inv.customerCode,
        customerName: inv.customerName,
        invoiceNumber: inv.invoiceNumber,
        concessionFeeAmount: inv.concessionFeeAmount,
        taxTotal: inv.taxTotal,
        totalInclTax: inv.totalInclTax,
      })),
    );
    const billingRows = flattenAdsMisBillingRows(billingSheet);
    const equipmentRows = adsMisIndexedEquipmentRows(billingSheet, stationCode);

    const priceCardItems = priceCardPayload.data?.items ?? [];
    const uniquePriceCardCustomers = new Map<string, string>();
    for (const item of priceCardItems) {
      const code = String(item.customerCode ?? '').trim().toUpperCase();
      if (code && !uniquePriceCardCustomers.has(code)) {
        uniquePriceCardCustomers.set(code, String(item.airlineName ?? code).trim());
      }
    }

    const billedCustomerCodes = new Set<string>();
    for (const inv of invoices) {
      if (inv.customerCode) billedCustomerCodes.add(inv.customerCode.toUpperCase());
      if (inv.billToCustomerCode) billedCustomerCodes.add(inv.billToCustomerCode.toUpperCase());
    }

    const missingBilling: Array<{ customerCode: string; airlineName: string; reason: string }> = [];
    uniquePriceCardCustomers.forEach((airlineName, customerCode) => {
      if (!billedCustomerCodes.has(customerCode)) {
        missingBilling.push({
          customerCode,
          airlineName,
          reason: 'No ADS invoice or draft for this billing month',
        });
      }
    });

    const sheets = this.buildSheetStatuses(profile.sheets, {
      flights: adsRows.length,
      equipmentLogEntries: equipmentRows.length,
      priceCardRows: uniquePriceCardCustomers.size,
      billedAirlines: billedCustomerCodes.size,
      missingBillingCount: missingBilling.length,
      usageResolved: opts.includeUsage,
    });

    const roePayload = roeRes as { data?: { rateToINR?: number } } | null;
    const roe = Number(roePayload?.data?.rateToINR);
    const roeToInr = Number.isFinite(roe) && roe > 0 ? roe : 1;

    const readyForExport = opts.includeUsage
      ? adsRows.length > 0 || invoices.length > 0
      : true;

    return {
      stationCode,
      stationLabel: profile.stationLabel,
      from,
      to,
      monthLabel: formatMisMonthTitle(from),
      monthToken: formatMisMonthToken(from),
      layout: profile.layout,
      readyForExport,
      sheets,
      missingBilling,
      summary: {
        scheduledFlights: adsRows.length,
        equipmentLogEntries: equipmentRows.length,
        priceCardAirlines: uniquePriceCardCustomers.size,
        billedAirlines: billedCustomerCodes.size,
        adsInvoices: invoices.length,
      },
      _equipmentRows: equipmentRows,
      _invoices: invoices,
      _billingRows: billingRows,
      _billingSheet: billingSheet,
      _roeToInr: roeToInr,
    };
  }

  private buildSheetStatuses(
    sheetDefs: AdsMisSheetDef[],
    metrics: {
      flights: number;
      equipmentLogEntries: number;
      priceCardRows: number;
      billedAirlines: number;
      missingBillingCount: number;
      usageResolved: boolean;
    },
  ): AdsMisSheetStatus[] {
    return sheetDefs.map((def) => {
      switch (def.id) {
        case 'working-sheet':
          return {
            id: def.id,
            label: def.label,
            description: def.description,
            status: !metrics.usageResolved
              ? 'partial'
              : metrics.equipmentLogEntries > 0
                ? 'complete'
                : 'missing',
            message: !metrics.usageResolved
              ? 'Indexed airline × equipment usage is written when you download'
              : metrics.equipmentLogEntries > 0
                ? `${metrics.equipmentLogEntries} unique airline × equipment rows`
                : 'No equipment log entries for selected month',
            rowCount: metrics.usageResolved ? metrics.equipmentLogEntries : undefined,
          };
        case 'exported-eq-data':
          return {
            id: def.id,
            label: def.label,
            description: def.description,
            status: !metrics.usageResolved
              ? 'partial'
              : metrics.equipmentLogEntries > 0
                ? 'complete'
                : 'missing',
            message: !metrics.usageResolved
              ? 'Indexed equipment totals are written at download'
              : metrics.equipmentLogEntries > 0
                ? `Indexed export with ${metrics.equipmentLogEntries} unique equipment rows`
                : 'Needs equipment usage data for the month',
            rowCount: metrics.usageResolved ? metrics.equipmentLogEntries : undefined,
          };
        case 'billing-sheet':
        case 'check-revenue':
        case 'revenue-working':
          return {
            id: def.id,
            label: def.label,
            description: def.description,
            status:
              !metrics.usageResolved
                ? metrics.billedAirlines > 0
                  ? 'complete'
                  : 'partial'
                : metrics.equipmentLogEntries > 0
                  ? metrics.billedAirlines > 0
                    ? 'complete'
                    : 'partial'
                  : metrics.billedAirlines > 0
                    ? 'partial'
                    : 'missing',
            message: !metrics.usageResolved
              ? metrics.billedAirlines > 0
                ? `${metrics.billedAirlines} ADS invoice(s) in period. Usage totals fill on download.`
                : 'Invoices optional. Airline/equipment totals are calculated on download.'
              : metrics.equipmentLogEntries > 0
                ? `Usage aggregated for ${metrics.equipmentLogEntries} unique equipment lines${
                    metrics.billedAirlines > 0
                      ? `; ${metrics.billedAirlines} invoice(s) in period`
                      : ' (invoices optional)'
                  }`
                : metrics.billedAirlines > 0
                  ? `${metrics.billedAirlines} invoice(s) — no ADS usage rows yet`
                  : 'No ADS usage or invoices for this month',
            rowCount: metrics.usageResolved
              ? metrics.equipmentLogEntries
              : metrics.billedAirlines,
            expectedCount: metrics.priceCardRows,
          };
        case 'check-equip':
          return {
            id: def.id,
            label: def.label,
            description: def.description,
            status: !metrics.usageResolved
              ? 'partial'
              : metrics.equipmentLogEntries > 0
                ? 'complete'
                : 'missing',
            message: !metrics.usageResolved
              ? 'Equipment matrix is populated at download'
              : 'Equipment quantity matrix populated',
            rowCount: metrics.usageResolved ? metrics.equipmentLogEntries : undefined,
          };
        default:
          return {
            id: def.id,
            label: def.label,
            description: def.description,
            status: 'partial',
            message: 'Template formulas preserved',
          };
      }
    });
  }

  private async loadAdsInvoices(
    ctx: StationScopeContext,
    from: string,
    to: string,
  ): Promise<AdsMisInvoiceRow[]> {
    const docs = await this.invoiceModel
      .find(StationScope.filter(buildAdsMisInvoiceQueryFilter(from, to), ctx))
      .sort({ customerCode: 1, updatedAt: -1 })
      .lean();

    return docs.map((doc) => ({
      customerCode: String(doc.customerCode ?? '').trim().toUpperCase(),
      billToCustomerCode: String(doc.billToCustomerCode ?? '').trim().toUpperCase() || undefined,
      customerName: String(doc.customerName ?? doc.customerCode ?? '').trim(),
      invoiceNumber: String(doc.invoiceNumber ?? doc.draftNumber ?? doc._id ?? '').trim(),
      status: String(doc.status ?? '').trim(),
      totalInclTax: Number(doc.totalInclTax ?? 0),
      concessionFeeAmount: Number(doc.concessionFeeAmount ?? 0) || undefined,
      taxTotal: Number(doc.taxTotal ?? 0) || undefined,
      currency: String(doc.currencyCode ?? 'INR').trim().toUpperCase(),
      billingPeriodStart: new Date(doc.billingPeriodStart),
      billingPeriodEnd: new Date(doc.billingPeriodEnd),
    }));
  }
}
