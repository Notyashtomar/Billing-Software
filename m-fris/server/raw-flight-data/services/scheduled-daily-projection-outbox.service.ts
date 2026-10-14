import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeStationCode } from '../../common/station/station.constants';
import {
  ScheduledDailyProjectionOutbox,
  ScheduledDailyProjectionOutboxDocument,
} from '../schema/scheduled-daily-projection-outbox.schema';
import {
  eachYmdInclusive,
  rebuildDayCoalesceKey,
} from '../utils/scheduled-daily-row.util';
import { readScheduledDailyReadModelEnv } from '../config/scheduled-daily-read-model.env';

@Injectable()
export class ScheduledDailyProjectionOutboxService {
  private readonly logger = new Logger(
    ScheduledDailyProjectionOutboxService.name,
  );

  constructor(
    @InjectModel(ScheduledDailyProjectionOutbox.name)
    private readonly outboxModel: Model<ScheduledDailyProjectionOutboxDocument>,
  ) {}

  /**
   * Enqueue a single-day rebuild. Coalesces with an existing pending/processing
   * row for the same coalesceKey (idempotent under burst).
   */
  async enqueueRebuildDay(params: {
    stationCode: string;
    staYmd: string;
    reason?: string;
  }): Promise<{ enqueued: boolean; coalesceKey: string; id?: string }> {
    const stationCode = normalizeStationCode(params.stationCode);
    if (!stationCode) {
      return { enqueued: false, coalesceKey: '' };
    }
    const staYmd = String(params.staYmd ?? '').trim();
    const coalesceKey = rebuildDayCoalesceKey(stationCode, staYmd);
    const existing = await this.outboxModel
      .findOne({
        coalesceKey,
        status: { $in: ['pending', 'processing'] },
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    if (existing?._id) {
      return {
        enqueued: false,
        coalesceKey,
        id: String(existing._id),
      };
    }
    const doc = await this.outboxModel.create({
      stationCode,
      staYmd,
      eventType: 'rebuild_day',
      coalesceKey,
      payload: { reason: params.reason ?? 'enqueue' },
      status: 'pending',
      attempts: 0,
      lastError: '',
      availableAt: new Date(),
      idempotencyKey: `${coalesceKey}:${Date.now()}`,
    });
    return { enqueued: true, coalesceKey, id: String(doc._id) };
  }

  async enqueueRebuildRange(params: {
    stationCode: string;
    fromYmd: string;
    toYmd: string;
    reason?: string;
  }): Promise<{ days: number; enqueued: number; skipped: number }> {
    const days = eachYmdInclusive(params.fromYmd, params.toYmd);
    let enqueued = 0;
    let skipped = 0;
    for (const staYmd of days) {
      const r = await this.enqueueRebuildDay({
        stationCode: params.stationCode,
        staYmd,
        reason: params.reason,
      });
      if (r.enqueued) enqueued += 1;
      else skipped += 1;
    }
    return { days: days.length, enqueued, skipped };
  }

  /** Claim up to `limit` pending jobs (availableAt <= now). */
  async claimPendingBatch(
    limit: number,
  ): Promise<ScheduledDailyProjectionOutboxDocument[]> {
    const now = new Date();
    const claimed: ScheduledDailyProjectionOutboxDocument[] = [];
    for (let i = 0; i < limit; i += 1) {
      const doc = await this.outboxModel
        .findOneAndUpdate(
          {
            status: 'pending',
            availableAt: { $lte: now },
          },
          {
            $set: { status: 'processing' },
            $inc: { attempts: 1 },
          },
          { sort: { availableAt: 1, createdAt: 1 }, new: true },
        )
        .exec();
      if (!doc) break;
      claimed.push(doc);
    }
    return claimed;
  }

  async markDone(id: string): Promise<void> {
    await this.outboxModel
      .updateOne(
        { _id: id },
        {
          $set: {
            status: 'done',
            processedAt: new Date(),
            lastError: '',
          },
        },
      )
      .exec();
  }

  async markFailed(id: string, error: string): Promise<void> {
    const maxAttempts = readScheduledDailyReadModelEnv().projectorMaxAttempts;
    const doc = await this.outboxModel.findById(id).exec();
    if (!doc) return;
    const attempts = Number(doc.attempts ?? 0);
    const dead = attempts >= maxAttempts;
    const backoffMs = Math.min(
      30 * 60_000,
      Math.max(5_000, 2 ** Math.min(attempts, 8) * 1000),
    );
    await this.outboxModel
      .updateOne(
        { _id: id },
        {
          $set: {
            status: dead ? 'dead' : 'pending',
            lastError: String(error ?? '').slice(0, 2000),
            availableAt: dead ? new Date() : new Date(Date.now() + backoffMs),
            ...(dead ? { processedAt: new Date() } : {}),
          },
        },
      )
      .exec();
    if (dead) {
      this.logger.warn(
        `[scheduled_daily_outbox] dead letter id=${id} attempts=${attempts} err=${error}`,
      );
    }
  }

  async countByStatus(
    stationCode?: string,
  ): Promise<Record<string, number>> {
    const match: Record<string, unknown> = {};
    const code = stationCode ? normalizeStationCode(stationCode) : '';
    if (code) match.stationCode = code;
    const rows = await this.outboxModel
      .aggregate<{ _id: string; n: number }>([
        { $match: match },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ])
      .exec();
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r._id)] = r.n;
    return out;
  }
}
