import { BadRequestException, Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type PipelineStage } from 'mongoose';
import type { StationScopeContext } from '../../common/station-scope';
import { StationScope } from '../../common/station-scope';
import {
  addDaysYmd,
  ddMmYyyyToYmd,
  enumerateDdMmYyyyFromYmdRange,
  normalizeBillingScheduledDateBasis,
  queryParamToYmd,
  scheduledFlightBillingWindowYmd,
} from '../../utils/billing-date.util';
import { reportDateYmd, mapFhrToInvoicingFlightReportRow } from '../../utils/invoicing-flight-report.mapper';
import {
  normalizeBillingCustomerCode,
  resolveBillingCustomerCode,
} from '../../utils/billing-customer-code.util';
import { fhrStaDatesRangeFilter } from 'src/fhr-collection/utils/sta-dates.util';
import {
  AdsUsageData,
  AdsUsageDataDocument,
  AdvanceRafAirlineRead,
  AdvanceRafAirlineReadDocument,
  CreationRafRead,
  CreationRafReadDocument,
  FhrCollectionRead,
  FhrCollectionReadDocument,
  RafCollectionRead,
  RafCollectionReadDocument,
} from '../../schemas/operational.schemas';
import {
  BillingCustomer,
  BillingCustomerDocument,
} from '../../schemas/billing.schemas';
import { BillingSourceEnrichmentService } from './billing-source-enrichment.service';
import type { EnrichSourceInput } from './billing-source-enrichment.service';
import { BillingPreparationService } from '../billing-preparation.service';
import { BillingSourcesQueryDto } from '../../dto/billing-sources-query.dto';
import type { BillingSourceRow } from '../../shared/billing-sources';
import {
  buildAdsCatalogIndex,
  mapFhrDocToAdsRows,
  type AdsEquipmentCatalogItem,
  type FhrAdsMappedRow,
} from '../../shared/fhr-equipment-to-ads-row';
import { EQUIPMENT_MANPOWER_CATALOG_SERIAL } from 'src/equipment-manpower/schema/equipment-manpower.schema';
import {
  applyIndexedAdsRatesToUsage,
  adsMisRateMap,
  dedupeAdsMappedRows,
  indexAdsMisRateSamples,
} from '../billing-mis-ads-source.util';

const ROW_LIMIT = 5000;
/** Full-month MAA ADS can exceed 5k usage lines; keep higher cap for ADS mode. */
const ADS_ROW_LIMIT = 20000;
/** Cap FHR docs scanned before in-memory ADS mapping (rows still capped at ADS_ROW_LIMIT). */
const FHR_ADS_DOC_LIMIT = 8000;
const ATD_PREFETCH_DAYS = Number(
  process.env.BILLING_SCHEDULED_ATD_PREFETCH_DAYS ?? '3',
);

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function stationFilter(ctx: StationScopeContext, field = 'station') {
  if (ctx.crossStation || !ctx.stationCode) return {};
  return { [field]: ctx.stationCode };
}

/**
 * Stations whose ADS/equipment/manpower pages read scheduled `fhr_collection`
 * (equipmentDetails / equipmentManpower / wheelchair counts) — same path as MAA.
 *
 * Excel-only stations (currently DLH) keep `ads_usage_data`. Override with
 * `BILLING_ADS_EXCEL_ONLY_STATIONS=DLH,XYZ` if needed.
 */
