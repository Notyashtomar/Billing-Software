/**
 * Export Aircraft analysis scheduled mix (fhr_collection) to Excel (.xlsx).
 *
 * Sheets:
 *   **Summary** — counts per SCH-*-*-* bucket
 *   **Serials_by_category** — one row per flight serial (sorted within bucket); trace rows without serial
 *   **All_flights** — full detail table (same columns as Markdown export)
 *
 * Usage (from server/):
 *   npm run export:scheduled-mix-xlsx -- --from 2026-02-28 --to 2026-03-31
 *   npm run export:scheduled-mix-xlsx -- --from 01/03/2026 --to 31/03/2026 --out ../docs/aircraft-analysis-scheduled-mix.xlsx
 *
 * On Windows, close the `.xlsx` in Excel before re-exporting; if the file is locked (`EBUSY`),
 * the script writes a timestamped sibling file and prints the path.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FhrCollectionService } from './services/fhr-collection.service';
import type { ScheduledMixCountedFlightRow } from './dto/scheduled-mix-counted-flight.dto';
import { SCHEDULED_MIX_BUCKET_KEYS } from './dto/scheduled-mix-counted-flight.dto';
import {
  SCHEDULED_MIX_CATEGORY_DESCRIPTIONS,
  aggregateScheduledMixBuckets,
  sortUniqueSerials,
} from './utils/scheduled-mix-export.util';

const cliLogger = new Logger('ExportScheduledMixFlightsXlsx');

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
      'Usage: npm run export:scheduled-mix-xlsx -- --from <yyyy-MM-dd|dd/MM/yyyy> --to <...> [--out path/to/file.xlsx]',
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
      `aircraft-analysis-scheduled-mix-${fromYmd}_to_${toYmd}.xlsx`,
    );
  } else {
    outPath = path.resolve(outPath);
  }

  return { fromYmd, toYmd, outPath };
}

/** Avoid failing when the output path is open in Excel (`EBUSY` on Windows). */
function writeXlsxBufferWithLockFallback(
  outPath: string,
  buffer: Buffer,
): string {
  const dir = path.dirname(outPath);
  const ext = path.extname(outPath) || '.xlsx';
  const base = path.basename(outPath, ext);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(outPath, buffer);
    return outPath;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code !== 'EBUSY' && e?.code !== 'EPERM') throw err;
    const fallback = path.join(dir, `${base}-${Date.now()}${ext}`);
    fs.writeFileSync(fallback, buffer);
    cliLogger.warn(
      `[export-scheduled-mix-xlsx] Output file is locked (often open in Excel):\n  ${outPath}\nClose it and re-run to overwrite.\nWrote:\n  ${fallback}`,
    );
    return fallback;
  }
}

function styleHeaderRow(row: ExcelJS.Row, lastCol: number) {
  row.font = { bold: true };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7EEF7' },
  };
  for (let c = 1; c <= lastCol; c++) {
    row.getCell(c).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  }
}

