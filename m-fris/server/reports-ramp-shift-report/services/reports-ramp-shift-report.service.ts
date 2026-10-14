import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { RawFlightDataService } from '../../raw-flight-data/services/raw-flight-data.service';
import { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';
import {
  RAMP_SHIFT_REPORT_KIND,
  type RampShiftBand,
} from '../constants/reports-ramp-shift-report.constants';
import {
  ReportsRampShiftReport,
  ReportsRampShiftReportDocument,
} from '../schema/reports-ramp-shift-report.schema';
import { UpsertRampShiftReportDto } from '../dto/upsert-ramp-shift-report.dto';
import { mapDailyRowToRampScheduled } from '../utils/ramp-shift-fhr-mapper.util';
import {
  scheduleLabelToYmd,
  ymdToDdMmYyyy,
} from '../utils/ramp-shift-time.util';

function leanListItem(doc: ReportsRampShiftReport & { _id?: unknown }) {
  return {
    reportId: doc.reportId,
    shift: doc.shift,
    reportDateYmd: doc.reportDateYmd,
    createdBy: doc.createdBy,
    modifiedBy: doc.modifiedBy,
    mailSent: doc.mailSent ?? false,
    createdAt: (doc as { createdAt?: Date }).createdAt,
    updatedAt: (doc as { updatedAt?: Date }).updatedAt,
  };
}

function leanFull(doc: ReportsRampShiftReport & { _id?: unknown }) {
  return {
    reportId: doc.reportId,
    shift: doc.shift,
    reportDateYmd: doc.reportDateYmd,
    manager: doc.manager,
    reportBy: doc.reportBy ?? '',
    operationalIndicators: doc.operationalIndicators ?? {},
    resourceValues: doc.resourceValues ?? [],
    scheduledRows: doc.scheduledRows ?? [],
    nonScheduledRows: doc.nonScheduledRows ?? [],
    operationalNotes: doc.operationalNotes ?? '',
    irregularitiesNotes: doc.irregularitiesNotes ?? '',
    createdBy: doc.createdBy,
    modifiedBy: doc.modifiedBy,
    mailSent: doc.mailSent ?? false,
    createdAt: (doc as { createdAt?: Date }).createdAt,
    updatedAt: (doc as { updatedAt?: Date }).updatedAt,
  };
}

@Injectable()
export class ReportsRampShiftReportService {
  constructor(
    @InjectModel(ReportsRampShiftReport.name)
    private readonly model: Model<ReportsRampShiftReportDocument>,
    private readonly rawFlightDataService: RawFlightDataService,
    private readonly fhrCollectionService: FhrCollectionService,
  ) {}

  createReportId(): string {
    return randomUUID();
  }

  async listByDateAndShift(reportDateYmd: string, shift: RampShiftBand) {
    const ymd = scheduleLabelToYmd(reportDateYmd);
    if (!ymd) throw new BadRequestException('Invalid reportDateYmd');
    const docs = await this.model
      .find({
        reportKind: RAMP_SHIFT_REPORT_KIND,
        reportDateYmd: ymd,
        shift,
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => leanListItem(d as ReportsRampShiftReport));
  }

  async getByReportId(reportId: string) {
    const id = String(reportId ?? '').trim();
    const doc = await this.model
      .findOne({
        reportKind: RAMP_SHIFT_REPORT_KIND,
        reportId: id,
      })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Ramp shift report not found');
    return leanFull(doc as ReportsRampShiftReport);
  }

  async upsert(dto: UpsertRampShiftReportDto) {
    const reportDateYmd = scheduleLabelToYmd(dto.reportDateYmd);
    if (!reportDateYmd) {
      throw new BadRequestException('Invalid reportDateYmd');
    }
    const reportId = String(dto.reportId ?? '').trim();
    if (!reportId) throw new BadRequestException('reportId is required');

    const payload = {
      reportKind: RAMP_SHIFT_REPORT_KIND,
      reportId,
      reportDateYmd,
      shift: dto.shift,
      manager: String(dto.manager ?? '').trim(),
      reportBy: String(dto.reportBy ?? '').trim(),
      operationalIndicators: dto.operationalIndicators ?? {},
      resourceValues: dto.resourceValues ?? [],
      scheduledRows: dto.scheduledRows ?? [],
      nonScheduledRows: dto.nonScheduledRows ?? [],
      operationalNotes: String(dto.operationalNotes ?? '').trim(),
      irregularitiesNotes: String(dto.irregularitiesNotes ?? '').trim(),
      modifiedBy: String(dto.savedBy ?? '').trim(),
      mailSent: dto.mailSent === true,
    };

    const existing = await this.model.findOne({ reportId }).exec();
    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      return leanFull(existing.toObject() as ReportsRampShiftReport);
    }

    const created = await this.model.create({
      ...payload,
      createdBy: String(dto.savedBy ?? '').trim(),
    });
    return leanFull(created.toObject() as ReportsRampShiftReport);
  }

  /**
   * Scheduled arrivals for report date from `fhr_collection` (via daily pipeline),
   * enriched with embeds and filtered by shift band (STA for upcoming, ATA when landed).
   */
  async getScheduledFlightsFromFhr(
    reportDateYmd: string,
    shift: RampShiftBand,
  ) {
    const ymd = scheduleLabelToYmd(reportDateYmd);
    if (!ymd) throw new BadRequestException('Invalid reportDateYmd');
    const ddMm = ymdToDdMmYyyy(ymd);

    const daily = await this.rawFlightDataService.listDailyFromAdvance(
      ddMm,
      ddMm,
    );

    const serials: number[] = [];
    for (const item of daily) {
      const d = item?.data ?? {};
      const raw = String(
        d.slNo ?? d.SlNo ?? d.serialNo ?? d.SerialNo ?? '',
      ).trim();
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) serials.push(n);
    }
    const unique = [...new Set(serials)];
    const fhrMap =
      unique.length > 0
        ? await this.fhrCollectionService.getLeanFhrBySerialsMap(unique)
        : new Map<number, Record<string, unknown>>();

    const bySerial = new Map<string, ReturnType<typeof mapDailyRowToRampScheduled>>();
    for (const item of daily) {
      const d = item?.data ?? {};
      const raw = String(
        d.slNo ?? d.SlNo ?? d.serialNo ?? d.SerialNo ?? '',
      ).trim();
      const n = Number(raw);
      const fhr = Number.isFinite(n) ? fhrMap.get(n) : undefined;
      const row = mapDailyRowToRampScheduled(item, fhr, ymd, shift);
      if (!row) continue;
      if (!bySerial.has(row.serialNo)) bySerial.set(row.serialNo, row);
    }

    return {
      reportDateYmd: ymd,
      shift,
      flights: [...bySerial.values()],
      count: bySerial.size,
    };
  }
}
