import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const doc = await coll.findOne({ staDates: '15/03/2026' });
console.log(JSON.stringify(doc?.rampDetails1 ?? {}, null, 2));
await mongoose.disconnect();