function usesFhrBackedAds(ctx: StationScopeContext): boolean {
  const code = String(ctx.stationCode ?? '').trim().toUpperCase();
  if (!code) return false;
  const excelOnly = new Set(
    String(process.env.BILLING_ADS_EXCEL_ONLY_STATIONS ?? 'DLH')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return !excelOnly.has(code);
}

/**
 * Generic airline-name match: FHR often stores only the full Airline name
 * (e.g. "AIR INDIA EXPRESS", "SPICEJET") with no usable code. Match that name
 * against the requested customer's registered name(s), both directions, so the
 * ADS flow works for every airline — not just IX.
 */
function airlineNameMatchesCustomer(
  airlineName: string,
  customerNames: string[],
): boolean {
  const a = airlineName.trim().toUpperCase();
  if (!a || customerNames.length === 0) return false;
  return customerNames.some((name) => {
    const n = name.trim().toUpperCase();
    return !!n && (a === n || a.includes(n) || n.includes(a));
  });
}

function buildStaDateCandidates(fromYmd: string, toYmd: string): string[] {
  const out = new Set<string>();
  const start = new Date(`${fromYmd}T00:00:00.000Z`);
  const end = new Date(`${toYmd}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [fromYmd, toYmd];
  }
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    out.add(`${y}-${m}-${d}`);
    out.add(`${d}/${m}/${y}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return [...out];
}

/** Shared MAA FHR → ADS listing used by ads / equipment / manpower endpoints. */
@Injectable()
export class BillingSourcesMaaFhrAdsService {
  constructor(
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectModel(BillingCustomer.name)
    private readonly customerModel: Model<BillingCustomerDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly enrichment: BillingSourceEnrichmentService,
    @Inject(forwardRef(() => BillingPreparationService))
    private readonly preparation: BillingPreparationService,
  ) {}

  /**
   * Airline display name(s) registered for a customer code — used so ADS filtering
   * works for ANY airline whose FHR stores only the full Airline name (not code).
   */
  private async resolveCustomerAirlineNames(
    ctx: StationScopeContext,
    customerCode: string,
  ): Promise<string[]> {
    const code = customerCode.trim().toUpperCase();
    if (!code) return [];
    const docs = await this.customerModel
      .find(StationScope.filter({ customerCode: code }, ctx))
      .select({ name: 1 })
      .lean();
    return docs
      .map((d) => String(d.name ?? '').trim().toUpperCase())
      .filter(Boolean);
  }

  async list(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
    mode: 'ads' | 'equipment' | 'manpower',
  ) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const dateBasis = normalizeBillingScheduledDateBasis(query.dateBasis);

    // Always live FHR + catalog for the selected date range — no in-memory list cache.
    const catalog = await this.loadCatalog(ctx);
    const catalogIndex = buildAdsCatalogIndex(catalog);
    const customerFilterCode = String(query.customerCode ?? '').trim().toUpperCase();
    const customerAirlineNames = customerFilterCode
      ? await this.resolveCustomerAirlineNames(ctx, customerFilterCode)
      : [];
    const mapped = await this.loadMappedRows(
      ctx,
      query,
      fromYmd,
      toYmd,
      catalogIndex,
      customerAirlineNames,
    );

    const filtered =
      mode === 'ads' ? mapped : mapped.filter((row) => row.sourceType === mode);

    const rowCap = mode === 'ads' ? ADS_ROW_LIMIT : ROW_LIMIT;
    const limited = filtered.slice(0, rowCap);
    // ADS page: enrich unique customer+particular+aircraft keys (same as MIS),
    // then stamp rates onto every usage line. Per-row enrichBatch was 20k
    // contract lookups and regularly exceeded Nest's 30s GET timeout.
    const enrichedRows =
      mode === 'ads'
        ? await this.enrichAdsRowsIndexed(ctx, limited)
        : await this.enrichment.enrichBatch(
            ctx,
            limited.map((row) => ({
              sourceType: row.sourceType,
              sourceRef: row.sourceRef,
              operationalData: row.operationalData,
              customerCode: row.customerCode,
              serviceCode: row.serviceCode,
              billingDate: row.billingDate,
            })),
          );

    const marked = await this.markAdsPreparationSent(
      ctx,
      enrichedRows,
      fromYmd,
      toYmd,
      mode,
    );
    return this.enrichment.wrapResponse(mode, marked, fromYmd, toYmd, dateBasis);
  }

  /**
   * MIS ADS: same FHR mapping as the ADS page, but enrich unique rate keys only.
   * Skips preparation marking so export cannot block Nest on 20k line writes.
   */
  async listIndexedForMis(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
  ): Promise<BillingSourceRow[]> {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const catalog = await this.loadCatalog(ctx);
    const catalogIndex = buildAdsCatalogIndex(catalog);
    const mapped = await this.loadMappedRows(ctx, query, fromYmd, toYmd, catalogIndex, []);
    const usage = dedupeAdsMappedRows(mapped).slice(0, ADS_ROW_LIMIT);
    return this.enrichAdsRowsIndexed(ctx, usage);
  }

  private async enrichAdsRowsIndexed(
    ctx: StationScopeContext,
    usage: FhrAdsMappedRow[],
  ): Promise<BillingSourceRow[]> {
    if (usage.length === 0) return [];
    const samples = indexAdsMisRateSamples(usage);
    const enrichedSamples = await this.enrichment.enrichBatch(
      ctx,
      samples.map((row) => ({
        sourceType: 'ads' as const,
        sourceRef: row.sourceRef,
        operationalData: row.operationalData,
        customerCode: row.customerCode,
        serviceCode: row.serviceCode,
        billingDate: row.billingDate,
      })),
    );
    return applyIndexedAdsRatesToUsage(usage, adsMisRateMap(samples, enrichedSamples)).filter(
      (row) => row.rateMatch?.omitBmeFromAds !== true,
    );
  }

  /**
   * Distinct TypeCraft values from fhr_collection flights for the selected airline
   * in the billing period (all flights — not filtered by equipment).
   */
  async listAircraftTypesForCustomer(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
  ): Promise<{ data: string[] }> {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const customerFilterCode = String(query.customerCode ?? '').trim().toUpperCase();
    if (!customerFilterCode) {
      throw new BadRequestException('customerCode is required');
    }

    const customerAirlineNames = await this.resolveCustomerAirlineNames(
      ctx,
      customerFilterCode,
    );

    const dateBasis = normalizeBillingScheduledDateBasis(query.dateBasis);
    const fetchFrom =
      dateBasis === 'atd-date' ? addDaysYmd(fromYmd, -ATD_PREFETCH_DAYS) : fromYmd;
    const fetchTo =
      dateBasis === 'atd-date' ? addDaysYmd(toYmd, ATD_PREFETCH_DAYS) : toYmd;
    const staDateCandidates = buildStaDateCandidates(fetchFrom, fetchTo);

    const staFilter = fhrStaDatesRangeFilter(staDateCandidates);
    const dateOr: Record<string, unknown>[] = Array.isArray(staFilter.$or)
      ? [...(staFilter.$or as Record<string, unknown>[])]
      : [staFilter];
    if (dateBasis === 'atd-date') {
      dateOr.push(
        { 'mainDetails.ATDDate': { $in: staDateCandidates } },
        { 'mainDetails.atdDate': { $in: staDateCandidates } },
      );
    }
    const dateFilter: Record<string, unknown> = { $or: dateOr };

    const pipeline: PipelineStage[] = [
      { $match: StationScope.filter(dateFilter, ctx) },
      { $limit: FHR_ADS_DOC_LIMIT },
      {
        $project: {
          _id: 0,
          mainDetails: 1,
          terminalDetails: 1,
        },
      },
    ];

    const fhrs: Array<{
      mainDetails?: Record<string, unknown>;
      terminalDetails?: Record<string, unknown>;
    }> = await this.fhrModel.aggregate(pipeline).exec();

    const types = new Set<string>();
    for (const fhr of fhrs) {
      const main = (fhr.mainDetails ?? {}) as Record<string, unknown>;
      const terminal = (fhr.terminalDetails ?? {}) as Record<string, unknown>;

      const rowCustomer = resolveBillingCustomerCode(main, {});
      const airline = String(main.Airline ?? '').toUpperCase();
      const matchesByName = airlineNameMatchesCustomer(airline, customerAirlineNames);
      if (rowCustomer && rowCustomer !== customerFilterCode && !matchesByName) {
        continue;
      }
      if (!rowCustomer && !matchesByName) {
        if (airline && customerAirlineNames.length > 0) continue;
      }

      const atdYmd = reportDateYmd(main.ATDDate ?? main.atdDate);
      const staYmd =
        reportDateYmd(terminal.STADate ?? terminal.staDate ?? terminal.STA_Date) ??
        reportDateYmd(main.STADate ?? main.staDate ?? main.STA_Date);
      const flightWindowYmd = scheduledFlightBillingWindowYmd(
        {},
        {
          atdYmd,
          staYmd,
          stdYmd: reportDateYmd(main.STDDate ?? main.stdDate),
          exportedYmd: null,
          scheduleYmd: staYmd,
        },
        dateBasis,
      );
      if (!flightWindowYmd || flightWindowYmd < fromYmd || flightWindowYmd > toYmd) {
        continue;
      }

      const ac = String(
        main.TypeCraft ?? main.typeCraft ?? main.AircraftType ?? main.aircraftType ?? '',
      )
        .trim()
        .toUpperCase();
      if (ac) types.add(ac);
    }

    return {
      data: [...types].sort((a, b) => a.localeCompare(b)),
    };
  }

  private async markAdsPreparationSent(
    ctx: StationScopeContext,
    rows: BillingSourceRow[],
    periodStartYmd: string,
    periodEndYmd: string,
    mode: 'ads' | 'equipment' | 'manpower',
  ): Promise<BillingSourceRow[]> {
    if (rows.length === 0) return rows;
    const sourceTypes =
      mode === 'ads' ? (['ads', 'equipment', 'manpower'] as const) : ([mode] as const);
    const ingestedUsageIds = await this.preparation.getIngestedAdsUsageRowIds(
      ctx,
      periodStartYmd,
      sourceTypes,
      periodEndYmd,
    );
    return rows.map((row) => {
      const usageRowId = String(row.sourceRef?.usageRowId ?? '').trim();
      if (usageRowId && ingestedUsageIds.has(usageRowId)) {
        return { ...row, sentToPreparation: true };
      }
      return { ...row, sentToPreparation: false };
    });
  }

  private async loadCatalog(
    ctx: StationScopeContext,
  ): Promise<AdsEquipmentCatalogItem[]> {
    const col = this.connection.collection('equipmentManpower');
    const filter = StationScope.filter(
      {
        serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
        isEquipmentManpowerCatalog: true,
      },
      ctx,
    );
    const doc = await col.findOne(filter, {
      projection: { catalogItems: 1 },
    });
    const raw = doc?.catalogItems;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }
    return raw.map((row) => ({
      abbr: String((row as { abbr?: unknown }).abbr ?? '').trim(),
      description: String((row as { description?: unknown }).description ?? '').trim(),
      unit_type: String((row as { unit_type?: unknown }).unit_type ?? '').trim(),
      category: String((row as { category?: unknown }).category ?? '').trim(),
    }));
  }

  private async loadMappedRows(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
    fromYmd: string,
    toYmd: string,
    catalogIndex: ReturnType<typeof buildAdsCatalogIndex>,
    customerAirlineNames: string[] = [],
  ): Promise<FhrAdsMappedRow[]> {
    // Same flight discovery as BHS (scheduled-flights): date basis + ATD prefetch + raw join.
    const dateBasis = normalizeBillingScheduledDateBasis(query.dateBasis);
    const fetchFrom =
      dateBasis === 'atd-date' ? addDaysYmd(fromYmd, -ATD_PREFETCH_DAYS) : fromYmd;
    const fetchTo =
      dateBasis === 'atd-date' ? addDaysYmd(toYmd, ATD_PREFETCH_DAYS) : toYmd;
    // Prefer FHR main/terminal dates for ADS window. MAA June ops often have no
    // raw_flight_data join hit; requiring raw ATD dropped valid IX equipment flights.
    const staDateCandidates = buildStaDateCandidates(fetchFrom, fetchTo);
    const customerFilterCode = String(query.customerCode ?? '')
      .trim()
      .toUpperCase();

    const staFilter = fhrStaDatesRangeFilter(staDateCandidates);
    const dateOr: Record<string, unknown>[] = Array.isArray(staFilter.$or)
      ? [...(staFilter.$or as Record<string, unknown>[])]
      : [staFilter];
    // ATD-basis discovery: STA index miss still finds flights by ATD date.
    if (dateBasis === 'atd-date') {
      dateOr.push(
        { 'mainDetails.ATDDate': { $in: staDateCandidates } },
        { 'mainDetails.atdDate': { $in: staDateCandidates } },
      );
    }
    const dateFilter: Record<string, unknown> = { $or: dateOr };

    // Do NOT Mongo-filter by Arline_Code === "IX": MAA stores flight nos (IX2718) there.
    // Filter after normalize (resolveBillingCustomerCode).
    const combinedFilter = dateFilter;

    // Project only cleaning/night-halt ramp fields — full rampDetails1 is large
    // and was the main ADS fetch regression after synthetic cleaning rows landed.
    // No .hint(): missing { staDates, SerialNo } caused every request to fail then
    // re-run unhinted (2× aggregate). Planner uses { stationCode, staDates } when present.
    const pipeline: PipelineStage[] = [
      { $match: StationScope.filter(combinedFilter, ctx) },
      { $limit: FHR_ADS_DOC_LIMIT },
      {
        $project: {
          _id: 0,
          SerialNo: 1,
          mainDetails: 1,
          terminalDetails: 1,
          'rampDetails1.CleaningFr': 1,
          'rampDetails1.CleaningTo': 1,
          'rampDetails1.cleaningStartedDate': 1,
          'rampDetails1.cleaningClosedDate': 1,
          'rampDetails1.cleaningStartedTime': 1,
          'rampDetails1.cleaningClosedTime': 1,
          'rampDetails1.ifNightHalt': 1,
          equipmentDetails: 1,
          equipmentManpower: 1,
        },
      },
    ];

    const fhrs: Array<{
      SerialNo?: unknown;
      mainDetails?: Record<string, unknown>;
      terminalDetails?: Record<string, unknown>;
      rampDetails1?: Record<string, unknown>;
      equipmentDetails?: unknown;
      equipmentManpower?: Record<string, unknown>;
    }> = await this.fhrModel.aggregate(pipeline).allowDiskUse(true).exec();
    const out: FhrAdsMappedRow[] = [];
    let scanned = 0;
    for (const fhr of fhrs) {
      scanned += 1;
      if (scanned % 200 === 0) {
        await yieldEventLoop();
      }
      const main = (fhr.mainDetails ?? {}) as Record<string, unknown>;
      const terminal = (fhr.terminalDetails ?? {}) as Record<string, unknown>;

      if (customerFilterCode) {
        const rowCustomer = resolveBillingCustomerCode(main, {});
        const airline = String(main.Airline ?? '').toUpperCase();
        const matchesByName = airlineNameMatchesCustomer(
          airline,
          customerAirlineNames,
        );
        if (rowCustomer && rowCustomer !== customerFilterCode && !matchesByName) {
          continue;
        }
        if (!rowCustomer && !matchesByName) {
          // Unknown FHR code: keep only when Airline name is empty (defer to client)
          // or clearly matches the requested customer; drop clear non-matches.
          if (airline && customerAirlineNames.length > 0) continue;
        }
      }

      const atdYmd = reportDateYmd(main.ATDDate ?? main.atdDate);
      const staYmd =
        reportDateYmd(terminal.STADate ?? terminal.staDate ?? terminal.STA_Date) ??
        reportDateYmd(main.STADate ?? main.staDate ?? main.STA_Date);
      const flightWindowYmd = scheduledFlightBillingWindowYmd(
        {},
        {
          atdYmd,
          staYmd,
          stdYmd: reportDateYmd(main.STDDate ?? main.stdDate),
          exportedYmd: null,
          scheduleYmd: staYmd,
        },
        dateBasis,
      );
      if (!flightWindowYmd || flightWindowYmd < fromYmd || flightWindowYmd > toYmd) {
        continue;
      }

      const rows = mapFhrDocToAdsRows(fhr, catalogIndex, {
        fromYmd,
        toYmd,
        flightWindowYmd,
      });
      for (const row of rows) {
        if (customerFilterCode) {
          const code =
            normalizeBillingCustomerCode(row.customerCode) || row.customerCode;
          const airline = String(
            (row.operationalData as { Airline?: unknown }).Airline ?? '',
          ).toUpperCase();
          const matchesByName = airlineNameMatchesCustomer(
            airline,
            customerAirlineNames,
          );
          if (code && code !== customerFilterCode && !matchesByName) continue;
        }
        out.push(row);
        if (out.length >= ADS_ROW_LIMIT) return out;
      }
    }
    return out;
  }
}

