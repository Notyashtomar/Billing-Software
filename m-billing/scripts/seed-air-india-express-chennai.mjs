#!/usr/bin/env node
console.error('Seeding is disabled. Use normal create/save APIs instead.');
process.exit(1);
/**
 * Seed Air India Express (Chennai) price-card data into billing:
 *   - Service catalog codes (Priority 3)
 *   - Domestic + International contracts with delay / XXLD clauses (Priority 4)
 *   - Rate cards with INR prices + remarks (Priority 5)
 *
 * Source: Chennai price card Excel — band 2026-01-01 → 2026-03-31 (covers Feb–Mar billing).
 *
 * Usage (from repo root):
 *   node BWMS/modules/m-billing/scripts/seed-air-india-express-chennai.mjs --dry-run
 *   node BWMS/modules/m-billing/scripts/seed-air-india-express-chennai.mjs --station=MAA --customer=AIX
 *
 * Options:
 *   --dry-run          Print form mapping only; no DB writes
 *   --station=MAA      Station code (default MAA)
 *   --customer=AIX     Billing customer code (default AIX — change if yours is IX)
 *   --valid-from=      Rate valid from (default 2026-02-28)
 *   --valid-to=        Rate valid to (default 2026-03-31)
 *   --create-customer  Insert customer if missing
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');

const dryRun = process.argv.includes('--dry-run');
const createCustomer = process.argv.includes('--create-customer');
const stationArg = process.argv.find((a) => a.startsWith('--station='));
const customerArg = process.argv.find((a) => a.startsWith('--customer='));
const validFromArg = process.argv.find((a) => a.startsWith('--valid-from='));
const validToArg = process.argv.find((a) => a.startsWith('--valid-to='));

const stationCode = stationArg?.split('=')[1]?.toUpperCase() || 'MAA';
const customerCode = customerArg?.split('=')[1]?.toUpperCase() || 'AIX';
const validFrom = validFromArg?.split('=')[1] || '2026-02-28';
const validTo = validToArg?.split('=')[1] || '2026-03-31';

const BILLING = 'billing';
const DOC = {
  customer: 'customer',
  serviceCatalog: 'service_catalog',
  contract: 'contract',
  rateCard: 'rate_card',
};

/** Contract-level clauses (lower price-card table). */
const CONTRACT_CLAUSES = {
  delayClause:
    'Clause 1.2.6: 10% would be charge for flights delayed beyond 6 hrs from STA/STD.',
  xxlnClause:
    'Clause 1.2.8: 50% additional charges in XXLN within 6 hrs from STA.',
};

const CPI_REMARK =
  'Price band: 2.75% capping annual increase as per CPI clause 1.3.1 w.e.f 01.01.26. All rates excluding concession fee.';

const TURNAROUND_REMARKS = [
  CPI_REMARK,
  'Clause 1.2.1: RTR shall be FOC if physical change is not involved; otherwise per annex 1.2.',
  'Clause 1.2.3: 50% additional for technical landing (non-commercial) if no physical load change.',
  'Clause 1.2.7: 50% charge for ferry-out flights.',
].join(' ');

const WCHR_REMARK =
  'Clause 2.1.3(a)(2): 05 WCHC/R/S included in basic handling per flight (cumulative monthly).';

/** Service catalog rows to upsert before rate cards. */
const SERVICE_CATALOG = [
  {
    serviceCode: 'Scheduled Flight',
    description: 'Scheduled turnaround / basic handling',
    category: 'scheduled',
    uom: 'FLIGHT',
  },
  {
    serviceCode: 'TRND',
    description: 'Turnaround / basic handling (price card)',
    category: 'scheduled',
    uom: 'FLIGHT',
  },
  { serviceCode: 'PU-WCHR-S', description: 'Wheelchair — ramp (WCHR)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PU-WCHS', description: 'Wheelchair — steps (WCHS)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PU-WCHC', description: 'Wheelchair — cabin (WCHC)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PS-AMB', description: 'Ambulance (AMB)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PH-GPU', description: 'GPU — per half hour or part thereof', category: 'equipment', uom: 'MIN' },
  { serviceCode: 'PH-ACU', description: 'ACU — per half hour or part thereof', category: 'equipment', uom: 'MIN' },
  { serviceCode: 'PST-ASU', description: 'Air Start Unit (ASU)', category: 'equipment', uom: 'EA' },
  { serviceCode: 'PP-PUSHBACK', description: 'Push back', category: 'equipment', uom: 'EA' },
  { serviceCode: 'PTOW', description: 'Aircraft towing', category: 'equipment', uom: 'EA' },
  { serviceCode: 'PS-WS', description: 'Water service (WS)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PS-TS', description: 'Toilet service (TS)', category: 'scheduled', uom: 'EA' },
  { serviceCode: 'PH-BC', description: 'Baggage cart (BC)', category: 'equipment', uom: 'MIN' },
  { serviceCode: 'PU-PSL', description: 'Passenger step ladder (PSL)', category: 'scheduled', uom: 'EA' },
];

