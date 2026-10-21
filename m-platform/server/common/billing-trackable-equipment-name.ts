/**
 * Canonical billing-trackable equipment / service / manpower full names.
 *
 * Scheduled GSE stores these full forms (not Excel short codes, serials-as-names,
 * or non-scheduled catalog spellings billing cannot match). Matching still accepts
 * short codes and aliases so legacy rows keep billing.
 *
 * Do not expand dropped / untrackable codes (`c1`, `urb`) into NS-only names
 * such as Coach or ULD Roller Bed.
 */

export type BillingTrackableNameKind = 'equipment' | 'manpower' | 'auto';

/** ADS contract drops these — never invent a full form billing cannot invoice. */
const BILLING_UNTRACKABLE_CODES = new Set(['c1', 'urb']);

type NameEntry = {
  full: string;
  kind: 'equipment' | 'manpower';
  aliases: readonly string[];
};

const EQUIPMENT_ENTRIES: readonly NameEntry[] = [
  { full: 'Cones', kind: 'equipment', aliases: ['C', 'Cones', 'Cone'] },
  { full: 'Chocks', kind: 'equipment', aliases: ['CK', 'Chocks', 'Chock', 'Chokes'] },
  { full: 'Diesel Tractor', kind: 'equipment', aliases: ['DT', 'Diesel Tractor'] },
  {
    full: 'Passenger Step Ladder Towable',
    kind: 'equipment',
    aliases: [
      'PSL-Towable',
      'PSL Towable',
      'PSLTOWABLE',
      'Pax Step Ladder Towable',
      'Passenger Step Ladder Towable',
      'Pax Step Ladder (Remote Bay) Towable',
      'Passenger Step Ladder (Remote Bay) Towable',
      'Pax Step Ladder Remote Bay Towable',
      'Pax Step Ladder (remote bay) Towable',
    ],
  },
  {
    full: 'Toilet Service',
    kind: 'equipment',
    aliases: ['TS', 'Toilet Service', 'Toilet service', 'Toilet Cart'],
  },
  {
    full: 'Water Cart',
    kind: 'equipment',
    aliases: ['WC', 'Water Cart', 'Water Carts'],
  },
  {
    full: 'Wing Walking',
    kind: 'equipment',
    aliases: ['WW', 'Wing Walking', 'Wing Walker', 'wing Walking'],
  },
  {
    full: 'Air Start Unit - Narrow Body',
    kind: 'equipment',
    aliases: [
      'ASU-NB',
      'ASUNB',
      'Air Start Unit Narrow Body',
      'Air Start Unit - Narrow Body',
      'Air Start Unit-Narrow Body',
      'Air Start Unit-Narrow body',
    ],
  },
  {
    full: 'Ambulift',
    kind: 'equipment',
    aliases: ['AMB', 'Ambulift', 'Ambuilift', 'Ambulance', 'AMB/Ambulift', 'PS-AMB'],
  },
  {
    full: 'Baggage Freight Loader',
    kind: 'equipment',
    aliases: [
      'BFL-Towable',
      'BFL Towable',
      'BFLTowable',
      'BFL',
      'Baggage Freight Loader',
      'Baggage Frieght Loader',
      'Baggage Freight Loader Towable',
    ],
  },
  {
    full: 'Conveyor Belt Loader',
    kind: 'equipment',
    aliases: [
      'CONVEYOR BELT',
      'Conveyor Belt',
      'Conveyor-Belt',
      'Conveyor belt loader',
      'Conveyor Belt Loader',
      'Conveyor Belt Towable',
      'Conveyor Belt-Towable',
      'Conveyor Belt Loader Towable',
    ],
  },
  {
    full: 'Electric Baggage Trolly',
    kind: 'equipment',
    aliases: [
      'EBT',
      'Electric Baggage Trolly',
      'Electric Baggage Trolley',
      'Electric Baggage Tractor',
    ],
  },
  {
    full: 'Passenger Coach',
    kind: 'equipment',
    aliases: ['PAX Coach', 'PAXCOACH', 'PAX-COACH', 'Passenger Coach', 'Pax Coach'],
  },
  {
    full: 'Push Back Narrow Body',
    kind: 'equipment',
    aliases: [
      'PBNB',
      'PB-NB',
      'PB/NB',
      'Push Back Narrow Body',
      'Pushback Narrow Body',
      'Push Back-Narrow Body',
      'Push Back - Narrow Body',
      'PushBack-Narrow Body',
    ],
  },
  {
    full: 'Motorized Passenger Step Ladder',
    kind: 'equipment',
    aliases: [
      'MPSL',
      'PSL-NB',
      'PSL-WB',
      'Motorized Passenger Step Ladder',
      'Motorised Passenger Step Ladder',
      'Motorised Pax Step Ladder',
    ],
  },
  {
    full: 'Ground Power Unit - Narrow Body',
    kind: 'equipment',
    aliases: [
      'GPU-NB',
      'GPUNB',
      'GPU NB',
      'GPU/NB',
      'Ground Power Unit Narrow Body',
      'Ground Power Unit - Narrow Body',
      'Ground Power Unit (NB)',
      'GPU-90KV',
      'GPU-90 KV',
      'GPU 90KV',
      'GPU 90 KV',
      'GPU90KV',
      'GPU-90KVA',
      'GPU 90KVA',
      'Ground Power Unit -90KV',
      'Ground Power Unit - 90KV',
      'Ground Power Unit -90 KV',
      'Ground Power Unit 90KV',
      'Ground Power Unit 90 KV',
      'Ground Power Unit (GPU) 90 KV',
    ],
  },
  {
    full: 'Ground Power Unit - 140KV',
    kind: 'equipment',
    aliases: [
      'GPU-140KV',
      'GPU-140 KV',
      'GPU 140KV',
      'GPU 140 KV',
      'GPU140KV',
      'GPU-140KVA',
      'GPU 140KVA',
      'Ground Power Unit -140KV',
      'Ground Power Unit - 140KV',
      'Ground Power Unit -140 KV',
      'Ground Power Unit 140KV',
      'Ground Power Unit 140 KV',
      'Ground Power Unit (GPU) 140 KV',
      'Ground Power Unit-140 KV',
    ],
  },
  {
    full: 'Ground Power Unit (BME)',
    kind: 'equipment',
    aliases: [
      'GPU(BME)',
      'GPU (BME)',
      'Ground Power Unit (BME)',
      'Ground Power Unit(BME)',
    ],
  },
  {
    full: 'Air Conditioner Unit - Narrow Body',
    kind: 'equipment',
    aliases: [
      'ACU-NB',
      'ACUNB',
      'Air Conditioner Unit Narrow Body',
      'Air Conditioner Unit - Narrow Body',
      'Air Conditioner Unit (NB)',
      'Air Conditioning Unit Narrow Body',
      'Air Conditioning Unit - Narrow Body',
    ],
  },
  {
    full: 'Crew Coach',
    kind: 'equipment',
    aliases: [
      'Crew Coach',
      'Crew-Coach',
      'Crew-Coach-1',
      'CrewCoach',
      'CREW COACH',
      'CREW-COACH-1',
      'CREW-COACH',
    ],
  },
  { full: 'Lower Deck Loader', kind: 'equipment', aliases: ['LDL', 'Lower Deck Loader'] },
  {
    full: 'Water Cart (BME)',
    kind: 'equipment',
    aliases: ['WC(BME)', 'WC (BME)', 'Water Cart (BME)', 'Water Cart(BME)'],
  },
  {
    full: 'Air Conditioner Unit (BME)',
    kind: 'equipment',
    aliases: [
      'ACU(BME)',
      'ACU (BME)',
      'Air Conditioner Unit (BME)',
      'Air Conditioner Unit(BME)',
      'Air Condition Unit (BME)',
      'Air Condition Unit(BME)',
      'Air Conditione Unit (BME)',
    ],
  },
  {
    full: 'Push Back Wide Body',
    kind: 'equipment',
    aliases: [
      'PBWB',
      'PB-WB',
      'PB/WB',
      'Push Back Wide Body',
      'Pushback Wide Body',
      'Push Back-Wide Body',
      'Push Back - Wide Body',
      'PushBack-Wide Body',
    ],
  },
  {
    full: 'Air Conditioner Unit - Wide Body',
    kind: 'equipment',
    aliases: [
      'ACU-WB',
      'ACUWB',
      'Air Conditioner Unit Wide Body',
      'Air Conditioner Unit-Wide Body',
      'Air Conditioner Unit - Wide Body',
      'Air Conditioning Unit Wide Body',
      'Air Conditioning Unit - Wide Body',
    ],
  },
  {
    full: 'Air Conditioner Unit',
    kind: 'equipment',
    aliases: ['ACU', 'Air Conditioner Unit', 'Air Conditioning Unit'],
  },
  {
    full: 'Ground Power Unit - Wide Body',
    kind: 'equipment',
    aliases: [
      'GPU-WB',
      'GPUWB',
      'GPU WB',
      'GPU/WB',
      'Ground Power Unit Wide Body',
      'Ground Power Unit - Wide Body',
      'Ground Power Unit (WB)',
      'GPU-180KV',
      'GPU-180 KV',
      'GPU 180KV',
      'GPU 180 KV',
      'GPU180KV',
      'GPU-280KV',
      'GPU-280 KV',
      'GPU 280KV',
      'GPU 280 KV',
      'GPU280KV',
      'Ground Power Unit -180KV',
      'Ground Power Unit - 180KV',
      'Ground Power Unit 180KV',
      'Ground Power Unit 180 KV',
      'Ground Power Unit -280KV',
      'Ground Power Unit - 280KV',
      'Ground Power Unit 280KV',
      'Ground Power Unit 280 KV',
    ],
  },
  {
    full: 'Air Start Unit - Wide Body',
    kind: 'equipment',
    aliases: [
      'ASU-WB',
      'ASUWB',
      'Air Start Unit Wide Body',
      'Air Start Unit - Wide Body',
      'Air Start Unit-Wide Body',
      'Air Start Unit-Wide body',
    ],
  },
  {
    full: 'Ramp Car',
    kind: 'equipment',
    aliases: ['RC', 'Ramp Car', 'Remote Control'],
  },
  {
    full: 'Towbar',
    kind: 'equipment',
    aliases: ['Tow', 'TOW', 'Towbar', 'Tow Bar'],
  },
  {
    full: 'Long Towbar',
    kind: 'equipment',
    aliases: ['Long Towbar', 'Long Tow Bar', 'LTOW'],
  },
  {
    full: 'Short Towbar',
    kind: 'equipment',
    aliases: ['Short Towbar', 'Short Tow Bar', 'STOW'],
  },
  {
    full: 'Baggage Trolly',
    kind: 'equipment',
    aliases: [
      'BT',
      'Baggage Trolly',
      'Baggage Trolley',
      'Baggage Trollies',
      'Baggage Trollys',
      'Baggage Trolleys',
    ],
  },
  {
    full: 'Inter Stand Tow Wide Body',
    kind: 'equipment',
    aliases: [
      'ISTWB',
      'IST-WB',
      'IST WB',
      'Tow Inter Stand Wide Body',
      'Inter Stand Tow Wide Body',
      'Tow inter Stand- Wide Body',
    ],
  },
  { full: 'Headset', kind: 'equipment', aliases: ['HS', 'Headset', 'Head Set', 'HeadSet'] },
  {
    full: 'Inter Stand Tow Narrow Body',
    kind: 'equipment',
    aliases: [
      'ISTNB',
      'IST-NB',
      'IST NB',
      'INSTNB',
      'Tow Inter Stand Narrow Body',
      'Inter Stand Tow Narrow Body',
      'Inter Stand Tow - Narrow Body',
      'Tow inter Stand- Narrow Body',
      'Tow-NB',
    ],
  },
  {
    full: 'Main Deck Loader',
    kind: 'equipment',
    aliases: ['MDL', 'Main Deck Loader', 'Maindeck Loader'],
  },
  {
    full: 'Upper Deck Loader',
    kind: 'equipment',
    aliases: ['UDL', 'Upper Deck Loader', 'Upperdeck Loader'],
  },
  {
    full: 'Fire Extinguisher',
    kind: 'equipment',
    aliases: ['FE', 'Fire Extinguisher', 'Fire Extinguisher (FE)'],
  },
  {
    full: 'Trestle',
    kind: 'equipment',
    aliases: ['Trestle', 'Tresel', 'Tressel', 'Trestel', 'TRE'],
  },
  {
    full: 'Marshaller',
    kind: 'equipment',
    aliases: ['Marshaller', 'Marshaler', 'Marshalling', 'Marshal', 'Marshall', 'M'],
  },
  {
    full: 'Container Dollies',
    kind: 'equipment',
    aliases: ['CD', 'Container Dollies', 'Container Dolly'],
  },
  {
    full: 'Pallet Dollies',
    kind: 'equipment',
    aliases: ['PD', 'Pallet Dollies', 'Pallet Dolly'],
  },
  { full: 'Baggage Cart', kind: 'equipment', aliases: ['BC', 'Baggage Cart'] },
  {
    full: 'Cargo Transfer Trailer',
    kind: 'equipment',
    aliases: ['CTT', 'Cargo Transfer Trailer'],
  },
  { full: 'Aircraft Pin', kind: 'equipment', aliases: ['PIN', 'Aircraft Pin'] },
  { full: 'Potable Water', kind: 'equipment', aliases: ['PW', 'Potable Water'] },
  {
    full: 'Wheel Chair Battery',
    kind: 'equipment',
    aliases: ['WBC', 'Wheel Chair Battery'],
  },
  { full: 'Water Service', kind: 'equipment', aliases: ['WS', 'Water Service'] },
  { full: 'Vehicle - BMW', kind: 'equipment', aliases: ['BMW', 'Vehicle - BMW'] },
  { full: 'Vehicle - MG', kind: 'equipment', aliases: ['MG', 'Vehicle - MG'] },
  {
    full: 'Cabin Cleaning',
    kind: 'equipment',
    aliases: ['Cabin Cleaning'],
  },
  {
    full: 'Deep Cleaning',
    kind: 'equipment',
    aliases: [
      'Deep Cleaning',
      'Mini Deep Cleaning',
      'Mini Deep Cleaning Narrow Body',
      'Mini Deep Cleaning Wide Body',
      'Mini Deep Cleaning ATR',
      'Aircraft deep cleaning',
      'DC',
      'DC-NB',
      'DC-WB',
    ],
  },
  {
    full: 'Exterior Cleaning',
    kind: 'equipment',
    aliases: [
      'Exterior Cleaning',
      'EC-NB',
      'EC - NB',
      'EC-WB',
      'Exterior Cleaning Narrow Body',
      'Exterior Cleaning Wide Body',
    ],
  },
  {
    full: 'Night Halt Cleaning',
    kind: 'equipment',
    aliases: [
      'Night Halt Cleaning',
      'Night-Halt Cleaning',
      'NightHalt Cleaning',
      'NHC - NB',
      'NHC-NB',
    ],
  },
  {
    full: 'Wheel Chair - WCHR',
    kind: 'equipment',
    aliases: ['WCHR', 'Wheel Chair -WCHR', 'Wheel Chair - WCHR', 'Wheelchair (R)', 'Wheel Chair (R)'],
  },
  {
    full: 'Wheel Chair - WCHS',
    kind: 'equipment',
    aliases: ['WCHS', 'Wheel Chair -WCHS', 'Wheel Chair - WCHS', 'Wheelchair (S)', 'Wheel Chair (S)'],
  },
  {
    full: 'Wheel Chair - WCHC',
    kind: 'equipment',
    aliases: ['WCHC', 'Wheel Chair -WCHC', 'Wheel Chair - WCHC', 'Wheelchair (C)', 'Wheel Chair (C)'],
  },
];

