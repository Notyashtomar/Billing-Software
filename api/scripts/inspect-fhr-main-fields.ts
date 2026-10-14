import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../.env') });

async function main(): Promise<void> {
  await mongoose.connect(process.env.MONGO_URI!);
  const coll = mongoose.connection.db!.collection('fhr_collection');
  const one = await coll.findOne({ staDates: '15/03/2026' });
  if (!one) {
    console.log('no doc');
    return;
  }
  const m = (one as Record<string, unknown>).mainDetails as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        topKeys: Object.keys(one as object).filter((k) => !['_id', 'mainDetails', 'terminalDetails', 'loadControlDetails', 'rampDetails1', 'rampDetails3'].includes(k)),
        mainKeys: Object.keys(m ?? {}).slice(0, 40),
        sampleMain: {
          TypeofHandling: m?.TypeofHandling,
          typeOfHandling: m?.typeOfHandling,
          ops: m?.ops,
          Typeofflight: m?.Typeofflight,
          flightCategory: m?.flightCategory,
          Cate_of_Flight: m?.Cate_of_Flight,
          ATADate: m?.ATADate,
          ATATime: m?.ATATime,
          ATDDate: m?.ATDDate,
          ATDTime: m?.ATDTime,
        },
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
