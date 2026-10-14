import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const { FhrCollectionService } = await import('../dist/fhr-collection/services/fhr-collection.service.js');
const { AdvanceAircraftService } = await import('../dist/advance-aircraft/services/advance-aircraft.service.js');

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

// Minimal stub for body catalog - use empty map (heuristics only)
const bodyCatalog = new Map();
const mix = FhrCollectionService.prototype.getScheduledCategoryBreakdownFromLeanRows.call(
  { isWideBodyForScheduledCategoryMix(m, catalog) {
      const tc = String(m.TypeCraft ?? '').trim();
      if (/\b(777|787|747|380|350|330|340|359)\b/i.test(tc)) return true;
      return false;
    } },
  inRange,
  '2026-02-28',
  '2026-03-31',
  bodyCatalog,
);

console.log(JSON.stringify(mix, null, 2));
await mongoose.disconnect();
