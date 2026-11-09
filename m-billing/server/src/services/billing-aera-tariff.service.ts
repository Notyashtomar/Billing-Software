import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AERA_FLIGHT_CLASSES,
  BillingAeraTariff,
  type AeraItemRow,
  type AeraMtowRow,
  type AeraScheduledRow,
  type BillingAeraTariffDocument,
} from '../schemas/billing-aera-tariff.schema';
import { StationScope, successResponse, type StationScopeContext } from '../common/station-scope';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';

/** One station entry of api/data/Aera Rates/extracted/aera-tariffs.verified.json. */
export type AeraTariffImportRow = {
  station: string;
  orderNumber: string;
  orderDate?: string;
  isp?: string;
  airport?: string;
  airportOperator?: string;
  controlPeriod: { label?: string; from: string; to: string };
  effectiveFrom: string;
  currency?: string;
  financialYears: string[];
  cargoRateColumn?: 'ramp' | 'full';
  scheduled: AeraScheduledRow[];
  internationalNonScheduled: AeraMtowRow[];
  itemWise?: AeraItemRow[] | Record<string, unknown>;
  rules?: string[];
  anomalies?: string[];
  verification?: string;
  sourcePages?: Record<string, unknown>;
  sourceFile?: string;
};

function parseDate(value: unknown, label: string): Date {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`AERA tariff: invalid ${label} "${String(value)}"`);
  }
  return date;
}

function assertAligned(label: string, values: Array<number | null> | null | undefined, count: number) {
  if (values == null) return;
  if (!Array.isArray(values) || values.length !== count) {
    throw new BadRequestException(
      `AERA tariff: ${label} has ${Array.isArray(values) ? values.length : 'no'} values, expected one per financial year (${count}).`,
    );
  }
  for (const v of values) {
    if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      throw new BadRequestException(`AERA tariff: ${label} contains a non-numeric rate.`);
    }
  }
}

function normalizeRow(row: AeraTariffImportRow, stationCode: string) {
  const years = (row.financialYears ?? []).map((fy) => String(fy).trim()).filter(Boolean);
  if (years.length === 0) throw new BadRequestException('AERA tariff: financialYears is required');
  for (const fy of years) {
    if (!/^\d{4}-\d{2}$/.test(fy)) {
      throw new BadRequestException(`AERA tariff: financial year "${fy}" must look like 2024-25`);
    }
  }
  const scheduled = (row.scheduled ?? []).map((line) => {
    const flightClass = String(line.flightClass ?? '').trim();
    if (!(AERA_FLIGHT_CLASSES as readonly string[]).includes(flightClass)) {
      throw new BadRequestException(`AERA tariff: unknown flight class "${flightClass}"`);
    }
    const code = String(line.aircraftCode ?? '').trim().toUpperCase();
    if (!/^[A-F]$/.test(code)) {
      throw new BadRequestException(`AERA tariff: aircraft code "${code}" must be A–F`);
    }
    const label = `${flightClass} ${code}`;
    assertAligned(`${label} pax`, line.pax, years.length);
    assertAligned(`${label} ramp`, line.ramp, years.length);
    assertAligned(`${label} full`, line.full, years.length);
    return {
      flightClass: flightClass as AeraScheduledRow['flightClass'],
      aircraftCode: code,
      pax: line.pax ?? null,
      ramp: line.ramp ?? null,
      full: line.full ?? null,
      ...(line.notApplicable ? { notApplicable: true } : {}),
    } satisfies AeraScheduledRow;
  });
  const nsop = (row.internationalNonScheduled ?? []).map((band) => {
    assertAligned(`MTOW ${band.mtowFromKg}`, band.rates, years.length);
    return {
      mtowFromKg: Number(band.mtowFromKg),
      mtowToKg: band.mtowToKg == null ? null : Number(band.mtowToKg),
      rates: band.rates,
    } satisfies AeraMtowRow;
  });
  const itemWise = Array.isArray(row.itemWise) ? (row.itemWise as AeraItemRow[]) : [];
  for (const item of itemWise) {
    assertAligned(`${item.itemCode} domestic`, item.domestic, years.length);
    assertAligned(`${item.itemCode} international`, item.international, years.length);
  }
  return {
    stationCode,
    orderNumber: String(row.orderNumber ?? '').trim(),
    orderDate: row.orderDate ? parseDate(row.orderDate, 'orderDate') : undefined,
    isp: row.isp,
    airport: row.airport,
    airportOperator: row.airportOperator,
    controlPeriodLabel: row.controlPeriod?.label,
    controlPeriodFrom: parseDate(row.controlPeriod?.from, 'controlPeriod.from'),
    controlPeriodTo: parseDate(row.controlPeriod?.to, 'controlPeriod.to'),
    effectiveFrom: parseDate(row.effectiveFrom, 'effectiveFrom'),
    currency: String(row.currency ?? 'INR').toUpperCase(),
    financialYears: years,
    cargoRateColumn: row.cargoRateColumn === 'full' ? 'full' : 'ramp',
    scheduled,
    internationalNonScheduled: nsop,
    itemWise,
    rules: row.rules ?? [],
    anomalies: row.anomalies ?? [],
    verification: row.verification,
    sourcePages: row.sourcePages,
    sourceFile: row.sourceFile,
    active: true,
  } as const;
}

