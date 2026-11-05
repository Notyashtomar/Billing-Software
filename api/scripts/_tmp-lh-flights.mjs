import { MongoClient } from 'mongodb';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const client = new MongoClient(loadMongoUri());
await client.connect();
const col = client.db('test').collection('billing');

const headers = await col
  .find({
    docType: 'invoice_header',
    stationCode: 'MAA',
    customerCode: 'LH',
  })
  .project({
    invoiceNumber: 1,
    status: 1,
    billingPeriodStart: 1,
    billingPeriodEnd: 1,
    concessionFeePercent: 1,
    currencyCode: 1,
    subtotalExclTax: 1,
  })
  .sort({ billingPeriodStart: -1 })
  .limit(8)
  .toArray();

const preps = await col
  .find({
    docType: 'preparation_record',
    stationCode: 'MAA',
    customerCode: 'LH',
    billingPeriodStart: { $gte: new Date('2026-09-01'), $lte: new Date('2026-09-30T23:59:59.999Z') },
  })
  .project({
    sourceType: 1,
    'operationalSnapshot.categoryOfFlight': 1,
    'operationalSnapshot.Cate_of_Flight': 1,
    'operationalSnapshot.typeOfFlight': 1,
    'operationalSnapshot.aircraftType': 1,
  })
  .limit(400)
  .toArray();

const counts = new Map();
for (const row of preps) {
  const snap = row.operationalSnapshot ?? {};
  const key = `${row.sourceType}|${snap.categoryOfFlight ?? snap.Cate_of_Flight ?? ''}|${snap.typeOfFlight ?? ''}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
console.log('HEADERS', JSON.stringify(headers, null, 2));
console.log('PREP COUNT', preps.length);
console.log('BUCKETS', JSON.stringify([...counts.entries()], null, 2));
await client.close();
