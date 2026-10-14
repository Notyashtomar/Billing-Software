import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const rows = await coll
  .find({ staDates: { $gte: '28/02/2026', $lte: '31/03/2026' } })
  .project({ lastSnapshotReason: 1, mainDetails: 1 })
  .toArray();

const reasons = new Map();
let operated = 0;
for (const d of rows) {
  if (d.mainDetails?.flightCancelled) continue;
  operated += 1;
  const r = String(d.lastSnapshotReason ?? '(none)');
  reasons.set(r, (reasons.get(r) ?? 0) + 1);
}
console.log({ operated, reasons: [...reasons.entries()] });
await mongoose.disconnect();