@Injectable()
export class BillingAeraTariffService {
  constructor(
    @InjectModel(BillingAeraTariff.name)
    private readonly model: Model<BillingAeraTariffDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async list(ctx: StationScopeContext) {
    const data = await this.model
      .find(StationScope.filter({}, ctx))
      .sort({ stationCode: 1, effectiveFrom: -1 })
      .lean();
    return successResponse(data);
  }

  async findOne(ctx: StationScopeContext, id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('AERA tariff order not found');
    StationScope.assertOwnership(doc, ctx);
    return successResponse(doc);
  }

  /**
   * Upsert one order per station + order number. The station comes from the
   * session scope (or the payload when the session is cross-station / admin).
   */
  async upsert(ctx: StationScopeContext, row: AeraTariffImportRow, actor: BillingActor) {
    const station = String(ctx.stationCode ?? row.station ?? '').trim().toUpperCase();
    if (!station) throw new BadRequestException('AERA tariff: station is required');
    if (ctx.stationCode && row.station && row.station.toUpperCase() !== station) {
      throw new BadRequestException(
        `AERA tariff for ${row.station.toUpperCase()} cannot be saved from the ${station} station.`,
      );
    }
    const payload = normalizeRow(row, station);
    if (!payload.orderNumber) throw new BadRequestException('AERA tariff: orderNumber is required');

    const existing = await this.model.findOne({
      stationCode: station,
      orderNumber: payload.orderNumber,
    });
    const doc = existing
      ? Object.assign(existing, payload)
      : new this.model(StationScope.stampCreate(payload, { ...ctx, stationCode: station }));
    if (existing) existing.markModified('scheduled');
    await doc.save();

    await this.auditEngine.log({
      entityType: 'aera_tariff',
      entityId: doc._id,
      action: existing ? 'updated' : 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: station,
      changes: { orderNumber: payload.orderNumber, financialYears: payload.financialYears },
    });
    return successResponse(doc.toObject());
  }

  /** Bulk import of the verified JSON (`stations` array); cross-station sessions may load every station. */
  async importMany(ctx: StationScopeContext, rows: AeraTariffImportRow[], actor: BillingActor) {
    const results: Array<{ station: string; orderNumber: string; status: 'saved' | 'skipped'; reason?: string }> = [];
    for (const row of rows ?? []) {
      const station = String(row.station ?? '').trim().toUpperCase();
      if (ctx.stationCode && station && station !== String(ctx.stationCode).toUpperCase()) {
        results.push({ station, orderNumber: row.orderNumber, status: 'skipped', reason: 'other station' });
        continue;
      }
      await this.upsert({ ...ctx, stationCode: ctx.stationCode ?? station }, row, actor);
      results.push({ station, orderNumber: row.orderNumber, status: 'saved' });
    }
    return successResponse(results);
  }

  async deactivate(ctx: StationScopeContext, id: string, actor: BillingActor) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('AERA tariff order not found');
    StationScope.assertOwnership(doc, ctx);
    doc.active = false;
    await doc.save();
    await this.auditEngine.log({
      entityType: 'aera_tariff',
      entityId: doc._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode: doc.stationCode,
      changes: { active: false },
    });
    return successResponse(doc.toObject());
  }

  /**
   * Order in force for a station on a date: the latest active order that has
   * taken effect. After its control period the last approved card stays in
   * force until a newer order is loaded (AERA interim extensions), so the
   * lookup does not require the date to be inside the control period.
   */
  async activeOrderFor(stationCode: string, onDate: Date): Promise<BillingAeraTariff | null> {
    const station = String(stationCode ?? '').trim().toUpperCase();
    if (!station) return null;
    return this.model
      .findOne({
        stationCode: station,
        active: true,
        effectiveFrom: { $lte: onDate },
      })
      .sort({ effectiveFrom: -1 })
      .lean();
  }
}