const MANPOWER_ENTRIES: readonly NameEntry[] = [
  {
    full: 'Customer Service Agent',
    kind: 'manpower',
    aliases: ['CSA', 'Customer Service Agent', 'Customer Service Associate'],
  },
  {
    full: 'Senior Customer Service Agent',
    kind: 'manpower',
    aliases: [
      'Sr. CSA',
      'Sr CSA',
      'Senior CSA',
      'SCSA',
      'Senior Customer Service Agent',
      'Senior Customer Service Associate',
      'Sr. Customer Service Agent',
      'Sr Customer Service Agent',
    ],
  },
  { full: 'Supervisor', kind: 'manpower', aliases: ['Sup', 'SUP', 'Supervisor', 'SVP'] },
  {
    full: 'Unit Handling',
    kind: 'manpower',
    aliases: ['UH', 'Unit Handling', 'Unskilled Helper'],
  },
  { full: 'Duty Officer', kind: 'manpower', aliases: ['DO', 'Duty Officer'] },
  {
    full: 'Customer Service Host',
    kind: 'manpower',
    aliases: ['CSH', 'Customer Service Host', 'Customer Service Hostess'],
  },
  {
    full: 'Additional Utility Hand',
    kind: 'manpower',
    aliases: [
      'Additional Utility Hand',
      'Addl Utility Hand',
      'Additional Utility Helper',
      'Additional UH',
      'Add. UH',
    ],
  },
  {
    full: 'White Collar',
    kind: 'manpower',
    aliases: ['WC', 'White Collar'],
  },
  {
    full: 'Blue Collar',
    kind: 'manpower',
    aliases: ['BC', 'Blue Collar', 'Blue collar'],
  },
];

function normKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function compactKey(raw: string): string {
  return normKey(raw).replace(/[^a-z0-9]+/g, '');
}

function stripQtySuffix(name: string): string {
  return name.replace(/\s*\(×\d+\)\s*$/i, '').trim();
}

function putAlias(
  map: Map<string, string>,
  alias: string,
  full: string,
): void {
  const n = normKey(alias);
  const c = compactKey(alias);
  if (n) map.set(n, full);
  if (c) map.set(c, full);
}

const equipmentByKey = new Map<string, string>();
const manpowerByKey = new Map<string, string>();

for (const entry of EQUIPMENT_ENTRIES) {
  putAlias(equipmentByKey, entry.full, entry.full);
  for (const alias of entry.aliases) putAlias(equipmentByKey, alias, entry.full);
}
for (const entry of MANPOWER_ENTRIES) {
  putAlias(manpowerByKey, entry.full, entry.full);
  for (const alias of entry.aliases) putAlias(manpowerByKey, alias, entry.full);
}

function lookup(map: Map<string, string>, raw: string): string | undefined {
  const n = normKey(raw);
  if (!n) return undefined;
  return map.get(n) ?? map.get(compactKey(raw));
}

export function isBillingUntrackableEquipmentCode(raw: string): boolean {
  return BILLING_UNTRACKABLE_CODES.has(normKey(raw)) || BILLING_UNTRACKABLE_CODES.has(compactKey(raw));
}

