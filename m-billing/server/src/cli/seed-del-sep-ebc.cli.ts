/**
 * Seed Delhi September 2026 excess-baggage collections (QP CSV + VJ workbook).
 *
 * From api/:
 *   $env:NODE_PATH = (Resolve-Path .\node_modules).Path
 *   npx ts-node --transpile-only --project tsconfig.json -r tsconfig-paths/register src/billing/cli/seed-del-sep-ebc.cli.ts
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { parseEbcFile, type EbcParsedSheet } from '../services/ebc-workbook.parser';

const DEFAULT_QP = 'c:/Users/Yasht/OneDrive/Desktop/EBC Data September/QP_EBC COLLECTION 2026(SEP 2026).csv';
const DEFAULT_VJ = 'c:/Users/Yasht/OneDrive/Desktop/EBC Data September/VJ EBC DATA OF MONTH SEP 26.xlsx';
const STATION = 'DEL';

async function main() {
  config();
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('MONGO_URI is not set. Run this from api/ so .env is loaded.');

  const [qpPath = DEFAULT_QP, vjPath = DEFAULT_VJ] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const parsed: EbcParsedSheet[] = [];
  for (const filePath of [qpPath, vjPath]) {
    parsed.push(...(await parseEbcFile(readFileSync(filePath), filePath)));
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('billing');
  const now = new Date();
  for (const sheet of parsed) {
    await collection.deleteMany({
      docType: 'ebc_collection',
      stationCode: STATION,
      month: sheet.month,
      airline: sheet.airline,
    });
    await collection.insertOne({
      docType: 'ebc_collection',
      stationCode: STATION,
      month: sheet.month,
      airline: sheet.airline,
      layout: sheet.layout,
      rows: sheet.rows,
      dailyTotals: sheet.dailyTotals,
      monthSplit: sheet.monthSplit,
      createdAt: now,
      updatedAt: now,
    });
    process.stdout.write(
      `${sheet.airline} ${sheet.month}: ${sheet.rows.length} rows, total ${sheet.monthSplit?.total ?? '—'}\n`,
    );
  }
  const stored = await collection.countDocuments({
    docType: 'ebc_collection',
    stationCode: STATION,
    month: '2026-09',
  });
  process.stdout.write(`Stored ${stored} Delhi September collections.\n`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