@Injectable()
export class BillingSourcesAdsService {
  constructor(
    @InjectModel(AdsUsageData.name)
    private readonly adsModel: Model<AdsUsageDataDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly maaFhrAds: BillingSourcesMaaFhrAdsService,
    @Inject(forwardRef(() => BillingPreparationService))
    private readonly preparation: BillingPreparationService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    if (usesFhrBackedAds(ctx)) {
      return this.maaFhrAds.list(ctx, query, 'ads');
    }

    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const filter: Record<string, unknown> = {
      ...stationFilter(ctx),
      // ads_usage_data.dateKey is stored as YYYY-MM-DD (same as RAF stdDateKey).
      dateKey: { $gte: fromYmd, $lte: toYmd },
    };
    if (query.customerCode) {
      filter.customerName = new RegExp(query.customerCode, 'i');
    }

    const docs = await this.adsModel.find(filter).sort({ dateKey: 1 }).limit(ROW_LIMIT).lean();
    const enrichedRows = await this.enrichment.enrichBatch(
      ctx,
      docs.map((doc) => ({
        sourceType: 'ads' as const,
        sourceRef: {
          usageRowId: String(doc._id),
          flightNo: doc.flightNo,
        },
        operationalData: doc as unknown as Record<string, unknown>,
        customerCode: String(doc.customerName ?? '').slice(0, 10).toUpperCase(),
        serviceCode: doc.serviceCode || 'Scheduled - Equipment - GPU-90KV',
        billingDate: doc.date,
      })),
    );

    const ingestedUsageIds = await this.preparation.getIngestedAdsUsageRowIds(
      ctx,
      fromYmd,
      ['ads'],
    );
    const marked = enrichedRows
      .filter((row) => row.rateMatch?.omitBmeFromAds !== true)
      .map((row) => {
        const usageRowId = String(row.sourceRef?.usageRowId ?? '').trim();
        return {
          ...row,
          sentToPreparation: Boolean(usageRowId && ingestedUsageIds.has(usageRowId)),
        };
      });

    return this.enrichment.wrapResponse('ads', marked, fromYmd, toYmd);
  }

