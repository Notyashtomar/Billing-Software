import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const doc = await coll.findOne({ staDates: '15/03/2026' });
const r3 = doc?.rampDetails3 ?? {};
console.log(JSON.stringify({
  ATDDate: r3.ATDDate,
  ATDTime: r3.ATDTime,
  ATADate: r3.ATADate,
  ATATime: r3.ATATime,
  Typeofflight: r3.Typeofflight,
  Cate_of_Flight: r3.Cate_of_Flight,
  TypeCraft: r3.TypeCraft,
}, null, 2));
await mongoose.disconnect();
