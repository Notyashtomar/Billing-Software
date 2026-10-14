import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const { FhrCollectionService } = await import('../dist/fhr-collection/services/fhr-collection.service.js');
const { aggregateKpiStripFromLeanRows } = await import('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');

function isAdditionalHandling(h) {
  const n = h.toUpperCase();
  if (/(^|[^A-Z])(ADDL|ADDITIONAL)([^A-Z]|$)/.test(n)) return true;
  if (/(FERRY|DIVERTED|RETURN\s*TO\s*RAMP|LOAD\s*IN|LOAD\s*OUT)/.test(n)) return true;
  return false;
}

function isScheduledHandling(h) {
  const n = h.toUpperCase();
  if (isAdditionalHandling(h)) return false;
  return /(^|[^A-Z])(SCH|SCHEDULED|TURNAROUND)([^A-Z]|$)/.test(n);
}

function aggregateKpiProposed(rows) {
  let totalFlights = 0;
  let cancelledFlights = 0;
  let scheduledFlights = 0;
  let additionalFlights = 0;
  for (const doc of rows) {
    totalFlights += 1;
    if (FhrCollectionService.fhrLeanDocIsCancelled(doc)) {
      cancelledFlights += 1;
      continue;
    }
    const handling = FhrCollectionService.resolveFhrRowHandlingText(doc);
    if (isAdditionalHandling(handling)) additionalFlights += 1;
    else if (isScheduledHandling(handling)) scheduledFlights += 1;
    else scheduledFlights += 1; // default operated to scheduled
  }
  return { totalFlights, cancelledFlights, didFlyFlights: totalFlights - cancelledFlights, scheduledFlights, additionalFlights };
}

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const docs = await coll.find({}).toArray();
const inRange = docs.filter((d) =>
  (d.staDates ?? []).some((x) => {
    const p = String(x).split('/');
    if (p.length !== 3) return false;
    const iso = `${p[2]}-${p[1]}-${p[0]}`;
    return iso >= '2026-02-28' && iso <= '2026-03-31';
  }),
);

console.log('current', aggregateKpiStripFromLeanRows(inRange));
console.log('proposed ferry/addl', aggregateKpiProposed(inRange));

await mongoose.disconnect();
