/**
 * Delhi price-card workbook: one sheet per airline, same layout as
 * Price_card_Delhi_V2.xlsx, with every BHS / ADS / ULD / manpower column
 * needed to bill from the Virgin and Thai SGHA.
 *
 * Existing airline sheets are kept and only missing columns are added.
 * New airlines get an empty rate row for the billing team to fill.
 *
 * Usage (from api/): node scripts/generate-del-airline-billing-workbook.mjs
 */
import ExcelJS from 'exceljs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, '../data/Price_card_Delhi_V2.xlsx');
const OUT = join(__dirname, '../data/DEL-all-airlines-billing-workbook.xlsx');

/** [sheet name, airline name]. Sheet name is the billing customer code when it matches the master. */
const AIRLINES = [
  ['CA', 'Air China'],
  ['HT', 'Tianjin Cargo'],
  ['Y8', 'Suparna Airlines'],
  ['ITA', 'ITA Airline'],
  ['CEN', 'My Freight LLC'],
  ['HEAPLRom Cargo', 'Hercules Aviation'],
  ['HEAPL-Aerotrans', 'Hercules Aviation'],
  ['BA', 'British Airways'],
  ['TKF', 'Turkish Cargo'],
  ['TK-PAX', 'Turkish Airline'],
  ['CXF', 'Cathay Pacific Cargo'],
  ['ACP', 'Astral Aviation'],
  ['UL', 'Sri Lankan Airline'],
  ['ET-PAX', 'Ethiopian Airlines'],
  ['ETF', 'Ethiopian Airlines'],
  ['UPS', 'United Parcel Service'],
  ['KA', 'Aero Nomad Airlines'],
  ['MU', 'China Eastern Airline'],
  ['MS', 'Egypt Air'],
  ['JL', 'Japan Airline'],
  ['HY', 'Urbekistan Airways'],
  ['KE-Pax', 'Korean Airline'],
  ['OV', 'Salam Air'],
  ['WY', 'Oman Air'],
  ['AX', 'Air Asia X'],
  ['SG', 'SpiceJet'],
  ['TG', 'Thai Airways'],
  ['VS', 'Virgin Atlantic'],
  ['SF-WG', 'SF Airlines'],
  ['KU', 'Kuwait Airways'],
  ['3S', 'Aerologic Air'],
  ['6E', 'Indigo Airlines'],
  ['MK', 'Air Mauritius'],
  ['LX', 'Swiss International Airlines'],
  ['LH', 'Lufthansa German'],
  ['LHF', 'Lufthansa Cargo'],
  ['G9', 'Air Arabia'],
  ['GI', 'China Central Longhao Airlines'],
  ['CZ', 'China Southern Airlines'],
  ['XJ', 'Thai Air Asia X'],
  ['SZ', 'Somon Air'],
  ['AFKL', 'Air France'],
  ['Akasa', 'Akasa Air'],
  ['Akasa New', 'Akasa Airline'],
  ['B3', 'Bhutan Air'],
  ['FG', 'Ariana Afghan'],
  ['BG', 'Biman Bangladesh'],
  ['CX', 'Cathay Pacific'],
  ['CI', 'China Airlines'],
  ['KB', 'Druk Air'],
  ['AY', 'FinnAir'],
  ['GF', 'Gulf Air'],
  ['KEF', 'Korean Airline (Passenger)'],
  ['MAIL', 'Myanmar Air'],
  ['QY', 'European Air Transport'],
  ['DHL', 'DHL Aviation'],
  ['RA', 'Nepal Airlines'],
  ['UA', 'United Airlines'],
  ['VJ', 'VietJet Air'],
  ['PAE', 'Pradhaan Air'],
  ['5Y', 'Atlas Air'],
];

