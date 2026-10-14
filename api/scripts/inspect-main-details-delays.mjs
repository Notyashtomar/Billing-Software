import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
for (const name of ['main_details', 'maindetails', 'main-details']) {
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  if (!names.includes(name)) continue;
  const coll = db.collection(name);
  const docs = await coll.find({}).limit(2000).toArray();
  let gha = 0;
  for (const d of docs) {
    for (const key of ['departureDelays','arrivalDelays']) {
      const arr = d[key];
      if (!Array.isArray(arr)) continue;
      for (const e of arr) {
        const r = String(e?.ReasonofDelay ?? e?.reason ?? '');
        const m = /^(\d{2})/.exec(r.trim());
        if (m && GHA.has(Number(m[1]))) gha++;
      }
    }
  }
  console.log({ collection: name, docs: docs.length, ghaHits: gha });
}
await mongoose.disconnect();
