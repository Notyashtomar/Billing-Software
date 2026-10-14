import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingBcBaseline,
  BillingBcBaselineDocument,
  BillingInvoiceHeader,
  BillingInvoiceHeaderDocument,
  BillingPreparationRecord,
  BillingPreparationRecordDocument,
  BillingSettings,
  BillingSettingsDocument,
} from '../schemas/billing.schemas';
import {
  FhrCollectionRead,
  FhrCollectionReadDocument,
  RawFlightDataRead,
  RawFlightDataReadDocument,
} from '../schemas/operational.schemas';
import type { StationScopeContext } from '../common/station-scope';
import { StationScope, successResponse } from '../common/station-scope';
import { readExportedNavFromDaily } from '../utils/exported-nav.util';
import { reportDateYmd } from '../utils/invoicing-flight-report.mapper';
import { mapFhrToInvoicingFlightReportRow } from '../utils/invoicing-flight-report.mapper';
import { BillingSourceEnrichmentService } from './sources/billing-source-enrichment.service';
import { AuditEngineService } from '../engines/audit-engine.service';
import type { BillingActor } from './billing-customers.service';
import {
  BackfillPreparationDto,
  CutoverReconciliationQueryDto,
  ImportBcBaselineDto,
  UpdateCutoverSettingsDto,
} from '../dto/billing-cutover.dto';

@Injectable()
export class BillingCutoverService {
  constructor(
    @InjectModel(BillingSettings.name)
    private readonly settingsModel: Model<BillingSettingsDocument>,
    @InjectModel(BillingPreparationRecord.name)
    private readonly preparationModel: Model<BillingPreparationRecordDocument>,
    @InjectModel(BillingInvoiceHeader.name)
    private readonly invoiceModel: Model<BillingInvoiceHeaderDocument>,
    @InjectModel(BillingBcBaseline.name)
    private readonly bcBaselineModel: Model<BillingBcBaselineDocument>,
    @InjectModel(FhrCollectionRead.name)
    private readonly fhrModel: Model<FhrCollectionReadDocument>,
    @InjectModel(RawFlightDataRead.name)
    private readonly rawModel: Model<RawFlightDataReadDocument>,
    private readonly enrichment: BillingSourceEnrichmentService,
    private readonly auditEngine: AuditEngineService,
  ) {}

  async getStatus(ctx: StationScopeContext) {
    const stationCode = StationScope.require(ctx);
    let settings = await this.settingsModel.findOne(StationScope.filter({}, ctx)).lean();
    if (!settings) {
      settings = (
        await this.settingsModel.create(
          StationScope.stampCreate(
            {
              approvalRequired: true,
              nativeBillingEnabled: false,
              cutoverPhase: 'parallel',
            },
            ctx,
          ),
        )
      ).toObject();
    }

    const base = StationScope.filter({}, ctx);
    const [preparationTotal, postedTotal, exportedNavInPrep] = await Promise.all([
      this.preparationModel.countDocuments(base),
      this.invoiceModel.countDocuments({ ...base, status: 'posted' }),
      this.preparationModel.countDocuments({
        ...base,
        'operationalSnapshot.exportedNav': { $in: ['Yes', 'yes', 'Y', 'Exported'] },
      }),
    ]);

    return successResponse({
      settings,
      metrics: {
        preparationRecords: preparationTotal,
        postedInvoices: postedTotal,
        preparationFromExportedNav: exportedNavInPrep,
      },
      checklist: buildChecklist(settings),
    });
  }