  async listIndexedForMis(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
  ): Promise<BillingSourceRow[]> {
    if (usesFhrBackedAds(ctx)) {
      return this.maaFhrAds.listIndexedForMis(ctx, query);
    }

    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const filter: Record<string, unknown> = {
      ...stationFilter(ctx),
      dateKey: { $gte: fromYmd, $lte: toYmd },
    };
    if (query.customerCode) {
      filter.customerName = new RegExp(query.customerCode, 'i');
    }
    const docs = await this.adsModel.find(filter).sort({ dateKey: 1 }).limit(ROW_LIMIT).lean();
    const mapped: FhrAdsMappedRow[] = docs.map((doc) => {
      const raw = doc as unknown as Record<string, unknown>;
      const customerCode = String(doc.customerName ?? '')
        .slice(0, 10)
        .toUpperCase();
      return {
        sourceType: 'equipment',
        sourceRef: {
          serialNo: String(doc._id),
          flightNo: String(doc.flightNo ?? ''),
          usageRowId: String(doc._id),
        },
        operationalData: {
          ...raw,
          particular: doc.serviceCode,
          qty: Number(raw.qty ?? raw.quantity ?? 1),
          customerCode,
          customerName: doc.customerName,
        },
        customerCode,
        serviceCode: doc.serviceCode || 'Scheduled - Equipment - GPU-90KV',
        billingDate: String(doc.date ?? ''),
      };
    });
    const usage = dedupeAdsMappedRows(mapped);
    const samples = indexAdsMisRateSamples(usage);
    const enrichedSamples = await this.enrichment.enrichBatch(
      ctx,
      samples.map((row) => ({
        sourceType: 'ads' as const,
        sourceRef: row.sourceRef,
        operationalData: row.operationalData,
        customerCode: row.customerCode,
        serviceCode: row.serviceCode,
        billingDate: row.billingDate,
      })),
    );
    return applyIndexedAdsRatesToUsage(usage, adsMisRateMap(samples, enrichedSamples)).filter(
      (row) => row.rateMatch?.omitBmeFromAds !== true,
    );
  }

