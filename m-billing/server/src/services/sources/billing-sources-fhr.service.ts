import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import type { StationScopeContext } from '../../common/station-scope';
import { StationScope } from '../../common/station-scope';
import { isCancelledFlight, queryParamToYmd } from '../../utils/billing-date.util';
import {
  mapFhrToInvoicingFlightReportRow,
  reportDateYmd,
} from '../../utils/invoicing-flight-report.mapper';
import {
  FhrCollectionRead,
  FhrCollectionReadDocument,
  NsRawFlightData,
  NsRawFlightDataDocument,
  RawFlightDataRead,
  RawFlightDataReadDocument,
} from '../../schemas/operational.schemas';
import {
  BillingSourceEnrichmentService,
  type EnrichSourceInput,
} from './billing-source-enrichment.service';
import { BillingSourcesQueryDto } from '../../dto/billing-sources-query.dto';
import {
  buildAdsCatalogIndex,
  hasRampCleaningEvidence,
  mapFhrDocToAdsRows,
  type AdsEquipmentCatalogItem,
} from '../../shared/fhr-equipment-to-ads-row';
import { EQUIPMENT_MANPOWER_CATALOG_SERIAL } from 'src/equipment-manpower/schema/equipment-manpower.schema';

@Injectable()
export class BillingSourcesCleaningService {
  constructor(
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly enrichment: BillingSourceEnrichmentService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const catalog = buildAdsCatalogIndex(await this.loadAdsCatalogItems(ctx));
    const fhrs = await this.fhrModel
      .find(
        StationScope.filter(
          {
            staDates: { $elemMatch: { $gte: fromYmd, $lte: toYmd } },
            $or: [
              { 'rampDetails1.CleaningFr': { $exists: true, $nin: [null, ''] } },
              { 'rampDetails1.CleaningTo': { $exists: true, $nin: [null, ''] } },
              {
                'rampDetails1.cleaningStartedDate': {
                  $exists: true,
                  $nin: [null, ''],
                },
              },
              {
                'rampDetails1.cleaningClosedDate': {
                  $exists: true,
                  $nin: [null, ''],
                },
              },
              {
                'rampDetails1.cleaningStartedTime': {
                  $exists: true,
                  $nin: [null, ''],
                },
              },
              {
                'rampDetails1.cleaningClosedTime': {
                  $exists: true,
                  $nin: [null, ''],
                },
              },
            ],
          },
          ctx,
        ),
      )
      .select({
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
      })
      .limit(2000)
      .lean();

    const enrichInputs: EnrichSourceInput[] = [];
    for (const fhr of fhrs) {
      const ramp = (fhr.rampDetails1 ?? {}) as Record<string, unknown>;
      if (!hasRampCleaningEvidence(ramp)) continue;

      const mapped = mapFhrDocToAdsRows(fhr, catalog, { fromYmd, toYmd });
      for (const row of mapped) {
        const label = String(
          row.operationalData.particular ??
            row.operationalData.equipment ??
            row.operationalData.equipment_name ??
            '',
        )
          .trim()
          .toLowerCase();
        if (
          !(
            label.includes('cabin cleaning') ||
            label.includes('night halt cleaning') ||
            label.includes('deep cleaning') ||
            label.includes('interior cleaning')
          )
        ) {
          continue;
        }
        enrichInputs.push({
          sourceType: 'cleaning',
          sourceRef: row.sourceRef,
          operationalData: {
            ...row.operationalData,
            adsParticular: row.operationalData.particular,
          },
          customerCode: row.customerCode,
          serviceCode: row.serviceCode,
          billingDate: row.billingDate,
        });
      }
    }

    // One master-data load for all rows — never N× enrich() (each reloads contracts).
    const rows = await this.enrichment.enrichBatch(ctx, enrichInputs);
    return this.enrichment.wrapResponse('cleaning', rows, fromYmd, toYmd);
  }

