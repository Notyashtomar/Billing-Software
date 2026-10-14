import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../../../apps/api/package.json'));
const mongoose = require('mongoose');

function loadMongoUri() {
  const envCandidates = [
    resolve(__dirname, '../../../apps/api/.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const p of envCandidates) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const match = content.match(/^(?:MONGODB_URI|MONGO_URI)=(.+)$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

const CATALOG_PREFIX_RE =
  /^(cancel\s+)?((ads|raf)(\s*-\s*(equipment|manpower))?|non[\s-]*scheduled(\s*-\s*(equipment|manpower|flight)|\s+flight)?|scheduled(\s*-\s*(equipment|manpower)|\s+flight)?)\s*-\s*/i;

function stripCatalogServicePrefix(label) {
  let value = String(label ?? '').trim();
  if (!value) return '';
  value = value.replace(
    /\s*\((ads|raf|equipment|manpower|scheduled|non[-\s]*scheduled)\)\s*$/i,
    '',
  );
  for (let i = 0; i < 3; i += 1) {
    const next = value.replace(CATALOG_PREFIX_RE, '').trim().replace(/^-\s*/, '');
    if (next === value) break;
    value = next;
  }
  return value.trim();
}

function inferCatalogMeta(label) {
  const raw = String(label ?? '').trim();
  const lower = raw.toLowerCase();
  const stripped = stripCatalogServicePrefix(raw);
  const strippedUpper = stripped.toUpperCase();

  // 1. Cancelled items
  if (lower.startsWith('cancel scheduled')) {
    if (lower.includes('cabin cleaning') || lower.includes('cleaning')) {
      return { category: 'cleaning', uom: 'FLIGHT' };
    }
    return { category: 'xxld', uom: 'FLIGHT' };
  }

  // 2. Wheelchair items
  if (
    /^(pu-)?wch[rcs](-s)?$/i.test(stripped) ||
    lower.includes('wheelchair') ||
    lower.includes('wheel chair') ||
    lower.endsWith('- wchc') ||
    lower.endsWith('- wchr') ||
    lower.endsWith('- wchs')
  ) {
    const category = lower.startsWith('non scheduled') ? 'non_scheduled' : 'scheduled';
    return { category, uom: 'EA' };
  }

  // 3. Cleaning items
  if (
    lower.includes('cabin cleaning') ||
    lower.includes('deep cleaning') ||
    lower.includes('night halt cleaning') ||
    strippedUpper === 'DC-NB' ||
    strippedUpper === 'EC - NB' ||
    strippedUpper === 'EC-NB' ||
    strippedUpper === 'NHC - NB' ||
    strippedUpper === 'NHC-NB'
  ) {
    return { category: 'cleaning', uom: 'FLIGHT' };
  }

  // 4. Manpower items
  if (
    lower.startsWith('raf - manpower') ||
    lower.startsWith('scheduled - manpower') ||
    lower.startsWith('non scheduled - manpower') ||
    lower === 'manpower' ||
    lower.startsWith('manpower -')
  ) {
    return { category: 'manpower', uom: 'HR' };
  }

  // 5. Scheduled flights / basic handling
  if (
    lower.startsWith('scheduled flight') ||
    lower === 'trnd' ||
    lower === 'trns' ||
    lower === 'ptd'
  ) {
    return { category: 'scheduled', uom: 'FLIGHT' };
  }
  if (lower === 'pu' || lower === 'pus') {
    return { category: 'scheduled', uom: 'EA' };
  }

  // 6. Non-scheduled flights (unless carrying equipment name suffix like Non Scheduled Flight - MDL)
  if (lower.startsWith('non scheduled flight')) {
    if (
      strippedUpper === 'MDL' ||
      strippedUpper === 'C' ||
      strippedUpper === 'CK' ||
      strippedUpper === 'TOW'
    ) {
      // Treat as non-scheduled equipment below
    } else {
      return { category: 'non_scheduled', uom: 'FLIGHT' };
    }
  }

  // 7. Base Category
  let category = 'equipment';
  if (lower.startsWith('raf -')) {
    category = 'raf';
  } else if (lower.startsWith('non scheduled')) {
    category = 'non_scheduled';
  } else if (lower.startsWith('scheduled - equipment') || lower.startsWith('equipment -')) {
    category = 'equipment';
  }

  // 8. Specific Equipment UOM Resolution:
  // Ambulift / Ambulance
  if (/^AMB\b|^AMBULIFT|^PS-AMB/i.test(strippedUpper)) {
    return { category, uom: 'Per Usage' };
  }

  // Air Start Unit
  if (/^ASU|^PST-ASU/i.test(strippedUpper)) {
    return { category, uom: 'Per start' };
  }

  // Step ladders, Headset, Wing Walkers
  if (/^BFL|^PSL|^PU-PSL/i.test(strippedUpper)) {
    return { category, uom: 'Per Turnaround' };
  }
  if (strippedUpper === 'HS' || /^HEAD\s*SET/i.test(strippedUpper)) {
    return { category, uom: 'Per Turnaround' };
  }
  if (strippedUpper === 'WW' || /^WING\s*WALKER/i.test(strippedUpper)) {
    return { category, uom: 'Per turnaround' };
  }

  // Coaches, Buses, Tempo
  if (/^PAX\s*COACH|^PASSENGER|^CREW\s*COACH|^TEMPO|^PTRIP/i.test(strippedUpper)) {
    return { category, uom: 'Per Trip' };
  }

  // Tow Inter Stand (NB / WB)
  if (/^ISTNB|^ISTWB|^TOW-NB|^TOW-WB|^TOW\s*INTER/i.test(strippedUpper)) {
    return { category, uom: 'Per Tow' };
  }

  // Towbars, Aircraft Towing
  if (/^TOWBAR|^LONG\s*TOWBAR|^SHORT\s*TOWBAR|^TOW$|^PTOW/i.test(strippedUpper)) {
    return { category, uom: 'Per push/tow' };
  }

  // Pushback
  if (/^PBNB|^PBWB|^PUSH\s*BACK|^PP-PUSHBACK/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }

  // Toilet & Water services
  if (strippedUpper === 'TS' || /^TOILET|^PS-TS/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }
  if (strippedUpper === 'WC' || /^WATER|^PS-WS/i.test(strippedUpper)) {
    return { category, uom: 'Per service' };
  }

  // Fire Extinguisher, Chocks, Cargo kit
  if (strippedUpper === 'FE' || /^FIRE/i.test(strippedUpper) || strippedUpper === 'CK') {
    return { category, uom: 'EA' };
  }

  // Loaders, Tractors, GPU, ACU, Dollies, Vehicles, Belts, Trestles (Time-based equipment)
  if (
    /^GPU|^ACU|^LDL|^MDL|^UDL|^EBT|^DT|^BT|^PH-BC|^PH-GPU|^PH-ACU|^C$|^C1$|^CBM|^CD|^PD|^BMW|^MG|^RC|^TRE|^URB|^FORK|^MPSL/i.test(
      strippedUpper,
    )
  ) {
    return { category, uom: 'Per Hour' };
  }

  return { category, uom: 'Per Hour' };
}

async function main() {
  const uri = loadMongoUri();
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const billingCol = mongoose.connection.collection('billing');
  const items = await billingCol.find({ docType: 'service_catalog' }).toArray();
  console.log(`Found ${items.length} service_catalog documents in billing collection.`);

  let updatedCount = 0;
  for (const item of items) {
    const meta = inferCatalogMeta(item.serviceCode);
    if (item.uom !== meta.uom || item.category !== meta.category) {
      await billingCol.updateOne(
        { _id: item._id },
        {
          $set: {
            uom: meta.uom,
            category: meta.category,
            updatedAt: new Date(),
          },
        },
      );
      updatedCount++;
      console.log(`Updated ${item.serviceCode}: category="${meta.category}", uom="${meta.uom}"`);
    }
  }

  // Also check legacy billing_service_catalog if collection exists
  const legacyCol = mongoose.connection.collection('billing_service_catalog');
  const legacyCount = await legacyCol.countDocuments();
  if (legacyCount > 0) {
    const legacyItems = await legacyCol.find({}).toArray();
    for (const item of legacyItems) {
      const meta = inferCatalogMeta(item.serviceCode);
      if (item.uom !== meta.uom || item.category !== meta.category) {
        await legacyCol.updateOne(
          { _id: item._id },
          {
            $set: {
              uom: meta.uom,
              category: meta.category,
              updatedAt: new Date(),
            },
          },
        );
      }
    }
    console.log(`Also updated legacy billing_service_catalog collection.`);
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Updated ${updatedCount} of ${items.length} items with actual units of measurement.`);

  // Verify final distribution
  const finalItems = await billingCol.find({ docType: 'service_catalog' }).toArray();
  const uomDist = {};
  for (const it of finalItems) {
    uomDist[it.uom] = (uomDist[it.uom] || 0) + 1;
  }
  console.log('Final UOM distribution in database:', uomDist);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
