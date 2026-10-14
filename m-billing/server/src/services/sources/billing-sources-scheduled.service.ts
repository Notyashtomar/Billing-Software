import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { AdvanceAircraftService } from 'src/advance-aircraft/services/advance-aircraft.service';
import type { BillingSourceRow } from '../../shared/billing-sources';
import type { StationScopeContext } from '../../common/station-scope';
import { StationScope } from '../../common/station-scope';
import { currentBillingOwnerUserId } from '../../common/billing-personal-workspace';
import {
  addDaysYmd,
  isBillingOperationalRowCancelled,
  normalizeBillingScheduledDateBasis,
  queryParamToYmd,
  scheduledFlightBillingWindowYmd,
} from '../../utils/billing-date.util';
import {
  mapFhrToInvoicingFlightReportRow,
  reportDateYmd,
} from '../../utils/invoicing-flight-report.mapper';
import { enrichScheduledFlightOperationalRow } from '../../utils/scheduled-flight-display.util';
import {
  FhrCollectionRead,
  FhrCollectionReadDocument,
} from '../../schemas/operational.schemas';
import { BillingSourceEnrichmentService } from './billing-source-enrichment.service';
import { BillingPreparationService } from '../billing-preparation.service';
import { BillingSourcesQueryDto } from '../../dto/billing-sources-query.dto';
import { BILLING_ADVANCE_ADAPTER_TOKEN } from '../../adapters/advance-invoicing.adapter';
import { FlightCancellationsService } from 'src/flight-cancellations/flight-cancellations.service';
import { preparationSourceIdentity } from '../../utils/preparation-source-identity.util';

/**
 * On FRIS integration, optionally inject AdvanceInvoicingService via
 * BillingAdvanceInvoicingAdapter for parity with /advance-invoicing/scheduled-flight-data.
 */
export interface AdvanceInvoicingAdapter {
  listScheduledFlightReportData(
    params: BillingSourcesQueryDto,
    station: StationScopeContext,
  ): Promise<{ data: { rows: Record<string, unknown>[] } }>;
}

@Injectable()
export class BillingSourcesScheduledService {
  private static readonly USE_ADVANCE_ADAPTER =
    String(process.env.BILLING_SCHEDULED_USE_ADVANCE_ADAPTER ?? '')
      .trim()
      .toLowerCase() === 'true';
  private static readonly ATD_PREFETCH_DAYS = Number(
    process.env.BILLING_SCHEDULED_ATD_PREFETCH_DAYS ?? '3',
  );
  private static readonly SCHEDULED_ROWS_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly CANCELLATION_ROWS_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly PREPARATION_SNAPSHOT_CACHE_TTL_MS = 15_000;
  private readonly scheduledRowsCache = new Map<
    string,
    { expiresAt: number; rows: BillingSourceRow[] }
  >();

  private readonly scheduledRowsInflight = new Map<string, Promise<BillingSourceRow[]>>();
  private readonly cancellationRowsCache = new Map<
    string,
    {
      expiresAt: number;
      rows: Awaited<
        ReturnType<FlightCancellationsService['findByCancelledDateRange']>
      >;
    }
  >();
  private readonly cancellationRowsInflight = new Map<
    string,
    Promise<Awaited<ReturnType<FlightCancellationsService['findByCancelledDateRange']>>>
  >();
  private readonly preparationSnapshotCache = new Map<
    string,
    { expiresAt: number; identities: Set<string> }
  >();
  private readonly preparationSnapshotInflight = new Map<string, Promise<Set<string>>>();

  constructor(
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly preparation: BillingPreparationService,
    private readonly flightCancellationsService: FlightCancellationsService,
    private readonly advanceAircraftService: AdvanceAircraftService,
    @Optional()
    @Inject(BILLING_ADVANCE_ADAPTER_TOKEN)
    private readonly advanceAdapter?: AdvanceInvoicingAdapter,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) {
      throw new BadRequestException('Invalid date range');
    }
    if (fromYmd > toYmd) {
      throw new BadRequestException('From date must be on or before To date');
    }