  async getReconciliation(ctx: StationScopeContext, query: CutoverReconciliationQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const period = {
      billingPeriodStart: { $gte: from },
      billingPeriodEnd: { $lte: to },
    };

    const exportedSerials = await this.findExportedNavSerials(ctx, query.from, query.to);

    const prepFilter: Record<string, unknown> = StationScope.filter(
      {
        ...period,
        sourceType: 'scheduled_flight',
      },
      ctx,
    );
    if (query.customerCode) {
      prepFilter.customerCode = query.customerCode.toUpperCase();
    }

    const [preparationCount, postedAgg, bcAgg] = await Promise.all([
      this.preparationModel.countDocuments(prepFilter),
      this.invoiceModel.aggregate([
        {
          $match: {
            ...StationScope.filter({ ...period, status: 'posted' }, ctx),
            ...(query.customerCode
              ? { customerCode: query.customerCode.toUpperCase() }
              : {}),
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalInclTax: { $sum: '$totalInclTax' },
          },
        },
      ]),
      this.bcBaselineModel.aggregate([
        {
          $match: {
            ...StationScope.filter(
              {
                billingPeriodStart: { $gte: from },
                billingPeriodEnd: { $lte: to },
              },
              ctx,
            ),
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalInclTax: { $sum: '$totalInclTax' },
          },
        },
      ]),
    ]);

    const frisPosted = postedAgg[0] ?? { count: 0, totalInclTax: 0 };
    const bcImported = bcAgg[0] ?? { count: 0, totalInclTax: 0 };

    const prepSerials = await this.preparationModel
      .find(prepFilter)
      .select('sourceRef.serialNo')
      .lean();
    const prepSet = new Set(
      prepSerials.map((p) => String((p.sourceRef as { serialNo?: string })?.serialNo ?? '')),
    );
    const missingInPreparation = exportedSerials.filter((s) => !prepSet.has(s));

    return successResponse({
      period: { from: query.from, to: query.to },
      exportedNavSerialCount: exportedSerials.length,
      preparationCount,
      frisPostedCount: frisPosted.count,
      frisPostedTotal: frisPosted.totalInclTax ?? 0,
      bcImportedCount: bcImported.count,
      bcImportedTotal: bcImported.totalInclTax ?? 0,
      varianceTotal: (frisPosted.totalInclTax ?? 0) - (bcImported.totalInclTax ?? 0),
      missingInPreparation: missingInPreparation.slice(0, 100),
      missingCount: missingInPreparation.length,
      readyForSignoff:
        missingInPreparation.length === 0 &&
        bcImported.count > 0 &&
        Math.abs((frisPosted.totalInclTax ?? 0) - (bcImported.totalInclTax ?? 0)) < 1,
    });
  }

  async backfillFromExportedNav(
    ctx: StationScopeContext,
    dto: BackfillPreparationDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const periodStart = new Date(dto.billingPeriodStart);
    const periodEnd = new Date(dto.billingPeriodEnd);

    const serials = await this.findExportedNavSerials(
      ctx,
      dto.billingPeriodStart,
      dto.billingPeriodEnd,
    );

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const serial of serials) {
      const exists = await this.preparationModel.exists({
        ...StationScope.filter(
          {
            sourceType: 'scheduled_flight',
            billingPeriodStart: periodStart,
            'sourceRef.serialNo': serial,
          },
          ctx,
        ),
      });
      if (exists) {
        skipped += 1;
        continue;
      }

      const fhr = await this.fhrModel.findOne({ SerialNo: Number(serial) }).lean();
      if (!fhr) {
        errors.push(`Serial ${serial}: no FHR`);
        continue;
      }

      const rawDoc = await this.rawModel
        .findOne({
          $or: [
            { 'data.SlNo': serial },
            { 'data.serialNo': serial },
            { 'data.Serial No': serial },
          ],
        })
        .lean();
      const daily = (rawDoc?.data ?? {}) as Record<string, unknown>;
      const op = mapFhrToInvoicingFlightReportRow(Number(serial), fhr, daily);
      op.exportedNav = 'Yes';

      const enriched = await this.enrichment.enrich(ctx, {
        sourceType: 'scheduled_flight',
        sourceRef: { serialNo: serial, flightNo: String(op.flightNoEquipmentNo ?? '') },
        operationalData: op,
        customerCode: String(op.customerCode ?? ''),
        serviceCode: 'Scheduled Flight',
        atdDate: String(op.atdDate ?? ''),
      });

      if (dto.dryRun) {
        created += 1;
        continue;
      }

      const status = enriched.validationStatus.passed ? 'eligible' : 'validation_error';
      await this.preparationModel.create(
        StationScope.stampCreate(
          {
            sourceType: 'scheduled_flight',
            sourceRef: enriched.sourceRef,
            customerCode: String(op.customerCode ?? '').toUpperCase(),
            customerName: String(op.customerName ?? ''),
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd,
            status,
            contractMatch: enriched.contractMatch,
            rateMatch: enriched.rateMatch,
            validationResults: enriched.validationStatus.errors,
            operationalSnapshot: op,
          },
          ctx,
        ),
      );
      created += 1;
    }

