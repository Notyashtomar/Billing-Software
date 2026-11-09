/**
 * One-time backfill: copy the legacy `CYI:<contract>:<ymd>:<pct>%x<steps>`
 * remark tag into the structured `annualIncreaseApplied` field on
 *   - BHS price cards        (docType price_card_airline)
 *   - rate cards             (docType rate_card)
 *   - contract ADS rules     (contract.adsEquipmentRules[].remarks)
 *
 * Idempotent: rows that already carry the field are skipped. The remark text
 * is left untouched.
 *
 * Usage (from api/):
 *   node scripts/backfill-annual-increase-field.mjs --dry-run
 *   node scripts/backfill-annual-increase-field.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const DRY = process.argv.includes('--dry-run');
const TAG = /CYI:([^:\s]*):(\d{4}-\d{2}-\d{2}):([\d.]+)%x(\d+)/;

function parseTag(remarks) {
  const match = String(remarks ?? '').match(TAG);
  if (!match) return null;
  const steps = Number(match[4]);
  const percent = Number(match[3]);
  if (!(steps > 0) || !Number.isFinite(percent)) return null;
  return { contractNumber: match[1] || null, validFrom: match[2], percent, steps };
}

async function main() {
  const client = new MongoClient(loadMongoUri());
  await client.connect();
  const col = client.db('test').collection('billing');

  let priceCards = 0;
  let rateCards = 0;
  let rules = 0;

  const cards = await col
    .find({
      docType: { $in: ['price_card_airline', 'rate_card'] },
      remarks: { $regex: 'CYI:' },
      annualIncreaseApplied: { $exists: false },
    })
    .toArray();
  for (const card of cards) {
    const applied = parseTag(card.remarks);
    if (!applied) continue;
    if (!DRY) {
      await col.updateOne({ _id: card._id }, { $set: { annualIncreaseApplied: applied } });
    }
    if (card.docType === 'rate_card') rateCards += 1;
    else priceCards += 1;
  }

  const contracts = await col
    .find({ docType: 'contract', 'adsEquipmentRules.remarks': { $regex: 'CYI:' } })
    .toArray();
  for (const contract of contracts) {
    let changed = false;
    const next = (contract.adsEquipmentRules || []).map((rule) => {
      if (rule.annualIncreaseApplied) return rule;
      const applied = parseTag(rule.remarks);
      if (!applied) return rule;
      changed = true;
      rules += 1;
      return { ...rule, annualIncreaseApplied: applied };
    });
    if (changed && !DRY) {
      await col.updateOne({ _id: contract._id }, { $set: { adsEquipmentRules: next } });
    }
  }

  console.log(DRY ? 'DRY RUN' : 'APPLIED');
  console.log(`price cards ${priceCards}`);
  console.log(`rate cards ${rateCards}`);
  console.log(`ads rules ${rules}`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
