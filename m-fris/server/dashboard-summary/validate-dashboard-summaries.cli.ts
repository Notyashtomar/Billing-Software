/**
 * Validates `dashboard_summaries` shards for Bird dashboard card requirements.
 * Flags zeroed/missing SCH, ADDL, and performance metrics; optionally rebuilds shards.
 *
 * Usage (from server/):
 *   npm run validate:dashboard-summaries -- --from 2026-02-28 --to 2026-03-31 --mode 4h
 *   npm run validate:dashboard-summaries -- --from 2026-02-28 --to 2026-03-31 --mode 4h --rebuild
 *   npm run validate:dashboard-summaries -- --from 2026-02-28 --to 2026-03-31 --mode 4h --rebuild --concurrency 6
 *   npm run validate:dashboard-summaries -- --from 28/02/2026 --to 31/03/2026 --json
 *
 * Exit codes: 0 = OK, 1 = issues found (recompute recommended), 2 = usage/runtime error.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FhrCollectionService } from '../fhr-collection/services/fhr-collection.service';
import { DashboardSummaryService } from './services/dashboard-summary.service';
import { DashboardSummaryWorkerService } from './services/dashboard-summary-worker.service';
import { rebuildDashboardShards } from './utils/rebuild-dashboard-shards.util';
import {
  buildDashboardSummaryValidationReport,
  uniqueRecomputeDates,
  type DashboardSummaryValidationReport,
} from './utils/validate-dashboard-summaries.util';

const cliLogger = new Logger('ValidateDashboardSummaries');

type CliArgs = {
  fromYmd: string;
  toYmd: string;
  mode: '4h' | '6h';
  rebuild: boolean;
  json: boolean;
  concurrency: number;
  bustCache: boolean;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let mode: '4h' | '6h' = '4h';
  let rebuild = false;
  let json = false;
  let concurrency = 4;
  let bustCache = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) {
      fromRaw = argv[++i];
    } else if (a === '--to' && argv[i + 1]) {
      toRaw = argv[++i];
    } else if (a === '--mode' && argv[i + 1]) {
      const m = argv[++i].trim().toLowerCase();
      mode = m === '4h' ? '4h' : '6h';
    } else if (a === '--rebuild') {
      rebuild = true;
    } else if (a === '--json') {
      json = true;
    } else if (a === '--concurrency' && argv[i + 1]) {
      concurrency = Math.max(1, Math.floor(Number(argv[++i])));
    } else if (a === '--bust-cache') {
      bustCache = true;
    }
  }

  const fromYmd = FhrCollectionService.queryParamToYmd(fromRaw) ?? '';
  const toYmd = FhrCollectionService.queryParamToYmd(toRaw) ?? '';
  if (!fromYmd || !toYmd) {
    cliLogger.error(
      'Usage: npm run validate:dashboard-summaries -- --from <yyyy-MM-dd|dd/MM/yyyy> --to <...> [--mode 4h|6h] [--rebuild] [--concurrency N] [--bust-cache] [--json]',
    );
    process.exit(2);
  }
  if (fromYmd > toYmd) {
    cliLogger.error('from date must be on or before to date');
    process.exit(2);
  }

  return { fromYmd, toYmd, mode, rebuild, json, concurrency, bustCache };
}

function printHumanReport(report: DashboardSummaryValidationReport): void {
  cliLogger.log(
    `Range ${report.fromDate} → ${report.tillDate} mode=${report.equipmentMode} shards=${report.shardCount}/${report.expectedDays}`,
  );

  if (report.composed) {
    const k = report.composed.kpiStrip;
    const p = report.composed.performanceReport;
    cliLogger.log(
      `Composed KPI: total=${k.totalFlights} didFly=${k.didFlyFlights} sch=${k.scheduledFlights} addl=${k.additionalFlights} xxld=${k.cancelledFlights}`,
    );
    cliLogger.log(
      `Composed performance: total=${p.totalFlights} onTime=${p.onTimeCount} offSkd=${p.offSkdCount} gha=${p.ghaImprovement}`,
    );
    cliLogger.log(
      `Composed aircraft mix: scheduled=${report.composed.aircraftScheduledTotal} additional=${report.composed.aircraftAdditionalTotal}`,
    );
  }

  if (report.issues.length === 0) {
    cliLogger.log('OK — dashboard_summaries match Bird dashboard requirements.');
    return;
  }

  cliLogger.warn(
    `Found ${report.issues.length} issue(s) — recompute recommended for affected day shards.`,
  );
  const byDay = new Map<string, typeof report.issues>();
  for (const issue of report.issues) {
    const key = issue.summaryDate;
    const list = byDay.get(key) ?? [];
    list.push(issue);
    byDay.set(key, list);
  }
  for (const [day, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    cliLogger.warn(`  ${day}:`);
    for (const issue of list) {
      cliLogger.warn(`    [${issue.code}] ${issue.message}`);
    }
  }

  const days = uniqueRecomputeDates(report.issues);
  if (days.length > 0) {
    cliLogger.warn(
      `Days needing worker recompute (${days.length}): ${days.slice(0, 8).join(', ')}${days.length > 8 ? '…' : ''}`,
    );
    cliLogger.warn(
      'Run with --rebuild (optional --concurrency 4-8, --bust-cache only when FHR changed).',
    );
  }
}

async function bootstrap(): Promise<void> {
  const args = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const summaryService = app.get(DashboardSummaryService);
    const worker = app.get(DashboardSummaryWorkerService);

    const shards = await summaryService.findOrderedDailyShards(
      args.fromYmd,
      args.toYmd,
      args.mode,
      'cards',
    );

    const report = buildDashboardSummaryValidationReport({
      fromDate: args.fromYmd,
      tillDate: args.toYmd,
      equipmentMode: args.mode,
      shards,
    });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
    }

    if (args.rebuild && report.needsRecompute) {
      const days = uniqueRecomputeDates(report.issues);
      cliLogger.log(
        `Rebuilding ${days.length} daily shard(s) concurrency=${args.concurrency} bustCache=${args.bustCache}…`,
      );
      const rebuildWallStart = Date.now();
      const results = await rebuildDashboardShards(worker, days, {
        equipmentMode: args.mode,
        concurrency: args.concurrency,
        invalidateFhrCache: args.bustCache,
      });
      for (const r of results.sort((a, b) => a.summaryDate.localeCompare(b.summaryDate))) {
        cliLogger.log(`  rebuilt ${r.summaryDate} mode=${args.mode} ms=${r.ms}`);
      }
      const perDayMs = results.map((r) => r.ms);
      const sum = perDayMs.reduce((a, b) => a + b, 0);
      const avg = perDayMs.length ? Math.round(sum / perDayMs.length) : 0;
      cliLogger.log(
        `Rebuild timing: days=${perDayMs.length} wallMs=${Date.now() - rebuildWallStart} ` +
          `perDayAvgMs=${avg} perDayMinMs=${Math.min(...perDayMs)} perDayMaxMs=${Math.max(...perDayMs)}`,
      );

      const reshards = await summaryService.findOrderedDailyShards(
        args.fromYmd,
        args.toYmd,
        args.mode,
        'cards',
      );
      const after = buildDashboardSummaryValidationReport({
        fromDate: args.fromYmd,
        tillDate: args.toYmd,
        equipmentMode: args.mode,
        shards: reshards,
      });
      if (args.json) {
        console.log(JSON.stringify({ afterRebuild: after }, null, 2));
      } else {
        cliLogger.log('--- After rebuild ---');
        printHumanReport(after);
      }
      process.exit(after.needsRecompute ? 1 : 0);
    }

    process.exit(report.needsRecompute ? 1 : 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    cliLogger.error(msg);
    process.exit(2);
  } finally {
    await app.close();
  }
}

void bootstrap();
