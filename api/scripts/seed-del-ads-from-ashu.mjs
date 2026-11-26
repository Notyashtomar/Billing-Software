/**
 * Replace Delhi ADS equipment rules from
 * Additional Services Controler_SGHA_Ashu (1).xlsx.
 * Prices are left blank. Unclear units stay blank and the sheet text is kept
 * in remarks.
 *
 * Usage (from api/): node scripts/seed-del-ads-from-ashu.mjs
 */
import { createRequire } from 'node:module';
import { loadMongoUri } from '../../m-billing/server/scripts/lib/seed-catalog-from-price-card.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const ExcelJS = require('exceljs');
const { MongoClient } = require('mongodb');

const FILE = 'c:/Users/shyam/Downloads/Additional Services Controler_SGHA_Ashu (1).xlsx';
const STATION = 'DEL';

const ONLY_AIRLINES = new Set([
  'DRUK AIR CORPORATION LIMITED',
  'FINNAIR PLC',
  'GULF AIR B.S.C. (C)',
  'KLM Royal Dutch Airlines',
  'KOREAN AIRLINES CO LTD',
  'KUWAIT AIRWAYS COMPANY',
  'Lufthansa German Airlines',
  'Nepal Airlines Corporation',
  'OMAN AIR S A O C',
  'SF AIRLINES CO. LTD.',
]);

const AIRLINE_CODES = {
  'AIR COMPANY SOMON AIR LLC': ['SZ'],
  'AIR MAURITIUS': ['MK'],
  'AIRASIA X BERHAD': ['AX'],
  'Aerologic Gmbh': ['3S'],
  'Air Arabia': ['G9'],
  'Air France': ['AF'],
  'Akasa Airline': ['QP'],
  'Ariana Afghan Airlines': ['FG'],
  'Atlas Air Inc': ['5Y'],
  'BIMAN BANGLADESH AIRLINES LIMITED': ['BG'],
  'Bhutan Airlines': ['B3'],
  'CATHAY PACIFIC AIRWAYS LTD': ['CX'],
  'CHINA AIRLINES LIMITED': ['CI'],
  'CHINA CENTRAL LONGHAO': ['GI'],
  'Centrum Air': ['C6'],
  'DRUK AIR CORPORATION LIMITED': ['KB'],
  'EUROPEAN AIR TRANSPORT LEIPZIG GMBH': ['QY'],
  'FINNAIR PLC': ['AY'],
  'GULF AIR B.S.C. (C)': ['GF'],
  'Hercules Avaition': ['HER'],
  'ITA Airways': ['AZ'],
  'Indigo Airlines': ['6E'],
  'KLM Royal Dutch Airlines': ['KL'],
  'KOREAN AIRLINES CO LTD': ['KE'],
  'KUWAIT AIRWAYS COMPANY': ['KU'],
  'Lufthansa German Airlines': ['LH'],
  'MYANMAR AIRWAYS INTERNATIONAL COMPANY LIMITED': ['8M', 'MAIL'],
  'Nepal Airlines Corporation': ['RA'],
  'OMAN AIR S A O C': ['WY'],
  'SF AIRLINES CO. LTD.': ['SF-WG'],
  'SPICEJET': ['SG'],
  'SWISS INTERNATIONAL': ['LX'],
  'Srilankan Airline': ['UL'],
  'Suparna Airlines Company Limited': ['Y8'],
  'THAI AIRWAYS INTERNATIONAL PUBLIC COMPANY LIMITED': ['TG'],
  'Thai Air Asia X': ['XJ'],
  'Tiajin Cargo': ['HT'],
  'UNITED AIRLINES INC': ['UA'],
  'Uzbekistan Airways': ['HY'],
  'VIETJET AVIATION JOINT STOCK COMPANY': ['VJ'],
  'VIRGIN ATLANTIC AIRWAYS LIMITED': ['VS'],
};

const UOM_MAP = {
  P4H: 'Per person for 4 hours',
  PC: 'Per Call',
  PD: 'Per Day',
  PF: 'Per Flight',
  PH: 'Per Hour',
  PL: 'Per Litre',
  PM: 'Per Month',
  PP: 'Per Push',
  PS: 'Per Service',
  PST: 'Per Startup',
  PTD: 'Per Turnaround',
  PTRIP: 'Per Trip',
  PTRND: 'Per Turnaround',
  PTW: 'Per Tow',
  PU: 'Per Unit',
  'PU 1': 'Per Unit',
  PU1: 'Per Unit',
  PS1: 'Per Service',
  PSPH: 'Per Staff Per Hour',
  PSPM: 'Per Staff Per Month',
  PSPF: 'Per Service Per Flight',
  PUM: 'Per Minor',
  Pcall: 'Per Call',
  Pevent: 'Per Event',
  'Per Fight': 'Per Flight',
  'Per staff PH': 'Per Staff Per Hour',
  'Per staff per Hour': 'Per Staff Per Hour',
  'Per 30 Min.': 'Per 30 Min',
  'Per 30 Minutes': 'Per 30 Min',
  'Per 60 Min': 'Per 60 Minutes',
  'Per 60 Minute': 'Per 60 Minutes',
  'Per lift': 'Per Lift',
  'Per litre': 'Per Litre',
};

