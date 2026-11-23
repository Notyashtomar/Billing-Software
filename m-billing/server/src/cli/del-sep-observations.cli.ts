/**
 * Delhi September 2026 BHS management observations — diagnose and repair helper.
 *
 * Read-only by default. Every write mode needs --apply.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/billing/cli/del-sep-observations.cli.ts <mode> [args]
 *
 * Modes
 *   sources <CODE...>            Unsent / failing scheduled flights for these airlines.
 *   customers <file.json>        Apply Customers-page edits (same service as the Edit button).
 *   send <CODE...>               Send unsent September flights to preparation and mark them ready.
 *   preview                      Live price of every September flight against its saved preparation price.
 *   rebuild <draftId...>         Rebuild lines from saved preparation prices (same as Refresh rates).
 *   recompute <draftId...>       Regenerate drafts from preparation (same as the Recompute button).
 *
 * Run `preview` before `recompute`: a recompute re-reads the price cards, so an
 * airline whose live price differs from its saved price must use `rebuild`.
 */
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../../app.module';
import {
  BillingCustomer,
  BillingInvoiceHeader,
  BillingPreparationRecord,
} from '../schemas/billing.schemas';
import { BillingCustomersService } from '../services/billing-customers.service';
import { BillingInvoiceDraftsService } from '../services/billing-invoice-drafts.service';
import { BillingPreparationService } from '../services/billing-preparation.service';
import { BillingSourcesScheduledService } from '../services/sources/billing-sources-scheduled.service';
import type { BillingSourceRow } from '../shared/billing-sources';

const log = new Logger('DelSepObservations');

const ctx = { stationCode: 'DEL', crossStation: false };
const actor = {
  userId: 'system',
  userName: 'del-sep-observations',
  stationCode: 'DEL',
};
const FROM = '2026-09-01';
const TO = '2026-09-30';

const argv = process.argv.slice(2);
const mode = argv[0] ?? '';
const apply = argv.includes('--apply');
const args = argv.slice(1).filter((arg) => !arg.startsWith('--'));

function out(line: string) {
  process.stdout.write(`${line}\n`);
}

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

