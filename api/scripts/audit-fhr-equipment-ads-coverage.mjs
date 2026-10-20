/**
 * READ-ONLY audit: enumerate every equipment / manpower name present in
 * `fhr_collection` (equipmentDetails[] + equipmentManpower.entries[]) and the
 * standalone `equipmentManpower` collection, then report which names are NOT
 * matched by the ADS palette alias tables in
 * `client/components/billing/sources/billingAdsBriefStats.ts`.
 *
 * Unmatched names = equipment being left out of ADS counting. Feed them back
 * into the DEFINITIONS alias arrays.
 *
 * Usage (from server/):
 *   MONGO_URI="mongodb+srv://..." node scripts/audit-fhr-equipment-ads-coverage.mjs
 * or put MONGO_URI / MONGODB_URI in server/.env
 *
 * Optional flags:
 *   --station=MAA         limit to one stationCode
 *   --json                emit machine-readable JSON only
 *   --min=2               only list unmatched names seen >= N times
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a);
    return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
  }),
);
const STATION = typeof args.get('station') === 'string' ? args.get('station') : null;
const JSON_ONLY = args.has('json');
const MIN = Number(args.get('min') ?? 1) || 1;

// ---------------------------------------------------------------------------
// Mirror of billingAdsBriefStats.ts matching logic (keep in sync).
// ---------------------------------------------------------------------------
const DEFINITIONS = [
  { key: 'c', label: 'C', aliases: ['C', 'Cones', 'Cone'] },
  { key: 'cabinCleaning', label: 'Cabin Cleaning', aliases: ['Cabin Cleaning'] },
  { key: 'ck', label: 'CK', aliases: ['CK', 'Chocks', 'Chock', 'Chokes'] },
  { key: 'dt', label: 'DT', aliases: ['DT', 'Diesel Tractor'] },
  { key: 'pslTowable', label: 'PSL-Towable', aliases: ['PSL-Towable', 'PSL Towable', 'Pax Step Ladder Towable', 'Passenger Step Ladder Towable', 'Pax Step Ladder (Remote Bay) Towable', 'Passenger Step Ladder (Remote Bay) Towable', 'Pax Step Ladder Remote Bay Towable'] },
  { key: 'ts', label: 'TS', aliases: ['TS', 'Toilet Service', 'Toilet service'] },
  { key: 'wc', label: 'WC', aliases: ['WC', 'Water Cart', 'White Collar'] },
  { key: 'ww', label: 'WW', aliases: ['WW', 'Wing Walking', 'Wing Walker'] },
  { key: 'asuNb', label: 'ASU-NB', aliases: ['ASU-NB', 'ASUNB', 'PST-ASU-NB', 'Air Start Unit Narrow Body', 'Air Start Unit - Narrow Body', 'Air start unit - narrow body', 'Air Start Unit-Narrow Body', 'Air Start Unit (ASU) Narrow Body', 'Air Start Unit (ASU) - Narrow Body'] },
  { key: 'amb', label: 'AMB', aliases: ['AMB', 'Ambulift', 'Ambuilift', 'AMB/Ambulift', 'AMB/Ambuilift'] },
  { key: 'wch', label: 'WCH', aliases: ['WCHR', 'WCHS', 'WCHC', 'Wheel Chair (R)', 'Wheel Chair (S)', 'Wheel Chair (C)', 'Wheel Chair R', 'Wheel Chair S', 'Wheel Chair C', 'Wheelchair (R)', 'Wheelchair (S)', 'Wheelchair (C)', 'Wheelchair R', 'Wheelchair S', 'Wheelchair C', 'Wheelchair', 'Wheel Chair', 'Wheel Chair -WCHR', 'Wheel Chair - WCHR', 'Wheel Chair -WCHS', 'Wheel Chair - WCHS', 'Wheel Chair -WCHC', 'Wheel Chair - WCHC'] },
  { key: 'bflTowable', label: 'BFL-Towable', aliases: ['BFL-Towable', 'BFL Towable', 'Baggage Freight Loader', 'Baggage Frieght Loader', 'Baggage Freight Loader Towable', 'Conveyor Belt Towable', 'Conveyor Belt Loader Towable'] },
  { key: 'ebt', label: 'EBT', aliases: ['EBT', 'Electric Baggage Trolly', 'Electric Baggage Trolley', 'Electric Baggage Tractor'] },
  { key: 'paxCoach', label: 'PAX Coach', aliases: ['PAX Coach', 'PAXCOACH', 'Passenger Coach', 'Pax Coach'] },
  { key: 'pbnb', label: 'PBNB', aliases: ['PBNB', 'Push Back Narrow Body', 'Pushback Narrow Body', 'Push Back-Narrow Body', 'Push Back - Narrow Body'] },
  { key: 'mpsl', label: 'MPSL', aliases: ['MPSL', 'Motorized Passenger Step Ladder', 'Motorised Passenger Step Ladder'] },
  { key: 'gpuNb', label: 'GPU-NB', aliases: ['GPU-NB', 'GPUNB', 'GPU NB', 'GPU/NB', 'Ground Power Unit Narrow Body', 'Ground Power Unit - Narrow Body', 'Ground power unit - narrow body', 'GPU-90KV', 'GPU-90 KV', 'GPU 90KV', 'GPU 90 KV', 'GPU90KV', 'GPU-90KVA', 'GPU 90KVA', 'GPU-140KV', 'GPU-140 KV', 'GPU 140KV', 'GPU 140 KV', 'GPU140KV', 'GPU-140KVA', 'GPU 140KVA', 'Ground Power Unit -90KV', 'Ground Power Unit - 90KV', 'Ground Power Unit -90 KV', 'Ground Power Unit 90KV', 'Ground Power Unit 90 KV', 'Ground Power Unit -140KV', 'Ground Power Unit - 140KV', 'Ground Power Unit -140 KV', 'Ground Power Unit 140KV', 'Ground Power Unit 140 KV', 'Ground Power Unit (GPU) 90 KV', 'Ground Power Unit (GPU) 140 KV'] },
  { key: 'acuNb', label: 'ACU-NB', aliases: ['ACU-NB', 'ACUNB', 'Air Conditioner Unit Narrow Body', 'Air Conditioner Unit - Narrow Body', 'Air Conditioning Unit Narrow Body', 'Air Conditioning Unit - Narrow Body'] },
  { key: 'crewCoach', label: 'Crew Coach', aliases: ['Crew Coach'] },
  { key: 'csh', label: 'CSH', aliases: ['CSH', 'Customer Service Host', 'Customer Service Hostess'] },
  { key: 'srCsa', label: 'Sr. CSA', aliases: ['Sr. CSA', 'Sr CSA', 'Senior CSA', 'SCSA', 'Senior Customer Service Agent', 'Senior Customer Service Associate', 'Sr. Customer Service Agent', 'Sr Customer Service Agent', 'Sr. Customer Service Associate'] },
  { key: 'sup', label: 'Sup', aliases: ['Sup', 'SUP', 'Supervisor', 'SVP'] },
  { key: 'uh', label: 'UH', aliases: ['UH', 'Unit Handling', 'Unskilled Helper'] },
  { key: 'csa', label: 'CSA', aliases: ['CSA', 'Customer Service Agent', 'Customer Service Associate'] },
  { key: 'ldl', label: 'LDL', aliases: ['LDL', 'Lower Deck Loader'] },
  { key: 'do', label: 'DO', aliases: ['DO', 'Duty Officer'] },
  { key: 'pbwb', label: 'PBWB', aliases: ['PBWB', 'Push Back Wide Body', 'Pushback Wide Body', 'Push Back-Wide Body', 'Push Back - Wide Body'] },
  { key: 'acuWb', label: 'ACU-WB', aliases: ['ACU-WB', 'ACUWB', 'Air Conditioner Unit Wide Body', 'Air Conditioner Unit-Wide Body', 'Air Conditioner Unit - Wide Body', 'Air Conditioning Unit Wide Body', 'Air Conditioning Unit - Wide Body'] },
  { key: 'gpuWb', label: 'GPU-WB', aliases: ['GPU-WB', 'GPUWB', 'GPU WB', 'GPU/WB', 'Ground Power Unit Wide Body', 'Ground Power Unit - Wide Body', 'Ground power unit - wide body', 'GPU-180KV', 'GPU-180 KV', 'GPU 180KV', 'GPU 180 KV', 'GPU180KV', 'GPU-280KV', 'GPU-280 KV', 'GPU 280KV', 'GPU 280 KV', 'GPU280KV', 'Ground Power Unit -180KV', 'Ground Power Unit - 180KV', 'Ground Power Unit 180KV', 'Ground Power Unit 180 KV', 'Ground Power Unit -280KV', 'Ground Power Unit - 280KV', 'Ground Power Unit 280KV', 'Ground Power Unit 280 KV'] },
  { key: 'asuWb', label: 'ASU-WB', aliases: ['ASU-WB', 'ASUWB', 'PST-ASU-WB', 'Air Start Unit Wide Body', 'Air Start Unit - Wide Body', 'Air start unit - wide body', 'Air Start Unit-Wide Body', 'Air Start Unit (ASU) Wide Body', 'Air Start Unit (ASU) - Wide Body'] },
  { key: 'rc', label: 'RC', aliases: ['RC', 'Remote Control', 'Ramp Car'] },
  { key: 'tow', label: 'Tow', aliases: ['Tow', 'Towbar', 'Tow Bar'] },
  { key: 'bt', label: 'BT', aliases: ['BT', 'Baggage Trolly', 'Baggage Trolley', 'Baggage Trollies', 'Baggage Trollys', 'Baggage Trolleys'] },
  { key: 'acu', label: 'ACU', aliases: ['ACU', 'Air Conditioner Unit', 'Air Conditioning Unit'] },
  { key: 'istwb', label: 'ISTWB', aliases: ['ISTWB', 'Tow Inter Stand Wide Body', 'Inter Stand Tow Wide Body'] },
  { key: 'hs', label: 'HS', aliases: ['HS', 'Headset', 'Head Set'] },
  { key: 'istNb', label: 'ISTNB', aliases: ['ISTNB', 'IST-NB', 'IST NB', 'Tow Inter Stand Narrow Body', 'Inter Stand Tow Narrow Body', 'Inter Stand Tow - Narrow Body'] },
  { key: 'mdl', label: 'MDL', aliases: ['MDL', 'Main Deck Loader', 'Maindeck Loader'] },
  { key: 'udl', label: 'UDL', aliases: ['UDL', 'Upper Deck Loader', 'Upperdeck Loader'] },
  { key: 'fe', label: 'FE', aliases: ['FE', 'Fire Extinguisher', 'Fire Extinguisher (FE)'] },
  { key: 'trestle', label: 'Trestle', aliases: ['Trestle', 'Tresel', 'Tressel', 'Trestel', 'TRE'] },
  { key: 'marshaller', label: 'Marshaller', aliases: ['Marshaller', 'Marshaler', 'Marshalling', 'Marshal', 'Marshall'] },
  { key: 'additionalUh', label: 'Add. UH', aliases: ['Additional Utility Hand', 'Addl Utility Hand', 'Additional Utility Helper', 'Additional UH'] },
  { key: 'ecNb', label: 'EC-NB', aliases: ['EC-NB', 'EC NB', 'ECNB'] },
  { key: 'cbm', label: 'CBM', aliases: ['CBM'] },
  { key: 'urb', label: 'URB', aliases: ['URB'] },
  { key: 'cd', label: 'CD', aliases: ['CD', 'Container Dollies', 'Container Dolly'] },
  { key: 'm', label: 'M', aliases: ['M'] },
  { key: 'ctt', label: 'CTT', aliases: ['CTT', 'Cargo Transfer Trailer'] },
  { key: 'ws', label: 'WS', aliases: ['WS', 'Water Service'] },
  { key: 'pin', label: 'PIN', aliases: ['PIN', 'Aircraft Pin'] },
  { key: 'pw', label: 'PW', aliases: ['PW', 'Potable Water'] },
  { key: 'baggageCart', label: 'BC', aliases: ['BC', 'Baggage Cart'] },
  { key: 'exteriorCleaning', label: 'Exterior Cleaning', aliases: ['Exterior Cleaning', 'Exterior Cleaning Narrow Body', 'Exterior Cleaning Wide Body'] },
  { key: 'wcb', label: 'WBC', aliases: ['WBC', 'Wheel Chair Battery', 'Wheelchair Battery'] },
  { key: 'pd', label: 'PD', aliases: ['PD', 'Pallet Dollies', 'Pallet Dolly'] },
];

function normalizeBriefName(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function compactBriefName(value) {
  return value.replace(/\s+/g, '');
}
function addCandidateName(names, raw) {
  const text = String(raw ?? '').trim();
  if (!text) return;
  const normalized = normalizeBriefName(text);
  if (!normalized) return;
  names.add(normalized);
  const compact = compactBriefName(normalized);
  if (compact && compact !== normalized) names.add(compact);
  for (const part of text.split(/\s*[-\u2013\u2014:/|]\s*/)) {
    const partNorm = normalizeBriefName(part);
    if (!partNorm || partNorm === normalized) continue;
    names.add(partNorm);
    const partCompact = compactBriefName(partNorm);
    if (partCompact && partCompact !== partNorm) names.add(partCompact);
  }
  const paren = /\(([A-Z0-9.]+)\)\s*$/i.exec(text);
  if (paren?.[1]) {
    const code = normalizeBriefName(paren[1]);
    if (code) names.add(code);
  }
}
const NORMALIZED_ALIASES = new Map(
  DEFINITIONS.map((item) => {
    const aliases = new Set();
    for (const alias of item.aliases) {
      const normalized = normalizeBriefName(alias);
      if (!normalized) continue;
      aliases.add(normalized);
      const compact = compactBriefName(normalized);
      if (compact) aliases.add(compact);
    }
    return [item.key, aliases];
  }),
);
function hasMatchingAlias(candidates, aliases) {
  for (const c of candidates) if (aliases.has(c)) return true;
  return false;
}
function hasFuzzyAliasMatch(candidates, aliases) {
  for (const candidate of candidates) {
    const cc = compactBriefName(candidate);
    if (cc.length < 4) continue;
    for (const alias of aliases) {
      const ac = compactBriefName(alias);
      if (ac.length < 4) continue;
      if (cc === ac || cc.includes(ac)) return true;
    }
  }
  return false;
}
function candidatesFor(rawName) {
  const names = new Set();
  addCandidateName(names, rawName);
  return names;
}
function inferGpu(candidates) {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isGpu = /\bGPU\b/.test(blob) || compact.startsWith('GPU') || compact.includes('GROUNDPOWER');
  if (!isGpu) return [];
  const explicitWb = /\bGPU\s*WB\b|\bGPUWB\b|\bWIDE\s*BODY\b/.test(blob) || compact.includes('GPUWB') || compact.includes('WIDEBODY') || /180KV|280KV|180KVA|280KVA/.test(compact);
  const explicitNb = /\bGPU\s*NB\b|\bGPUNB\b|\bNARROW\s*BODY\b/.test(blob) || compact.includes('GPUNB') || compact.includes('NARROWBODY') || /90KV|140KV|90KVA|140KVA/.test(compact);
  if (explicitWb && !explicitNb) return ['gpuWb'];
  if (explicitNb && !explicitWb) return ['gpuNb'];
  return ['gpuNb'];
}
function inferAcu(candidates) {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isAcu = /\bACU\b/.test(blob) || compact.includes('ACU') || compact.includes('AIRCONDITION');
  if (!isAcu) return [];
  const keys = new Set();
  if (/\bACU\s*WB\b|\bACUWB\b|\bWIDE\s*BODY\b/.test(blob) || compact.includes('ACUWB') || compact.includes('WIDEBODY')) keys.add('acuWb');
  if (/\bACU\s*NB\b|\bACUNB\b|\bNARROW\s*BODY\b/.test(blob) || compact.includes('ACUNB') || compact.includes('NARROWBODY')) keys.add('acuNb');
  if (keys.size === 0) keys.add('acuNb');
  return [...keys];
}
function inferAsu(candidates) {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isAsu = /\bASU\b/.test(blob) || compact.includes('AIRSTART') || compact.includes('ASUNB') || compact.includes('ASUWB');
  if (!isAsu) return [];
  const explicitWb = /\bWIDE\s*BODY\b/.test(blob) || compact.includes('ASUWB') || compact.includes('WIDEBODY');
  const explicitNb = /\bNARROW\s*BODY\b/.test(blob) || compact.includes('ASUNB') || compact.includes('NARROWBODY');
  if (explicitWb && !explicitNb) return ['asuWb'];
  if (explicitNb && !explicitWb) return ['asuNb'];
  return ['asuNb'];
}
function matchKeys(rawName) {
  const candidates = candidatesFor(rawName);
  const exact = [];
  const fuzzy = [];
  for (const item of DEFINITIONS) {
    const aliases = NORMALIZED_ALIASES.get(item.key);
    if (hasMatchingAlias(candidates, aliases)) exact.push(item.key);
    else if ((item.key === 'gpuNb' || item.key === 'gpuWb') && hasFuzzyAliasMatch(candidates, aliases)) fuzzy.push(item.key);
  }
  const matches = exact.length > 0 ? [...exact] : [...fuzzy];
  for (const k of inferGpu(candidates)) if (!matches.includes(k)) matches.push(k);
  for (const k of inferAcu(candidates)) if (!matches.includes(k)) matches.push(k);
  for (const k of inferAsu(candidates)) if (!matches.includes(k)) matches.push(k);
  if (matches.includes('asuNb') || matches.includes('asuWb')) {
    return matches.filter((k) => k !== 'gpuNb' && k !== 'gpuWb' && k !== 'acu' && k !== 'acuNb' && k !== 'acuWb');
  }
  return matches;
}

