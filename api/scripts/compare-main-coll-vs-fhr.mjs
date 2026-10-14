import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;
const fhr = db.collection('fhr_collection');
const main = db.collection('mainDetails');

for (const sn of [16626, 16638, 16616]) {
  const f = await fhr.findOne({ SerialNo: sn }, { projection: { mainDetails: 1, lastSnapshotReason: 1, lastSnapshotAt: 1 } });
  const m = await main.findOne({ SerialNo: sn });
  const fhrKeys = Object.entries(f?.mainDetails || {}).filter(([, v]) => String(v ?? '').trim() && !['_id','createdAt','updatedAt'].includes(String(v)));
  const mainKeys = m ? Object.entries(m).filter(([k, v]) => !['_id','__v','createdAt','updatedAt'].includes(k) && String(v ?? '').trim()).slice(0, 15) : [];
  console.log('\n===', sn, '===');
  console.log('lastReason:', f?.lastSnapshotReason, f?.lastSnapshotAt);
  console.log('fhr populated fields:', fhrKeys.map(([k,v]) => `${k}=${String(v).slice(0,40)}`));
  console.log('mainDetails coll exists:', !!m, 'populated:', mainKeys.map(([k,v]) => `${k}=${String(v).slice(0,40)}`));
}

// Count mainDetails collection with any non-empty business field
const withRoute = await main.countDocuments({ Route: { $nin: ['', null] } });
const withAirline = await main.countDocuments({ Airline: { $nin: ['', null] } });
console.log('\nmainDetails collection:', { withRoute, withAirline, total: await main.countDocuments() });

await mongoose.disconnect();
