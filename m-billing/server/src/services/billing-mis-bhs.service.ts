import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AdvanceScheduleSetupRead,
  AdvanceScheduleSetupReadDocument,
  FhrCollectionRead,
  FhrCollectionReadDocument,
} from '../schemas/operational.schemas';
import {
  mapFhrCollectionDocToRecoFlights,
  misStaDateCandidates,
  previousCalendarMonth,
  recoStationReadFilter,
  type RecoSkdFlightLike,
} from './billing-mis-bhs-reco-skd.util';
import {
  bhsMisDedupFlights,
  buildBhsMisRevRows,
} from './billing-mis-bhs-source.util';
import type { BillingSourceRow } from '../shared/billing-sources';
import {
  StationScope,
  successResponse,
  type StationScopeContext,
} from '../common/station-scope';
import { BillingMisBhsQueryDto } from '../dto/billing-mis-bhs.dto';
import { BillingSourcesService } from './billing-sources.service';
import { BillingPriceCardAirlinesService } from './billing-price-card-airlines.service';
import {
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
} from '../schemas/billing.schemas';
import {
  buildBhsMisWorkbook,
  flightRowMatchesStation,
  listBhsMisWorkbookSheetNames,
  mapSourceRowToMisFlight,
  type BhsMisFlightRow,
  type BhsMisInvoiceRow,
  type BhsMisPriceCardRow,
} from './billing-mis-bhs-export.util';
import {
  formatMisMonthTitle,
  formatMisMonthToken,
  getBhsMisStationProfile,
  workbookSheetDefs,
  type BhsMisSheetDef,
} from './billing-mis-bhs-profile.util';
import { BillingExchangeRatesService } from './billing-settings.service';
import { NOT_IN_BIN_FILTER } from '../common/billing-invoice-bin.util';
import { preparationListPeriodFilter } from '../common/billing-invoice-period.util';

export type BhsMisSheetStatus = {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'partial' | 'missing' | 'not_applicable';
  message: string;
  rowCount?: number;
  expectedCount?: number;
};

export type BhsMisStatusPayload = {
  stationCode: string;
  stationLabel: string;
  from: string;
  to: string;
  monthLabel: string;
  monthToken: string;
  layout: string;
  readyForExport: boolean;
  sheets: BhsMisSheetStatus[];
  missingBilling: Array<{
    customerCode: string;
    airlineName: string;
    reason: string;
  }>;
  summary: {
    scheduledFlights: number;
    eligibleFlights: number;
    priceCardAirlines: number;
    billedAirlines: number;
    bhsInvoices: number;
  };
};

const BILLABLE_INVOICE_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'generated',
  'posted',
  'sent',
] as const;

/** Align MIS BHS invoice lookup with billing draft / invoice list rules. */
export function buildBhsMisInvoiceQueryFilter(
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
      { invoiceCategory: 'BHS' },
      { invoiceCategory: { $exists: false } },
      { invoiceCategory: null },
      { invoiceCategory: '' },
    ],
  };
}

@Injectable()
export class BillingMisBhsService {
  constructor(
    private readonly sourcesService: BillingSourcesService,
    private readonly priceCardService: BillingPriceCardAirlinesService,
    private readonly exchangeRatesService: BillingExchangeRatesService,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(AdvanceScheduleSetupRead.name)
    private readonly scheduleSetupModel: Model<AdvanceScheduleSetupReadDocument>,
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
  ) {}

  async getStatus(ctx: StationScopeContext, query: BillingMisBhsQueryDto) {
    const payload = await this.collectContext(ctx, query, { includeUsage: true });
    const {
      _flights,
      _lastMonthFlights,
      _fhrFlights,
      _scheduleMasters,
      _priceCardRows,
      _invoices,
      _previousInvoices,
      _revRows,
      _roeToInr,
      _previousRoeToInr,
      ...publicStatus
    } = payload;
    return successResponse(publicStatus);
  }

