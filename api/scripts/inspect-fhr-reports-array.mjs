import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const withReports = await coll.countDocuments({ reports: { $exists: true, $ne: [] } });
const sample = await coll.findOne({ reports: { $exists: true, $ne: [] } });
console.log({ withReports, sampleReports: sample?.reports?.slice?.(0, 2) });
await mongoose.disconnect();