async function buildWorkbook(
  rows: ScheduledMixCountedFlightRow[],
  fromYmd: string,
  toYmd: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FRIS scheduled-mix export';
  wb.created = new Date();

  const agg = aggregateScheduledMixBuckets(rows);

  const wsSummary = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  wsSummary.columns = [
    { header: 'Mix category', key: 'cat', width: 14 },
    { header: 'Description', key: 'desc', width: 52 },
    { header: 'Count', key: 'cnt', width: 10 },
  ];
  const sumHeader = wsSummary.getRow(1);
  styleHeaderRow(sumHeader, 3);
  for (const k of SCHEDULED_MIX_BUCKET_KEYS) {
    wsSummary.addRow({
      cat: k,
      desc: SCHEDULED_MIX_CATEGORY_DESCRIPTIONS[k],
      cnt: agg.byBucket[k] ?? 0,
    });
  }
  wsSummary.addRow({
    cat: 'TOTAL',
    desc: 'Sum of SCH buckets (same as dashboard total counted)',
    cnt: agg.breakdownTotal,
  });
  const totalRow = wsSummary.lastRow;
  if (totalRow) {
    totalRow.font = { bold: true };
  }

  const wsSerials = wb.addWorksheet('Serials_by_category', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  wsSerials.columns = [
    { header: 'Mix category', key: 'cat', width: 14 },
    { header: 'Description', key: 'desc', width: 44 },
    { header: 'Flight serial number', key: 'serial', width: 22 },
    { header: 'STA (YMD)', key: 'sta', width: 12 },
    { header: 'Flight no', key: 'fno', width: 18 },
    { header: 'TypeCraft', key: 'tc', width: 18 },
  ];
  styleHeaderRow(wsSerials.getRow(1), 6);

  for (const k of SCHEDULED_MIX_BUCKET_KEYS) {
    const desc = SCHEDULED_MIX_CATEGORY_DESCRIPTIONS[k];
    const sorted = sortUniqueSerials(agg.serialsByBucket.get(k) ?? []);
    for (const sn of sorted) {
      wsSerials.addRow({
        cat: k,
        desc,
        serial: sn,
        sta: '',
        fno: '',
        tc: '',
      });
    }
    const missing = agg.missingSerialRowsByBucket.get(k) ?? [];
    for (const r of missing) {
      wsSerials.addRow({
        cat: k,
        desc,
        serial: '(missing)',
        sta: r.staYmd,
        fno: r.flightNo,
        tc: r.typeCraftRaw,
      });
    }
  }

  const wsAll = wb.addWorksheet('All_flights', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  wsAll.columns = [
    { header: 'STA (YMD)', key: 'staYmd', width: 12 },
    { header: 'Flight serial', key: 'serialNo', width: 14 },
    { header: 'Flight no', key: 'flightNo', width: 18 },
    { header: 'Mix category', key: 'mix', width: 14 },
    { header: 'TypeofHandling', key: 'toh', width: 22 },
    { header: 'Cate_of_Flight', key: 'cof', width: 36 },
    { header: 'TypeCraft', key: 'tc', width: 18 },
    { header: 'I/D', key: 'seg', width: 6 },
    { header: 'P/F', key: 'pf', width: 6 },
    { header: 'NB/WB', key: 'body', width: 8 },
  ];
  styleHeaderRow(wsAll.getRow(1), 10);

  const sortedRows = [...rows].sort((a, b) => {
    const ak = `${a.staYmd}\0${a.serialNo ?? 0}\0${a.flightNo}`;
    const bk = `${b.staYmd}\0${b.serialNo ?? 0}\0${b.flightNo}`;
    return ak.localeCompare(bk);
  });

  for (const r of sortedRows) {
    wsAll.addRow({
      staYmd: r.staYmd,
      serialNo: r.serialNo ?? '',
      flightNo: r.flightNo,
      mix: r.mixCategory,
      toh: r.typeofHandling,
      cof: r.cateOfFlight,
      tc: r.typeCraftRaw,
      seg: r.segment,
      pf: r.passengerOrFreighter,
      body: r.aircraftBody,
    });
  }

  const meta = wb.addWorksheet('Export_meta');
  meta.columns = [{ width: 28 }, { width: 60 }];
  meta.addRow(['STA range (inclusive)', `${fromYmd} → ${toYmd}`]);
  meta.addRow(['Generated (UTC)', new Date().toISOString()]);
  meta.addRow([
    'Rules',
    'TypeofHandling Scheduled/SCH only; excludes Additional; same STA window & cancel rules as dashboard.',
  ]);
  meta.addRow(['Flight count', rows.length]);

  const buf = await wb.xlsx.writeBuffer();
  return buf;
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

    const buffer = await buildWorkbook(rows, fromYmd, toYmd);
    const writtenTo = writeXlsxBufferWithLockFallback(
      outPath,
      Buffer.from(buffer),
    );
    cliLogger.log(`Wrote ${rows.length} flights to ${writtenTo}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  cliLogger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
