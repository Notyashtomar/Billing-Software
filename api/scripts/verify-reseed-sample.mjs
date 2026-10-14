import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const fhr = mongoose.connection.db.collection('fhr_collection');

for (const sn of [16616, 16626, 16638]) {
  const f = await fhr.findOne(
    { SerialNo: sn },
    {
      projection: {
        mainDetails: 1,
        rampDetails1: 1,
        terminalDetails: 1,
        lastSnapshotReason: 1,
      },
    },
  );
  console.log('\n===', sn, '===');
  console.log('reason:', f?.lastSnapshotReason);
  console.log('main TypeofHandling:', f?.mainDetails?.TypeofHandling);
  console.log('main Cate:', f?.mainDetails?.Cate_of_Flight);
  console.log('main Airline:', f?.mainDetails?.Airline);
  console.log('ramp Route unchanged:', f?.rampDetails1?.Route);
  console.log('terminal exists:', !!f?.terminalDetails);
}

await mongoose.disconnect();