    if (!dto.dryRun) {
      const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx));
      await this.auditEngine.log({
        entityType: 'cutover',
        entityId: settings?._id ?? stationCode,
        action: 'updated',
        userId: actor.userId,
        userName: actor.userName,
        stationCode,
        changes: { backfill: { created, skipped, serials: serials.length } },
      });
    }

    return successResponse({
      dryRun: Boolean(dto.dryRun),
      exportedNavSerials: serials.length,
      created,
      skipped,
      errors: errors.slice(0, 20),
    });
  }

  async updateSettings(
    ctx: StationScopeContext,
    dto: UpdateCutoverSettingsDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    if (dto.cutoverPhase === 'decommissioned') {
      throw new BadRequestException(
        'Use POST /billing/cutover/decommission after readiness checks — do not set decommissioned via settings.',
      );
    }

    const update: Record<string, unknown> = { ...dto };
    const now = new Date();
    if (dto.parallelRunStartDate) update.parallelRunStartDate = new Date(dto.parallelRunStartDate);
    if (dto.bcReadOnlyDate) update.bcReadOnlyDate = new Date(dto.bcReadOnlyDate);
    if (dto.frisPrimaryDate) update.frisPrimaryDate = new Date(dto.frisPrimaryDate);
    if (dto.cutoverPhase === 'fris_primary' && !dto.frisPrimaryDate) {
      update.frisPrimaryDate = now;
    }
    if (dto.cutoverPhase === 'bc_readonly' && !dto.bcReadOnlyDate) {
      update.bcReadOnlyDate = now;
    }

    const settings = await this.settingsModel.findOneAndUpdate(
      { stationCode },
      { $set: update },
      { new: true, upsert: true },
    );

    await this.auditEngine.log({
      entityType: 'cutover',
      entityId: settings._id,
      action: 'updated',
      userId: actor.userId,
      userName: actor.userName,
      stationCode,
      changes: dto as Record<string, unknown>,
    });

    return successResponse(settings.toObject());
  }

  async importBcBaseline(
    ctx: StationScopeContext,
    dto: ImportBcBaselineDto,
    actor: BillingActor,
  ) {
    const stationCode = StationScope.require(ctx);
    const periodStart = new Date(dto.billingPeriodStart);
    const periodEnd = new Date(dto.billingPeriodEnd);

    await this.bcBaselineModel.deleteMany({
      stationCode,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
    });

    const docs = dto.rows.map((row) => ({
      stationCode,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
      customerCode: row.customerCode?.toUpperCase(),
      invoiceNumber: row.invoiceNumber,
      totalInclTax: row.totalInclTax,
      source: 'csv_import',
      importedBy: actor.userName,
      importedAt: new Date(),
    }));

    const inserted = await this.bcBaselineModel.insertMany(docs);

    const settings = await this.settingsModel.findOne(StationScope.filter({}, ctx));
    await this.auditEngine.log({
      entityType: 'cutover',
      entityId: settings?._id ?? inserted[0]?._id,
      action: 'imported',
      userId: actor.userId,
      userName: actor.userName,
      actor,
      stationCode,
      changes: { rowCount: docs.length },
    });

    return successResponse({
      imported: docs.length,
      totalInclTax: docs.reduce((s, r) => s + r.totalInclTax, 0),
    });
  }

  private async findExportedNavSerials(
    ctx: StationScopeContext,
    fromYmd: string,
    toYmd: string,
  ): Promise<string[]> {
    const fhrs = await this.fhrModel
      .find(
        StationScope.filter(
          { staDates: { $elemMatch: { $gte: fromYmd, $lte: toYmd } } },
          ctx,
        ),
      )
      .limit(10000)
      .lean();

    const serials: string[] = [];
    for (const fhr of fhrs) {
      const serial = String(fhr.SerialNo ?? '');
      if (!serial) continue;

      const rawDoc = await this.rawModel
        .findOne({
          $or: [
            { 'data.SlNo': serial },
            { 'data.serialNo': serial },
            { 'data.Serial No': serial },
          ],
        })
        .lean();
      const daily = (rawDoc?.data ?? {}) as Record<string, unknown>;
      if (!readExportedNavFromDaily(daily)) continue;

      const atdYmd =
        reportDateYmd(
          (fhr.mainDetails as Record<string, unknown> | undefined)?.ATDDate ??
            daily.atdDate,
        ) ?? reportDateYmd((fhr.terminalDetails as Record<string, unknown>)?.STADate);

      if (atdYmd && (atdYmd < fromYmd || atdYmd > toYmd)) continue;
      serials.push(serial);
    }
    return [...new Set(serials)];
  }
}

function buildChecklist(settings: {
  cutoverPhase?: string;
  nativeBillingEnabled?: boolean;
  parallelRunStartDate?: Date;
}) {
  const phase = settings.cutoverPhase ?? 'parallel';
  return [
    {
      id: 'parallel',
      label: 'Parallel run (FRIS drafts + BC official post)',
      done: phase !== 'parallel' || Boolean(settings.parallelRunStartDate),
      active: phase === 'parallel',
    },
    {
      id: 'fris_primary',
      label: 'FRIS posts official invoices',
      done: ['fris_primary', 'bc_readonly', 'decommissioned'].includes(phase),
      active: phase === 'fris_primary',
    },
    {
      id: 'bc_readonly',
      label: 'BC invoicing read-only',
      done: ['bc_readonly', 'decommissioned'].includes(phase),
      active: phase === 'bc_readonly',
    },
    {
      id: 'decommissioned',
      label: 'BC invoicing decommissioned',
      done: phase === 'decommissioned',
      active: phase === 'decommissioned',
    },
    {
      id: 'native_enabled',
      label: 'Native billing enabled for station',
      done: Boolean(settings.nativeBillingEnabled),
      active: Boolean(settings.nativeBillingEnabled),
    },
  ];
}