  async exportWorkbook(ctx: StationScopeContext, query: BillingMisBhsQueryDto): Promise<{
    buffer: Buffer;
    fileName: string;
    status: BhsMisStatusPayload;
  }> {
    const status = await this.collectContext(ctx, query, { includeUsage: true });
    const buffer = await buildBhsMisWorkbook({
      stationCode: status.stationCode,
      from: status.from,
      to: status.to,
      flights: status._flights,
      lastMonthFlights: status._lastMonthFlights,
      fhrFlights: status._fhrFlights,
      scheduleMasters: status._scheduleMasters,
      priceCardRows: status._priceCardRows,
      invoices: status._invoices,
      previousInvoices: status._previousInvoices,
      revRows: status._revRows,
      roeToInr: status._roeToInr,
      previousRoeToInr: status._previousRoeToInr,
    });
    const fileName = `BHS_MIS_${status.stationCode}_${status.monthToken}.xlsx`;
    const {
      _flights,
      _lastMonthFlights,
      _fhrFlights,
      _scheduleMasters,
      _priceCardRows,
      _invoices,
      _previousInvoices,
      _revRows,
      _roeToInr,
      _previousRoeToInr,
      ...publicStatus
    } = status;
    return { buffer, fileName, status: publicStatus };
  }

  private async collectContext(
    ctx: StationScopeContext,
    query: BillingMisBhsQueryDto,
    opts: { includeUsage: boolean },
  ): Promise<
    BhsMisStatusPayload & {
      _flights: BhsMisFlightRow[];
      _lastMonthFlights: BhsMisFlightRow[];
      _fhrFlights: RecoSkdFlightLike[];
      _scheduleMasters: Array<{ data?: Record<string, unknown> }>;
      _priceCardRows: BhsMisPriceCardRow[];
      _invoices: BhsMisInvoiceRow[];
      _previousInvoices: BhsMisInvoiceRow[];
      _revRows: ReturnType<typeof buildBhsMisRevRows>;
      _roeToInr: number;
      _previousRoeToInr: number;
    }
  > {
    const stationCode = StationScope.require(ctx);
    const profile = getBhsMisStationProfile(stationCode);
    const from = query.from;
    const to = query.to;

    const prevMonth = previousCalendarMonth(from);
    const fhrDateCandidates = misStaDateCandidates(prevMonth.from, to);
    const emptySources = Promise.resolve({ data: { rows: [] as BillingSourceRow[] } });
    const [
      flightsRes,
      lastMonthFlightsRes,
      xxldRes,
      scheduleMasters,
      fhrDocs,
      priceCardRes,
      invoices,
      previousInvoices,
      roeRes,
      previousRoeRes,
    ] = await Promise.all([
      opts.includeUsage
        ? this.sourcesService.scheduledFlights(ctx, {
            from,
            to,
            dateBasis: 'schedule-date',
          })
        : emptySources,
      opts.includeUsage
        ? this.sourcesService.scheduledFlights(ctx, {
            from: prevMonth.from,
            to: prevMonth.to,
            dateBasis: 'schedule-date',
          })
        : emptySources,
      opts.includeUsage
        ? this.sourcesService.xxldScheduled(ctx, {
            from,
            to,
            dateBasis: 'schedule-date',
          })
        : emptySources,
      opts.includeUsage
        ? this.scheduleSetupModel.find(recoStationReadFilter(stationCode)).lean()
        : Promise.resolve([]),
      opts.includeUsage
        ? this.fhrModel
            .find(
              recoStationReadFilter(stationCode, {
                $or: [
                  { staDates: { $in: fhrDateCandidates } },
                  { 'mainDetails.STADate': { $in: fhrDateCandidates } },
                  { 'mainDetails.staDate': { $in: fhrDateCandidates } },
                  { 'terminalDetails.STADate': { $in: fhrDateCandidates } },
                  { 'terminalDetails.staDate': { $in: fhrDateCandidates } },
                  { 'rampDetails1.STADate': { $in: fhrDateCandidates } },
                  { 'rampDetails1.staDate': { $in: fhrDateCandidates } },
                ],
              }),
            )
            .lean()
        : Promise.resolve([]),
      this.priceCardService.list(ctx, { handlingType: 'BHS' }),
      this.loadBhsInvoices(ctx, from, to),
      this.loadBhsInvoices(ctx, prevMonth.from, prevMonth.to),
      this.exchangeRatesService
        .getEffective(ctx, { currencyCode: 'USD', date: to })
        .catch(() => null),
      this.exchangeRatesService
        .getEffective(ctx, { currencyCode: 'USD', date: prevMonth.to })
        .catch(() => null),
    ]);

    const flightsPayload = flightsRes as unknown as {
      data?: { rows?: Array<Record<string, unknown>> };
    };
    const priceCardPayload = priceCardRes as unknown as {
      data?: { items?: Array<Record<string, unknown>> };
    };

    const sourceRows = (flightsPayload.data?.rows ?? []).filter((row) =>
      flightRowMatchesStation(row, stationCode),
    );
    const xxldPayload = xxldRes as unknown as {
      data?: { rows?: Array<Record<string, unknown>> };
    };
    const xxldFlights = (xxldPayload.data?.rows ?? [])
      .filter((row) => flightRowMatchesStation(row, stationCode))
      .map((row) => mapSourceRowToMisFlight(row))
      .filter((row): row is BhsMisFlightRow => row != null);

    const flights = bhsMisDedupFlights([
      ...sourceRows
        .map((row) => mapSourceRowToMisFlight(row))
        .filter((row): row is BhsMisFlightRow => row != null),
      ...xxldFlights,
    ]);

    const lastMonthPayload = lastMonthFlightsRes as unknown as {
      data?: { rows?: Array<Record<string, unknown>> };
    };
    const lastMonthFlights = bhsMisDedupFlights(
      (lastMonthPayload.data?.rows ?? [])
        .filter((row) => flightRowMatchesStation(row, stationCode))
        .map((row) => mapSourceRowToMisFlight(row))
        .filter((row): row is BhsMisFlightRow => row != null),
    );

    const scheduleMasterRows = (scheduleMasters ?? []).map((doc) => ({
      data: (doc.data ?? {}) as Record<string, unknown>,
    }));
    const fhrFlights = (fhrDocs ?? []).flatMap((doc) =>
      mapFhrCollectionDocToRecoFlights(doc as unknown as Record<string, unknown>),
    );

    const eligibleFlights = flights.filter((row) => row.eligible === true).length;

    const priceCardItems = priceCardPayload.data?.items ?? [];
    const priceCardRows: BhsMisPriceCardRow[] = priceCardItems.map((item) => {
      const currency = String(item.currencyCode ?? 'INR').trim().toUpperCase() || 'INR';
      const price = Number(item.price ?? 0) || undefined;
      return {
        customerCode: String(item.customerCode ?? '').trim().toUpperCase(),
        airlineName: String(item.airlineName ?? item.customerCode ?? '').trim(),
        aircraftType: String(item.aircraftType ?? '').trim(),
        category: String(item.category ?? 'C').trim(),
        bodyType: 'NB',
        packagePriceUsd: currency === 'USD' ? price : undefined,
        packagePriceInr: currency === 'USD' ? undefined : price,
        currency,
        validFrom: item.validFrom ? new Date(String(item.validFrom)) : undefined,
        validTo: item.validTo ? new Date(String(item.validTo)) : undefined,
        royaltyMode: undefined,
      };
    });

    const billedCustomerCodes = new Set<string>();
    for (const inv of invoices) {
      if (inv.customerCode) billedCustomerCodes.add(inv.customerCode.toUpperCase());
      if (inv.billToCustomerCode) {
        billedCustomerCodes.add(inv.billToCustomerCode.toUpperCase());
      }
    }
    const uniquePriceCardCustomers = new Map<string, BhsMisPriceCardRow>();
    for (const row of priceCardRows) {
      if (!uniquePriceCardCustomers.has(row.customerCode)) {
        uniquePriceCardCustomers.set(row.customerCode, row);
      }
    }

    const missingBilling = [...uniquePriceCardCustomers.values()]
      .filter((row) => !billedCustomerCodes.has(row.customerCode))
      .map((row) => ({
        customerCode: row.customerCode,
        airlineName: row.airlineName,
        reason: 'No BHS invoice or draft for this billing month',
      }));

    const cancelledCount = flights.filter((f) => f.cancelled).length;
    let workbookNames: string[] = [];
    try {
      workbookNames = await listBhsMisWorkbookSheetNames(profile.templateFile);
    } catch {
      workbookNames = profile.sheets.map((sheet) => sheet.sheetName);
    }
    const visibleSheets = workbookSheetDefs(profile.sheets, workbookNames);
    const sheets = this.buildSheetStatuses(visibleSheets.length > 0 ? visibleSheets : profile.sheets, {
      flights: flights.length,
      eligibleFlights,
      cancelledCount,
      priceCardRows: uniquePriceCardCustomers.size,
      billedAirlines: billedCustomerCodes.size,
      missingBillingCount: missingBilling.length,
      layout: profile.layout,
    });

    const roePayload = roeRes as { data?: { rateToINR?: number } } | null;
    const roe = Number(roePayload?.data?.rateToINR);
    const roeToInr = Number.isFinite(roe) && roe > 0 ? roe : 1;
    const prevRoePayload = previousRoeRes as { data?: { rateToINR?: number } } | null;
    const prevRoe = Number(prevRoePayload?.data?.rateToINR);
    const previousRoeToInr = Number.isFinite(prevRoe) && prevRoe > 0 ? prevRoe : roeToInr;

    const revRows = buildBhsMisRevRows(priceCardRows, invoices, flights, roeToInr, {
      previousFlights: lastMonthFlights,
      previousInvoices,
      previousRoeToInr,
    });
    const readyForExport = opts.includeUsage
      ? flights.length > 0 || invoices.length > 0
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
        scheduledFlights: flights.length,
        eligibleFlights,
        priceCardAirlines: uniquePriceCardCustomers.size,
        billedAirlines: billedCustomerCodes.size,
        bhsInvoices: invoices.length,
      },
      _flights: flights,
      _lastMonthFlights: lastMonthFlights,
      _fhrFlights: fhrFlights,
      _scheduleMasters: scheduleMasterRows,
      _priceCardRows: priceCardRows,
      _invoices: invoices,
      _previousInvoices: previousInvoices,
      _revRows: revRows,
      _roeToInr: roeToInr,
      _previousRoeToInr: previousRoeToInr,
    };
  }

  private buildSheetStatuses(
    sheetDefs: BhsMisSheetDef[],
    metrics: {
      flights: number;
      eligibleFlights: number;
      cancelledCount: number;
      priceCardRows: number;
      billedAirlines: number;
      missingBillingCount: number;
      layout: string;
    },
  ): BhsMisSheetStatus[] {
    return sheetDefs.map((def) => {
      switch (def.id) {
        case 'schedule-fris':
          return this.sheetStatus(def, metrics.flights > 0 ? 'complete' : 'missing', {
            message:
              metrics.flights > 0
                ? `${metrics.flights} scheduled flights loaded`
                : 'No scheduled flights for selected month',
            rowCount: metrics.flights,
          });
        case 'proj-skd':
          return this.sheetStatus(
            def,
            metrics.flights > 0 ? 'complete' : 'missing',
            {
              message:
                metrics.flights > 0
                  ? `Daily airline × aircraft matrix from ${metrics.flights} scheduled / FHR flights`
                  : 'No flight data for projection',
              rowCount: metrics.flights,
            },
          );
        case 'reco-skd':
          return this.sheetStatus(
            def,
            metrics.flights > 0 ? 'complete' : 'missing',
            {
              message:
                metrics.flights > 0
                  ? 'Reco from Advance schedule setup + closed flights (weekday + extra days after 28th)'
                  : 'Needs Advance schedule setup and closed flights',
              rowCount: metrics.flights,
            },
          );
        case 'addl-xxld':
          return this.sheetStatus(def, 'partial', {
            message:
              metrics.cancelledCount > 0
                ? `${metrics.cancelledCount} cancelled / XXLD flights mapped`
                : 'No cancelled flights — sheet retains template formulas',
            rowCount: metrics.cancelledCount,
          });
        case 'delay-working':
          return this.sheetStatus(def, metrics.layout === 'maa' ? 'partial' : 'not_applicable', {
            message:
              metrics.layout === 'maa'
                ? 'Delay working uses template formulas — verify delay report feed'
                : 'Not used in Delhi layout',
          });
        case 'delay-flt':
          return this.sheetStatus(def, 'partial', {
            message: 'Delay summary retains template formulas — cross-check delay report',
          });
        case 'rev-summary':
          return this.sheetStatus(
            def,
            metrics.missingBillingCount === 0 && metrics.billedAirlines > 0
              ? 'complete'
              : metrics.billedAirlines > 0
                ? 'partial'
                : 'missing',
            {
              message:
                metrics.missingBillingCount === 0
                  ? `All ${metrics.billedAirlines} billed airlines mapped`
                  : metrics.billedAirlines > 0
                    ? `${metrics.missingBillingCount} airline(s) still need BHS billing`
                    : 'No BHS invoices for this month',
              rowCount: metrics.billedAirlines,
              expectedCount: metrics.priceCardRows,
            },
          );
        case 'fris-data':
        case 'fris-data-1':
        case 'fris-data-2':
          return this.sheetStatus(
            def,
            metrics.flights > 0 ? 'partial' : 'missing',
            {
              message:
                metrics.flights > 0
                  ? `${metrics.flights} scheduled flights in billing for this month`
                  : 'No scheduled flights in billing for this month',
              rowCount: metrics.flights,
            },
          );
        case 'ceiling-rates':
          return this.sheetStatus(def, 'complete', {
            message: 'Ceiling rates retained from station template',
          });
        default:
          return this.sheetStatus(def, 'partial', { message: 'Template formulas preserved' });
      }
    });
  }

  private sheetStatus(
    def: BhsMisSheetDef,
    status: BhsMisSheetStatus['status'],
    extra: Pick<BhsMisSheetStatus, 'message' | 'rowCount' | 'expectedCount'>,
  ): BhsMisSheetStatus {
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      status,
      message: extra.message,
      rowCount: extra.rowCount,
      expectedCount: extra.expectedCount,
    };
  }

  private async loadBhsInvoices(
    ctx: StationScopeContext,
    from: string,
    to: string,
  ): Promise<BhsMisInvoiceRow[]> {
    const docs = await this.invoiceModel
      .find(StationScope.filter(buildBhsMisInvoiceQueryFilter(from, to), ctx))
      .sort({ customerCode: 1, updatedAt: -1 })
      .lean();

    return docs.map((doc) => ({
      customerCode: String(doc.customerCode ?? '').trim().toUpperCase(),
      billToCustomerCode: String(doc.billToCustomerCode ?? '').trim().toUpperCase() || undefined,
      customerName: String(doc.customerName ?? doc.customerCode ?? '').trim(),
      invoiceNumber: String(doc.invoiceNumber ?? doc.draftNumber ?? doc._id ?? '').trim(),
      status: String(doc.status ?? '').trim(),
      totalInclTax: Number(doc.totalInclTax ?? 0),
      currency: String(doc.currencyCode ?? 'INR').trim().toUpperCase(),
      billingPeriodStart: new Date(doc.billingPeriodStart),
      billingPeriodEnd: new Date(doc.billingPeriodEnd),
    }));
  }
}
