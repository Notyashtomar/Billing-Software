/**
 * One-shot: serial 20557 is missing from maa-ixc-gse-july.xlsb (gap between 20556 and 20558).
 * Equipment names come from the GSE list for that flight. From/to/usage copied from the
 * previous EY342/343 day (serial 20537, 28 Jul) and shifted +1 calendar day to 29 Jul 2026.
 *
 * Run from BWMS/apps/api:
 *   node scripts/seed-serial-20557-gse.mjs
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const SERIAL = 20557;
const DAY_SHIFT = 1;

/** Previous-day EY342/343 GSE (serial 20537, 28 Jul) from maa-ixc-gse-july.xlsb. */
const TEMPLATE_ROWS = [
  { 'Equipment No': 'CSA', Quantity: 1, 'Usages Time': 0.3333333333333333, 'From Date': 46231.208333333336, 'To date': 46231.541666666664, Remarks: '08:00 08 staffs' },
  { 'Equipment No': 'CSH', Quantity: 1, 'Usages Time': 0.3333333333333333, 'From Date': 46231.208333333336, 'To date': 46231.541666666664, Remarks: '08:00 05 staffs' },
  { 'Equipment No': 'UH', Quantity: 1, 'Usages Time': 0.125, 'From Date': 46231.260416666664, 'To date': 46231.385416666664, Remarks: '03:00 06 staffs' },
  { 'Equipment No': 'UH', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: '01:48 22 staffs' },
  { 'Equipment No': 'WC', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: '01:48 05 staffs' },
  { 'Equipment No': 'PSL-Towable', Quantity: 1, 'Usages Time': 0.04861111111111111, 'From Date': 46231.350694444445, 'To date': 46231.399305555555, Remarks: 0.04861111111111111 },
  { 'Equipment No': 'PBNB', Quantity: 1, 'Usages Time': 0.006944444444444444, 'From Date': 46231.41458333333, 'To date': 46231.42152777778, Remarks: 0.006944444444444444 },
  { 'Equipment No': 'WW', Quantity: 1, 'Usages Time': 0.006944444444444444, 'From Date': 46231.41458333333, 'To date': 46231.42152777778, Remarks: 0.006944444444444444 },
  { 'Equipment No': 'WW', Quantity: 1, 'Usages Time': 0.003472222222222222, 'From Date': 46231.34375, 'To date': 46231.34722222222, Remarks: 0.003472222222222222 },
  { 'Equipment No': 'WC', Quantity: 1, 'Usages Time': 0.006944444444444444, 'From Date': 46231.37847222222, 'To date': 46231.385416666664, Remarks: 0.006944444444444444 },
  { 'Equipment No': 'TS', Quantity: 1, 'Usages Time': 0.006944444444444444, 'From Date': 46231.38888888889, 'To date': 46231.395833333336, Remarks: 0.006944444444444444 },
  { 'Equipment No': 'BFL-Towable', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'BFL-Towable', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'EBT', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'DT', Quantity: 1, 'Usages Time': 0.041666666666666664, 'From Date': 46231.3125, 'To date': 46231.354166666664, Remarks: 0.041666666666666664 },
  { 'Equipment No': 'GPU-NB', Quantity: 1, 'Usages Time': 0.06666666666666667, 'From Date': 46231.347916666666, 'To date': 46231.41458333333, Remarks: 0.06666666666666667 },
  { 'Equipment No': 'EBT', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'ACU-NB', Quantity: 1, 'Usages Time': 0.059027777777777776, 'From Date': 46231.350694444445, 'To date': 46231.40972222222, Remarks: 0.059027777777777776 },
  { 'Equipment No': 'BFL-Towable', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'C', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'DO', Quantity: 1, 'Usages Time': 0.375, 'From Date': 46231.208333333336, 'To date': 46231.583333333336, Remarks: '09:00 01 staff' },
  { 'Equipment No': 'CK', Quantity: 1, 'Usages Time': 0.075, 'From Date': 46231.34652777778, 'To date': 46231.42152777778, Remarks: 0.075 },
  { 'Equipment No': 'Cabin Cleaning', Quantity: 1, 'Usages Time': 0.007638888888888889, 'From Date': 46231.36388888889, 'To date': 46231.37152777778, Remarks: 0.007638888888888889 },
];