/**
 * Expand a stored / Excel equipment, service, or manpower label to the billing
 * full form. Unknown values and untrackable codes (`c1`, `urb`) stay unchanged.
 *
 * `kind`:
 * - `equipment` — GSE / scheduled equipment (WC → Water Cart)
 * - `manpower` — staff roles (WC → White Collar)
 * - `auto` — equipment first, then manpower except bare `WC` (Water Cart)
 */
export function toBillingTrackableFullName(
  raw: string,
  kind: BillingTrackableNameKind = 'auto',
): string {
  const cleaned = stripQtySuffix(String(raw ?? '').trim());
  if (!cleaned) return '';
  if (isBillingUntrackableEquipmentCode(cleaned)) return cleaned;

  if (kind === 'manpower') {
    return lookup(manpowerByKey, cleaned) ?? lookup(equipmentByKey, cleaned) ?? cleaned;
  }
  if (kind === 'equipment') {
    return lookup(equipmentByKey, cleaned) ?? cleaned;
  }

  const asEquipment = lookup(equipmentByKey, cleaned);
  if (asEquipment) return asEquipment;
  return lookup(manpowerByKey, cleaned) ?? cleaned;
}

/** Normalize `fhr_collection.equipmentDetails[]` names to billing full forms. */
export function normalizeFhrEquipmentDetailItems(
  rows: unknown,
): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row as Record<string, unknown>;
    const rec = row as Record<string, unknown>;
    const raw = String(rec.equipment_name ?? rec.equipmentName ?? '').trim();
    if (!raw) return rec;
    const full = toBillingTrackableFullName(raw, 'auto');
    if (full === raw) return rec;
    return { ...rec, equipment_name: full };
  });
}
