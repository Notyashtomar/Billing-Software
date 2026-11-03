/**
 * Load Cochin Kuwait Airways and Oman Air SGHA rates from the signed PDFs
 * in api/data/COK_SGHA, and attach those PDFs to the existing COK contracts.
 *
 * Kuwait: Addendum 5, effective 1 Nov 2015, renews every three years.
 * Oman: Addendum 1 replaces the basic-handling table from 1 Jun 2026.
 * Printed amounts are stored as printed. The later 5% step is a clause.
 *
 * Usage (from api/): node scripts/seed-cok-kuwait-oman.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { MongoClient } = require('mongodb');

const STATION = 'COK';
const FAR = '2099-12-31';
const root = dirname(fileURLToPath(import.meta.url));
const uri = (readFileSync(join(root, '../.env'), 'utf8').match(/^MONGO_URI=(.*)$/m) || [])[1];
const folder = join(root, '../data/COK_SGHA');

function day(iso, end = false) {
  return new Date(`${iso}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
}

function rule(serviceCode, amount, uom, extra = {}) {
  const row = {
    serviceCode,
    includedForAds: true,
    alwaysChargeable: extra.free == null || extra.free === 0,
    uom,
    aircraftTypes: extra.aircraft ?? [],
    remarks: extra.remarks ?? '',
    unitPriceUSD: amount,
  };
  if (extra.free != null) row.freePerFlight = extra.free;
  if (extra.free != null && extra.free > 0) row.alwaysChargeable = false;
  return row;
}

function clause(label, body) {
  return { clauseType: 'sgha', label, body, appliesTo: ['BHS', 'ADS'] };
}

const KU_AIRCRAFT = ['A320', 'A300-600', 'A310-300', 'A330', 'A340', 'B747', 'B777'];
const WY_AIRCRAFT = ['B737', 'B737-800', 'B737-900', 'B737 MAX'];

const contracts = [
  {
    contractNumber: 'KU-COK-SGHA',
    customerCode: 'KU',
    name: 'Kuwait Airways',
    pdf: 'Kuwait_SGHA_COK.pdf',
    from: '2015-11-01',
    to: FAR,
    openEnded: true,
    aircraftTypes: KU_AIRCRAFT,
    coverage: 'comprehensive',
    concessionNote:
      'Addendum 5 rates include the airport ground-handling royalty or concession, and exclude service tax and other levies.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 6,
      cancellationWithinHoursPercent: 25,
    },
    bhs: [
      {
        aircraft: ['A320'],
        price: 1932,
        remarks: 'Addendum 5, 1 Nov 2015. Ramp and terminal handling per flight. Inclusive of concession.',
      },
      {
        aircraft: ['A300-600', 'A310-300'],
        price: 2340,
        remarks: 'Addendum 5. A300-600 / A310-300 ramp and terminal handling per flight.',
      },
      {
        aircraft: ['A330', 'A340', 'B747', 'B777'],
        price: 3852,
        remarks: 'Addendum 5. A330 / A340 / B747 / B777 ramp and terminal handling per flight.',
      },
    ],
    rules: [
      rule('Wheel Chair - WCHR/S', 25, 'Per Unit', {
        remarks: 'Additional WCHR or WCHS USD 25. 200 non-accumulative WCHR/WCHS per month are included in basic handling.',
      }),
      rule('Wheel Chair-WCHC', 30, 'Per Unit', {
        remarks: 'Additional WCHC USD 30. The 200-chair monthly allowance in the annex is stated for WCHR/WCHS.',
      }),
      rule('Ambulift', 225, 'Per Usage', { remarks: 'USD 225 per use. Accommodates 1–4 wheelchairs or 1 stretcher.' }),
      rule('Ground Power Unit', 120, 'Per Usage', { remarks: 'Printed GPU rate USD 120. The annex does not state an hour unit for GPU.' }),
      rule('Air Conditioner Unit', 126, 'Per Hour', { remarks: 'USD 126 per hour or part thereof.' }),
      rule('Passenger Coach', 115, 'Per Turnaround', {}),
      rule('Air Start Unit', 120, 'Per Start', {}),
      rule('Push Back', 170, 'Per Push', { free: 1, remarks: 'One pushback is included in basic handling. Additional push USD 170.' }),
      rule('Towing', 295, 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Aircraft Cleaning', 160, 'Per Service', { remarks: 'Deep or layover cleaning USD 160. Turnaround cleaning is included in basic handling.' }),
      rule('ULD Storage', 10, 'Per Month', { remarks: 'USD 10 per LD3 per month. USD 15 per LD11 per month. 30 ULD included. 1 LD11 counts as 2 LD3.' }),
      rule('Blue Collar', 22, 'Per Turnaround', { remarks: 'Additional porter or utility hand, USD 22 per person per scheduled turnaround.' }),
      rule('VAL Handling', 40, 'Per Unit', { remarks: 'USD 40 per service, per standard container.' }),
    ],
    clauses: [
      clause('1.2', 'Addendum 5 basic handling, all in USD per flight: A320 1,932; A300-600/A310-300 2,340; A330/A340/B747/B777 3,852. Effective 1 November 2015.'),
      clause('Term', 'The 1 November 2015 term runs to 31 October 2018 and renews automatically for the same three-year period unless either party gives 90 days written notice. The annex does not print a later price change.'),
      clause('1.3', 'Service tax and other levies are extra.'),
      clause('1.4', 'No extra charge for night, weekend, or legal-holiday handling.'),
      clause('1.5', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.6', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.7', 'Return to ramp with a physical change of load is 50% of the basic rate.'),
      clause('1.8', 'Cancellation within 6 hours is 25% of the basic rate.'),
      clause('1.9', 'The basic rates include ground-handling royalty. No other airport levy is included unless the airport operator later enforces one.'),
      clause('3.1', 'Disbursements are recharged at cost plus an accounting surcharge of 10%.'),
      clause('Addendum 2', 'Kuwait flights diverting to Bengaluru are handled by GlobeGround India on the Cochin Annex B1.0 terms. That diversion is not a Cochin price.'),
    ],
  },
  {
    contractNumber: 'WY-COK-SGHA',
    customerCode: 'WY',
    name: 'Oman Air',
    pdf: 'Oman_SGHA_COK.pdf',
    from: '2026-06-01',
    to: '2029-03-31',
    openEnded: false,
    aircraftTypes: WY_AIRCRAFT,
    coverage: 'comprehensive',
    concessionNote:
      'The 1 June 2026 basic handling charge includes the current airport concession or royalty and excludes GST.',
    conditional: {
      technicalHandlingChargesPercent: 50,
      returnToRamp: 0,
      cancellationWithinHours: 12,
      cancellationWithinHoursPercent: 50,
      delayChargesPercent: 10,
      filoLifoChargesPercent: 75,
    },
    bhs: [
      {
        aircraft: WY_AIRCRAFT,
        price: 1600,
        remarks: 'Addendum 1, effective 1 June 2026. B737-800/900 MAX handling per flight, USD 1,600. Inclusive of concession, exclusive of GST. Fixed until 31 May 2027.',
      },
    ],
    rules: [
      rule('Departure Stationery', 50, 'Per Flight', { remarks: 'Boarding passes and baggage tags.' }),
      rule('Wheel Chair - WCHR/S', 31, 'Per Unit', {
        free: 5,
        remarks: 'Five WCHR/WCHS per flight are included in basic handling. Additional unit USD 31.',
      }),
      rule('Wheel Chair-WCHC', 31, 'Per Unit', { remarks: 'WCHC USD 31. The five included chairs are stated for WCHR/WCHS.' }),
      rule('Ambulift', 234, 'Per Usage', { remarks: 'Accommodates 1–4 wheelchairs or 1 stretcher.' }),
      rule('Ground Power Unit', 112, 'Per Hour', { remarks: 'USD 112 per hour or part thereof.' }),
      rule('Air Conditioner Unit', 165, 'Per Hour', { remarks: 'Remote bay only. USD 165 per hour or part thereof.' }),
      rule('Air Start Unit', 144, 'Per Start', {}),
      rule('Passenger Coach', 65, 'Per Turnaround', {}),
      rule('Crew Coach', 41, 'Per Turnaround', {}),
      rule('Push Back', 224, 'Per Push', { free: 1, remarks: 'One pushback is included in basic handling. Additional push USD 224.' }),
      rule('Towing', 195, 'Per Tow', { remarks: 'Inter-stand tow.' }),
      rule('Line Maintenance', 73, 'Per Hour', { remarks: 'USD 73 per staff per hour.' }),
      rule('Blue Collar', 14, 'Per Hour', { remarks: 'Additional porter or utility hand, USD 14 per staff per hour.' }),
    ],
    clauses: [
      clause('Addendum 1', 'From 1 June 2026 the basic handling table is replaced by B737-800/900 MAX at USD 1,600 per flight. The charge includes the current concession and excludes GST.'),
      clause('15.1', 'Addendum 1 runs from 1 June 2026 to 31 March 2029 unless ended with 60 days written notice.'),
      clause('15.2', 'The USD 1,600 rate is fixed for one year. From 1 June 2027 it increases by 5% a year. The addendum does not print the later amount.'),
      clause('1.4', 'Technical landing for a non-commercial purpose is 50% when there is no physical change of load.'),
      clause('1.5', 'Return to ramp is not charged extra when there is no physical change of load.'),
      clause('1.6', 'Return to ramp with a physical change of load is charged as a technical landing (50%).'),
      clause('1.7', 'Ferry-in-live-out or live-in-ferry-out is 75% when the aircraft is empty and has no loose cargo to load or unload.'),
      clause('1.8', 'No extra charge for night, Saturday, Sunday, or legal-holiday handling.'),
      clause('1.9', 'Cancellation within 12 hours is 50%.'),
      clause('1.11', 'A delay not caused by the Handling Company is an extra 10% after 2 hours from schedule, and 20% after 4 hours.'),
      clause('Prior table', 'Until 31 May 2026 the annex table was B737 USD 2,200 and A330 USD 4,200, with 5% annual increases from 1 May 2024. Those cards stay in force only through 31 May 2026.'),
      clause('3.1', 'Disbursements are recharged at cost plus an accounting surcharge of 7%.'),
    ],
  },
];

const client = new MongoClient(uri);
await client.connect();
const billing = client.db('test').collection('billing');
const pdfs = client.db('test').collection('billing_contract_pdfs');
const now = new Date();
const summary = [];

for (const item of contracts) {
  const contract = await billing.findOne({
    docType: 'contract',
    stationCode: STATION,
    contractNumber: item.contractNumber,
  });
  if (!contract) {
    throw new Error(`Missing contract ${item.contractNumber}`);
  }

  await billing.updateOne(
    { _id: contract._id, stationCode: STATION },
    {
      $set: {
        customerCode: item.customerCode,
        stationCode: STATION,
        category: 'Both',
        categories: ['Dom', 'Int'],
        aircraftTypes: item.aircraftTypes,
        priceValidFrom: day(item.from),
        priceValidTo: day(item.to, true),
        openEnded: item.openEnded,
        status: 'active',
        adsBillingEnabled: true,
        bhsConcessionCoverage: item.coverage,
        bhsConcessionNote: item.concessionNote,
        conditionalCharges: item.conditional,
        clauses: item.clauses,
        adsEquipmentRules: item.rules,
        updatedAt: now,
      },
    },
  );

  if (item.customerCode === 'KU') {
    await billing.updateMany(
      {
        docType: 'price_card_airline',
        stationCode: STATION,
        customerCode: 'KU',
        handlingType: { $in: ['BHS', 'ADS'] },
        active: { $ne: false },
      },
      { $set: { active: false, updatedAt: now } },
    );
  } else {
    await billing.updateMany(
      {
        docType: 'price_card_airline',
        stationCode: STATION,
        customerCode: 'WY',
        handlingType: { $in: ['BHS', 'ADS'] },
        active: { $ne: false },
        validFrom: { $lt: day('2026-06-01') },
        validTo: { $gte: day('2026-06-01') },
      },
      { $set: { validTo: day('2026-05-31', true), updatedAt: now } },
    );
  }

  let bhsCount = 0;
  for (const pkg of item.bhs) {
    for (const aircraftType of pkg.aircraft) {
      for (const category of ['Dom', 'Int']) {
        for (const handlingType of ['BHS', 'ADS']) {
          await billing.insertOne({
            docType: 'price_card_airline',
            handlingType,
            customerCode: item.customerCode,
            airlineName: item.name,
            validFrom: day(item.from),
            validTo: day(item.to, true),
            remarks: pkg.remarks,
            aircraftType,
            category,
            ...(handlingType === 'BHS' ? { price: pkg.price } : {}),
            currencyCode: 'USD',
            openEnded: item.openEnded,
            flightOperation: 'scheduled',
            stationCode: STATION,
            active: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        bhsCount += 1;
      }
    }
  }

  const fileName = item.pdf;
  const data = readFileSync(join(folder, fileName));
  await pdfs.updateOne(
    { contractId: contract._id },
    {
      $set: {
        contractId: contract._id,
        stationCode: STATION,
        contractNumber: item.contractNumber,
        fileName,
        contentType: 'application/pdf',
        uploadedAt: now,
        data,
      },
    },
    { upsert: true },
  );
  await billing.updateOne(
    { _id: contract._id },
    {
      $set: {
        contractPdfFileName: fileName,
        contractPdfContentType: 'application/pdf',
        contractPdfUploadedAt: now,
      },
      $unset: { contractPdfBase64: '' },
    },
  );

  summary.push({
    contract: item.contractNumber,
    from: item.from,
    to: item.openEnded ? 'open' : item.to,
    bhsCards: bhsCount,
    rules: item.rules.length,
    pdfBytes: data.length,
  });
}

console.log(JSON.stringify({ station: STATION, summary }, null, 2));
await client.close();