const EQUIPMENT_ORDER = [
  'EBT',
  'BFL-Towable',
  'DO',
  'UH',
  'GPU-NB',
  'BFL-Towable',
  'EBT',
  'DT',
  'ACU-NB',
  'CK',
  'C',
  'BFL-Towable',
  'PSL-Towable',
  'PBNB',
  'WW',
  'WW',
  'WC',
  'TS',
  'Cabin Cleaning',
  'CSA',
  'CSH',
  'WC',
  'UH',
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function excelSerialToDateTime(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return { date: '', time: '' };
  const d = XLSX.SSF.parse_date_code(v);
  if (!d) return { date: '', time: '' };
  const hasDate = (d.d ?? 0) > 0;
  const date = hasDate ? `${pad2(d.d)}/${pad2(d.m)}/${d.y}` : '';
  const hasTime = (d.H ?? 0) !== 0 || (d.M ?? 0) !== 0;
  const time = hasTime ? `${pad2(d.H ?? 0)}:${pad2(d.M ?? 0)}` : '';
  return { date, time };
}

function usageTime(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToDateTime(v).time;
  return String(v ?? '').trim();
}

function remarksCell(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function shiftSerial(v, days) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  return v + days;
}

function buildLines(templateRows) {
  const unused = templateRows.map((r) => ({ ...r }));
  const lines = [];
  const unmatched = [];
  for (const name of EQUIPMENT_ORDER) {
    const idx = unused.findIndex((r) => String(r['Equipment No'] ?? '').trim() === name);
    if (idx < 0) {
      unmatched.push(name);
      lines.push({
        equipment_name: name,
        equipment_quantity: 1,
        from_date: '29/07/2026',
        from_time: '',
        to_date: '29/07/2026',
        to_time: '',
        usage_time: '',
        remarks: '',
      });
      continue;
    }
    const [row] = unused.splice(idx, 1);
    const from = excelSerialToDateTime(shiftSerial(row['From Date'], DAY_SHIFT));
    const to = excelSerialToDateTime(shiftSerial(row['To date'], DAY_SHIFT));
    lines.push({
      equipment_name: name,
      equipment_quantity: Number(row.Quantity) > 0 ? Math.trunc(Number(row.Quantity)) : 1,
      from_date: from.date,
      from_time: from.time,
      to_date: to.date,
      to_time: to.time,
      usage_time: usageTime(row['Usages Time']),
      remarks: remarksCell(row.Remarks),
    });
  }
  return { lines, unmatched };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI missing');
    process.exit(1);
  }

  const { lines, unmatched } = buildLines(TEMPLATE_ROWS);
  if (unmatched.length) {
    console.warn('No template row for:', unmatched.join(', '));
  }

  await mongoose.connect(uri);
  try {
    const fhr = mongoose.connection.collection('fhr_collection');
    const ns = mongoose.connection.collection('ns_fhr_collection');
    const filter = {
      $or: [{ SerialNo: SERIAL }, { flightSerialNumber: SERIAL }],
    };
    const existing = await fhr.findOne(filter, {
      projection: {
        SerialNo: 1,
        flightSerialNumber: 1,
        stationCode: 1,
        equipmentDetails: 1,
        'mainDetails.Airline': 1,
        'mainDetails.TypeCraft': 1,
        'terminalDetails.FlightNo': 1,
        'terminalDetails.STDDate': 1,
      },
    });
    const nsExisting = await ns.findOne(filter, { projection: { SerialNo: 1 } });

    if (!existing) {
      console.error(`No fhr_collection doc for serial ${SERIAL}`);
      if (nsExisting) console.error('Found in ns_fhr_collection instead — not writing scheduled stub.');
      process.exit(1);
    }

    const priorCount = Array.isArray(existing.equipmentDetails)
      ? existing.equipmentDetails.length
      : 0;

    const result = await fhr.updateOne(
      { _id: existing._id },
      {
        $set: {
          equipmentDetails: lines,
          lastSnapshotAt: new Date(),
          lastSnapshotReason: 'Scheduled equipment gap-fill serial 20557 (EY342/343 29/07/2026)',
        },
      },
    );

    console.log(
      JSON.stringify(
        {
          serial: SERIAL,
          stationCode: existing.stationCode ?? null,
          airline: existing.mainDetails?.Airline ?? null,
          flightNo: existing.terminalDetails?.FlightNo ?? null,
          stdDate: existing.terminalDetails?.STDDate ?? null,
          typeCraft: existing.mainDetails?.TypeCraft ?? null,
          priorEquipmentLines: priorCount,
          written: lines.length,
          names: lines.map((l) => l.equipment_name),
          matched: result.matchedCount,
          modified: result.modifiedCount,
          nsCollision: Boolean(nsExisting),
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
