/**
 * Recreate Delhi August 2026 BHS invoice drafts for flights that are still in
 * FHR but no longer on an invoice. Existing drafts are left in place.
 *
 * From BWMS/apps/api:
 *   node dist/billing/cli/restore-del-aug-bhs-invoices.cli.js
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../../app.module';
import { BillingPreparationRecord } from '../schemas/billing.schemas';
import { extractPreparationFlightYmd } from '../utils/contract-fortnight-billing.util';
import { BillingInvoiceDraftsService } from '../services/billing-invoice-drafts.service';
import { BillingPreparationService } from '../services/billing-preparation.service';
import { BillingSourcesScheduledService } from '../services/sources/billing-sources-scheduled.service';
import type { BillingSourceRow } from '../shared/billing-sources';

const log = new Logger('RestoreDelAugBhs');

const ctx = { stationCode: 'DEL', crossStation: false };
const actor = {
  userId: 'system',
  userName: 'invoice-recovery',
  stationCode: 'DEL',
};

function mapRow(row: BillingSourceRow) {
  return {
    sourceType: row.sourceType,
    sourceRef: {
      serialNo: row.sourceRef.serialNo ?? String(row.operationalData.serialNumber ?? ''),
      flightNo: row.sourceRef.flightNo,
      usageRowId: row.sourceRef.usageRowId,
    },
    operationalData: row.operationalData,
    contractMatch: row.contractMatch,
    rateMatch: row.rateMatch,
    validationStatus: row.validationStatus,
    validationResults: row.validationStatus?.errors,
  };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const drafts = app.get(BillingInvoiceDraftsService);
    if (process.argv.includes('--finish-fortnight')) {
      const model = app.get<Model<BillingPreparationRecord>>(
        getModelToken(BillingPreparationRecord.name),
      );
      const ready = await model
        .find({
          stationCode: 'DEL',
          sourceType: 'scheduled_flight',
          status: 'ready_for_invoice',
          billingPeriodStart: {
            $gte: new Date('2026-08-01T00:00:00.000Z'),
            $lt: new Date('2026-09-01T00:00:00.000Z'),
          },
        })
        .exec();
      const inside = ready.filter((row) => {
        const ymd = extractPreparationFlightYmd({
          sourceRef: (row.sourceRef ?? null) as Record<string, unknown> | null,
          operationalSnapshot: (row.operationalSnapshot ?? null) as Record<string, unknown> | null,
        });
        if (!ymd) return false;
        const day = Number(ymd.slice(8, 10));
        return day >= 1 && day <= 30;
      });
      log.log(`Fortnight remainder inside parts: ${inside.length} of ${ready.length}`);
      if (inside.length === 0) return;
      const draftsRes = await drafts.createFromPreparation(
        ctx,
        {
          preparationRecordIds: inside.map((row) => String(row._id)),
          documentDate: '2026-08-31',
          groupByCustomer: true,
          mergeOpenDraft: false,
        },
        actor,
      );
      log.log(JSON.stringify(draftsRes.data ?? draftsRes, null, 2));
      return;
    }

    const sources = app.get(BillingSourcesScheduledService);
    const preparation = app.get(BillingPreparationService);

    const listed = await sources.list(ctx, {
      from: '2026-08-01',
      to: '2026-08-31',
      dateBasis: 'atd-date',
    });
    const rows = (listed.data?.rows ?? []).filter((row) => !row.sentToPreparation);
    log.log(`Unsent DEL August scheduled flights: ${rows.length}`);
    if (rows.length === 0) {
      log.log('Nothing to restore.');
      return;
    }

    let createdPrep = 0;
    let skippedPrep = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200).map(mapRow);
      const res = await preparation.ingest(
        ctx,
        { billingPeriodStart: '2026-08-01', billingPeriodEnd: '2026-08-31', rows: batch },
        actor,
      );
      createdPrep += res.data?.created ?? 0;
      skippedPrep += res.data?.skippedCount ?? 0;
      log.log(`Ingested ${Math.min(i + 200, rows.length)} / ${rows.length}`);
    }
    log.log(`Preparation created=${createdPrep} skipped=${skippedPrep}`);

    const ready = await preparation.bulkReadyByFilter(
      ctx,
      { status: 'pending', from: '2026-08-01', to: '2026-08-31' },
      actor,
    );
    const eligible = await preparation.bulkReadyByFilter(
      ctx,
      { status: 'eligible', from: '2026-08-01', to: '2026-08-31' },
      actor,
    );
    log.log(
      `Marked ready pending=${ready.data?.succeeded ?? 0} eligible=${eligible.data?.succeeded ?? 0}`,
    );

    const draftsRes = await drafts.createFromPreparation(
      ctx,
      {
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-08-31',
        documentDate: '2026-08-31',
        groupByCustomer: true,
        mergeOpenDraft: false,
      },
      actor,
    );
    log.log(JSON.stringify(draftsRes.data ?? draftsRes, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
