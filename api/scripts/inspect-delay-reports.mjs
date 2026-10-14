import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const GHA = new Set([11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52]);

await mongoose.connect(process.env.MONGO_URI);
const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
const delayCols = names.filter((n) => n.includes('delay'));
console.log('delay collections', delayCols);

for (const name of delayCols) {
  const coll = mongoose.connection.db.collection(name);
  const count = await coll.countDocuments();
  const sample = await coll.findOne({});
  console.log({ name, count, keys: sample ? Object.keys(sample) : [] });
  if (sample) console.log(JSON.stringify(sample).slice(0, 400));
}

await mongoose.disconnect();
