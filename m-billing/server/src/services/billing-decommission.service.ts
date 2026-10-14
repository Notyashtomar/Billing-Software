import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingBcDecommissionRecord,
  BillingBcDecommissionRecordDocument,
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingParallelRunSnapshot,
  BillingParallelRunSnapshotDocument,
  BillingSequence,
  BillingSequenceDocument,
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope, successResponse } from '../common/station-scope';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import {
  ExecuteDecommissionDto,
  RollbackDecommissionDto,
} from '../dto/billing-cutover.dto';

export type ReadinessItem = {
  id: string;
  label: string;
  passed: boolean;
  required: boolean;
  detail?: string;
};

@Injectable()
export class BillingDecommissionService {
  constructor(
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingParallelRunSnapshot.name)
    private readonly snapshotModel: Model<BillingParallelRunSnapshotDocument>,
    @InjectModel(BillingSequence.name)
    private readonly sequenceModel: Model<BillingSequenceDocument>,
    @InjectModel(BillingBcDecommissionRecord.name)
    private readonly decommissionModel: Model<BillingBcDecommissionRecordDocument>,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async getReadiness(ctx: StationScopeContext) {
    const stationCode = StationScope.require(ctx);
    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean();
    const checklist = await this.buildReadinessChecklist(ctx, settings);
    const ready = checklist.filter((i) => i.required).every((item) => item.passed);

    return successResponse({
      stationCode,
      cutoverPhase: settings?.cutoverPhase ?? 'parallel',
      decommissioned: settings?.cutoverPhase === 'decommissioned',
      ready,
      checklist,
    });
  }

  async getLegacyExportPolicy(ctx: StationScopeContext) {
    const stationCode = StationScope.require(ctx);
    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean();
    const phase = settings?.cutoverPhase ?? 'parallel';
    const legacyNavExportAllowed =
      settings?.legacyNavExportEnabled !== false && phase !== 'decommissioned';

    return successResponse({
      stationCode,
      cutoverPhase: phase,
      legacyNavExportAllowed,
      nativeBillingEnabled: Boolean(settings?.nativeBillingEnabled),
      reason: legacyNavExportAllowed
        ? 'Legacy exportedNAV path allowed for this station'
        : 'BC invoicing decommissioned — use FRIS native billing only',
    });
  }

