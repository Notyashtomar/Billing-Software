/**
 * One-time migration: the Royalty Master used to hold a single General
 * Aviation percent (`generalAviation`). It is now split into
 * `generalAviationDomestic` and `generalAviationInternational`. Copy the old
 * value into whichever split field is still empty, on both the net and gross
 * sides. The old field is left in place; the engine stops reading it once
 * every station has the split values.
 *
 * Usage (from api/):
 *   node scripts/migrate-royalty-ga-split.mjs --dry-run
 *   node scripts/migrate-royalty-ga-split.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const DRY = process.argv.includes('--dry-run');

function hasPercent(fee) {
  return fee && Number.isFinite(Number(fee.percent)) && Number(fee.percent) > 0;
}

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const col = client.db('test').collection('billing');
  const settings = await col.find({ docType: 'settings' }).toArray();

  let updated = 0;
  for (const doc of settings) {
    const set = {};
    for (const side of ['net', 'gross']) {
      const row = doc.royaltyMaster?.[side];
      if (!row || !hasPercent(row.generalAviation)) continue;
      if (!hasPercent(row.generalAviationDomestic)) {
        set[`royaltyMaster.${side}.generalAviationDomestic`] = { ...row.generalAviation };
      }
      if (!hasPercent(row.generalAviationInternational)) {
        set[`royaltyMaster.${side}.generalAviationInternational`] = { ...row.generalAviation };
      }
    }
    if (Object.keys(set).length === 0) continue;
    console.log(`${doc.stationCode}: ${Object.keys(set).join(', ')}`);
    if (!DRY) await col.updateOne({ _id: doc._id }, { $set: set });
    updated += 1;
  }
  console.log(DRY ? 'DRY RUN' : 'APPLIED', `settings updated ${updated}`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
