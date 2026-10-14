/**
 * Builds Markdown including **counts**, **flight serial numbers grouped per SCH-*-*-* bucket** (same as the Aircraft analysis card), and a full detail table.
 *
 * Usage (from server/, after dependencies installed):
 *   npm run export:scheduled-mix-md -- --from 2026-03-01 --to 2026-03-31
 *   npm run export:scheduled-mix-md -- --from 01/03/2026 --to 31/03/2026 --out ../docs/aircraft-analysis-scheduled-mix-serials.md
 *
 * Requires MongoDB (same as `npm run start:dev`).
 */
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FhrCollectionService } from './services/fhr-collection.service';
import { SCHEDULED_MIX_BUCKET_KEYS } from './dto/scheduled-mix-counted-flight.dto';
import {
  aggregateScheduledMixBuckets,
  flightSerialsByCategoryMarkdown,
} from './utils/scheduled-mix-export.util';

const cliLogger = new Logger('ExportScheduledMixFlightsMd');

function mdCell(s: unknown): string {
  const t = s == null ? '' : String(s);
  return t.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function parseArgs(): { fromYmd: string; toYmd: string; outPath: string } {
  const argv = process.argv.slice(2);
  let fromRaw = '';
  let toRaw = '';
  let outPath = '';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from' && argv[i + 1]) {
      fromRaw = argv[i + 1];
      i++;
    } else if (argv[i] === '--to' && argv[i + 1]) {
      toRaw = argv[i + 1];
      i++;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i++;
    }
  }

  const fromYmd = FhrCollectionService.queryParamToYmd(fromRaw) ?? '';
  const toYmd = FhrCollectionService.queryParamToYmd(toRaw) ?? '';

  if (!fromYmd || !toYmd) {
    cliLogger.error(
      'Usage: npm run export:scheduled-mix-md -- --from <yyyy-MM-dd|dd/MM/yyyy> --to <...> [--out path/to/file.md]',
    );
    process.exit(1);
  }

  if (!outPath) {
    outPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'docs',
      `scheduled-mix-flights-${fromYmd}_to_${toYmd}.md`,
    );
  } else {
    outPath = path.resolve(outPath);
  }

  return { fromYmd, toYmd, outPath };
}

async function bootstrap() {
  const { fromYmd, toYmd, outPath } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const fhr = app.get(FhrCollectionService);
    const rows = await fhr.listScheduledMixCountedFlightsForStaYmdWindow(
      fromYmd,
      toYmd,
    );

    const { byBucket, breakdownTotal } = aggregateScheduledMixBuckets(rows);

    const countsLines = SCHEDULED_MIX_BUCKET_KEYS.map(
      (k) => `| ${mdCell(k)} | ${byBucket[k] ?? 0} |`,
    ).join('\n');

    const tableHeader =
      '| STA (YMD) | Serial | Flight no | Mix category | TypeofHandling | Cate_of_Flight | TypeCraft | I/D | P/F | NB/WB |';
    const tableSep =
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
    const tableRows = rows
      .map(
        (r) =>
          `| ${mdCell(r.staYmd)} | ${mdCell(r.serialNo ?? '')} | ${mdCell(r.flightNo)} | ${mdCell(r.mixCategory)} | ${mdCell(r.typeofHandling)} | ${mdCell(r.cateOfFlight)} | ${mdCell(r.typeCraftRaw)} | ${mdCell(r.segment)} | ${mdCell(r.passengerOrFreighter)} | ${mdCell(r.aircraftBody)} |`,
      )
      .join('\n');

    const generatedAt = new Date().toISOString();

    const serialSections = flightSerialsByCategoryMarkdown(rows);

    const md = `# Aircraft analysis — scheduled mix (\`fhr_collection\`)

**Generated:** ${generatedAt}

**STA calendar range (inclusive):** \`${fromYmd}\` → \`${toYmd}\`

## Rules (same as dashboard **Aircraft analysis → Scheduled mix** card)

- Source: \`fhr_collection\` rows whose **STA date** falls in the range (from terminal/ramp STADate chain).
- **Excluded:** cancelled flights (\`isCancelled\`, main \`flightCancelled\` / \`departureStatus\`, or resolved flight number containing \`CANC\`).
- **Scheduled handling only:** \`mainDetails.TypeofHandling\` / \`typeofHandling\` must be **Scheduled** or **SCH** (case-insensitive). Rows marked **Additional** or other non-scheduled handling are **omitted** (not listed in any SCH bucket).
- **Classification:** \`Cate_of_Flight\` / \`flightCategory\` → intl/domestic × passenger/freight; **NB/WB** from \`advance-aircraft\` when \`TypeCraft\` matches the catalog, else main-details \`aircraftBody\` / \`TypeCraft\` heuristics.
- Only flights that land in an SCH-*-*-* bucket are listed (not the \`other\` bucket).

**Total counted:** ${rows.length} (sum of category counts: ${breakdownTotal})

## Counts by mix category

| Category | Count |
| --- | --- |
${countsLines}

## Flight serial numbers by category

Each subsection lists every **flight serial number** (\`SerialNo\` / \`flightSerialNumber\` on the merged \`fhr_collection\` row) for that SCH bucket, sorted ascending. Rows without a serial appear in a small traceability table.

${serialSections}

## Full flight list (${rows.length})

${tableHeader}
${tableSep}
${tableRows || '| — | — | — | — | — | — | *no rows in range* | — | — | — |'}
`;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md, 'utf8');
    cliLogger.log(`Wrote ${rows.length} flights to ${outPath}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