const BLANK_UOM = new Set(['', 'PFM', 'PSPR', 'EBC', 'Beyond Ground Time', 'PS/PF', '0.05']);

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value instanceof Date) return value.toISOString();
    return '';
  }
  return String(value).trim();
}

function resolveUom(raw, service) {
  const text = raw.trim();
  if (BLANK_UOM.has(text)) return { uom: '', remark: text ? `UOM: ${text}` : '' };
  if (UOM_MAP[text]) return { uom: UOM_MAP[text], remark: '' };
  if (text.toUpperCase() === 'PT') {
    return { uom: /tow|ist/i.test(service) ? 'Per Tow' : 'Per Trip', remark: '' };
  }
  return { uom: text, remark: '' };
}

function parseFoc(raw) {
  const text = raw.trim();
  if (!text || text === '0') return { freePerFlight: 0, remarks: '' };
  const split = text.match(/^(\d+)\s*for\s*NB,\s*(\d+)\s*for\s*WB/i);
  if (split) {
    return {
      freePerFlight: 0,
      freePerFlightNb: Number(split[1]),
      freePerFlightWb: Number(split[2]),
      remarks: text,
    };
  }
  if (/year|per month|based on/i.test(text)) return { freePerFlight: 0, remarks: text };
  const hours = text.match(/^(\d+(?:\.\d+)?)\s*hours?\b/i);
  if (hours) return { freePerFlight: Number(hours[1]), remarks: text };
  const minutes = text.match(/^(\d+)\s*min\b/i);
  if (minutes) return { freePerFlight: Number(minutes[1]) / 60, remarks: text };
  if (/^\d+$/.test(text)) return { freePerFlight: Number(text), remarks: '' };
  const counted = text.match(/^(\d+)\b.*(?:operational days|stack)/i);
  if (counted) return { freePerFlight: Number(counted[1]), remarks: text };
  if (/^1\s+(?:trip each|unit included)/i.test(text)) return { freePerFlight: 1, remarks: text };
  return { freePerFlight: 0, remarks: text };
}

function ruleFromRow(row) {
  const foc = parseFoc(row.foc);
  const unit = resolveUom(row.uom, row.service);
  const remarks = [foc.remarks, unit.remark].filter(Boolean).join(' ');
  const rule = {
    serviceCode: row.service,
    includedForAds: true,
    alwaysChargeable: row.foc.trim() === '',
    freePerFlight: foc.freePerFlight,
    cumulativeMonthlyBasis: false,
    uom: unit.uom,
    remarks,
    unitPriceINR: null,
    unitPriceUSD: null,
    aircraftTypes: [],
  };
  if (foc.freePerFlightNb != null) rule.freePerFlightNb = foc.freePerFlightNb;
  if (foc.freePerFlightWb != null) rule.freePerFlightWb = foc.freePerFlightWb;
  return rule;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(FILE);
const sheet = workbook.worksheets[0];
const byCode = new Map();
const unknownAirlines = new Set();
let sheetRows = 0;

for (let index = 3; index <= sheet.rowCount; index += 1) {
  const row = sheet.getRow(index);
  const airline = cellText(row.getCell(1).value);
  const service = cellText(row.getCell(3).value).replace(/\s+/g, ' ').trim();
  if (!airline || !service || !ONLY_AIRLINES.has(airline)) continue;
  sheetRows += 1;
  const codes = AIRLINE_CODES[airline];
  if (!codes) {
    unknownAirlines.add(airline);
    continue;
  }
  const source = {
    service,
    foc: cellText(row.getCell(4).value),
    uom: cellText(row.getCell(6).value),
  };
  for (const code of codes) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(ruleFromRow(source));
  }
}

for (const [code, rules] of byCode) {
  const seen = new Set();
  byCode.set(
    code,
    rules.filter((rule) => {
      const key = [rule.serviceCode, rule.uom, rule.freePerFlight, rule.freePerFlightNb ?? '', rule.freePerFlightWb ?? '', rule.remarks].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

const client = new MongoClient(loadMongoUri());
await client.connect();
const billing = client.db().collection('billing');
const now = new Date();
const report = [];

for (const [code, rules] of [...byCode.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const contracts = await billing
    .find({ docType: 'contract', stationCode: STATION, customerCode: code })
    .project({ contractNumber: 1, status: 1 })
    .toArray();
  if (contracts.length === 0) {
    report.push({ code, contracts: [], rules: rules.length, missing: true });
    continue;
  }
  for (const contract of contracts) {
    await billing.updateOne(
      { _id: contract._id },
      { $set: { adsEquipmentRules: rules, adsBillingEnabled: true, updatedAt: now } },
    );
  }
  report.push({
    code,
    contracts: contracts.map((contract) => `${contract.contractNumber} (${contract.status})`),
    rules: rules.length,
  });
}

console.log(JSON.stringify({ sheetRows, unknownAirlines: [...unknownAirlines], report }, null, 2));
await client.close();