  private async loadAdsCatalogItems(
    ctx: StationScopeContext,
  ): Promise<AdsEquipmentCatalogItem[]> {
    const col = this.connection.collection('equipmentManpower');
    const filter: Record<string, unknown> = {
      serialNo: EQUIPMENT_MANPOWER_CATALOG_SERIAL,
    };
    if (!ctx.crossStation && ctx.stationCode) {
      filter.station = ctx.stationCode;
    }
    const doc = await col.findOne(filter, { projection: { catalogItems: 1 } });
    const items: AdsEquipmentCatalogItem[] = [];
    const catalogItems = Array.isArray(doc?.catalogItems) ? doc.catalogItems : [];
    for (const raw of catalogItems) {
      const item = raw as Record<string, unknown>;
      const abbr = String(item.abbr ?? item.equipmentCode ?? '').trim();
      const description = String(
        item.description ?? item.equipmentName ?? item.name ?? '',
      ).trim();
      if (!abbr && !description) continue;
      items.push({
        abbr: abbr || description,
        description: description || abbr,
        unit_type: String(item.unit_type ?? item.unitType ?? '').trim() || undefined,
        category: String(item.category ?? '').trim() || undefined,
      });
    }
    return items;
  }
}

@Injectable()
export class BillingSourcesXxldService {
  constructor(
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectModel(RawFlightDataRead.name)
    private readonly rawModel: Model<RawFlightDataReadDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
  ) {}

  async listScheduled(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.listCancelled(ctx, query, 'xxld', true);
  }

  async listNonScheduled(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    return this.listCancelled(ctx, query, 'xxld', false);
  }

  private async listCancelled(
    ctx: StationScopeContext,
    query: BillingSourcesQueryDto,
    sourceType: 'xxld',
    scheduled: boolean,
  ) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const rawDocs = await this.rawModel
      .find(StationScope.filter({}, ctx))
      .limit(5000)
      .lean();

    const cancelledSerials: Array<{ serial: number; daily: Record<string, unknown> }> = [];
    for (const doc of rawDocs) {
      const daily = (doc.data ?? {}) as Record<string, unknown>;
      if (!isCancelledFlight(daily)) continue;
      const isScheduled = String(daily.scheduleSource ?? daily.type ?? '')
        .toLowerCase()
        .includes('schedule');
      if (scheduled !== isScheduled) continue;

      const raw = String(daily.SlNo ?? daily.serialNo ?? daily['Serial No'] ?? '').trim();
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;

      const atdYmd = reportDateYmd(daily.atdDate ?? daily.staDate);
      if (atdYmd && (atdYmd < fromYmd || atdYmd > toYmd)) continue;
      cancelledSerials.push({ serial: n, daily });
    }

    const serialNums = cancelledSerials.map((c) => c.serial);
    const fhrs = serialNums.length
      ? await this.fhrModel.find({ SerialNo: { $in: serialNums } }).lean()
      : [];
    const fhrBySerial = new Map(fhrs.map((f) => [Number(f.SerialNo), f]));

    const rows = await Promise.all(
      cancelledSerials.map(async ({ serial, daily }) => {
        const fhr = fhrBySerial.get(serial);
        const op = mapFhrToInvoicingFlightReportRow(serial, fhr, daily);
        return this.enrichment.enrich(ctx, {
          sourceType: scheduled ? 'xxld' : 'non_scheduled',
          sourceRef: { serialNo: String(serial), flightNo: String(op.flightNoEquipmentNo) },
          operationalData: { ...op, xxldRemarks: 'See Addl & XXLD Flt sheet' },
          customerCode: String(op.customerCode ?? ''),
          serviceCode: 'Cancel Scheduled Flight',
          cancelled: true,
        });
      }),
    );

    return this.enrichment.wrapResponse(
      scheduled ? 'xxld' : 'non_scheduled',
      rows,
      fromYmd,
      toYmd,
    );
  }
}

@Injectable()
export class BillingSourcesMaasService {
  constructor(
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
  ) {}

