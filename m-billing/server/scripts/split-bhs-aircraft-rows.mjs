/**
 * Split combined BHS/ADS price-card aircraft labels into one type per row.
 * Airlines UL, AY, CA, VJ, AF, C6, XJ, VS keep their grouped commercial rows.
 *
 *   node split-bhs-aircraft-rows.mjs           # dry run
 *   node split-bhs-aircraft-rows.mjs --apply
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  BHS_GROUPED_AIRCRAFT_CUSTOMERS,
  expandBhsAircraftLabel,
  remarksForSplitAircraft,
} from './lib/bhs-aircraft-row.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');

config({ path: resolve(__dirname, '../../../../apps/api/.env'), quiet: true });

function ymd(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  return raw;
}

function priceKey(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(value);
}

function rowKey(row, aircraftType, remarks) {
  return [
    row.stationCode,
    row.handlingType,
    String(row.customerCode ?? '').toUpperCase(),
    aircraftType,
    row.category ?? '',
    priceKey(row.price),
    ymd(row.validFrom),
    ymd(row.validTo),
    String(remarks ?? '').trim(),
  ].join('|');
}

function plannedNames(label) {
  const expanded = expandBhsAircraftLabel(label);
  if (expanded.aircraft.length === 0) return null;
  if (expanded.aircraft.length === 1 && expanded.aircraft[0] === String(label ?? '').trim()) {
    return null;
  }
  return expanded;
}

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const billing = mongoose.connection.collection('billing');

const rows = await billing
  .find({
    docType: 'price_card_airline',
    handlingType: { $in: ['BHS', 'ADS'] },
    active: true,
  })
  .toArray();

const occupied = new Map();
for (const row of rows) {
  const code = String(row.customerCode ?? '').toUpperCase();
  if (BHS_GROUPED_AIRCRAFT_CUSTOMERS.has(code)) continue;
  const plan = plannedNames(row.aircraftType);
  if (plan) continue;
  occupied.set(rowKey(row, String(row.aircraftType ?? '').trim(), row.remarks), row._id.toString());
}

const updates = [];
const inserts = [];
const deactivates = [];

for (const row of rows) {
  const code = String(row.customerCode ?? '').toUpperCase();
  if (BHS_GROUPED_AIRCRAFT_CUSTOMERS.has(code)) continue;
  const plan = plannedNames(row.aircraftType);
  if (!plan) continue;

  const fresh = [];
  for (const aircraftType of plan.aircraft) {
    const remarks = remarksForSplitAircraft(
      row.remarks,
      row.aircraftType,
      aircraftType,
      plan.condition,
    );
    const key = rowKey(row, aircraftType, remarks);
    if (occupied.has(key)) continue;
    occupied.set(key, 'new');
    fresh.push({ aircraftType, remarks, key });
  }

  if (fresh.length === 0) {
    deactivates.push(row);
    continue;
  }

const [first, ...rest] = fresh;
  updates.push({ row, aircraftType: first.aircraftType, remarks: first.remarks });
  for (const item of rest) {
    inserts.push({ row, aircraftType: item.aircraftType, remarks: item.remarks });
  }
}

const rateCards = await billing.find({ docType: 'rate_card', aircraftType: /\// }).toArray();
const rateClaim = new Map();
const rateUpdates = [];
const rateInserts = [];
const rateDeletes = [];
for (const card of rateCards) {
  const code = String(card.customerCode ?? '').toUpperCase();
  if (BHS_GROUPED_AIRCRAFT_CUSTOMERS.has(code)) continue;
  const plan = plannedNames(card.aircraftType);
  if (!plan) continue;
  const original = String(card.aircraftType);
  const accepted = [];
  for (const aircraftType of plan.aircraft) {
    const key = [
      card.stationCode,
      code,
      card.serviceCode,
      card.category ?? '',
      aircraftType,
      priceKey(card.unitPriceINR),
      priceKey(card.unitPriceUSD),
      ymd(card.validFrom),
      ymd(card.validTo),
      card.billingScope ?? '',
      card.billingReference ?? '',
    ].join('|');
    const owner = rateClaim.get(key);
    if (owner && owner !== original) continue;
    if (!owner) rateClaim.set(key, original);
    accepted.push(aircraftType);
  }
  if (accepted.length === 0) {
    rateDeletes.push(card);
    continue;
  }
  const [aircraftType, ...extra] = accepted;
  rateUpdates.push({ card, aircraftType });
  for (const name of extra) rateInserts.push({ card, aircraftType: name });
}

const byAirline = new Map();
function note(code, station, line) {
  const key = `${station} ${code}`;
  if (!byAirline.has(key)) byAirline.set(key, []);
  byAirline.get(key).push(line);
}
for (const item of updates) {
  note(
    item.row.customerCode,
    item.row.stationCode,
    `${item.row.handlingType} ${item.row.category} "${item.row.aircraftType}" -> ${item.aircraftType} @ ${item.row.price ?? '—'}${item.remarks && item.remarks !== item.row.remarks ? ` [${item.remarks}]` : ''}`,
  );
}
for (const item of inserts) {
  note(
    item.row.customerCode,
    item.row.stationCode,
    `${item.row.handlingType} ${item.row.category} + ${item.aircraftType} @ ${item.row.price ?? '—'}`,
  );
}
for (const row of deactivates) {
  note(row.customerCode, row.stationCode, `${row.handlingType} deactivate "${row.aircraftType}" (already covered)`);
}

for (const [key, lines] of [...byAirline.entries()].sort()) {
  console.log(`\n${key}`);
  for (const line of lines) console.log(`  ${line}`);
}
console.log(
  `\n${apply ? 'APPLY' : 'DRY'} price updates=${updates.length} inserts=${inserts.length} deactivate=${deactivates.length} rateUpdates=${rateUpdates.length} rateInserts=${rateInserts.length} rateDeleteDupes=${rateDeletes.length}`,
);

if (apply) {
  const now = new Date();
  for (const item of updates) {
    await billing.updateOne(
      { _id: item.row._id },
      { $set: { aircraftType: item.aircraftType, remarks: item.remarks ?? '', updatedAt: now } },
    );
  }
  if (inserts.length) {
    await billing.insertMany(
      inserts.map((item) => {
        const { _id, ...rest } = item.row;
        return {
          ...rest,
          aircraftType: item.aircraftType,
          remarks: item.remarks ?? '',
          active: true,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
  }
  if (deactivates.length) {
    await billing.updateMany(
      { _id: { $in: deactivates.map((row) => row._id) } },
      { $set: { active: false, updatedAt: now } },
    );
  }
  for (const item of rateUpdates) {
    await billing.updateOne(
      { _id: item.card._id },
      { $set: { aircraftType: item.aircraftType, updatedAt: now } },
    );
  }
  if (rateInserts.length) {
    await billing.insertMany(
      rateInserts.map((item) => {
        const { _id, ...rest } = item.card;
        return {
          ...rest,
          aircraftType: item.aircraftType,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
  }
  if (rateDeletes.length) {
    await billing.deleteMany({ _id: { $in: rateDeletes.map((card) => card._id) } });
  }
  console.log('written');
}

await mongoose.disconnect();