    const dateBasis: BillingSourcesQueryDto['dateBasis'] =
      normalizeBillingScheduledDateBasis(query.dateBasis);
    const rows = await this.loadScheduledRowsCached(ctx, query, dateBasis, fromYmd, toYmd);
    const marked = await this.markPreparationSent(ctx, rows, fromYmd);
    return this.enrichment.wrapResponse(
      'scheduled_flight',
      marked,
      fromYmd,
      toYmd,
      dateBasis,
    );
  }

  private async loadScheduledRowsCached(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
    dateBasis: BillingSourcesQueryDto['dateBasis'],
    fromYmd: string,
    toYmd: string,
  ): Promise<BillingSourceRow[]> {
    const useAdvanceAdapter =
      BillingSourcesScheduledService.USE_ADVANCE_ADAPTER &&
      Boolean(this.advanceAdapter);
    const key = [
      String(ctx.stationCode ?? '').trim().toUpperCase(),
      dateBasis,
      fromYmd,
      toYmd,
      String(query.customerCode ?? '').trim().toUpperCase() || '__ALL__',
      useAdvanceAdapter ? 'adapter' : 'native',
    ].join('|');
    const now = Date.now();
    const cached = this.scheduledRowsCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.rows;
    }

    const inflight = this.scheduledRowsInflight.get(key);
    if (inflight) return inflight;

    const loadPromise = (async () => {
      let rows: BillingSourceRow[];
      if (useAdvanceAdapter && this.advanceAdapter) {
        const adapted = await this.advanceAdapter.listScheduledFlightReportData(
          { ...query, dateBasis: dateBasis ?? undefined },
          ctx,
        );
        const mapped = this.filterMappedByCustomerCode(
          adapted.data.rows,
          query.customerCode,
        );
        rows = await this.enrichMappedRows(ctx, mapped, fromYmd, toYmd, dateBasis);
      } else {
        const fetchFrom =
          dateBasis === 'atd-date'
            ? addDaysYmd(fromYmd, -BillingSourcesScheduledService.ATD_PREFETCH_DAYS)
            : fromYmd;
        const fetchTo =
          dateBasis === 'atd-date'
            ? addDaysYmd(toYmd, BillingSourcesScheduledService.ATD_PREFETCH_DAYS)
            : toYmd;
        const usesRawDailyJoin = dateBasis !== 'schedule-date';
        const staDateCandidates = this.buildStaDateCandidates(fetchFrom, fetchTo);
        const customerFilterCode = String(query.customerCode ?? '')
          .trim()
          .toUpperCase();
        const dateFilter: Record<string, unknown> = {
          $or: [
            { staDates: { $in: staDateCandidates } },
            { 'mainDetails.STADate': { $in: staDateCandidates } },
            { 'mainDetails.staDate': { $in: staDateCandidates } },
            { 'mainDetails.STA_Date': { $in: staDateCandidates } },
            { 'terminalDetails.STADate': { $in: staDateCandidates } },
            { 'terminalDetails.staDate': { $in: staDateCandidates } },
            { 'terminalDetails.STA_Date': { $in: staDateCandidates } },
          ],
        };
        const customerFilter: Record<string, unknown> | null = customerFilterCode
          ? {
              $or: [
                { 'mainDetails.Arline_Code': customerFilterCode },
                { 'mainDetails.airlineCode': customerFilterCode },
                { 'mainDetails.AirlineCode': customerFilterCode },
              ],
            }
          : null;
        const combinedFilter: Record<string, unknown> = customerFilter
          ? { $and: [dateFilter, customerFilter] }
          : dateFilter;
        const fhrFilter = StationScope.filter(combinedFilter, ctx);
        const aggregatePipeline: PipelineStage[] = [
          { $match: fhrFilter },
        ];
        if (usesRawDailyJoin) {
          aggregatePipeline.push({
            $lookup: {
              from: 'raw_flight_data',
              let: { serialAsString: { $toString: '$SerialNo' } },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        { $eq: ['$data.Serial No', '$$serialAsString'] },
                        { $eq: ['$data.SlNo', '$$serialAsString'] },
                        { $eq: ['$data.serialNo', '$$serialAsString'] },
                      ],
                    },
                  },
                },
                { $project: { _id: 0, data: 1 } },
                { $limit: 1 },
              ],
              as: 'rawRows',
            },
          });
        }
        aggregatePipeline.push({
          $project: {
            _id: 0,
            SerialNo: 1,
            mainDetails: 1,
            terminalDetails: 1,
            rampDetails1: 1,
            loadControlDetails: 1,
            remarks: 1,
            equipmentManpower: 1,
            rawData: usesRawDailyJoin
              ? {
                  $ifNull: [{ $arrayElemAt: ['$rawRows.data', 0] }, {}],
                }
              : { $literal: {} },
          },
        });

        const fhrs = await this.fhrModel
          .aggregate<
            Record<string, unknown> & {
              SerialNo?: unknown;
              mainDetails?: Record<string, unknown>;
              terminalDetails?: Record<string, unknown>;
              rampDetails1?: Record<string, unknown>;
              loadControlDetails?: Record<string, unknown>;
              remarks?: Record<string, unknown>;
              equipmentManpower?: Record<string, unknown>;
              rawData?: Record<string, unknown>;
            }
          >(aggregatePipeline)
          .exec();
        const rawBySerial = new Map<number, Record<string, unknown>>();
        for (const doc of fhrs) {
          const data = (doc.rawData ?? {}) as Record<string, unknown>;
          const raw = String(data.SlNo ?? data.serialNo ?? data['Serial No'] ?? '').trim();
          const n = Number(raw);
          if (Number.isFinite(n) && n > 0) rawBySerial.set(n, data);
        }

        const mapped: Record<string, unknown>[] = [];

        for (const fhr of fhrs) {
          const serial = Number(fhr.SerialNo);
          const daily = usesRawDailyJoin ? (rawBySerial.get(serial) ?? {}) : {};
          if (customerFilterCode) {
            const rowCustomer = String(
              daily.customerCode ??
                daily['Airline Code'] ??
                daily.airlineCode ??
                (fhr.mainDetails as Record<string, unknown> | undefined)?.Arline_Code ??
                (fhr.mainDetails as Record<string, unknown> | undefined)?.airlineCode ??
                (fhr.mainDetails as Record<string, unknown> | undefined)?.AirlineCode ??
                '',
            )
              .trim()
              .toUpperCase();
            if (rowCustomer && rowCustomer !== customerFilterCode) continue;
          }

          if (usesRawDailyJoin) {
            const atdYmd = reportDateYmd(
              (fhr.mainDetails as Record<string, unknown> | undefined)?.ATDDate ??
                (fhr.mainDetails as Record<string, unknown> | undefined)?.atdDate ??
                daily.atdDate,
            );
            const exportedYmd = reportDateYmd(
              daily.exportedDate ?? daily['Exported Date'] ?? daily.exportedOn,
            );
            const scheduleYmd = reportDateYmd(daily.scheduleDate ?? daily['STA Date']);

            const windowYmd = scheduledFlightBillingWindowYmd(
              daily,
              {
                atdYmd,
                staYmd:
                  reportDateYmd(daily.staDate ?? daily.STADate ?? daily['STA Date']) ??
                  reportDateYmd(
                    (fhr.terminalDetails as Record<string, unknown> | undefined)?.STADate,
                  ),
                stdYmd: reportDateYmd(daily.stdDate ?? daily.STDDate ?? daily['STD Date']),
                exportedYmd,
                scheduleYmd,
              },
              dateBasis,
            );
            if (!windowYmd || windowYmd < fromYmd || windowYmd > toYmd) continue;
          }

          const row = mapFhrToInvoicingFlightReportRow(serial, fhr, daily);
          if (usesRawDailyJoin) {
            const exportedNav = String(
              daily.exportedNAV ?? daily.ExportedNAV ?? daily['Exported NAV'] ?? '',
            ).trim();
            if (exportedNav) row.exportedNav = exportedNav;
          }
          mapped.push(row);
        }

        const filtered = this.filterMappedByCustomerCode(mapped, query.customerCode);

        filtered.sort((a, b) => String(a.atdDate ?? '').localeCompare(String(b.atdDate ?? '')));

        rows = await this.enrichMappedRows(ctx, filtered, fromYmd, toYmd, dateBasis);
      }

      this.scheduledRowsCache.set(key, {
        expiresAt: Date.now() + BillingSourcesScheduledService.SCHEDULED_ROWS_CACHE_TTL_MS,
        rows,
      });
      return rows;
    })();

    this.scheduledRowsInflight.set(key, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.scheduledRowsInflight.delete(key);
    }
  }

  private buildStaDateCandidates(fromYmd: string, toYmd: string): string[] {
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

  private async markPreparationSent(
    ctx: StationScopeContext,
    rows: BillingSourceRow[],
    _periodStartYmd: string,
  ): Promise<BillingSourceRow[]> {
    const ingestedIdentities = await this.loadPreparationSerialsCached(
      ctx,
      undefined,
      'scheduled_flight',
    );

    const marked = rows.map((row) => {
      const identity = preparationSourceIdentity({
        sourceRef: row.sourceRef,
        operationalData: row.operationalData,
      });
      return {
        ...row,
        sentToPreparation: Boolean(identity && ingestedIdentities.has(identity)),
      };
    });

    return this.sortUnsentFirst(marked);
  }

  private async loadPreparationSerialsCached(
    ctx: StationScopeContext,
    periodStartYmd: string | undefined,
    sourceType: string,
  ): Promise<Set<string>> {
    const key = [
      String(ctx.stationCode ?? '').trim().toUpperCase(),
      currentBillingOwnerUserId() || '__station__',
      sourceType,
      periodStartYmd ?? '__ALL_PERIODS__',
    ].join('|');
    const now = Date.now();
    const cached = this.preparationSnapshotCache.get(key);
    if (cached && cached.expiresAt > now) return cached.identities;

    const inflight = this.preparationSnapshotInflight.get(key);
    if (inflight) return inflight;

    const loadPromise = (async () => {
      const ingested = await this.preparation.getIngestedSourceSnapshots(
        ctx,
        periodStartYmd ? new Date(periodStartYmd) : undefined,
        sourceType,
      );
      const identities = new Set(
        ingested.map((existing) => preparationSourceIdentity(existing)).filter(Boolean),
      );
      this.preparationSnapshotCache.set(key, {
        expiresAt:
          Date.now() +
          BillingSourcesScheduledService.PREPARATION_SNAPSHOT_CACHE_TTL_MS,
        identities,
      });
      return identities;
    })();

    this.preparationSnapshotInflight.set(key, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.preparationSnapshotInflight.delete(key);
    }
  }

  private sortUnsentFirst(rows: BillingSourceRow[]): BillingSourceRow[] {
    return [...rows].sort((a, b) => {
      const aSent = a.sentToPreparation ? 1 : 0;
      const bSent = b.sentToPreparation ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return String(a.operationalData.atdDate ?? '').localeCompare(
        String(b.operationalData.atdDate ?? ''),
      );
    });
  }

  private filterMappedByCustomerCode(
    rows: Record<string, unknown>[],
    customerCode?: string,
  ): Record<string, unknown>[] {
    const code = customerCode?.trim().toUpperCase();
    if (!code) return rows;
    return rows.filter((r) => String(r.customerCode ?? '').toUpperCase() === code);
  }

  private async enrichMappedRows(
    ctx: StationScopeContext,
    mapped: Record<string, unknown>[],
    fromYmd: string,
    toYmd: string,
    dateBasis?: string,
  ): Promise<BillingSourceRow[]> {
    if (mapped.length === 0) return [];
    const catalog = await this.advanceAircraftService.getActiveAircraftBodyMap();
    const enriched = mapped.map((row) =>
      enrichScheduledFlightOperationalRow(
        row,
        catalog,
        (c, typeCraft) =>
          this.advanceAircraftService.matchCatalogAircraftBody(c, typeCraft),
      ),
    );
    const serials = [
      ...new Set(
        enriched
          .map((row) => String(row.serialNumber ?? '').trim())
          .filter(Boolean),
      ),
    ];
    const cancellations = await this.loadCancellationsCached(
      fromYmd,
      toYmd,
      ctx,
      serials,
    );
    const cancellationBySerial = new Map(
      cancellations.map((row) => [
        `${String(row.instanceSerial ?? '').trim()}|${String(row.cancelledDate ?? '').trim()}`,
        row,
      ]),
    );

    const inputs = enriched.map((op) => {
      const flightNo = String(op.flightNoEquipmentNo ?? '');
      const opRecord = op as Record<string, unknown>;
      const cancelled = isBillingOperationalRowCancelled(opRecord, flightNo);
      const cancellationKey = `${String(op.serialNumber ?? '').trim()}|${String(op.staDate ?? '').trim()}`;
      const cancellation = cancellationBySerial.get(cancellationKey);
      const atdYmd = reportDateYmd(op.atdDate);
      const ataYmd = reportDateYmd(
        op.ataDate ?? op.ATADate ?? op['ATA Date'],
      );
      const staYmd = reportDateYmd(
        op.staDate ?? op.STADate ?? op['STA Date'],
      );
      const stdYmd = reportDateYmd(
        op.stdDate ?? op.STDDate ?? op['STD Date'],
      );
      const billingDateYmd = scheduledFlightBillingWindowYmd(
        opRecord,
        {
          atdYmd: atdYmd ?? ataYmd,
          staYmd,
          stdYmd,
          exportedYmd: reportDateYmd(op.exportedDate ?? op['Exported Date']),
          scheduleYmd: staYmd,
        },
        normalizeBillingScheduledDateBasis(dateBasis),
      );
      return {
        sourceType: 'scheduled_flight' as const,
        sourceRef: {
          serialNo: String(op.serialNumber ?? ''),
          flightNo,
        },
        operationalData: {
          ...opRecord,
          isCancelled: cancelled,
          cancelled,
          billingDateBasis: normalizeBillingScheduledDateBasis(dateBasis),
          billingDateYmd: billingDateYmd ?? undefined,
          cancellationIntimationTime: cancellation?.intimationTime ?? '',
          cancellationCancelledDate: cancellation?.cancelledDate ?? '',
        },
        customerCode: String(op.customerCode ?? ''),
        serviceCode: 'Scheduled Flight',
        billingDate: billingDateYmd ?? undefined,
        atdDate: String(op.atdDate ?? ''),
        cancelled,
      };
    });

    return this.enrichment.enrichBatch(ctx, inputs);
  }

  private async loadCancellationsCached(
    fromYmd: string,
    toYmd: string,
    ctx: StationScopeContext,
    serials: string[] = [],
  ): Promise<Awaited<ReturnType<FlightCancellationsService['findByCancelledDateRange']>>> {
    const normalizedSerials = [...new Set(serials.map((s) => String(s).trim()).filter(Boolean))].sort();
    const key = [
      String(ctx.stationCode ?? '').trim().toUpperCase(),
      fromYmd,
      toYmd,
      normalizedSerials.length > 0 ? normalizedSerials.join(',') : '__ALL__',
    ].join('|');
    const now = Date.now();
    const cached = this.cancellationRowsCache.get(key);
    if (cached && cached.expiresAt > now) return cached.rows;

    const inflight = this.cancellationRowsInflight.get(key);
    if (inflight) return inflight;

    const loadPromise =
      normalizedSerials.length > 0
        ? this.flightCancellationsService.findByCancelledDateRangeForSerials(
            fromYmd,
            toYmd,
            normalizedSerials,
            ctx,
          )
        : this.flightCancellationsService.findByCancelledDateRange(
            fromYmd,
            toYmd,
            ctx,
          );
    this.cancellationRowsInflight.set(key, loadPromise);
    try {
      const rows = await loadPromise;
      this.cancellationRowsCache.set(key, {
        expiresAt:
          Date.now() + BillingSourcesScheduledService.CANCELLATION_ROWS_CACHE_TTL_MS,
        rows,
      });
      return rows;
    } finally {
      this.cancellationRowsInflight.delete(key);
    }
  }
}