/**
 * Each line = one "New rate card" form submission.
 * contractCategory: Dom | Int | Both (equipment duplicated on both contracts)
 */
const RATE_LINES = [
  {
    contractCategory: 'Dom',
    serviceCode: 'Scheduled Flight',
    billingReference: 'TRND',
    category: 'A320/B737/B737MAX',
    uom: 'FLIGHT',
    unitPriceINR: 21662,
    discountDelayPercent: 10,
    remarks: `${TURNAROUND_REMARKS} DOM column on price card.`,
  },
  {
    contractCategory: 'Int',
    serviceCode: 'Scheduled Flight',
    billingReference: 'TRND',
    category: 'A320/B737/B737MAX',
    uom: 'FLIGHT',
    unitPriceINR: 26011,
    discountDelayPercent: 10,
    remarks: `${TURNAROUND_REMARKS} INTL column on price card.`,
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PU-WCHR-S',
    billingReference: 'PU',
    unitPriceINR: 493,
    uom: 'EA',
    remarks: WCHR_REMARK,
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PU-WCHS',
    billingReference: 'PU',
    unitPriceINR: 493,
    uom: 'EA',
    remarks: WCHR_REMARK,
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PU-WCHC',
    billingReference: 'PU',
    unitPriceINR: 616,
    uom: 'EA',
    remarks: WCHR_REMARK,
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PS-AMB',
    billingReference: 'PS',
    unitPriceINR: 5959,
    uom: 'EA',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PH-GPU',
    billingReference: 'PH',
    unitPriceINR: 2158,
    uom: 'MIN',
    remarks: 'Per half hour or part thereof (price card column PH).',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PH-ACU',
    billingReference: 'PH',
    unitPriceINR: 3904,
    uom: 'MIN',
    remarks: 'Per half hour or part thereof (price card column PH).',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PST-ASU',
    billingReference: 'PST',
    unitPriceINR: 5651,
    uom: 'EA',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PP-PUSHBACK',
    billingReference: 'PP',
    unitPriceINR: 5035,
    uom: 'EA',
    remarks: 'Clause 1.2.1 also applies to return-to-ramp when pushback involved.',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PTOW',
    billingReference: 'PTOW',
    unitPriceINR: 6679,
    uom: 'EA',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PS-WS',
    billingReference: 'PS',
    unitPriceINR: 2055,
    uom: 'EA',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PS-TS',
    billingReference: 'PS',
    unitPriceINR: 1850,
    uom: 'EA',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PH-BC',
    billingReference: 'PH',
    unitPriceINR: 308,
    uom: 'MIN',
  },
  {
    contractCategory: 'Both',
    serviceCode: 'PU-PSL',
    billingReference: 'PU',
    unitPriceINR: 2466,
    uom: 'EA',
  },
];