  /** MAAS escort charges — FHR remarks with MAAS keyword, mapped to meet-and-greet billing fields. */
  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const fhrs = await this.fhrModel
      .find(
        StationScope.filter(
          {
            staDates: { $elemMatch: { $gte: fromYmd, $lte: toYmd } },
            $or: [
              { 'remarks.GHRepRemarks': /MAAS/i },
              { 'remarks.AirlineRepRemarks': /MAAS/i },
            ],
          },
          ctx,
        ),
      )
      .limit(500)
      .lean();

    const rows = await Promise.all(
      fhrs.map(async (fhr) => {
        const serial = Number(fhr.SerialNo);
        const op = mapFhrToInvoicingFlightReportRow(serial, fhr);
        const remarks = `${op.bwfsRepRemarksI ?? ''} ${op.airlineRepRemarksI ?? ''}`;
        const hourMatch = /(\d{1,2})/.exec(
          String(op.atdTime ?? op.staTime ?? op.ataTime ?? ''),
        );
        const hour = hourMatch ? Number(hourMatch[1]) : NaN;
        const shift =
          Number.isFinite(hour) && hour >= 6 && hour < 18
            ? 'Day (06:00-18:00)'
            : Number.isFinite(hour)
              ? 'Night (18:00-06:00)'
              : '';
        return this.enrichment.enrich(ctx, {
          sourceType: 'maas',
          sourceRef: {
            serialNo: String(serial),
            flightNo: String(op.flightNoEquipmentNo ?? ''),
          },
          operationalData: {
            ...op,
            serviceDate: String(op.atdDate ?? op.staDate ?? ''),
            shift,
            serviceType: /group/i.test(remarks) ? 'Group' : 'Single',
            staffType: 'Single',
            staffCount: '1',
            pax: String(op.flightQuantity ?? '1'),
            whiteGlove: /white\s*glove/i.test(remarks) ? 'Yes' : '',
            blueGlove: /blue\s*glove/i.test(remarks) ? 'Yes' : '',
            escortNotes: remarks.trim(),
            airlineName: String(op.customerName ?? ''),
            flightNumber: String(op.flightNoEquipmentNo ?? ''),
            flightSerial: String(serial),
          },
          customerCode: String(op.customerCode ?? ''),
          serviceCode: 'MAAS',
          atdDate: String(op.atdDate ?? ''),
        });
      }),
    );

    return this.enrichment.wrapResponse('maas', rows, fromYmd, toYmd);
  }
}

@Injectable()
export class BillingSourcesNonScheduledService {
  constructor(
    @InjectModel(NsRawFlightData.name)
    private readonly nsModel: Model<NsRawFlightDataDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
  ) {}

  async list(ctx: StationScopeContext, query: BillingSourcesQueryDto) {
    const fromYmd = queryParamToYmd(query.from);
    const toYmd = queryParamToYmd(query.to);
    if (!fromYmd || !toYmd) throw new BadRequestException('Invalid date range');

    const docs = await this.nsModel.find(StationScope.filter({}, ctx)).limit(2000).lean();
    const rows = await Promise.all(
      docs.map((doc) => {
        const data = (doc.data ?? {}) as Record<string, unknown>;
        return this.enrichment.enrich(ctx, {
          sourceType: 'non_scheduled',
          sourceRef: {
            serialNo: String(data.serialNo ?? data.SlNo ?? ''),
            flightNo: String(data.flightNo ?? ''),
          },
          operationalData: data,
          customerCode: String(data.customerCode ?? data.airlineCode ?? ''),
          serviceCode: 'Non Scheduled Flight',
          atdDate: String(data.atdDate ?? data.staDate ?? ''),
        });
      }),
    );

    const filtered = rows.filter((r) => {
      const d = reportDateYmd(r.operationalData.atdDate ?? r.operationalData.staDate);
      return d && d >= fromYmd && d <= toYmd;
    });

    return this.enrichment.wrapResponse('non_scheduled', filtered, fromYmd, toYmd);
  }
}
