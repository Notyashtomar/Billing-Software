import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const names = (await db.listCollections().toArray()).map(c => c.name);
const mainColl = names.find(n => /maindetails/i.test(n));
console.log('collections like main', names.filter(n => /main/i.test(n)));

if (mainColl) {
  const coll = db.collection(mainColl);
  const total = await coll.countDocuments();
  const withHandling = await coll.countDocuments({ TypeofHandling: { $nin: ['', null] } });
  const withCat = await coll.countDocuments({ Cate_of_Flight: { $nin: ['', null] } });
  const sample = await coll.findOne({ TypeofHandling: { $nin: ['', null] } });
  console.log({ mainColl, total, withHandling, withCat, sampleType: sample?.TypeofHandling, sampleCat: sample?.Cate_of_Flight });
}

// Compare fhr embed vs source collection for same serial
const fhr = await db.collection('fhr_collection').findOne({ SerialNo: 16638 });
if (mainColl && fhr) {
  const src = await db.collection(mainColl).findOne({ SerialNo: fhr.SerialNo });
  console.log('compare 16638', {
    fhrHandling: fhr.mainDetails?.TypeofHandling,
    srcHandling: src?.TypeofHandling,
    fhrCat: fhr.mainDetails?.Cate_of_Flight,
    srcCat: src?.Cate_of_Flight,
    lastReason: fhr.lastSnapshotReason,
  });
}

await mongoose.disconnect();