  async listAircraftTypesForCustomer(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
  ): Promise<{ data: string[] }> {
    if (usesFhrBackedAds(ctx)) {
      return this.maaFhrAds.listAircraftTypesForCustomer(ctx, query);
    }

    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const customerFilterCode = String(query.customerCode ?? '').trim().toUpperCase();
    if (!customerFilterCode) {
      throw new BadRequestException('customerCode is required');
    }

    const filter: Record<string, unknown> = {
      ...stationFilter(ctx),
      dateKey: { $gte: fromYmd, $lte: toYmd },
      customerName: new RegExp(customerFilterCode, 'i'),
    };
    const docs = await this.adsModel.find(filter).limit(ROW_LIMIT).lean();
    const types = new Set<string>();
    for (const doc of docs) {
      const raw = doc as unknown as Record<string, unknown>;
      const ac = String(raw.aircraftType ?? raw.TypeCraft ?? raw.typeCraft ?? '')
        .trim()
        .toUpperCase();
      if (ac) types.add(ac);
    }
    return {
      data: [...types].sort((a, b) => a.localeCompare(b)),
    };
  }
}

@Injectable()
export class BillingSourcesRafService {
  constructor(
    @InjectModel(CreationRafRead.name)
    private readonly creationRafModel: Model<CreationRafReadDocument>,
    @InjectModel(AdvanceRafAirlineRead.name)
    private readonly rafAirlineModel: Model<AdvanceRafAirlineReadDocument>,
    @InjectModel(RafCollectionRead.name)
    private readonly rafCollectionModel: Model<RafCollectionReadDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    @Inject(forwardRef(() => BillingPreparationService))
    private readonly preparation: BillingPreparationService,
  ) {}

  /**
   * RAF billed-services source — aligned with Flights → Ramp Assistance Forms:
   * 1) Advance → Gateway → RAF Airline master (which airlines + cleaning kinds)
   * 2) Creation → RAF flights in the billing window
   * 3) `raf_collection.rafCleaningServices` for cleaning lines (when master flags enabled)
   * 4) `raf_collection.rafAdhocDetails.services` for equipment / manpower / service lines
   *
   * Equipment rows still appear when the airline master has all cleaning flags off.
   * If Advance RAF Airline is empty, flights with adhoc equipment still list using
   * the creation-raf airline identity (so seeded usage is never silently dropped).
   */
  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const customerFilter = normalizeBillingCustomerCode(query.customerCode);
    const rafAirlines = await this.loadRafAirlineMaster(ctx);

