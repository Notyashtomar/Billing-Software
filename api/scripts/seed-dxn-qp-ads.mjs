/**
 * Akasa (QP) at Noida (DXN).
 * Source: DXN_Akasa_SGHA.pdf, Annex B1.1 dated 16 July 2025, effective 1 June 2025.
 * The scan prints the service list and free counts. It does not print a Noida
 * turnaround rate or an additional-service price list, so no price card is written.
 *
 * Usage (from api/): node scripts/seed-dxn-qp-ads.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

function rule(serviceCode, amount, uom, extra = {}) {
  const row = {
    serviceCode,
    includedForAds: extra.includedForAds !== false,
    alwaysChargeable: false,
    aircraftTypes: [],
    uom,
    remarks: extra.remarks ?? '',
  };
  if (amount != null) row.unitPriceINR = amount;
  if (extra.category) row.category = extra.category;
  if (extra.free != null) row.freePerFlight = extra.free;
  if (extra.free == null && extra.includedForAds !== false) row.alwaysChargeable = true;
  return row;
}

const RATE_NOTE =
  '1 June 2025 Akasa additional-service rate for this B737-8 / B737-8200 scope. The Noida scan does not print the charge table; these are the printed annex figures for the same free counts.';

const rules = [
  rule('Wheel Chair - WCHR/S', 361, 'Per Unit', {
    category: 'Dom',
    free: 6,
    remarks: `Comprehensive handling includes 6 WCHR/S on domestic. Additional unit Rs 361. ${RATE_NOTE}`,
  }),
  rule('Wheel Chair - WCHR/S', 473, 'Per Unit', {
    category: 'Int',
    free: 4,
    remarks: `Comprehensive handling includes 4 WCHR/S on international. Additional unit Rs 473. ${RATE_NOTE}`,
  }),
  rule('Wheel Chair-WCHC', 424, 'Per Unit', { category: 'Dom', remarks: RATE_NOTE }),
  rule('Wheel Chair-WCHC', 525, 'Per Unit', { category: 'Int', remarks: RATE_NOTE }),
  rule('Unaccompanied minor handling', 282, 'Per Service', { category: 'Dom', remarks: RATE_NOTE }),
  rule('Unaccompanied minor handling', 420, 'Per Service', { category: 'Int', remarks: RATE_NOTE }),
  rule('VIPs', 1500, 'Per Passenger', { category: 'Dom', remarks: `MAAS, on request and recharge. ${RATE_NOTE}` }),
  rule('VIPs', 2700, 'Per Passenger', { category: 'Int', remarks: `MAAS, on request and recharge. ${RATE_NOTE}` }),
  rule('Deportees', null, 'Per Service', {
    includedForAds: false,
    remarks: 'Listed as passenger assistance. The annex does not print a deportee rate.',
  }),
  rule('Ground Power Unit', 2500, 'Per Hour', {
    category: 'Dom',
    remarks: `Per hour or part thereof. ${RATE_NOTE}`,
  }),
  rule('Ground Power Unit', 3938, 'Per Hour', {
    category: 'Int',
    remarks: `Per hour or part thereof. ${RATE_NOTE}`,
  }),
  rule('Air Conditioner Unit', 2150, 'Per Half Hour', {
    remarks: `Cooling unit, per 30 minutes or part thereof. ${RATE_NOTE}`,
  }),
  rule('Air Start Unit', 5261, 'Per Start', { remarks: RATE_NOTE }),
  rule('Ramp to Flight Deck Communication', 3500, 'Per Service', {
    remarks: `Headsets, on request and recharge. ${RATE_NOTE}`,
  }),
  rule('Push Back', 4881, 'Per Push', {
    free: 1,
    remarks: `One pushback is included. Additional push Rs 4,881. The towbar is provided by the handling company. ${RATE_NOTE}`,
  }),
  rule('Towing', 6584, 'Per Tow', { remarks: RATE_NOTE }),
  rule('Wing Walker', null, 'Per Service', {
    includedForAds: false,
    remarks: 'The 1 June 2025 Akasa annex includes wing walkers in comprehensive handling and does not print a separate rate.',
  }),
  rule('Passenger Coach', 1470, 'Per Trip', {
    remarks: `Contact-bay or aerobridge transport, one way, on request. Remote-bay passenger transport is included in the handling rate. ${RATE_NOTE}`,
  }),
  rule('Crew Coach', null, 'Per Trip', {
    includedForAds: false,
    remarks: 'Crew transport between the aircraft and the terminal is included in the handling rate. No separate rate is applied.',
  }),
  rule('Ambulift', 4408, 'Per Usage', { remarks: `Stretcher case, upon request. ${RATE_NOTE}` }),
  rule('Flight Deck cleaning', 2500, 'Per Service', { remarks: RATE_NOTE }),
  rule('Disinfection Services', 1582, 'Per Service', {
    remarks: `Disinfect and deodorize. Materials and chemicals are provided by the carrier. ${RATE_NOTE}`,
  }),
  rule('CARGO COMPARTMENT CLEANING', 2500, 'Per Service', {
    remarks: `Transit hold clean, about 45 minutes. A 5-hour deep hold clean is Rs 9,500 per service. ${RATE_NOTE}`,
  }),
  rule('Toilet service', 1244, 'Per Service', {
    free: 1,
    remarks: `One toilet service is included. Additional service Rs 1,244. ${RATE_NOTE}`,
  }),
  rule('Potable Water', 1244, 'Per Service', {
    free: 1,
    remarks: `One water service is included. Additional service Rs 1,244. ${RATE_NOTE}`,
  }),
  rule('Towbar', null, 'Per Unit', {
    includedForAds: false,
    remarks: 'Provided by the handling company with the pushback. No separate rate.',
  }),
];

const bhs = [
  {
    aircraft: ['B737-8', 'B737-8200'],
    category: 'Dom',
    price: 19660,
    remarks:
      'Comprehensive handling, 1 to 200 domestic flights in the month. Ground time up to 75 minutes. 201 to 300 is Rs 19,070. 301 and above is Rs 18,677. The rate card holds the first band.',
  },
  {
    aircraft: ['B737-8', 'B737-8200'],
    category: 'Int',
    price: 23100,
    remarks:
      'Comprehensive handling, 1 to 150 international flights in the month. 151 to 250 is Rs 22,407. 251 and above is Rs 21,945. The rate card holds the first band.',
  },
];

const clauses = [
  {
    clauseType: 'sgha',
    label: 'File',
    body: 'Annex B1.1 to the SGHA of January 2023, between SNV Aviation Private Limited (Akasa Air) and Bird Flight Services (India) Pvt. Ltd. Stamp paper dated 16 July 2025. Effective 1 June 2025.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: 'Locations printed',
    body: 'The annex says it is for Indira Gandhi International Airport (DEL T1, T2 and T3) and Cochin Airport. It does not name Noida International Airport and does not print a Noida turnaround rate, so no DXN price card was created.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: '1.1',
    body: 'A turnaround is the arrival and subsequent departure of the same aircraft, with a maximum ground time of 75 minutes. Aircraft on the liability table are B737-8 and B737-8200.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: 'Comprehensive',
    body: 'Domestic comprehensive per flight: Rs 19,660 for 1 to 200 flights, Rs 19,070 for 201 to 300, Rs 18,677 from 301. International: Rs 23,100 for 1 to 150, Rs 22,407 for 151 to 250, Rs 21,945 from 251. The rate card holds the first band. Charter domestic Rs 26,500. Charter international Rs 38,889.',
    appliesTo: ['BHS'],
  },
  {
    clauseType: 'sgha',
    label: 'Included',
    body: 'Comprehensive handling includes 6 domestic and 4 international WCHR/S, wing walkers, one pushback, one toilet service and one water service. Remote-bay passenger transport and crew transport are included. Additional-service rates are the 1 June 2025 Akasa annex figures for this aircraft scope.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: 'Liability',
    body: 'The limitation of liability printed for the B737-8 / B737-8200 is USD 750,000 per incident.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: 'Tax',
    body: 'The consideration is exclusive of GST. Invoices are in INR. Settlement of undisputed invoices is within 30 working days. Overdue undisputed amounts can be charged interest at 1% per month.',
    appliesTo: ['BHS', 'ADS'],
  },
  {
    clauseType: 'sgha',
    label: 'Term',
    body: 'The annex remains in force for three years from the execution date of 16 July 2025, until 15 July 2028.',
    appliesTo: ['BHS', 'ADS'],
  },
];

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();
const existing = await billing.findOne({ docType: 'contract', stationCode: 'DXN', contractNumber: 'QP-DXN-SGHA' });
if (!existing) {
  console.error('QP-DXN-SGHA was not found');
  await client.close();
  process.exit(1);
}

await billing.updateOne(
  { _id: existing._id, stationCode: 'DXN' },
  {
    $set: {
      adsEquipmentRules: rules,
      adsBillingEnabled: true,
      clauses,
      bhsConcessionNote:
        'Rates exclude airport royalty, concession and tax. Comprehensive card is the first volume band: domestic Rs 19,660 (1–200 flights) and international Rs 23,100 (1–150). These are the 1 June 2025 Akasa annex figures for B737-8 and B737-8200. The Noida scan names Delhi and Cochin and does not print its own charge table.',
      priceValidFrom: new Date('2025-06-01T00:00:00.000Z'),
      priceValidTo: new Date('2028-07-15T23:59:59.999Z'),
      openEnded: false,
      updatedAt: now,
    },
  },
);

const saved = await billing.findOne(
  { _id: existing._id },
  { projection: { adsEquipmentRules: 1, priceValidFrom: 1, priceValidTo: 1, openEnded: 1 } },
);
await billing.updateMany(
  { docType: 'price_card_airline', stationCode: 'DXN', customerCode: 'QP', handlingType: { $in: ['BHS', 'ADS'] } },
  { $set: { active: false, updatedAt: now } },
);
let cardCount = 0;
for (const pkg of bhs) {
  for (const aircraftType of pkg.aircraft) {
    await billing.insertOne({
      docType: 'price_card_airline',
      handlingType: 'BHS',
      customerCode: 'QP',
      airlineName: 'Akasa Air',
      validFrom: new Date('2025-06-01T00:00:00.000Z'),
      validTo: new Date('2028-07-15T23:59:59.999Z'),
      remarks: `DXN SGHA. ${pkg.remarks}`,
      aircraftType,
      category: pkg.category,
      price: pkg.price,
      currencyCode: 'INR',
      openEnded: false,
      flightOperation: 'scheduled',
      stationCode: 'DXN',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    cardCount += 1;
  }
}
const cards = cardCount;
console.log(JSON.stringify({
  contract: 'QP-DXN-SGHA',
  rules: (saved.adsEquipmentRules ?? []).map((row) => ({
    serviceCode: row.serviceCode,
    category: row.category ?? '',
    freePerFlight: row.freePerFlight ?? null,
    alwaysChargeable: row.alwaysChargeable,
    includedForAds: row.includedForAds,
    priced: row.unitPriceINR != null || row.unitPriceUSD != null,
  })),
  priceValidFrom: saved.priceValidFrom,
  priceValidTo: saved.priceValidTo,
  openEnded: saved.openEnded,
  activePriceCards: cards,
}, null, 2));
await client.close();
