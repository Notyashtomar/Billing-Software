/**
 * Quick row-d timing simulation using same timing merge as server (via dynamic import won't work easily).
 * Count legs where AGT>SGT and (ata>sta OR (ata<sta && atd>std)) without GHA code requirement.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

// Use ts compiled dist if available
const { FhrCollectionService } = await import('../dist/fhr-collection/services/fhr-collection.service.js');
const { mapLeanFhrRowsToPerformanceLegs } = await import('../dist/dashboard-summary/utils/dashboard-performance-from-fhr.util.js');

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

const legs = mapLeanFhrRowsToPerformanceLegs(inRange);
let rowDNoGha = 0;
let rowDWithGha = 0;
for (const f of legs) {
  if (f.flightNo.toUpperCase().startsWith('CANC') || f.isCancelled) continue;
  const { ataMs: ata, staMs: sta, atdMs: atd, stdMs: std } = f;
  if (ata == null || sta == null || atd == null || std == null) continue;
  const AGT = atd - ata;
  const SGT = std - sta;
  if (AGT <= SGT) continue;
  const match = (ata > sta) || (ata < sta && atd > std);
  if (!match) continue;
  rowDNoGha++;
}
console.log({ legs: legs.length, rowDNoGha });
await mongoose.disconnect();
