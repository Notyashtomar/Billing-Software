/**
 * Mark DEL / MAA / HYD contracts Comprehensive or Non-comprehensive
 * from the station price-card concession note. Updates only that field.
 *
 *   node BWMS/modules/m-billing/server/scripts/lib/mark-bhs-concession-coverage.mjs
 *   node .../mark-bhs-concession-coverage.mjs --dry-run
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePriceCardWorkbook } from './price-card-maa-parser.mjs';
import { loadMongoUri } from './seed-catalog-from-price-card.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../../../../../apps/api/package.json'));
const ExcelJS = require('exceljs');

const JOBS = [
  {
    station: 'DEL',
    file: resolve(here, '../../../../../apps/api/data/Price_card_Delhi_V2.xlsx'),
  },
  {
    station: 'MAA',
    file: resolve(process.env.USERPROFILE ?? '', 'Desktop/Billing/ADS/price_card_chennai_maa-july.xlsx'),
  },
  {
    station: 'HYD',
    file: resolve(process.env.USERPROFILE ?? '', 'Desktop/Billing/ADS/Price Card_ Hyderabad.xlsx'),
  },
];

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const mongoose = require('mongoose');
  const uri = loadMongoUri();
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI missing');
  await mongoose.connect(uri);
  const billing = mongoose.connection.db.collection('billing');
  const now = new Date();
  const asOf = new Date('2026-09-22T00:00:00');
  let updated = 0;
  let missing = 0;
  try {
    for (const job of JOBS) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(job.file);
      const parsed = parsePriceCardWorkbook(workbook, {
        asOf,
        stationCode: job.station,
        includeExtraAds: true,
        collectBhsPackages: true,
      });
      for (const row of parsed) {
        if (!row.bhsConcessionCoverage) {
          console.log(`${job.station} unmarked  ${row.contractNumber}`);
          continue;
        }
        const filter = {
          docType: 'contract',
          stationCode: job.station,
          contractNumber: row.contractNumber,
        };
        const existing = await billing.findOne(filter, { projection: { _id: 1, customerCode: 1 } });
        if (!existing) {
          missing += 1;
          console.log(`${job.station} missing   ${row.contractNumber} ${row.bhsConcessionCoverage}`);
          continue;
        }
        updated += 1;
        console.log(
          `${job.station} ${row.bhsConcessionCoverage.padEnd(18)} ${row.customerCode} ${row.contractNumber}`,
        );
        if (!dryRun) {
          await billing.updateOne(filter, {
            $set: {
              bhsConcessionCoverage: row.bhsConcessionCoverage,
              bhsConcessionNote: row.bhsConcessionNote ?? '',
              updatedAt: now,
            },
          });
        }
      }
    }
  } finally {
    await mongoose.disconnect();
  }
  console.log(`\n${dryRun ? 'dry-run ' : ''}updated ${updated}, missing ${missing}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