function describeRow(row: BillingSourceRow): string {
  const op = row.operationalData as Record<string, unknown>;
  const failing = (row.validationStatus?.errors ?? [])
    .filter((entry) => entry && entry.passed === false)
    .map((entry) => `${entry.rule}: ${entry.message ?? ''}`)
    .join(' ; ');
  return [
    `serial=${row.sourceRef.serialNo}`,
    `flt=${row.sourceRef.flightNo}`,
    `cust=${String(op.customerCode ?? '')}`,
    `ac=${String(op.aircraftType ?? '')}`,
    `cat=${String(op.categoryOfFlight ?? '')}`,
    `type=${String(op.typeOfFlight ?? '')}`,
    `ata=${String(op.ataDate ?? '')} ${String(op.ataTime ?? '')}`,
    `atd=${String(op.atdDate ?? '')} ${String(op.atdTime ?? '')}`,
    `cancelled=${String(op.isCancelled ?? '')}`,
    `sent=${row.sentToPreparation ? 'Y' : 'N'}`,
    `contract=${row.contractMatch?.matched ? 'Y' : `N(${row.contractMatch?.message ?? ''})`}`,
    `rate=${row.rateMatch?.matched ? `${row.rateMatch.currency} ${row.rateMatch.unitPrice}` : 'N'}`,
    `valid=${row.validationStatus?.passed ? 'Y' : 'N'}`,
    failing ? `fail=[${failing}]` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const sources = app.get(BillingSourcesScheduledService);
    const preparation = app.get(BillingPreparationService);
    const drafts = app.get(BillingInvoiceDraftsService);
    const customers = app.get(BillingCustomersService);
    const customerModel = app.get<Model<BillingCustomer>>(getModelToken(BillingCustomer.name));
    const invoiceModel = app.get<Model<BillingInvoiceHeader>>(
      getModelToken(BillingInvoiceHeader.name),
    );
    const prepModel = app.get<Model<BillingPreparationRecord>>(
      getModelToken(BillingPreparationRecord.name),
    );

    if (mode === 'sources' || mode === 'send') {
      for (const code of args) {
        const listed = await sources.list(ctx, {
          from: FROM,
          to: TO,
          dateBasis: 'atd-date',
          customerCode: code,
        });
        const rows = listed.data?.rows ?? [];
        const unsent = rows.filter((row) => !row.sentToPreparation);
        out(`\n===== ${code}: ${rows.length} September flights, ${unsent.length} not in preparation`);
        for (const row of unsent) out(`  ${describeRow(row)}`);
        if (mode !== 'send') continue;

        const billable = unsent.filter(
          (row) =>
            !(row.operationalData as Record<string, unknown>).isCancelled &&
            row.contractMatch?.matched &&
            row.rateMatch?.matched &&
            Number(row.rateMatch?.unitPrice) > 0,
        );
        out(`  billable unsent: ${billable.length}`);
        if (!apply || billable.length === 0) continue;

        const res = await preparation.ingest(
          ctx,
          { billingPeriodStart: FROM, billingPeriodEnd: TO, rows: billable.map(mapRow) },
          actor,
        );
        out(
          `  ingest created=${res.data?.created ?? 0} skipped=${res.data?.skippedCount ?? 0} ${JSON.stringify(res.data?.statusBreakdown ?? {})}`,
        );
        for (const skip of res.data?.skipped ?? []) out(`    skipped ${JSON.stringify(skip)}`);
        const serials = billable.map((row) => String(row.sourceRef.serialNo));
        const created = await prepModel
          .find({
            stationCode: 'DEL',
            sourceType: 'scheduled_flight',
            'sourceRef.serialNo': { $in: serials },
            status: { $in: ['pending', 'eligible', 'validation_error', 'ready_for_invoice'] },
          })
          .select('_id status sourceRef')
          .lean();
        const toReady = created
          .filter((row) => row.status !== 'ready_for_invoice')
          .map((row) => String(row._id));
        if (toReady.length > 0) {
          const ready = await preparation.bulkReady(ctx, { ids: toReady } as never, actor);
          out(`  bulkReady ${JSON.stringify(ready.data ?? ready)}`);
        }
        const after = await prepModel
          .find({ _id: { $in: created.map((row) => row._id) } })
          .select('_id status sourceRef')
          .lean();
        for (const row of after) {
          out(`    prep ${String(row._id)} ${JSON.stringify(row.sourceRef)} → ${row.status}`);
        }
      }
      return;
    }

    if (mode === 'preview') {
      // Live price for every September flight against the price saved on its preparation row.
      const listed = await sources.list(ctx, { from: FROM, to: TO, dateBasis: 'atd-date' });
      const rows = listed.data?.rows ?? [];
      const serials = rows.map((row) => String(row.sourceRef.serialNo));
      const preps = await prepModel
        .find({
          stationCode: 'DEL',
          sourceType: 'scheduled_flight',
          'sourceRef.serialNo': { $in: serials },
        })
        .select('sourceRef customerCode status rateMatch invoiceDraftId')
        .lean();
      const prepBySerial = new Map(
        preps.map((row) => [String((row.sourceRef as { serialNo?: string })?.serialNo), row]),
      );
      const byCustomer = new Map<string, { same: number; lines: string[] }>();
      for (const row of rows) {
        const serial = String(row.sourceRef.serialNo);
        const prep = prepBySerial.get(serial);
        if (!prep) continue;
        const code = String(prep.customerCode ?? '');
        const entry = byCustomer.get(code) ?? { same: 0, lines: [] };
        byCustomer.set(code, entry);
        const saved = prep.rateMatch as { unitPrice?: number; currency?: string } | undefined;
        const livePrice = row.rateMatch?.matched ? Number(row.rateMatch.unitPrice) : null;
        const liveCurrency = row.rateMatch?.currency ?? '';
        if (
          livePrice != null &&
          Math.abs(livePrice - Number(saved?.unitPrice ?? 0)) < 0.005 &&
          String(saved?.currency ?? '') === String(liveCurrency)
        ) {
          entry.same += 1;
          continue;
        }
        entry.lines.push(
          `  ${serial} ${row.sourceRef.flightNo} ac=${String((row.operationalData as Record<string, unknown>).aircraftType ?? '')} saved=${saved?.currency} ${saved?.unitPrice} live=${livePrice == null ? 'NO RATE' : `${liveCurrency} ${livePrice}`}`,
        );
      }
      for (const [code, entry] of [...byCustomer.entries()].sort()) {
        out(`${code}: unchanged=${entry.same} changed=${entry.lines.length}`);
        for (const line of entry.lines.slice(0, 6)) out(line);
        if (entry.lines.length > 6) out(`  … ${entry.lines.length - 6} more`);
      }
      return;
    }

    if (mode === 'customers') {
      const edits = JSON.parse(readFileSync(args[0], 'utf8')) as Array<{
        customerCode: string;
        patch: Record<string, unknown>;
      }>;
      for (const edit of edits) {
        const doc = await customerModel
          .findOne({ stationCode: 'DEL', customerCode: edit.customerCode })
          .lean();
        if (!doc) {
          out(`!! ${edit.customerCode}: customer not found`);
          continue;
        }
        const before: Record<string, unknown> = {};
        for (const key of Object.keys(edit.patch)) {
          before[key] = (doc as unknown as Record<string, unknown>)[key] ?? null;
        }
        out(`\n${edit.customerCode}\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(edit.patch)}`);
        if (!apply) continue;
        await customers.update(ctx, String(doc._id), edit.patch as never, actor);
        out('  saved');
      }
      return;
    }

    if (mode === 'from-prep') {
      for (const code of args) {
        const res = await drafts.createFromPreparation(
          ctx,
          {
            customerCode: code,
            billingPeriodStart: FROM,
            billingPeriodEnd: TO,
            documentDate: '2026-10-01',
            groupByCustomer: true,
          } as never,
          actor,
        );
        out(`\n===== ${code} from-prep ${JSON.stringify(res)}`);
      }
      return;
    }

    if (mode === 'merge') {
      if (args.length < 2) {
        out('merge needs at least two draft ids');
        return;
      }
      if (!apply) {
        out(`would merge ${args.join(', ')}`);
        return;
      }
      const res = await drafts.mergeSelectedDrafts(ctx, args, actor);
      out(`merged ${JSON.stringify(res)}`);
      return;
    }

    if (mode === 'rebuild') {
      // Same as the Refresh rates button: lines are rebuilt from the prices already
      // saved on preparation with the live contract terms. Price cards are not re-read.
      for (const id of args) {
        const before = await invoiceModel.findById(id).lean();
        if (!before) {
          out(`!! ${id}: draft not found`);
          continue;
        }
        const label = `${before.customerCode} ${before.invoiceCategory} ${before.draftNumber}`;
        const summary = (h: typeof before) =>
          `${h.currencyCode} sub=${h.subtotalExclTax} conc=${h.concessionFeeAmount ?? 0} total=${h.totalInclTax} flights=${(h.preparationRecordIds ?? []).length} name="${h.customerName}" addr=${h.customerAddress ? 'Y' : 'N'}`;
        if (!apply) {
          out(`${label}: would rebuild (${summary(before)})`);
          continue;
        }
        try {
          await drafts.refreshRates(ctx, id, actor);
          const after = await invoiceModel.findById(id).lean();
          out(`${label}\n  before ${summary(before)}\n  after  ${after ? summary(after) : 'missing'}`);
        } catch (err) {
          out(`!! ${label}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return;
    }

    if (mode === 'recompute') {
      for (const id of args) {
        const before = await invoiceModel.findById(id).lean();
        if (!before) {
          out(`!! ${id}: draft not found`);
          continue;
        }
        const label = `${before.customerCode} ${before.invoiceCategory} ${before.draftNumber}`;
        const summary = (h: typeof before) =>
          `${h.currencyCode} sub=${h.subtotalExclTax} conc=${h.concessionFeeAmount ?? 0} total=${h.totalInclTax} flights=${(h.preparationRecordIds ?? []).length} name="${h.customerName}" addr=${h.customerAddress ? 'Y' : 'N'}`;
        if (!apply) {
          out(`${label}: would recompute (${summary(before)})`);
          continue;
        }
        try {
          const res = (await drafts.recomputeFromPreparation(ctx, id, actor)) as {
            splitDraftIds?: string[];
          };
          const after = await invoiceModel.findById(id).lean();
          out(`${label}\n  before ${summary(before)}\n  after  ${after ? summary(after) : 'missing'}`);
          if (res?.splitDraftIds?.length) out(`  split into ${res.splitDraftIds.join(', ')}`);
        } catch (err) {
          out(`!! ${label}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return;
    }

    out('Unknown mode. See the header of this file.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  log.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
