import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });
const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) process.exit(1);

await mongoose.connect(uri);
const db = mongoose.connection.db;
const fhr = db.collection('fhr_collection');
const rows = await fhr
  .aggregate([
    {
      $match: {
        stationCode: 'DEL',
        SerialNo: { $in: [214219, 214384, 214445, 214604, 214654, 214804, 214894] },
      },
    },
    { $unwind: '$mainDetails' },
    { $unwind: '$equipmentDetails' },
    { $match: { 'equipmentDetails.equipment_name': /break cooling|brake cooling|wheel chair battery/i } },
    {
      $project: {
        serial: '$SerialNo',
        flight: '$mainDetails.FlightNo',
        sta: '$mainDetails.STADate',
        std: '$mainDetails.STDDate',
        atd: '$mainDetails.ATDDate',
        type: '$mainDetails.TypeCraft',
        body: '$mainDetails.aircraftBody',
        name: '$equipmentDetails.equipment_name',
        usage: '$equipmentDetails.usage_time',
        remarks: '$equipmentDetails.remarks',
      },
    },
  ])
  .toArray();
console.log('fhr', rows.length);
for (const row of rows) console.log(JSON.stringify(row));

const billing = db.collection('billing');
const headers = await billing
  .find({
    docType: 'invoice_header',
    customerCode: 'TG',
    stationCode: 'DEL',
    invoiceCategory: 'ADS',
  })
  .project({
    draftNumber: 1,
    billingPeriodStart: 1,
    billingPeriodEnd: 1,
    status: 1,
    updatedAt: 1,
  })
  .sort({ updatedAt: -1 })
  .limit(5)
  .toArray();
console.log('headers', JSON.stringify(headers, null, 2));

const latest = headers[0];
if (latest) {
  const lines = await billing
    .find({ docType: 'invoice_line', invoiceId: latest._id, description: /cool|wbc|battery/i })
    .project({
      description: 1,
      quantity: 1,
      uom: 1,
      unitPrice: 1,
      'sourceRef.aircraftType': 1,
      'sourceRef.usedQuantity': 1,
      'sourceRef.chargedQuantity': 1,
      'sourceRef.freeAllowance': 1,
    })
    .toArray();
  console.log('invoice lines', JSON.stringify(lines, null, 2));
}

const prep = await billing
  .find({
    docType: 'preparation_record',
    customerCode: 'TG',
    stationCode: 'DEL',
    billingPeriodStart: { $gte: new Date('2026-09-01'), $lt: new Date('2026-10-01') },
    $or: [
      { 'operationalSnapshot.equipment_name': /break cooling|brake cooling|battery/i },
      { 'operationalSnapshot.particular': /break cooling|brake cooling|battery/i },
      { 'rateMatch.particular': /break cooling|brake cooling|battery/i },
    ],
  })
  .project({
    sourceType: 1,
    'sourceRef.serialNo': 1,
    'operationalSnapshot.equipment_name': 1,
    'operationalSnapshot.aircraftType': 1,
    'operationalSnapshot.usageHours': 1,
    'operationalSnapshot.qty': 1,
    'operationalSnapshot.remarks': 1,
    'rateMatch.particular': 1,
    'rateMatch.uom': 1,
    'rateMatch.unitPrice': 1,
    'rateMatch.pricingBasis': 1,
    'rateMatch.usedUnits': 1,
    'rateMatch.freeAllowance': 1,
    billingPeriodStart: 1,
    billingPeriodEnd: 1,
  })
  .toArray();
console.log('prep', prep.length);
for (const row of prep) console.log(JSON.stringify(row));

await mongoose.disconnect();
