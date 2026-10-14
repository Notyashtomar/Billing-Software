import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('fhr_collection');
const doc = await coll.findOne({ staDates: '15/03/2026' });
const m = doc?.mainDetails ?? {};
const lc = doc?.loadControlDetails ?? {};
const t = doc?.terminalDetails ?? {};
console.log(JSON.stringify({
  main: { ATADate: m.ATADate, ATATime: m.ATATime, ATDDate: m.ATDDate, ATDTime: m.ATDTime, ataDate: m.ataDate },
  lc: { STADate: lc.STADate, STATime: lc.STATime, staDate: lc.staDate, staTime: lc.staTime, sta: lc.sta, STDDate: lc.STDDate, STDTime: lc.STDTime, std: lc.std },
  terminal: { STADate: t.STADate, staDate: t.staDate, sta: t.sta, STATime: t.STATime, STDDate: t.STDDate, std: t.std },
}, null, 2));
await mongoose.disconnect();