function loadMongoUri() {
  const candidates = [
    resolve(__dirname, '../../../apps/api/.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const text = readFileSync(envPath, 'utf8');
    const match =
      text.match(/^MONGODB_URI=(.+)$/m) ?? text.match(/^MONGO_URI=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  const fromEnv = process.env.MONGODB_URI?.trim() || process.env.MONGO_URI?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

function now() {
  return new Date();
}

function printFormGuide(contracts) {
  console.log('\n=== How this maps to the New rate card form ===\n');
  console.log(
    'Contract (Dom)  →',
    contracts.Dom?.contractNumber ?? `AIX-${stationCode}-SGHA-DOM-2026`,
  );
  console.log(
    'Contract (Int)  →',
    contracts.Int?.contractNumber ?? `AIX-${stationCode}-SGHA-INT-2026`,
  );
  console.log('Customer code   →', customerCode);
  console.log('Currency        → INR');
  console.log('Valid from / to →', validFrom, '→', validTo);
  console.log('\nContract fields (Priority 4 — not on rate card form):');
  console.log('  Delay clause  →', CONTRACT_CLAUSES.delayClause);
  console.log('  XXLD clause   →', CONTRACT_CLAUSES.xxlnClause);
  console.log('\nRate card rows (one form save each):\n');
  console.log(
    [
      'Contract'.padEnd(6),
      'Service'.padEnd(16),
      'Ref'.padEnd(6),
      'Aircraft band'.padEnd(20),
      'UOM'.padEnd(8),
      'INR'.padEnd(8),
      'Remarks',
    ].join(' | '),
  );
  console.log('-'.repeat(120));

  for (const line of RATE_LINES) {
    const cats =
      line.contractCategory === 'Both' ? ['Dom', 'Int'] : [line.contractCategory];
    for (const cat of cats) {
      console.log(
        [
          cat.padEnd(6),
          line.serviceCode.padEnd(16),
          line.billingReference.padEnd(6),
          (line.category ?? '—').padEnd(20),
          line.uom.padEnd(8),
          String(line.unitPriceINR).padEnd(8),
          (line.remarks ?? '—').slice(0, 60),
        ].join(' | '),
      );
    }
  }
  console.log(
    '\nNote: contractCategory "Both" = save the same equipment row twice (Dom + Int contracts).',
  );
  console.log(
    'Scheduled Flight uses service code "Scheduled Flight" so Scheduled Flights billing can rate-match.',
  );
}

async function upsertCustomer(col) {
  const existing = await col.findOne({ docType: DOC.customer, stationCode, customerCode });
  if (existing) return { doc: existing, created: false };

  if (!createCustomer && !dryRun) {
    console.warn(
      `Customer ${customerCode} not found at ${stationCode}. Run with --create-customer or add manually.`,
    );
    return { doc: null, created: false };
  }

  const doc = {
    docType: DOC.customer,
    customerCode,
    name: 'Air India Express',
    currencyCode: 'INR',
    blocked: false,
    active: true,
    stationCode,
    createdAt: now(),
    updatedAt: now(),
  };
  if (!dryRun) {
    const res = await col.insertOne(doc);
    doc._id = res.insertedId;
  }
  return { doc, created: true };
}

async function upsertServiceCatalog(col) {
  let created = 0;
  let skipped = 0;
  for (const row of SERVICE_CATALOG) {
    const exists = await col.findOne({
      docType: DOC.serviceCatalog,
      stationCode,
      serviceCode: row.serviceCode,
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    const doc = {
      docType: DOC.serviceCatalog,
      serviceCode: row.serviceCode,
      description: row.description,
      lineType: 'service',
      category: row.category,
      uom: row.uom,
      royaltyApplicable: false,
      active: true,
      stationCode,
      createdAt: now(),
      updatedAt: now(),
    };
    if (!dryRun) await col.insertOne(doc);
    created += 1;
  }
  return { created, skipped };
}

async function upsertContract(col, category) {
  const contractNumber = `${customerCode}-${stationCode}-SGHA-${category.toUpperCase()}-2026`;
  const existing = await col.findOne({
    docType: DOC.contract,
    stationCode,
    contractNumber,
  });
  if (existing) {
    if (!dryRun) {
      await col.updateOne(
        { _id: existing._id },
        {
          $set: {
            delayClause: CONTRACT_CLAUSES.delayClause,
            xxlnClause: CONTRACT_CLAUSES.xxlnClause,
            aircraftTypes: ['A320', 'B737', 'B737MAX'],
            priceValidFrom: new Date(validFrom),
            priceValidTo: new Date(validTo),
            status: 'active',
            updatedAt: now(),
          },
        },
      );
    }
    return { doc: existing, created: false, contractNumber };
  }

  const doc = {
    docType: DOC.contract,
    contractNumber,
    customerCode,
    stationCode,
    category,
    aircraftTypes: ['A320', 'B737', 'B737MAX'],
    priceValidFrom: new Date(validFrom),
    priceValidTo: new Date(validTo),
    delayClause: CONTRACT_CLAUSES.delayClause,
    xxlnClause: CONTRACT_CLAUSES.xxlnClause,
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  };
  if (!dryRun) {
    const res = await col.insertOne(doc);
    doc._id = res.insertedId;
  }
  return { doc, created: true, contractNumber };
}

async function upsertRateCard(col, contractId, line) {
  const filter = {
    docType: DOC.rateCard,
    stationCode,
    customerCode,
    serviceCode: line.serviceCode,
    contractId,
    validFrom: new Date(validFrom),
    ...(line.category ? { category: line.category } : {}),
  };

  const payload = {
    contractId,
    customerCode,
    serviceCode: line.serviceCode,
    billingReference: line.billingReference,
    category: line.category,
    currency: 'INR',
    uom: line.uom,
    unitPriceINR: line.unitPriceINR,
    discountDelayPercent: line.discountDelayPercent,
    remarks: line.remarks,
    validFrom: new Date(validFrom),
    validTo: new Date(validTo),
    stationCode,
    updatedAt: now(),
  };

  const existing = await col.findOne(filter);
  if (existing) {
    if (!dryRun) {
      await col.updateOne({ _id: existing._id }, { $set: payload });
    }
    return 'updated';
  }

  if (!dryRun) {
    await col.insertOne({
      docType: DOC.rateCard,
      ...payload,
      createdAt: now(),
    });
  }
  return 'created';
}

async function main() {
  console.log(
    `Air India Express Chennai seed — station=${stationCode} customer=${customerCode}${dryRun ? ' (DRY RUN)' : ''}`,
  );

  const contractsPreview = {
    Dom: { contractNumber: `${customerCode}-${stationCode}-SGHA-DOM-2026` },
    Int: { contractNumber: `${customerCode}-${stationCode}-SGHA-INT-2026` },
  };
  printFormGuide(contractsPreview);

  if (dryRun) {
    console.log('\nDry run complete — no database changes. Re-run without --dry-run to insert.');
    return;
  }

  const uri = loadMongoUri();
  if (!uri) {
    console.error(
      '\nNo MongoDB URI found. Set MONGODB_URI in BWMS/apps/api/.env (same as Nest) or pass it in the shell:\n' +
        '  $env:MONGODB_URI="your-connection-string"; node BWMS/modules/m-billing/scripts/seed-air-india-express-chennai.mjs\n',
    );
    process.exit(1);
  }

  console.log('\nConnecting to MongoDB…');
  await mongoose.connect(uri);
  const col = mongoose.connection.collection(BILLING);

  const { doc: customer, created: customerCreated } = await upsertCustomer(col);
  if (!customer && !createCustomer) {
    console.error('\nAborting: create customer first or pass --create-customer');
    await mongoose.disconnect();
    process.exit(1);
  }

  const catalogStats = await upsertServiceCatalog(col);
  const dom = await upsertContract(col, 'Dom');
  const intl = await upsertContract(col, 'Int');

  let rateCreated = 0;
  let rateUpdated = 0;

  for (const line of RATE_LINES) {
    const categories =
      line.contractCategory === 'Both' ? ['Dom', 'Int'] : [line.contractCategory];
    for (const cat of categories) {
      const contract = cat === 'Dom' ? dom.doc : intl.doc;
      if (!contract?._id) continue;
      const result = await upsertRateCard(col, contract._id, line);
      if (result === 'created') rateCreated += 1;
      else rateUpdated += 1;
    }
  }

  console.log('\n=== Seed complete ===');
  if (customerCreated) console.log('Customer created:', customerCode);
  console.log(
    `Service catalog: ${catalogStats.created} created, ${catalogStats.skipped} already existed`,
  );
  console.log(
    `Contracts: Dom ${dom.created ? 'created' : 'updated'} | Int ${intl.created ? 'created' : 'updated'}`,
  );
  console.log(`Rate cards: ${rateCreated} created, ${rateUpdated} updated`);
  console.log('\nOpen Billing → Rate Cards and filter by customer', customerCode);
  console.log('Edit any row to see Remarks and compare with the printed table above.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
