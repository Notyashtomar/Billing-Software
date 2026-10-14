import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.db.collection('dashboard_summaries');
const docs = await coll.find({
  summaryDate: { $gte: '2026-02-28', $lte: '2026-03-31' },
}).toArray();

let ghaImprovement = 0;
let improvedFlights = 0;
for (const d of docs) {
  const pr = d.cards?.performanceReport ?? {};
  ghaImprovement += Number(pr.ghaImprovement ?? 0);
  const drill = d.drilldowns?.performanceReport?.flights ?? [];
  for (const f of drill) {
    if (f.inPerformanceReportGhaImprovementRow) improvedFlights++;
  }
}
console.log({ days: docs.length, ghaImprovement, improvedFlights });
await mongoose.disconnect();
