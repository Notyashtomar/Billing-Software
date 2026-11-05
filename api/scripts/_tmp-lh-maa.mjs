import { MongoClient } from 'mongodb';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const client = new MongoClient(loadMongoUri());
await client.connect();
const col = client.db('test').collection('billing');

const customers = await col
  .find({
    docType: 'customer',
    stationCode: 'MAA',
    $or: [{ customerCode: 'LH' }, { name: /lufthansa/i }],
  })
  .project({ customerCode: 1, name: 1, currencyCode: 1, active: 1 })
  .toArray();

const contracts = await col
  .find({
    docType: 'contract',
    stationCode: 'MAA',
    $or: [{ customerCode: 'LH' }, { name: /lufthansa/i }, { contractNumber: /LH/i }],
  })
  .project({
    contractNumber: 1,
    customerCode: 1,
    name: 1,
    category: 1,
    categories: 1,
    active: 1,
    priceValidFrom: 1,
    priceValidTo: 1,
    concessionRates: 1,
    royaltyAtGross: 1,
    bhsConcessionCoverage: 1,
    'conditionalCharges.divertedDom': 1,
    'conditionalCharges.divertedInt': 1,
  })
  .toArray();

const settings = await col.findOne(
  { docType: 'settings', stationCode: 'MAA' },
  { projection: { royaltyMaster: 1, airportCommercial: 1 } },
);

const drafts = await col
  .find({
    docType: 'invoice_draft',
    stationCode: 'MAA',
    $or: [{ customerCode: 'LH' }, { airlineCode: 'LH' }],
  })
  .project({
    draftNumber: 1,
    status: 1,
    customerCode: 1,
    currencyCode: 1,
    periodFrom: 1,
    periodTo: 1,
    billingPeriodStart: 1,
    billingPeriodEnd: 1,
    concessionFeePercent: 1,
    flightCategory: 1,
    subtotal: 1,
  })
  .limit(15)
  .toArray();

console.log('CUSTOMERS', JSON.stringify(customers, null, 2));
console.log('CONTRACTS', JSON.stringify(contracts, null, 2));
console.log(
  'ROYALTY',
  JSON.stringify(
    {
      ownership: settings?.airportCommercial?.ownership,
      mechanism: settings?.airportCommercial?.revenueShareMechanism,
      gross: settings?.royaltyMaster?.gross,
      net: settings?.royaltyMaster?.net,
    },
    null,
    2,
  ),
);
console.log('DRAFTS', JSON.stringify(drafts, null, 2));
await client.close();
