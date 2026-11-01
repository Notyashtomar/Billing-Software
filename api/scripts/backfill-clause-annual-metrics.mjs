/**
 * Put the current-year increase percent and start date onto the CPI clause
 * so the billing engine can compound it. Safe to run again.
 *
 * Usage (from api/): node scripts/backfill-clause-annual-metrics.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const PATTERN = /From (\d{4}-\d{2}-\d{2}) the saved annex rates increase by ([\d.]+)% a year/;

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const col = client.db('test').collection('billing');
  const contracts = await col.find({
    docType: 'contract',
    'clauses.label': 'Current-year rates',
  }).toArray();
  let updated = 0;
  for (const contract of contracts) {
    let changed = false;
    const clauses = (contract.clauses || []).map((clause) => {
      if (clause.label !== 'Current-year rates') return clause;
      if (clause.percent != null && clause.validFrom) return clause;
      const match = String(clause.body || '').match(PATTERN);
      if (!match) return clause;
      changed = true;
      return {
        ...clause,
        clauseType: 'cpi',
        percent: Number(match[2]),
        validFrom: match[1],
        appliesTo: ['BHS', 'ADS'],
      };
    });
    if (!changed) continue;
    await col.updateOne({ _id: contract._id }, { $set: { clauses, updatedAt: new Date() } });
    updated += 1;
  }
  console.log(`updated ${updated} of ${contracts.length}`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
