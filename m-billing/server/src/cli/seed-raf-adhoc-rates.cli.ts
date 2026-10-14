/**
 * Seed RAF adhoc tariff from apps/api/data/adhoc_rate_raf_2026.xlsx Sheet1.
 * Skips first column. Upserts pan-India (*) rows only — station overrides stay.
 *
 * Usage (from BWMS/apps/api):
 *   npm run seed:raf-adhoc
 *   npm run seed:raf-adhoc -- --dry-run
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import type { Model } from 'mongoose';
import { AppModule } from '../../app.module';
import {
  BillingRafAdhocRate,
  type BillingRafAdhocRateDocument,
} from '../schemas/billing.schemas';
import {
  parseRafAdhocSheetRows,
  RAF_ADHOC_ALL_STATIONS,
  RAF_ADHOC_DEFAULT_VALID_FROM,
  RAF_ADHOC_DEFAULT_VALID_TO,
} from '../shared/raf-adhoc-excel';

const logger = new Logger('SeedRafAdhocRates');

const DEFAULT_WORKBOOK = join(__dirname, '..', '..', '..', 'data', 'adhoc_rate_raf_2026.xlsx');

function readArg(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const workbookPath = readArg('--file') || DEFAULT_WORKBOOK;
  const sheetName = readArg('--sheet') || 'Sheet1';

  if (!existsSync(workbookPath)) {
    logger.error(`Workbook not found: ${workbookPath}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(workbookPath);
  const ws = wb.getWorksheet(sheetName) ?? wb.worksheets.find((s) => s.name === sheetName);
  if (!ws) {
    logger.error(`Sheet "${sheetName}" not found. Sheets: ${wb.worksheets.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  const raw: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells: unknown[] = [];
    for (let c = 1; c <= 6; c += 1) cells.push(row.getCell(c).value);
    raw.push(cells);
  });

  const parsed = parseRafAdhocSheetRows(raw);
  logger.log(`Parsed ${parsed.length} RAF adhoc rows (first column skipped)`);
  if (dryRun) {
    for (const row of parsed.slice(0, 8)) {
      logger.log(`${row.itemKind} | ${row.label} | ${row.uom} | INR ${row.unitPriceINR ?? '—'} | USD ${row.unitPriceUSD ?? '—'}`);
    }
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const model = app.get<Model<BillingRafAdhocRateDocument>>(getModelToken(BillingRafAdhocRate.name));
    const validFrom = new Date(`${RAF_ADHOC_DEFAULT_VALID_FROM}T00:00:00.000Z`);
    const validTo = new Date(`${RAF_ADHOC_DEFAULT_VALID_TO}T23:59:59.000Z`);
    let upserted = 0;
    for (const row of parsed) {
      await model.updateOne(
        {
          stationCode: RAF_ADHOC_ALL_STATIONS,
          itemKind: row.itemKind,
          label: row.label,
          validFrom,
        },
        {
          $set: {
            itemKind: row.itemKind,
            label: row.label,
            remarks: row.remarks || undefined,
            uom: row.uom,
            unitPriceINR: row.unitPriceINR,
            unitPriceUSD: row.unitPriceUSD,
            percentValue: row.percentValue,
            validFrom,
            validTo,
            stationCode: RAF_ADHOC_ALL_STATIONS,
            sourceWorkbook: 'adhoc_rate_raf_2026.xlsx',
          },
        },
        { upsert: true },
      );
      upserted += 1;
    }
    logger.log(`Upserted ${upserted} RAF adhoc rates for all stations (*)`);
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  logger.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