    const operationDates = enumerateDdMmYyyyFromYmdRange(fromYmd, toYmd);
    const creationFlights = await this.creationRafModel
      .find(
        StationScope.filter(
          {
            $or: [
              { date: { $in: operationDates } },
              { date2: { $in: operationDates } },
              { operationDate: { $in: operationDates } },
            ],
          },
          ctx,
        ),
      )
      .select({
        serialNo: 1,
        airlines: 1,
        flightNo: 1,
        acType: 1,
        airlineCode: 1,
        date: 1,
        date2: 1,
        operationDate: 1,
        categoryOfFlight: 1,
        stationCode: 1,
      })
      .limit(ROW_LIMIT)
      .lean();

    const serialNums = [
      ...new Set(
        creationFlights
          .map((row) => Number(row.serialNo))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    const fhrBySerial = await this.loadRafCollectionBySerial(ctx, serialNums);

    type EnrichInput = EnrichSourceInput;
    const enrichInputs: EnrichInput[] = [];

    for (const flight of creationFlights) {
      const serialNum = Number(flight.serialNo);
      if (!Number.isFinite(serialNum) || serialNum <= 0) continue;
      const serial = String(serialNum);
      const airlineName = String(flight.airlines ?? '').trim();
      const airlineCode = String(flight.airlineCode ?? '').trim();
      const master =
        matchRafAirlineMaster(rafAirlines, airlineName, airlineCode) ??
        syntheticRafAirlineMaster(airlineName, airlineCode);
      if (!master) continue;

      const billingDate =
        ddMmYyyyToYmd(
          String(flight.operationDate ?? flight.date ?? flight.date2 ?? ''),
        ) ?? null;
      if (!billingDate || billingDate < fromYmd || billingDate > toYmd) continue;

      const customerCode =
        normalizeBillingCustomerCode(flight.airlineCode) ||
        normalizeBillingCustomerCode(master.airlineCode) ||
        resolveBillingCustomerCode({}, {}, String(flight.flightNo ?? ''));
      if (customerFilter && customerCode !== customerFilter) continue;

      const fhr = fhrBySerial.get(serial);
      const cleaningStore = readRafCleaningStore(fhr);
      const adhocServices = readRafAdhocServices(fhr);
      const opBase = buildRafOperationalSnapshot(flight, master, billingDate, fhr);

      for (const kind of RAF_CLEANING_KINDS) {
        if (!isRafCleaningKindEnabled(master, kind)) continue;
        const entry = cleaningStore?.[kind.payloadKey];
        const entryRec =
          entry && typeof entry === 'object' && !Array.isArray(entry)
            ? (entry as Record<string, unknown>)
            : {};
        const filled = isRafCleaningEntryFilled(entry);

        enrichInputs.push({
          sourceType: 'raf',
          sourceRef: {
            serialNo: serial,
            flightNo: String(flight.flightNo ?? ''),
            usageRowId: `${serial}:raf:${kind.id}`,
          },
          operationalData: {
            ...opBase,
            particular: kind.label,
            adsParticular: kind.label,
            rafCleaningKind: kind.id,
            rafCleaningLabel: kind.label,
            rafAirlineName: master.airline,
            billingDateYmd: billingDate,
            cleaningFromDate: String(entryRec.fromDate ?? '').trim(),
            cleaningFromTime: String(entryRec.fromTime ?? '').trim(),
            cleaningToDate: String(entryRec.toDate ?? '').trim(),
            cleaningToTime: String(entryRec.toTime ?? '').trim(),
            cleaningDuration: String(entryRec.duration ?? '').trim(),
            rafCleaningFilled: filled,
          },
          customerCode,
          serviceCode: kind.label,
          billingDate,
        });
      }

      adhocServices.forEach((svc, idx) => {
        const particular =
          String(svc.particular ?? svc.service ?? svc.equipmentCode ?? '').trim();
        if (!particular) return;
        const equipmentCode = String(
          svc.equipmentCode ?? svc.code ?? '',
        ).trim();
        const kindLabel = String(svc.kind ?? 'equipment').trim() || 'equipment';
        const kindTitle =
          kindLabel.charAt(0).toUpperCase() + kindLabel.slice(1).toLowerCase();
        const serviceCode =
          String(svc.serviceCode ?? '').trim() ||
          (equipmentCode
            ? `RAF - ${kindTitle} - ${equipmentCode}`
            : particular);
        const usageHours = Number(svc.usageHours);
        const quantity = Number(svc.quantity);
        const uses = String(svc.uses ?? '').trim();
        const rowId =
          String(svc.id ?? '').trim() || `${serial}:raf-eq:${idx + 1}`;

        enrichInputs.push({
          sourceType: 'raf',
          sourceRef: {
            serialNo: serial,
            flightNo: String(flight.flightNo ?? ''),
            usageRowId: rowId.startsWith(`${serial}:`)
              ? rowId
              : `${serial}:raf-eq:${rowId}`,
          },
          operationalData: {
            ...opBase,
            particular,
            adsParticular: particular,
            equipmentCode,
            equipment_name: particular,
            equipmentName: particular,
            rafItemKind: kindLabel,
            rafAirlineName: master.airline,
            billingDateYmd: billingDate,
            usageHours:
              Number.isFinite(usageHours) && usageHours > 0
                ? usageHours
                : undefined,
            quantity:
              Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
            uses,
            fromDate: String(svc.fromDate ?? '').trim(),
            fromTime: String(svc.fromTime ?? '').trim(),
            toDate: String(svc.toDate ?? '').trim(),
            toTime: String(svc.toTime ?? '').trim(),
            uom: String(svc.unit ?? svc.uom ?? '').trim(),
            remarks: String(svc.remarks ?? '').trim(),
          },
          customerCode,
          serviceCode,
          billingDate,
        });
      });
    }

    const rows = await this.enrichment.enrichBatch(ctx, enrichInputs);
    const ingestedUsageIds = await this.preparation.getIngestedAdsUsageRowIds(
      ctx,
      fromYmd,
      ['raf'],
      toYmd,
    );
    const marked = rows.map((row) => {
      const usageRowId = String(row.sourceRef?.usageRowId ?? '').trim();
      return {
        ...row,
        sentToPreparation: Boolean(usageRowId && ingestedUsageIds.has(usageRowId)),
      };
    });

    return this.enrichment.wrapResponse('raf', marked, fromYmd, toYmd);
  }

  /** Advance → Gateway → RAF Airline rows for billing Customer filter dropdown. */
  async listAirlines(ctx: StationScopeContext) {
    const rows = await this.loadRafAirlineMaster(ctx);
    const byCode = new Map<
      string,
      {
        customerCode: string;
        name: string;
        deepCleaning: boolean;
        nightHaltCleaning: boolean;
        exteriorCleaning: boolean;
      }
    >();
    for (const row of rows) {
      const customerCode =
        row.airlineCode || normalizeRafAirlineKey(row.airline).toUpperCase();
      if (!customerCode && !row.airline) continue;
      byCode.set(customerCode || normalizeRafAirlineKey(row.airline).toUpperCase(), {
        customerCode: customerCode || normalizeRafAirlineKey(row.airline).toUpperCase(),
        name: row.airline || row.airlineCode,
        deepCleaning: row.deepCleaning,
        nightHaltCleaning: row.nightHaltCleaning,
        exteriorCleaning: row.exteriorCleaning,
      });
    }

    // Also expose airlines that have Creation → RAF flights (seeded equipment may
    // exist before Advance RAF Airline master is fully filled).
    const creationAirlines = await this.creationRafModel
      .find(StationScope.filter({}, ctx))
      .select({ airlines: 1, airlineCode: 1 })
      .lean();
    for (const flight of creationAirlines) {
      const airlineName = String(flight.airlines ?? '').trim();
      const airlineCode = String(flight.airlineCode ?? '').trim().toUpperCase();
      const customerCode =
        normalizeBillingCustomerCode(airlineCode) ||
        normalizeRafAirlineKey(airlineName).toUpperCase();
      if (!customerCode) continue;
      if (byCode.has(customerCode)) continue;
      byCode.set(customerCode, {
        customerCode,
        name: airlineName || airlineCode,
        deepCleaning: false,
        nightHaltCleaning: false,
        exteriorCleaning: false,
      });
    }

    const data = [...byCode.values()].sort((a, b) =>
      a.customerCode.localeCompare(b.customerCode, undefined, { sensitivity: 'base' }),
    );
    return { success: true, data };
  }

  private async loadRafAirlineMaster(
    ctx: StationScopeContext,
  ): Promise<RafAirlineMasterRow[]> {
    const docs = await this.rafAirlineModel
      .find(StationScope.filter({}, ctx))
      .select({
        airline: 1,
        airlineCode: 1,
        deepCleaning: 1,
        nightHaltCleaning: 1,
        exteriorCleaning: 1,
      })
      .lean();
    return docs
      .map((doc) => ({
        airline: String(doc.airline ?? '').trim(),
        airlineCode: String(doc.airlineCode ?? '').trim().toUpperCase(),
        deepCleaning: Boolean(doc.deepCleaning),
        nightHaltCleaning: Boolean(doc.nightHaltCleaning),
        exteriorCleaning: Boolean(doc.exteriorCleaning),
      }))
      .filter((row) => row.airline || row.airlineCode);
  }

  private async loadRafCollectionBySerial(
    ctx: StationScopeContext,
    serialNums: number[],
  ): Promise<Map<string, Record<string, unknown>>> {
    if (serialNums.length === 0) return new Map();
    const docs = await this.rafCollectionModel
      .find(
        StationScope.filter(
          {
            $or: [
              { SerialNo: { $in: serialNums } },
              { flightSerialNumber: { $in: serialNums } },
            ],
          },
          ctx,
        ),
      )
      .select({
        SerialNo: 1,
        flightSerialNumber: 1,
        mainDetails: 1,
        rafCleaningServices: 1,
        rafAdhocDetails: 1,
      })
      .lean();
    const out = new Map<string, Record<string, unknown>>();
    for (const doc of docs) {
      const serial = String(
        doc.SerialNo ?? doc.flightSerialNumber ?? '',
      ).trim();
      if (serial) out.set(serial, doc as unknown as Record<string, unknown>);
    }
    return out;
  }
}

const RAF_CLEANING_KINDS = [
  { id: 'deep', payloadKey: 'deep', label: 'Deep Cleaning', flag: 'deepCleaning' as const },
  {
    id: 'night-halt',
    payloadKey: 'nightHalt',
    label: 'Night Halt Cleaning',
    flag: 'nightHaltCleaning' as const,
  },
  { id: 'exterior', payloadKey: 'exterior', label: 'Exterior Cleaning', flag: 'exteriorCleaning' as const },
] as const;

type RafAirlineMasterRow = {
  airline: string;
  airlineCode: string;
  deepCleaning: boolean;
  nightHaltCleaning: boolean;
  exteriorCleaning: boolean;
};

function normalizeRafAirlineKey(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchRafAirlineMaster(
  masterRows: RafAirlineMasterRow[],
  airlineName: string,
  airlineCode: string,
): RafAirlineMasterRow | null {
  const nameKey = normalizeRafAirlineKey(airlineName);
  const code = String(airlineCode ?? '').trim().toUpperCase();
  for (const row of masterRows) {
    if (nameKey && normalizeRafAirlineKey(row.airline) === nameKey) return row;
    if (code && row.airlineCode === code) return row;
    if (nameKey && normalizeRafAirlineKey(row.airlineCode) === nameKey) return row;
  }
  return null;
}

/** Fallback when Advance RAF Airline has no row — still bill equipment from FHR. */
function syntheticRafAirlineMaster(
  airlineName: string,
  airlineCode: string,
): RafAirlineMasterRow | null {
  const airline = String(airlineName ?? '').trim();
  const code = String(airlineCode ?? '').trim().toUpperCase();
  if (!airline && !code) return null;
  return {
    airline: airline || code,
    airlineCode: code || normalizeRafAirlineKey(airline).toUpperCase(),
    deepCleaning: false,
    nightHaltCleaning: false,
    exteriorCleaning: false,
  };
}

function isRafCleaningKindEnabled(
  master: RafAirlineMasterRow,
  kind: (typeof RAF_CLEANING_KINDS)[number],
): boolean {
  return Boolean(master[kind.flag]);
}

function readRafCleaningStore(
  fhr: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const raw = fhr?.rafCleaningServices;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function readRafAdhocServices(
  fhr: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const raw = fhr?.rafAdhocDetails;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const services = (raw as Record<string, unknown>).services;
  if (!Array.isArray(services)) return [];
  return services.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row),
  );
}

function buildRafOperationalSnapshot(
  flight: CreationRafRead,
  master: RafAirlineMasterRow,
  billingDateYmd: string,
  fhr?: Record<string, unknown>,
): Record<string, unknown> {
  const serialNum = Number(flight.serialNo);
  if (fhr && Number.isFinite(serialNum) && serialNum > 0) {
    const fromFhr = mapFhrToInvoicingFlightReportRow(serialNum, fhr);
    return {
      ...fromFhr,
      billingDateYmd,
      customerName: master.airline || fromFhr.customerName,
      customerCode:
        normalizeBillingCustomerCode(master.airlineCode) ||
        normalizeBillingCustomerCode(flight.airlineCode) ||
        fromFhr.customerCode,
    };
  }
  return {
    flightNoEquipmentNo: String(flight.flightNo ?? ''),
    customerName: master.airline || String(flight.airlines ?? ''),
    customerCode:
      normalizeBillingCustomerCode(master.airlineCode) ||
      normalizeBillingCustomerCode(flight.airlineCode),
    aircraftType: String(flight.acType ?? ''),
    staDate: billingDateYmd,
    billingDateYmd,
    categoryOfFlight: String(flight.categoryOfFlight ?? ''),
  };
}

function isRafCleaningEntryFilled(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  const from =
    String(o.fromDate ?? '').trim() || String(o.fromTime ?? '').trim();
  const to = String(o.toDate ?? '').trim() || String(o.toTime ?? '').trim();
  return Boolean(from && to);
}

@Injectable()
export class BillingSourcesEquipmentService {
  constructor(
    @InjectModel(AdsUsageData.name)
    private readonly adsModel: Model<AdsUsageDataDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly maaFhrAds: BillingSourcesMaaFhrAdsService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    if (usesFhrBackedAds(ctx)) {
      return this.maaFhrAds.list(ctx, query, 'equipment');
    }

    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const filter: Record<string, unknown> = {
      ...stationFilter(ctx),
      dateKey: { $gte: fromYmd, $lte: toYmd },
      serviceCode: /Equipment/i,
    };

    const docs = await this.adsModel.find(filter).sort({ dateKey: 1 }).limit(ROW_LIMIT).lean();
    const rows = await Promise.all(
      docs.map((doc) =>
        this.enrichment.enrich(ctx, {
          sourceType: 'equipment',
          sourceRef: { usageRowId: String(doc._id), flightNo: doc.flightNo },
          operationalData: doc as unknown as Record<string, unknown>,
          customerCode: String(doc.customerName ?? '').slice(0, 10).toUpperCase(),
          serviceCode: doc.serviceCode,
          billingDate: doc.date,
        }),
      ),
    );

    return this.enrichment.wrapResponse('equipment', rows, fromYmd, toYmd);
  }
}

@Injectable()
export class BillingSourcesManpowerService {
  constructor(
    @InjectModel(AdsUsageData.name)
    private readonly adsModel: Model<AdsUsageDataDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly maaFhrAds: BillingSourcesMaaFhrAdsService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    if (usesFhrBackedAds(ctx)) {
      return this.maaFhrAds.list(ctx, query, 'manpower');
    }

    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const filter: Record<string, unknown> = {
      ...stationFilter(ctx),
      dateKey: { $gte: fromYmd, $lte: toYmd },
      serviceCode: /Manpower/i,
    };

    const docs = await this.adsModel.find(filter).limit(ROW_LIMIT).lean();
    const rows = await Promise.all(
      docs.map((doc) =>
        this.enrichment.enrich(ctx, {
          sourceType: 'manpower',
          sourceRef: { usageRowId: String(doc._id), flightNo: doc.flightNo },
          operationalData: doc as unknown as Record<string, unknown>,
          customerCode: String(doc.customerName ?? '').slice(0, 10).toUpperCase(),
          serviceCode: doc.serviceCode || 'Scheduled - Manpower - CSA',
          billingDate: doc.date,
        }),
      ),
    );

    return this.enrichment.wrapResponse('manpower', rows, fromYmd, toYmd);
  }
}
