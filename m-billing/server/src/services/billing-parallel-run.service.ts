import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingParallelRunSnapshot,
  BillingParallelRunSnapshotDocument,
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope, successResponse } from '../common/station-scope';
import { BillingCutoverService } from './billing-cutover.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import {
  CaptureParallelSnapshotDto,
  ListParallelSnapshotsQueryDto,
  SignOffParallelPeriodDto,
} from '../dto/billing-cutover.dto';

@Injectable()
export class BillingParallelRunService {
  constructor(
    @InjectModel(BillingParallelRunSnapshot.name)
    private readonly snapshotModel: Model<BillingParallelRunSnapshotDocument>,
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    private readonly cutoverService: BillingCutoverService,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async listSnapshots(ctx: StationScopeContext, query: ListParallelSnapshotsQueryDto) {
    const limit = Math.min(Math.max(Number(query.limit) || 24, 1), 100);
    const rows = await this.snapshotModel
      .find(StationScope.filter({}, ctx))
      .sort({ capturedAt: -1 })
      .limit(limit)
      .lean();

    return successResponse(rows);
  }

  async captureSnapshot(
    ctx: StationScopeContext,
    dto: CaptureParallelSnapshotDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const reconRes = await this.cutoverService.getReconciliation(ctx, {
      from: dto.from,
      to: dto.to,
      customerCode: dto.customerCode,
    });
    const recon = reconRes.data as Record<string, unknown>;

    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean();
    const weekNumber =
      dto.weekNumber ??
      computeWeekNumber(settings?.parallelRunStartDate, new Date());

    const snapshot = await this.snapshotModel.create(
      StationScope.stampCreate(
        {
          billingPeriodStart: new Date(dto.from),
          billingPeriodEnd: new Date(dto.to),
          weekNumber,
          weekLabel: dto.weekLabel ?? `Week ${weekNumber}`,
          metrics: recon,
          readyForSignoff: Boolean(recon.readyForSignoff),
          capturedBy: actor.userName,
          capturedAt: new Date(),
        },
        ctx,
      ),
    );

    await this.auditEngine.log({
      entityType: 'parallel_run',
      entityId: snapshot._id,
      action: 'created',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: {
        weekNumber,
        readyForSignoff: recon.readyForSignoff,
        varianceTotal: recon.varianceTotal,
      },
    });

    return successResponse(snapshot.toObject());
  }

  async signOffPeriod(
    ctx: StationScopeContext,
    dto: SignOffParallelPeriodDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const reconRes = await this.cutoverService.getReconciliation(ctx, {
      from: dto.from,
      to: dto.to,
    });
    const recon = reconRes.data as { readyForSignoff?: boolean };

    if (!recon.readyForSignoff && !dto.force) {
      throw new BadRequestException(
        'Period is not ready for sign-off. Import BC baseline, clear missing serials, or use force with finance approval.',
      );
    }

    const periodStart = new Date(dto.from);
    const periodEnd = new Date(dto.to);
    const signedOffAt = new Date();

    const snapshot = await this.snapshotModel
      .findOneAndUpdate(
        StationScope.filter(
          {
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            signedOffAt: { $exists: false },
          },
          ctx,
        ),
        {
          $set: {
            signedOffBy: actor.userName,
            signedOffAt,
            signOffNotes: dto.notes,
            readyForSignoff: true,
          },
        },
        { sort: { capturedAt: -1 }, new: true },
      )
      .lean();

    if (!snapshot) {
      await this.captureSnapshot(
        ctx,
        { from: dto.from, to: dto.to, weekLabel: 'Sign-off capture' },
        actor,
      );
      await this.snapshotModel.findOneAndUpdate(
        StationScope.filter(
          {
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
          },
          ctx,
        ),
        {
          $set: {
            signedOffBy: actor.userName,
            signedOffAt,
            signOffNotes: dto.notes,
            readyForSignoff: true,
          },
        },
        { sort: { capturedAt: -1 }, new: true },
      );
    }

    const settings = await this.settingsModel.findOneAndUpdate(
      { stationCode },
      {
        $set: {
          'cutoverNotes.lastSignOff': {
            from: dto.from,
            to: dto.to,
            signedOffBy: actor.userName,
            signedOffAt,
            notes: dto.notes,
            forced: Boolean(dto.force),
          },
        },
      },
      { new: true, upsert: true },
    );

    await this.auditEngine.log({
      entityType: 'parallel_run',
      entityId: settings._id,
      action: 'approved',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: { signOff: { from: dto.from, to: dto.to, force: dto.force } },
    });

    return successResponse({
      signedOff: true,
      period: { from: dto.from, to: dto.to },
      signedOffBy: actor.userName,
      signedOffAt,
    });
  }

  async startParallelRun(ctx: StationScopeContext, actor: BillingActor) {
    const stationCode = StationScope.require(ctx);
    const now = new Date();

    const settings = await this.settingsModel.findOneAndUpdate(
      { stationCode },
      {
        $set: {
          cutoverPhase: 'parallel',
          parallelRunStartDate: now,
          nativeBillingEnabled: true,
        },
      },
      { new: true, upsert: true },
    );

    await this.auditEngine.log({
      entityType: 'parallel_run',
      entityId: settings._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      stationCode,
      changes: { parallelRunStartDate: now },
    });

    return successResponse(settings.toObject());
  }
}

function computeWeekNumber(parallelStart: Date | undefined, now: Date): number {
  if (!parallelStart) return 1;
  const ms = now.getTime() - new Date(parallelStart).getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1);
}