// Clean like the server mapper does before matching.
function cleanName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return (s.replace(/^(EQ|MP)\s*:\s*/i, '').split('|')[0] ?? s).trim() || s;
}

// ---------------------------------------------------------------------------
async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('ERROR: set MONGO_URI (or MONGODB_URI) env var or server/.env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const fhr = db.collection('fhr_collection');

  const baseMatch = STATION ? { stationCode: STATION } : {};

  // Distinct equipment_name from embedded equipmentDetails[].
  const detailAgg = await fhr
    .aggregate([
      { $match: baseMatch },
      { $unwind: '$equipmentDetails' },
      {
        $group: {
          _id: { $ifNull: ['$equipmentDetails.equipment_name', ''] },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
    ])
    .toArray();

  // Distinct names from embedded equipmentManpower.entries[].
  const embedAgg = await fhr
    .aggregate([
      { $match: baseMatch },
      { $unwind: '$equipmentManpower.entries' },
      {
        $group: {
          _id: {
            equipmentName: '$equipmentManpower.entries.equipmentName',
            name: '$equipmentManpower.entries.name',
            entryType: '$equipmentManpower.entries.entryType',
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
    ])
    .toArray();

  // Standalone equipmentManpower collection (non-catalog docs).
  let standaloneAgg = [];
  try {
    const emp = db.collection('equipmentManpower');
    standaloneAgg = await emp
      .aggregate([
        { $match: { isEquipmentManpowerCatalog: { $ne: true } } },
        { $unwind: '$entries' },
        {
          $group: {
            _id: {
              equipmentName: '$entries.equipmentName',
              name: '$entries.name',
              entryType: '$entries.entryType',
            },
            n: { $sum: 1 },
          },
        },
        { $sort: { n: -1 } },
      ])
      .toArray();
  } catch {
    standaloneAgg = [];
  }

  // Aggregate all raw names into a single frequency map (post-clean).
  const rawCounts = new Map();
  const bump = (raw, n) => {
    const cleaned = cleanName(raw);
    if (!cleaned) return;
    rawCounts.set(cleaned, (rawCounts.get(cleaned) ?? 0) + n);
  };

  for (const r of detailAgg) bump(r._id, r.n);
  for (const r of embedAgg) {
    const raw = r._id.equipmentName || r._id.name;
    bump(raw, r.n);
  }
  for (const r of standaloneAgg) {
    const raw = r._id.equipmentName || r._id.name;
    bump(raw, r.n);
  }

  const matched = [];
  const unmatched = [];
  for (const [name, n] of rawCounts.entries()) {
    const keys = matchKeys(name);
    if (keys.length > 0) matched.push({ name, n, keys });
    else unmatched.push({ name, n });
  }
  matched.sort((a, b) => b.n - a.n);
  unmatched.sort((a, b) => b.n - a.n);

  const unmatchedFiltered = unmatched.filter((u) => u.n >= MIN);

  if (JSON_ONLY) {
    console.log(
      JSON.stringify(
        {
          db: mongoose.connection.name,
          station: STATION ?? 'ALL',
          distinctNames: rawCounts.size,
          matchedCount: matched.length,
          unmatchedCount: unmatched.length,
          matched,
          unmatched: unmatchedFiltered,
        },
        null,
        2,
      ),
    );
    await mongoose.disconnect();
    return;
  }

  console.log('='.repeat(72));
  console.log(`DB: ${mongoose.connection.name}   station: ${STATION ?? 'ALL'}`);
  console.log(`distinct equipment names (post-clean): ${rawCounts.size}`);
  console.log(`  matched to an ADS palette key: ${matched.length}`);
  console.log(`  UNMATCHED (left out of ADS counting): ${unmatched.length}`);
  console.log('='.repeat(72));

  console.log('\n### UNMATCHED names (seen >= ' + MIN + ') — these are being left out:\n');
  if (unmatchedFiltered.length === 0) {
    console.log('  (none) — every equipment name maps to a palette key.');
  } else {
    for (const u of unmatchedFiltered) {
      console.log(`  ${String(u.n).padStart(6)}  |  ${u.name}`);
    }
  }

  console.log('\n### MATCHED names (for review of over-broad mapping):\n');
  for (const m of matched) {
    console.log(`  ${String(m.n).padStart(6)}  |  ${m.name}  ->  [${m.keys.join(', ')}]`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