/** category row + column header. match skips the column when a header already covers it. */
const REQUIRED = [
  ['Aircraft', 'A320-200', /A320/i],
  ['Aircraft', 'A321-200', /A321/i],
  ['Aircraft', 'A330-300', /A330/i],
  ['Aircraft', 'A350-900', /A350|A359/i],
  ['Aircraft', 'B777-200 ER', /B777-200/i],
  ['Aircraft', 'B777-300 ER', /B777-300/i],
  ['Aircraft', 'B787-800', /B787-800|B787\/B787-900/i],
  ['Aircraft', 'B787-900', /B787-900/i],
  ['Aircraft', 'A380', /\bA380\b/i],
  ['ADS', 'WCHR/S', /WCHR/i],
  ['ADS', 'WCHC', /WCHC/i],
  ['ADS', 'GPU-140 KV', /\bGPU\b/i],
  ['ADS', 'GPU-180 KV', /GPU-180|180\s*KV/i],
  ['ADS', 'ACU-NB', /\bACU\b/i],
  ['ADS', 'ACU-WB', /ACU-WB|ACU WB/i],
  ['ADS', 'ASU-NB', /\bASU\b/i],
  ['ADS', 'ASU-WB', /ASU-WB|ASU WB/i],
  ['ADS', 'Motorized Passenger Step', /MOTORIZED PASSENGER STEP|MPSL/i],
  ['ADS', 'Pax Step Towable', /STEP LADDER|PAX STEP|\bPSL\b/i],
  ['ADS', 'Push Back NB', /PUSH\s*BACK|PBNB|PB-NB|PB NB/i],
  ['ADS', 'Push Back WB', /PB-WB|PBWB|PUSH BACK WB/i],
  ['ADS', 'Toilet Service', /TOILET/i],
  ['ADS', 'Potable Water', /WATER/i],
  ['ADS', 'Ambulift', /AMBULIFT|\bAMB\b/i],
  ['ADS', 'Passenger Coach', /PAX[-\s]*COACH|PASSENGER COACH/i],
  ['ADS', 'Crew Coach', /CREW COACH/i],
  ['ADS', 'Towing', /\bTOW\b|TOWING/i],
  ['Manpower', 'Blue Collar', /BLUE COLLAR/i],
  ['Manpower', 'White Collar', /WHITE COLLAR/i],
  ['Manpower', 'Utility Hand', /UTILITY HAND|\bUH\b/i],
  ['ADS', 'Wheel Break Cooling', /WHEEL BR|WBC|BRAKE COOL|BREAK COOL/i],
  ['ADS', 'Headset', /HEAD\s*SET|HEADSET/i],
  ['ADS', 'Adhoc Agent', /AD\s*HOC/i],
  ['ULD', 'LD3', /\bLD3\b/i],
  ['ULD', 'LD11', /\bLD11\b/i],
  ['ULD', 'PAJ', /\bPAJ\b/i],
  ['ULD', 'PMA', /\bPMA\b/i],
  ['ULD', 'Cargo Hold Cleaning', /CARGO HOLD|HOLD CLEAN/i],
];

const CLAUSES = [
  ['1.2', 'All rates are exclusive of airport concession and government tax unless this airline contract says the rate is inclusive. Record the concession percent and whether it is on gross or on net.'],
  ['BHS', 'Aircraft columns are the basic turnaround handling rate for that aircraft. One rate per aircraft column. Fill only the aircraft this airline operates.'],
  ['ADS', 'Additional columns are chargeable equipment and services. Record the unit in the column header note: Per Hour, Per Flight, Per Service, Per Start, Per Trip, or Per Tow. Per Hour uses a 5-minute grace, then the next hour, multiplied by the headcount in the flight remark.'],
  ['FOC', 'Where the SGHA includes a free count, write it in Remarks for that rate row, for example WCHR/S 10 included, toilet 1 included, pushback 1 included. Leave FOC blank when the item is chargeable from the first use.'],
  ['Manpower', 'Blue Collar, White Collar, and Utility Hand are per hour with no free allowance. The flight remark headcount (04 U/H PROVIDED) is the number of people.'],
  ['ULD', 'LD3, LD11, PAJ, and PMA are per unit per day. Cargo hold cleaning is per service. Record any free ULD count in Remarks.'],
  ['1.3', 'Technical landing with no change of load is 50 percent of the handling rate unless this airline agrees otherwise.'],
  ['1.4', 'Return to ramp is not charged extra when there is no significant change of load.'],
  ['1.6', 'Off-schedule and cancellation percents: record the percent and the notice hours in Remarks.'],
  ['1.9', 'Delay beyond scheduled ground time: record the percent for the first hours and the percent after that.'],
  ['1.10', 'Yearly increase percent, if the airline has one.'],
  ['3.1', 'Disbursements are at cost plus the accounting surcharge percent recorded here.'],
  ['Fortnight', 'If this airline is billed in two parts, the contract parts are day 1-15 and day 16-31. Day 31 is the contract end day even in a 30-day month.'],
];

function text(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  }
  return String(value);
}

function headerRowNumber(sheet) {
  let found = 0;
  const lastCol = Math.max(sheet.columnCount, 12);
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found) return;
    const cells = [];
    for (let col = 1; col <= lastCol; col += 1) {
      cells.push(text(row.getCell(col).value).trim().toLowerCase());
    }
    const hasFrom = cells.some((value) => value === 'from' || value === 'valid from');
    const hasTo = cells.some((value) => value === 'to' || value === 'valid to');
    if (hasFrom && hasTo) found = rowNumber;
  });
  return found;
}

function clauseStart(sheet) {
  let start = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (start) return;
    const c1 = text(row.getCell(1).value).trim().toLowerCase();
    const c2 = text(row.getCell(2).value).trim().toLowerCase();
    if (c1 === 's.no' && c2 === 'clause') start = rowNumber;
  });
  return start;
}

function existingHeaders(sheet, headerRow) {
  const headers = [];
  const row = sheet.getRow(headerRow);
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    headers.push(text(row.getCell(col).value));
  }
  return headers;
}

