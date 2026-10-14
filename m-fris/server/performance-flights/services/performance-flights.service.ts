import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PerformanceFlightsSnapshot,
  PerformanceFlightsSnapshotDocument,
} from '../schema/performance-flights-snapshot.schema';

export type PerformanceFlightLeg = {
  sta: string;
  ata: string;
  std: string;
  atd: string;
};

@Injectable()
export class PerformanceFlightsService {
  constructor(
    @InjectModel(PerformanceFlightsSnapshot.name)
    private readonly model: Model<PerformanceFlightsSnapshotDocument>,
  ) {}

  private static normalizeLeg(row: unknown): PerformanceFlightLeg {
    if (row == null || typeof row !== 'object') {
      return { sta: '', ata: '', std: '', atd: '' };
    }
    const r = row as Record<string, unknown>;
    return {
      sta: String(r.sta ?? r.STA ?? '').trim(),
      ata: String(r.ata ?? r.ATA ?? '').trim(),
      std: String(r.std ?? r.STD ?? '').trim(),
      atd: String(r.atd ?? r.ATD ?? '').trim(),
    };
  }

  /**
   * Upsert by `reportKey` (replaces the whole `flights` array).
   */
  async save(dto: {
    reportKey: string;
    title?: string;
    flights: unknown[];
  }): Promise<{
    success: true;
    reportKey: string;
    legCount: number;
    updatedAt: Date;
  }> {
    const reportKey = String(dto.reportKey ?? '').trim();
    if (!reportKey) {
      throw new BadRequestException('reportKey is required');
    }
    if (!Array.isArray(dto.flights)) {
      throw new BadRequestException('flights must be an array');
    }
    const legs = dto.flights.map((row) =>
      PerformanceFlightsService.normalizeLeg(row),
    );
    const title = String(dto.title ?? '').trim();

    const doc = await this.model
      .findOneAndUpdate(
        { reportKey },
        { $set: { reportKey, title, flights: legs } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();

    if (!doc) {
      throw new BadRequestException('Failed to save performance flights');
    }
    return {
      success: true,
      reportKey: doc.reportKey,
      legCount: doc.flights?.length ?? 0,
      updatedAt: (doc as { updatedAt?: Date }).updatedAt ?? new Date(),
    };
  }

  async getByKey(reportKey: string): Promise<PerformanceFlightsSnapshot> {
    const key = String(reportKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('reportKey is required');
    }
    const doc = await this.model.findOne({ reportKey: key }).lean().exec();
    if (!doc) {
      throw new NotFoundException(`No snapshot for reportKey: ${key}`);
    }
    return doc as unknown as PerformanceFlightsSnapshot;
  }

  /**
   * List saved snapshots (metadata only — no per-leg payload).
   */
  async listSummaries(): Promise<
    { reportKey: string; title: string; legCount: number; updatedAt: Date }[]
  > {
    const rows = await this.model
      .find({})
      .select({ reportKey: 1, title: 1, flights: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows.map((d) => ({
      reportKey: d.reportKey,
      title: d.title ?? '',
      legCount: Array.isArray(d.flights) ? d.flights.length : 0,
      updatedAt: (d as { updatedAt?: Date }).updatedAt ?? new Date(),
    }));
  }

  async deleteByKey(
    reportKey: string,
  ): Promise<{ success: true; deleted: boolean }> {
    const key = String(reportKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('reportKey is required');
    }
    const r = await this.model.deleteOne({ reportKey: key }).exec();
    return { success: true, deleted: (r.deletedCount ?? 0) > 0 };
  }
}