  async executeDecommission(
    ctx: StationScopeContext,
    dto: ExecuteDecommissionDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx));
    if (!settings) {
      throw new BadRequestException('Billing settings not found for station');
    }
    if (settings.cutoverPhase === 'decommissioned') {
      throw new BadRequestException('Station is already decommissioned');
    }

    const readiness = await this.buildReadinessChecklist(ctx, settings.toObject());
    const ready = readiness.filter((i) => i.required).every((item) => item.passed);
    if (!ready && !dto.force) {
      throw new BadRequestException({
        message: 'Decommission readiness checks failed',
        checklist: readiness.filter((i) => !i.passed),
      });
    }

    const now = new Date();
    settings.cutoverPhase = 'decommissioned';
    settings.decommissionedAt = now;
    settings.decommissionedBy = actor.userName;
    settings.legacyNavExportEnabled = false;
    settings.nativeBillingEnabled = true;
    await settings.save();

    const record = await this.decommissionModel.create({
      stationCode,
      decommissionedBy: actor.userName,
      decommissionedAt: now,
      readinessSnapshot: { checklist: readiness, ready, forced: Boolean(dto.force) },
      notes: dto.notes,
      forced: Boolean(dto.force),
    });

    await this.auditEngine.log({
      entityType: 'decommission',
      entityId: record._id,
      action: 'posted',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: { decommissioned: true, forced: dto.force },
    });

    return successResponse({
      decommissioned: true,
      decommissionedAt: now,
      record: record.toObject(),
      legacyNavExportAllowed: false,
    });
  }

  async rollbackDecommission(
    ctx: StationScopeContext,
    dto: RollbackDecommissionDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx));
    if (!settings || settings.cutoverPhase !== 'decommissioned') {
      throw new BadRequestException('Station is not decommissioned');
    }

    settings.cutoverPhase = 'bc_readonly';
    settings.legacyNavExportEnabled = true;
    await settings.save();

    const latest = await this.decommissionModel
      .findOne({ stationCode, rolledBack: { $ne: true } })
      .sort({ decommissionedAt: -1 });

    if (latest) {
      latest.rolledBack = true;
      latest.rolledBackAt = new Date();
      latest.rolledBackBy = actor.userName;
      await latest.save();
    }

    await this.auditEngine.log({
      entityType: 'decommission',
      entityId: settings._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      stationCode,
      changes: { rollback: dto.reason },
    });

    return successResponse({
      cutoverPhase: 'bc_readonly',
      legacyNavExportAllowed: true,
    });
  }

  async listRecords(ctx: StationScopeContext) {
    const rows = await this.decommissionModel
      .find(StationScope.filter({}, ctx))
      .sort({ decommissionedAt: -1 })
      .limit(20)
      .lean();
    return successResponse(rows);
  }

  private async buildReadinessChecklist(
    ctx: StationScopeContext,
    settings: {
      cutoverPhase?: string;
      nativeBillingEnabled?: boolean;
      cutoverNotes?: Record<string, unknown>;
      frisPrimaryDate?: Date;
      bcReadOnlyDate?: Date;
    } | null,
  ): Promise<ReadinessItem[]> {
    const stationCode = StationScope.require(ctx);
    const phase = settings?.cutoverPhase ?? 'parallel';

    const [postedCount, signedSnapshots, sequenceCount] = await Promise.all([
      this.invoiceModel.countDocuments(
        StationScope.filter({ status: 'posted' }, ctx),
      ),
      this.snapshotModel.countDocuments(
        StationScope.filter({ signedOffAt: { $exists: true } }, ctx),
      ),
      this.sequenceModel.countDocuments(
        StationScope.filter({}, ctx),
      ),
    ]);

    const lastSignOff = (settings?.cutoverNotes as { lastSignOff?: unknown } | undefined)
      ?.lastSignOff;
    const hasFinanceSignOff = Boolean(lastSignOff) || signedSnapshots >= 1;

    const items: ReadinessItem[] = [
      {
        id: 'native_enabled',
        label: 'Native billing enabled',
        passed: Boolean(settings?.nativeBillingEnabled),
        required: true,
      },
      {
        id: 'bc_readonly',
        label: 'BC invoicing read-only phase reached',
        passed: phase === 'bc_readonly' || phase === 'decommissioned',
        required: true,
        detail: `Current phase: ${phase}`,
      },
      {
        id: 'fris_primary_complete',
        label: 'FRIS primary phase completed (bc_readonly date set)',
        passed: Boolean(settings?.bcReadOnlyDate) || phase === 'bc_readonly',
        required: true,
        detail: settings?.bcReadOnlyDate
          ? `Since ${new Date(settings.bcReadOnlyDate).toISOString().slice(0, 10)}`
          : 'Set bc_readonly phase on Cutover page first',
      },
      {
        id: 'finance_signoff',
        label: 'Finance sign-off on parallel run period',
        passed: hasFinanceSignOff,
        required: true,
        detail: signedSnapshots
          ? `${signedSnapshots} signed snapshot(s)`
          : 'Sign off on Parallel run page',
      },
      {
        id: 'posted_invoices',
        label: 'At least one FRIS posted invoice',
        passed: postedCount > 0,
        required: true,
        detail: `${postedCount} posted`,
      },
      {
        id: 'sequences',
        label: 'Invoice sequences configured',
        passed: sequenceCount > 0,
        required: true,
        detail: `${sequenceCount} sequence(s) for ${stationCode}`,
      },
      {
        id: 'two_month_close',
        label: 'Two signed parallel-run periods (recommended)',
        passed: signedSnapshots >= 2,
        required: false,
        detail: `${signedSnapshots}/2 signed periods`,
      },
    ];

    return items;
  }
}