function addMissingColumns(sheet) {
  const headerRow = headerRowNumber(sheet);
  if (!headerRow) return 0;
  const headers = existingHeaders(sheet, headerRow);
  const categoryRow = sheet.getRow(headerRow - 1);
  let added = 0;
  let col = Math.max(sheet.columnCount, headers.length) + 1;
  for (const [category, header, pattern] of REQUIRED) {
    if (headers.some((value) => pattern.test(value))) continue;
    categoryRow.getCell(col).value = category;
    sheet.getRow(headerRow).getCell(col).value = header;
    added += 1;
    col += 1;
  }
  return added;
}

function addGuideClauses(sheet) {
  let start = clauseStart(sheet);
  if (!start) {
    start = sheet.rowCount + 2;
    const row = sheet.getRow(start);
    row.getCell(1).value = 'S.No';
    row.getCell(2).value = 'Clause';
    row.getCell(3).value = 'Note';
    row.font = { bold: true };
  }
  const have = new Set();
  for (let r = start; r <= sheet.rowCount; r += 1) {
    have.add(text(sheet.getRow(r).getCell(2).value).trim());
  }
  let next = sheet.rowCount + 1;
  let n = have.size;
  for (const [label, body] of CLAUSES) {
    if (have.has(label)) continue;
    n += 1;
    const row = sheet.getRow(next);
    row.getCell(1).value = n;
    row.getCell(2).value = label;
    row.getCell(3).value = body;
    next += 1;
  }
}

function addTemplate(workbook, sheetName, airlineName) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getCell('A1').value = 'Bird Worldwide Flight Services India Pvt Ltd';
  sheet.getCell('A2').value = `${airlineName} - Rate Card in INR`;
  const categories = ['', '', ''];
  const headers = ['From', 'To', 'Remarks'];
  for (const [category, header] of REQUIRED) {
    categories.push(category);
    headers.push(header);
  }
  categories.forEach((value, index) => {
    sheet.getRow(3).getCell(index + 1).value = value;
  });
  headers.forEach((value, index) => {
    const cell = sheet.getRow(4).getCell(index + 1);
    cell.value = value;
    cell.font = { bold: true };
  });
  sheet.getRow(5).getCell(1).value = new Date(2026, 0, 1);
  sheet.getRow(5).getCell(2).value = new Date(2027, 11, 31);
  sheet.getRow(5).getCell(3).value = 'Fill this airline rate in each column. Leave a column blank when the airline does not buy that service.';
  addGuideClauses(sheet);
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 42;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(SOURCE);

let created = 0;
let extended = 0;
for (const [sheetName, airlineName] of AIRLINES) {
  const existing =
    workbook.getWorksheet(sheetName) ||
    workbook.worksheets.find((sheet) => sheet.name.toLowerCase() === sheetName.toLowerCase());
  if (!existing) {
    addTemplate(workbook, sheetName, airlineName);
    created += 1;
    continue;
  }
  extended += addMissingColumns(existing);
  addGuideClauses(existing);
}

const guide = workbook.getWorksheet('Check List') ?? workbook.addWorksheet('Check List');
guide.spliceRows(1, guide.rowCount);
guide.getCell('A1').value = 'Delhi billing workbook';
guide.getCell('A2').value = 'One sheet per airline. Fill only that airline. Columns cover BHS aircraft, ADS equipment and manpower, and ULD, taken from the Virgin Atlantic and Thai Airways SGHA.';
guide.getRow(4).values = ['Column', 'Service type', 'How to fill'];
guide.getRow(4).font = { bold: true };
const guideRows = [
  ['From / To', 'Contract', 'Rate validity for this row.'],
  ['Remarks', 'Contract', 'Addendum, FOC, concession, or yearly increase for this row.'],
  ['Aircraft columns', 'BHS', 'Turnaround handling rate in INR for that aircraft. Blank if the airline does not operate it.'],
  ['WCHR/S WCHC GPU ACU ASU steps pushback toilet water ambulift coach tow headset', 'ADS', 'Rate for that unit. Per Hour items use a 5-minute grace.'],
  ['Blue Collar White Collar Utility Hand', 'Manpower', 'Per hour. No free allowance. Headcount comes from the flight remark.'],
  ['Wheel Break Cooling', 'ADS', 'Per flight unless this airline contract says otherwise.'],
  ['LD3 LD11 PAJ PMA', 'ULD', 'Per unit per day. Record a free count in Remarks when the SGHA includes one.'],
  ['Cargo Hold Cleaning', 'ULD', 'Per service.'],
  ['Clause rows', 'All', 'Concession, tax, technical landing, return to ramp, delay, cancellation, disbursement, fortnight.'],
];
guideRows.forEach((values, index) => {
  guide.getRow(5 + index).values = values;
});
guide.getColumn(1).width = 55;
guide.getColumn(2).width = 16;
guide.getColumn(3).width = 88;

await workbook.xlsx.writeFile(OUT);
console.log(JSON.stringify({ file: OUT, sheets: workbook.worksheets.length, newAirlineSheets: created, columnsAdded: extended }));
