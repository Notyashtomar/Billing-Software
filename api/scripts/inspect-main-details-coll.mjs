import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const names = (await db.listCollections().toArray()).map(c => c.name);
console.log('has main_details', names.includes('main_details'));
if (names.includes('main_details')) {
  const coll = db.collection('main_details');
  const count = await coll.countDocuments();
  const withHandling = await coll.countDocuments({ TypeofHandling: { $exists: true, $ne: '' } });
  const withCat = await coll.countDocuments({ Cate_of_Flight: { $exists: true, $ne: '' } });
  const sample = await coll.findOne({ TypeofHandling: { $regex: /scheduled/i } });
  console.log({ count, withHandling, withCat, sampleHandling: sample?.TypeofHandling, sampleCat: sample?.Cate_of_Flight });
}
await mongoose.disconnect();
