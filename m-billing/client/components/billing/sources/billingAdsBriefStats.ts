import type { ActiveFlightStatTheme } from '@/components/fris/flights/scheduledairlines/scheduledAirlinesActiveFlightStats';
import type { BillingSourceRow } from '@/lib/billing-shared/billing-sources';
import { toBillingTrackableFullName } from '@/lib/billing-shared/billing-trackable-equipment-name';

export const BILLING_ADS_BRIEF_KEYS = [
  'c',
  'cabinCleaning',
  'deepCleaning',
  'nightHaltCleaning',
  'ck',
  'dt',
  'pslTowable',
  'ts',
  'wc',
  'ww',
  'asuNb',
  'amb',
  'wch',
  'bflTowable',
  'ebt',
  'paxCoach',
  'pbnb',
  'mpsl',
  'gpuNb',
  'acuNb',
  'crewCoach',
  'csh',
  'srCsa',
  'sup',
  'uh',
  'csa',
  'ldl',
  'do',
  'pbwb',
  'acuWb',
  'gpuWb',
  'asuWb',
  'rc',
  'tow',
  'longTowbar',
  'shortTowbar',
  'bt',
  'acu',
  'istwb',
  'hs',
  // Added after live fhr_collection audit — equipment/roles that previously had
  // no palette bucket and were dropped from ADS counting.
  'istNb',
  'mdl',
  'udl',
  'fe',
  'trestle',
  'marshaller',
  'additionalUh',
  'ecNb',
  'cbm',
  'urb',
  'cd',
  'm',
  // FHR equipmentDetails names that had a billing full form but no palette bucket,
  // so their quantities never appeared on ADS.
  'ctt',
  'ws',
  'pin',
  'pw',
  'baggageCart',
  'exteriorCleaning',
  'wcb',
  'pd',
] as const;

export type BillingAdsBriefKey = (typeof BILLING_ADS_BRIEF_KEYS)[number];
export type BillingAdsBriefStats = Record<BillingAdsBriefKey, number>;

export type BillingAdsWchSubtype = 'wchr' | 'wchs' | 'wchc';

export type BillingAdsWchBreakdown = Record<BillingAdsWchSubtype, number>;

export const EMPTY_BILLING_ADS_WCH_BREAKDOWN: BillingAdsWchBreakdown = {
  wchr: 0,
  wchs: 0,
  wchc: 0,
};

type BillingAdsBriefItem = {
  key: BillingAdsBriefKey;
  label: string;
  /** Human-readable name shown on palette hover. */
  fullName: string;
  aliases: readonly string[];
  theme: ActiveFlightStatTheme;
};

/** Primary full forms for palette tooltips (codes stay as card labels). */
export const BILLING_ADS_BRIEF_FULL_NAMES: Record<BillingAdsBriefKey, string> = {
  c: 'Cones',
  cabinCleaning: 'Cabin Cleaning',
  deepCleaning: 'Deep Cleaning',
  nightHaltCleaning: 'Night Halt Cleaning',
  ck: 'Chocks',
  dt: 'Diesel Tractor',
  pslTowable: 'Passenger Step Ladder Towable',
  ts: 'Toilet Service',
  wc: 'Water Cart',
  ww: 'Wing Walking',
  asuNb: 'Air Start Unit - Narrow Body',
  amb: 'Ambulift',
  wch: 'Wheelchair (WCHR / WCHS / WCHC)',
  bflTowable: 'Baggage Freight Loader',
  ebt: 'Electric Baggage Trolly',
  paxCoach: 'Passenger Coach',
  pbnb: 'Push Back Narrow Body',
  mpsl: 'Motorized Passenger Step Ladder',
  gpuNb: 'Ground Power Unit - Narrow Body',
  acuNb: 'Air Conditioner Unit - Narrow Body',
  crewCoach: 'Crew Coach',
  csh: 'Customer Service Host',
  srCsa: 'Senior Customer Service Agent',
  sup: 'Supervisor',
  uh: 'Unit Handling',
  csa: 'Customer Service Agent',
  ldl: 'Lower Deck Loader',
  do: 'Duty Officer',
  pbwb: 'Push Back Wide Body',
  acuWb: 'Air Conditioner Unit - Wide Body',
  gpuWb: 'Ground Power Unit - Wide Body',
  asuWb: 'Air Start Unit - Wide Body',
  rc: 'Ramp Car',
  tow: 'Towbar',
  longTowbar: 'Long Towbar',
  shortTowbar: 'Short Towbar',
  bt: 'Baggage Trolly',
  acu: 'Air Conditioner Unit',
  istwb: 'Inter Stand Tow Wide Body',
  hs: 'Headset',
  istNb: 'Inter Stand Tow Narrow Body',
  mdl: 'Main Deck Loader',
  udl: 'Upper Deck Loader',
  fe: 'Fire Extinguisher',
  trestle: 'Trestle',
  marshaller: 'Marshaller',
  additionalUh: 'Additional Utility Hand',
  // Short codes seen in FHR equipmentDetails without a documented full form.
  ecNb: 'EC - NB',
  cbm: 'CBM',
  urb: 'URB',
  cd: 'Container Dollies',
  m: 'M',
  ctt: 'Cargo Transfer Trailer',
  ws: 'Water Service',
  pin: 'Aircraft Pin',
  pw: 'Potable Water',
  baggageCart: 'Baggage Cart',
  exteriorCleaning: 'Exterior Cleaning',
  wcb: 'Wheel Chair Battery',
  pd: 'Pallet Dollies',
};

export function billingAdsBriefHoverTitle(
  key: BillingAdsBriefKey,
  label: string,
  count: number,
): string {
  const fullName = BILLING_ADS_BRIEF_FULL_NAMES[key] ?? label;
  const countLabel = `${count} FHR engagement${count === 1 ? '' : 's'} in date range`;
  if (fullName.trim().toLowerCase() === label.trim().toLowerCase()) {
    return `${label}: ${countLabel}`;
  }
  return `${label} — ${fullName} (${countLabel})`;
}

const THEMES: readonly ActiveFlightStatTheme[] = [
  {
    accent: '#1d4ed8',
    swatch: '#3b82f6',
    bgTop: '#eff6ff',
    bgBottom: '#dbeafe',
    border: '#93c5fd',
    shadow: 'rgba(37, 99, 235, 0.25)',
    hoverShadow: 'rgba(37, 99, 235, 0.42)',
  },
  {
    accent: '#7c3aed',
    swatch: '#a78bfa',
    bgTop: '#f5f3ff',
    bgBottom: '#ede9fe',
    border: '#c4b5fd',
    shadow: 'rgba(124, 58, 237, 0.24)',
    hoverShadow: 'rgba(124, 58, 237, 0.4)',
  },
  {
    accent: '#0e7490',
    swatch: '#06b6d4',
    bgTop: '#ecfeff',
    bgBottom: '#cffafe',
    border: '#67e8f9',
    shadow: 'rgba(14, 116, 144, 0.24)',
    hoverShadow: 'rgba(14, 116, 144, 0.4)',
  },
  {
    accent: '#15803d',
    swatch: '#22c55e',
    bgTop: '#f0fdf4',
    bgBottom: '#dcfce7',
    border: '#86efac',
    shadow: 'rgba(21, 128, 61, 0.24)',
    hoverShadow: 'rgba(21, 128, 61, 0.4)',
  },
  {
    accent: '#b45309',
    swatch: '#eab308',
    bgTop: '#fffbeb',
    bgBottom: '#fef3c7',
    border: '#fcd34d',
    shadow: 'rgba(217, 119, 6, 0.28)',
    hoverShadow: 'rgba(217, 119, 6, 0.45)',
  },
  {
    accent: '#c2410c',
    swatch: '#f97316',
    bgTop: '#fff7ed',
    bgBottom: '#ffedd5',
    border: '#fdba74',
    shadow: 'rgba(194, 65, 12, 0.26)',
    hoverShadow: 'rgba(194, 65, 12, 0.42)',
  },
  {
    accent: '#be123c',
    swatch: '#fb7185',
    bgTop: '#fff1f2',
    bgBottom: '#ffe4e6',
    border: '#fda4af',
    shadow: 'rgba(190, 18, 60, 0.24)',
    hoverShadow: 'rgba(190, 18, 60, 0.42)',
  },
  {
    accent: '#4338ca',
    swatch: '#6366f1',
    bgTop: '#eef2ff',
    bgBottom: '#e0e7ff',
    border: '#a5b4fc',
    shadow: 'rgba(67, 56, 202, 0.24)',
    hoverShadow: 'rgba(67, 56, 202, 0.4)',
  },
];

/**
 * Palette labels are billing full forms; `aliases` match scheduled FHR `equipment_name`
 * (codes and full forms). Case-insensitive via {@link normalizeBriefName}.
 *
 * Scheduled FHR / GSE: C = Cones, CK = Chocks — billing full forms, not NS catalog remap.
 */
const DEFINITIONS: ReadonlyArray<
  Omit<BillingAdsBriefItem, 'theme' | 'fullName'>
> = [
  {
    key: 'c',
    label: 'C',
    aliases: ['C', 'Cones', 'Cone'],
  },
  { key: 'cabinCleaning', label: 'Cabin Cleaning', aliases: ['Cabin Cleaning'] },
  {
    key: 'deepCleaning',
    label: 'Deep Cleaning',
    aliases: [
      'Deep Cleaning',
      'Mini Deep Cleaning',
      'Mini Deep Cleaning Narrow Body',
      'Mini Deep Cleaning Wide Body',
      'Mini Deep Cleaning ATR',
    ],
  },
  {
    key: 'nightHaltCleaning',
    label: 'Night Halt Cleaning',
    aliases: [
      'Night Halt Cleaning',
      'Night-Halt Cleaning',
      'NightHalt Cleaning',
    ],
  },
  {
    key: 'ck',
    label: 'CK',
    aliases: ['CK', 'Chocks', 'Chock', 'Chokes'],
  },
  { key: 'dt', label: 'DT', aliases: ['DT', 'Diesel Tractor'] },
  {
    key: 'pslTowable',
    label: 'PSL-Towable',
    aliases: [
      'PSL-Towable',
      'PSL Towable',
      'Pax Step Ladder Towable',
      'Passenger Step Ladder Towable',
      // FHR remote-bay variant seen in scheduled equipmentDetails.
      'Pax Step Ladder (Remote Bay) Towable',
      'Passenger Step Ladder (Remote Bay) Towable',
      'Pax Step Ladder Remote Bay Towable',
    ],
  },
  {
    key: 'ts',
    label: 'TS',
    aliases: ['TS', 'Toilet Service', 'Toilet service'],
  },
  { key: 'wc', label: 'WC', aliases: ['WC', 'Water Cart', 'White Collar'] },
  { key: 'ww', label: 'WW', aliases: ['WW', 'Wing Walking', 'Wing Walker'] },
  {
    key: 'asuNb',
    label: 'ASU-NB',
    aliases: [
      'ASU-NB',
      'ASUNB',
      'PST-ASU-NB',
      'Air Start Unit Narrow Body',
      'Air Start Unit - Narrow Body',
      'Air start unit - narrow body',
      'Air Start Unit-Narrow Body',
      'Air Start Unit (ASU) Narrow Body',
      'Air Start Unit (ASU) - Narrow Body',
    ],
  },
  {
    key: 'amb',
    label: 'AMB',
    aliases: [
      'AMB',
      'Ambulift',
      'Ambuilift',
      'Ambulance',
      'AMB/Ambulift',
      'AMB/Ambuilift',
      'PS-AMB',
      'Scheduled - Equipment - AMB',
      'ADS - Equipment - Ambulift',
    ],
  },
  {
    // Combined wheelchair chip: WCHR + WCHS + WCHC counted together. Source is
    // FHR terminalDetails pax counts (UI: arrival/departureWheelChairR|S|C;
    // Excel: wcr/wcs/wcc + Departure_*), surfaced as ADS rows by the server.
    key: 'wch',
    label: 'WCH',
    aliases: [
      'WCHR',
      'WCHS',
      'WCHC',
      'Wheel Chair (R)',
      'Wheel Chair (S)',
      'Wheel Chair (C)',
      'Wheel Chair R',
      'Wheel Chair S',
      'Wheel Chair C',
      'Wheelchair (R)',
      'Wheelchair (S)',
      'Wheelchair (C)',
      'Wheelchair R',
      'Wheelchair S',
      'Wheelchair C',
      'Wheelchair',
      'Wheel Chair',
      'Wheel Chair -WCHR',
      'Wheel Chair - WCHR',
      'Wheel Chair -WCHS',
      'Wheel Chair - WCHS',
      'Wheel Chair -WCHC',
      'Wheel Chair - WCHC',
    ],
  },
  {
    key: 'bflTowable',
    label: 'BFL-Towable',
    aliases: [
      'BFL-Towable',
      'BFL Towable',
      'Baggage Freight Loader',
      'Baggage Frieght Loader',
      'Baggage Freight Loader Towable',
      'Conveyor Belt Towable',
      'Conveyor Belt Loader Towable',
    ],
  },
  {
    key: 'ebt',
    label: 'EBT',
    aliases: [
      'EBT',
      'Electric Baggage Trolly',
      'Electric Baggage Trolley',
      'Electric Baggage Tractor',
    ],
  },
  {
    key: 'paxCoach',
    label: 'PAX Coach',
    aliases: ['PAX Coach', 'PAXCOACH', 'Passenger Coach', 'Pax Coach'],
  },
  {
    key: 'pbnb',
    label: 'PBNB',
    aliases: [
      'PBNB',
      'Push Back Narrow Body',
      'Pushback Narrow Body',
      'Push Back-Narrow Body',
      'Push Back - Narrow Body',
    ],
  },
  {
    key: 'mpsl',
    label: 'MPSL',
    aliases: [
      'MPSL',
      'Motorized Passenger Step Ladder',
      'Motorised Passenger Step Ladder',
    ],
  },
  {
    key: 'gpuNb',
    label: 'GPU-NB',
    aliases: [
      'GPU-NB',
      'GPUNB',
      'GPU NB',
      'GPU/NB',
      'Ground Power Unit Narrow Body',
      'Ground Power Unit - Narrow Body',
      'Ground power unit - narrow body',
      // FHR stores KV class for NB GPUs
      'GPU-90KV',
      'GPU-90 KV',
      'GPU 90KV',
      'GPU 90 KV',
      'GPU90KV',
      'GPU-90KVA',
      'GPU 90KVA',
      'GPU-140KV',
      'GPU-140 KV',
      'GPU 140KV',
      'GPU 140 KV',
      'GPU140KV',
      'GPU-140KVA',
      'GPU 140KVA',
      'Ground Power Unit -90KV',
      'Ground Power Unit - 90KV',
      'Ground Power Unit -90 KV',
      'Ground Power Unit 90KV',
      'Ground Power Unit 90 KV',
      'Ground Power Unit -140KV',
      'Ground Power Unit - 140KV',
      'Ground Power Unit -140 KV',
      'Ground Power Unit 140KV',
      'Ground Power Unit 140 KV',
      'Ground Power Unit (GPU) 90 KV',
      'Ground Power Unit (GPU) 140 KV',
    ],
  },
  {
    key: 'acuNb',
    label: 'ACU-NB',
    aliases: [
      'ACU-NB',
      'ACUNB',
      'Air Conditioner Unit Narrow Body',
      'Air Conditioner Unit - Narrow Body',
      'Air Conditioning Unit Narrow Body',
      'Air Conditioning Unit - Narrow Body',
    ],
  },
  {
    key: 'crewCoach',
    label: 'Crew Coach',
    aliases: [
      'Crew Coach',
      'Crew-Coach',
      'Crew-Coach-1',
      'CrewCoach',
      'CREW COACH',
      'CREW-COACH-1',
    ],
  },
  {
    key: 'csh',
    label: 'CSH',
    aliases: ['CSH', 'Customer Service Host', 'Customer Service Hostess'],
  },
  {
    key: 'srCsa',
    label: 'Sr. CSA',
    aliases: [
      'Sr. CSA',
      'Sr CSA',
      'Senior CSA',
      'SCSA',
      'Senior Customer Service Agent',
      'Senior Customer Service Associate',
      'Sr. Customer Service Agent',
      'Sr Customer Service Agent',
      'Sr. Customer Service Associate',
    ],
  },
  {
    key: 'sup',
    label: 'Sup',
    aliases: ['Sup', 'SUP', 'Supervisor', 'SVP'],
  },
  {
    key: 'uh',
    label: 'UH',
    aliases: ['UH', 'Unit Handling', 'Unskilled Helper'],
  },
  {
    key: 'csa',
    label: 'CSA',
    aliases: [
      'CSA',
      'Customer Service Agent',
      'Customer Service Associate',
    ],
  },
  {
    key: 'ldl',
    label: 'LDL',
    aliases: ['LDL', 'Lower Deck Loader'],
  },
  { key: 'do', label: 'DO', aliases: ['DO', 'Duty Officer'] },
  {
    key: 'pbwb',
    label: 'PBWB',
    aliases: [
      'PBWB',
      'Push Back Wide Body',
      'Pushback Wide Body',
      'Push Back-Wide Body',
      'Push Back - Wide Body',
    ],
  },
  {
    key: 'acuWb',
    label: 'ACU-WB',
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
    key: 'gpuWb',
    label: 'GPU-WB',
    aliases: [
      'GPU-WB',
      'GPUWB',
      'GPU WB',
      'GPU/WB',
      'Ground Power Unit Wide Body',
      'Ground Power Unit - Wide Body',
      'Ground power unit - wide body',
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
    key: 'asuWb',
    label: 'ASU-WB',
    aliases: [
      'ASU-WB',
      'ASUWB',
      'PST-ASU-WB',
      'Air Start Unit Wide Body',
      'Air Start Unit - Wide Body',
      'Air start unit - wide body',
      'Air Start Unit-Wide Body',
      'Air Start Unit (ASU) Wide Body',
      'Air Start Unit (ASU) - Wide Body',
    ],
  },
  {
    key: 'rc',
    label: 'RC',
    aliases: ['RC', 'Remote Control', 'Ramp Car'],
  },
  {
    key: 'tow',
    label: 'Tow',
    aliases: ['Tow', 'Towbar', 'Tow Bar'],
  },
  {
    key: 'longTowbar',
    label: 'Long Towbar',
    aliases: ['Long Towbar', 'Long Tow Bar', 'LTOW'],
  },
  {
    key: 'shortTowbar',
    label: 'Short Towbar',
    aliases: ['Short Towbar', 'Short Tow Bar', 'STOW'],
  },
  {
    key: 'bt',
    label: 'BT',
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
    key: 'acu',
    label: 'ACU',
    aliases: [
      'ACU',
      'Air Conditioner Unit',
      'Air Conditioning Unit',
    ],
  },
  {
    key: 'istwb',
    label: 'ISTWB',
    aliases: [
      'ISTWB',
      'Tow Inter Stand Wide Body',
      'Inter Stand Tow Wide Body',
    ],
  },
  { key: 'hs', label: 'HS', aliases: ['HS', 'Headset', 'Head Set'] },
  {
    key: 'istNb',
    label: 'ISTNB',
    aliases: [
      'ISTNB',
      'IST-NB',
      'IST NB',
      'Tow Inter Stand Narrow Body',
      'Inter Stand Tow Narrow Body',
      'Inter Stand Tow - Narrow Body',
    ],
  },
  {
    key: 'mdl',
    label: 'MDL',
    aliases: ['MDL', 'Main Deck Loader', 'Maindeck Loader'],
  },
  {
    key: 'udl',
    label: 'UDL',
    aliases: ['UDL', 'Upper Deck Loader', 'Upperdeck Loader'],
  },
  {
    key: 'fe',
    label: 'FE',
    aliases: ['FE', 'Fire Extinguisher', 'Fire Extinguisher (FE)'],
  },
  {
    key: 'trestle',
    label: 'Trestle',
    aliases: ['Trestle', 'Tresel', 'Tressel', 'Trestel', 'TRE'],
  },
  {
    key: 'marshaller',
    label: 'Marshaller',
    aliases: ['Marshaller', 'Marshaler', 'Marshalling', 'Marshal', 'Marshall'],
  },
  {
    key: 'additionalUh',
    label: 'Add. UH',
    aliases: [
      'Additional Utility Hand',
      'Addl Utility Hand',
      'Additional Utility Helper',
      'Additional UH',
    ],
  },
  { key: 'ecNb', label: 'EC-NB', aliases: ['EC-NB', 'EC NB', 'ECNB'] },
  { key: 'cbm', label: 'CBM', aliases: ['CBM'] },
  { key: 'urb', label: 'URB', aliases: ['URB'] },
  { key: 'cd', label: 'CD', aliases: ['CD', 'Container Dollies', 'Container Dolly'] },
  { key: 'm', label: 'M', aliases: ['M'] },
  {
    key: 'ctt',
    label: 'CTT',
    aliases: ['CTT', 'Cargo Transfer Trailer'],
  },
  {
    key: 'ws',
    label: 'WS',
    aliases: ['WS', 'Water Service'],
  },
  {
    key: 'pin',
    label: 'PIN',
    aliases: ['PIN', 'Aircraft Pin'],
  },
  {
    key: 'pw',
    label: 'PW',
    aliases: ['PW', 'Potable Water'],
  },
  {
    key: 'baggageCart',
    label: 'BC',
    aliases: ['BC', 'Baggage Cart'],
  },
  {
    key: 'exteriorCleaning',
    label: 'Exterior Cleaning',
    aliases: [
      'Exterior Cleaning',
      'Exterior Cleaning Narrow Body',
      'Exterior Cleaning Wide Body',
    ],
  },
  {
    key: 'wcb',
    label: 'WBC',
    aliases: ['WBC', 'Wheel Chair Battery', 'Wheelchair Battery'],
  },
  {
    key: 'pd',
    label: 'PD',
    aliases: ['PD', 'Pallet Dollies', 'Pallet Dolly'],
  },
];

export const BILLING_ADS_BRIEF_ITEMS: readonly BillingAdsBriefItem[] = DEFINITIONS.map(
  (item, index) => ({
    ...item,
    label: BILLING_ADS_BRIEF_FULL_NAMES[item.key],
    fullName: BILLING_ADS_BRIEF_FULL_NAMES[item.key],
    theme: THEMES[index % THEMES.length],
  }),
);

export type AdsBriefPaletteCategory = 'motorised' | 'nonMotorised' | 'manpower';

const ADS_BRIEF_MANPOWER_KEYS: readonly BillingAdsBriefKey[] = [
  'cabinCleaning',
  'deepCleaning',
  'nightHaltCleaning',
  'csa',
  'srCsa',
  'sup',
  'uh',
  'additionalUh',
  'do',
  'csh',
  'marshaller',
  'ww',
  'exteriorCleaning',
];

const ADS_BRIEF_MOTORISED_KEYS: readonly BillingAdsBriefKey[] = [
  'dt',
  'ebt',
  'paxCoach',
  'crewCoach',
  'amb',
  'mpsl',
  'ldl',
  'mdl',
  'udl',
  'rc',
  'gpuNb',
  'gpuWb',
  'acuNb',
  'acuWb',
  'asuNb',
  'asuWb',
  'pbnb',
  'pbwb',
  'istNb',
  'istwb',
  'ecNb',
];

export const BILLING_ADS_BRIEF_PALETTE_CATEGORY: Record<
  BillingAdsBriefKey,
  AdsBriefPaletteCategory
> = Object.fromEntries(
  BILLING_ADS_BRIEF_KEYS.map((key) => {
    if (ADS_BRIEF_MANPOWER_KEYS.includes(key)) {
      return [key, 'manpower'] as const;
    }
    if (ADS_BRIEF_MOTORISED_KEYS.includes(key)) {
      return [key, 'motorised'] as const;
    }
    return [key, 'nonMotorised'] as const;
  }),
) as Record<BillingAdsBriefKey, AdsBriefPaletteCategory>;

export type MotorisedNbWbPaletteGroup = {
  id: string;
  label: string;
  nbKey?: BillingAdsBriefKey;
  wbKey?: BillingAdsBriefKey;
  keys: readonly BillingAdsBriefKey[];
};

/** Motorised equipment families with NB/WB palette chips (combined display). */
export const MOTORISED_NB_WB_PALETTE_GROUPS: readonly MotorisedNbWbPaletteGroup[] = [
  { id: 'gpu', label: 'Ground Power Unit', nbKey: 'gpuNb', wbKey: 'gpuWb', keys: ['gpuNb', 'gpuWb'] },
  {
    id: 'acu',
    label: 'Air Conditioner Unit',
    nbKey: 'acuNb',
    wbKey: 'acuWb',
    keys: ['acuNb', 'acuWb', 'acu'],
  },
  { id: 'asu', label: 'Air Start Unit', nbKey: 'asuNb', wbKey: 'asuWb', keys: ['asuNb', 'asuWb'] },
  { id: 'pb', label: 'Push Back', nbKey: 'pbnb', wbKey: 'pbwb', keys: ['pbnb', 'pbwb'] },
  {
    id: 'ist',
    label: 'Inter Stand Tow',
    nbKey: 'istNb',
    wbKey: 'istwb',
    keys: ['istNb', 'istwb'],
  },
];

const MOTORISED_GROUPED_KEYS = new Set<BillingAdsBriefKey>(
  MOTORISED_NB_WB_PALETTE_GROUPS.flatMap((g) => g.keys),
);

export type WchPaletteGroup = {
  id: 'wch';
  label: string;
  key: BillingAdsBriefKey;
  subtypes: readonly BillingAdsWchSubtype[];
};

/** Non-motorised wheelchair chip — one filter key with WCHR / WCHS / WCHC breakdown. */
export const WCH_PALETTE_GROUP: WchPaletteGroup = {
  id: 'wch',
  label: 'Wheelchair',
  key: 'wch',
  subtypes: ['wchr', 'wchs', 'wchc'],
};

export const WCH_SUBTYPE_LABELS: Record<BillingAdsWchSubtype, string> = {
  wchr: 'WCHR',
  wchs: 'WCHS',
  wchc: 'WCHC',
};

export const ADS_BRIEF_PALETTE_CATEGORY_TITLES: Record<
  AdsBriefPaletteCategory,
  string
> = {
  motorised: 'Motorised',
  nonMotorised: 'Non motorised',
  manpower: 'Manpower',
};

export type AdsPaletteDisplayEntry =
  | { kind: 'single'; item: BillingAdsBriefItem }
  | { kind: 'nbWbGroup'; group: MotorisedNbWbPaletteGroup }
  | { kind: 'wchGroup'; group: WchPaletteGroup };

export type AdsPaletteSection = {
  category: AdsBriefPaletteCategory;
  title: string;
  entries: AdsPaletteDisplayEntry[];
};

export function buildAdsPaletteSections(
  items: readonly BillingAdsBriefItem[],
): AdsPaletteSection[] {
  const categories: AdsBriefPaletteCategory[] = [
    'motorised',
    'nonMotorised',
    'manpower',
  ];

  return categories
    .map((category) => {
      const categoryItems = items.filter(
        (item) => BILLING_ADS_BRIEF_PALETTE_CATEGORY[item.key] === category,
      );
      const entries: AdsPaletteDisplayEntry[] = [];

      if (category === 'motorised') {
        for (const group of MOTORISED_NB_WB_PALETTE_GROUPS) {
          const hasGroup = categoryItems.some((item) =>
            group.keys.includes(item.key),
          );
          if (hasGroup) {
            entries.push({ kind: 'nbWbGroup', group });
          }
        }
        for (const item of categoryItems) {
          if (!MOTORISED_GROUPED_KEYS.has(item.key)) {
            entries.push({ kind: 'single', item });
          }
        }
      } else {
        for (const item of categoryItems) {
          if (item.key === WCH_PALETTE_GROUP.key) {
            entries.push({ kind: 'wchGroup', group: WCH_PALETTE_GROUP });
            continue;
          }
          entries.push({ kind: 'single', item });
        }
      }

      return {
        category,
        title: ADS_BRIEF_PALETTE_CATEGORY_TITLES[category],
        entries,
      };
    })
    .filter((section) => section.entries.length > 0);
}

export function motorisedNbWbGroupCountLabel(
  group: MotorisedNbWbPaletteGroup,
  stats: BillingAdsBriefStats,
): string {
  const { nb, wb, total, label } = motorisedNbWbGroupCounts(group, stats);
  const parts: string[] = [];
  if (group.nbKey) parts.push(`NB-${nb}`);
  if (group.wbKey) parts.push(`WB-${wb}`);
  parts.push(`${label}-${total}`);
  return parts.join(', ');
}

export function motorisedNbWbGroupCounts(
  group: MotorisedNbWbPaletteGroup,
  stats: BillingAdsBriefStats,
): { nb: number; wb: number; total: number; label: string } {
  const nb = group.nbKey ? stats[group.nbKey] : 0;
  const wb = group.wbKey ? stats[group.wbKey] : 0;
  let extra = 0;
  for (const key of group.keys) {
    if (key !== group.nbKey && key !== group.wbKey) {
      extra += stats[key];
    }
  }
  return {
    nb,
    wb,
    total: nb + wb + extra,
    label: group.label,
  };
}

export function motorisedNbWbGroupHoverTitle(
  group: MotorisedNbWbPaletteGroup,
  stats: BillingAdsBriefStats,
): string {
  const fullName =
    group.nbKey
      ? BILLING_ADS_BRIEF_FULL_NAMES[group.nbKey]
      : BILLING_ADS_BRIEF_FULL_NAMES[group.keys[0]];
  return `${group.label} — ${fullName} (${motorisedNbWbGroupCountLabel(group, stats)})`;
}

export function isMotorisedNbWbGroupSelected(
  group: MotorisedNbWbPaletteGroup,
  selected: ReadonlySet<BillingAdsBriefKey>,
): boolean {
  return group.keys.every((key) => selected.has(key));
}

export function isMotorisedNbWbGroupPartial(
  group: MotorisedNbWbPaletteGroup,
  selected: ReadonlySet<BillingAdsBriefKey>,
): boolean {
  const count = group.keys.filter((key) => selected.has(key)).length;
  return count > 0 && count < group.keys.length;
}

export function wchPaletteGroupCounts(
  breakdown: BillingAdsWchBreakdown,
  stats: BillingAdsBriefStats,
): { wchr: number; wchs: number; wchc: number; total: number } {
  return {
    wchr: breakdown.wchr,
    wchs: breakdown.wchs,
    wchc: breakdown.wchc,
    total: stats.wch,
  };
}

export function wchPaletteGroupCountLabel(
  breakdown: BillingAdsWchBreakdown,
  stats: BillingAdsBriefStats,
): string {
  const counts = wchPaletteGroupCounts(breakdown, stats);
  return `WCHR-${counts.wchr}, WCHS-${counts.wchs}, WCHC-${counts.wchc}, WCH-${counts.total}`;
}

export function wchPaletteGroupHoverTitle(
  breakdown: BillingAdsWchBreakdown,
  stats: BillingAdsBriefStats,
): string {
  const fullName = BILLING_ADS_BRIEF_FULL_NAMES.wch;
  return `WCH — ${fullName} (${wchPaletteGroupCountLabel(breakdown, stats)})`;
}

function formatAdsClock(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return text;
}

/** Engagement window / usage time for one ADS equipment line. */
export function formatAdsRowEngagementTime(row: BillingSourceRow): string {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const usageTime = String(op.usage_time ?? op.usageTime ?? '').trim();
  if (usageTime) return usageTime;

  const from = formatAdsClock(op.from_time ?? op.fromTime);
  const to = formatAdsClock(op.to_time ?? op.toTime);
  if (from && to) return `${from}–${to}`;
  if (from) return from;

  const hours = Number(op.usageHours);
  if (Number.isFinite(hours) && hours > 0) {
    return `${hours}h`;
  }
  return '—';
}

/** One row in the flight equipment engagement column. */
export type AdsFlightEngagementEntry = {
  label: string;
  /** Time window, hours, or count string depending on `isCount`. */
  value: string;
  /** Wheelchair lines show pax count, not engagement time. */
  isCount?: boolean;
};

/** Summarise equipment engagement for a flight (optionally palette-filtered lines). */
export function formatAdsFlightEngagementEntries(
  lines: BillingSourceRow[],
): AdsFlightEngagementEntry[] {
  const timeEntries: AdsFlightEngagementEntry[] = [];
  const wchCounts: BillingAdsWchBreakdown = { wchr: 0, wchs: 0, wchc: 0 };

  for (const line of lines) {
    const briefKey = primaryBriefKey(line);
    if (briefKey === 'wch') {
      const subtype = inferWheelchairSubtype(line);
      const qty = adsRowOperationalQuantity(line);
      if (subtype && qty > 0) {
        wchCounts[subtype] += qty;
      }
      continue;
    }

    const op = (line.operationalData ?? {}) as Record<string, unknown>;
    const equip = String(
      op.equipment_name ??
        op.equipmentName ??
        op.particular ??
        op.equipment ??
        '',
    ).trim();
    const time = formatAdsRowEngagementTime(line);
    if (time === '—') continue;
    timeEntries.push({
      label: equip || 'Equipment',
      value: time,
    });
  }

  const entries: AdsFlightEngagementEntry[] = [];
  for (const subtype of WCH_PALETTE_GROUP.subtypes) {
    const count = wchCounts[subtype];
    if (count > 0) {
      entries.push({
        label: WCH_SUBTYPE_LABELS[subtype],
        value: String(count),
        isCount: true,
      });
    }
  }

  entries.push(...timeEntries);
  return entries;
}

export type AdsFlightBhsIncludedEntry = {
  label: string;
  count: number;
};

/** Units covered by BHS package / contract free allowance (not charged on ADS). */
export function adsRowBhsIncludedQuantity(row: BillingSourceRow): number {
  const pricingBasis = adsRowPricingBasis(row);
  if (pricingBasis === 'ads_excluded' || pricingBasis === 'not_on_contract') {
    return 0;
  }

  const used = adsRowUsedUnits(row);
  if (!Number.isFinite(used) || used <= 0) return 0;

  const wholeUsed = toWholeAdsUnits(used);
  const free = adsRowFreeAllowance(row);

  if (pricingBasis === 'package_inclusive') {
    return wholeUsed;
  }

  if (free > 0) {
    if (free >= Number.MAX_SAFE_INTEGER / 4) return wholeUsed;
    return Math.min(wholeUsed, free);
  }

  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  if (op.adsPackageIncluded === true) {
    return wholeUsed;
  }

  return 0;
}

function adsBriefLabelForRow(row: BillingSourceRow): string {
  const briefKey = primaryBriefKey(row);
  if (briefKey === 'wch') {
    const subtype = inferWheelchairSubtype(row);
    if (subtype) return WCH_SUBTYPE_LABELS[subtype];
  }
  if (briefKey) {
    const item = BILLING_ADS_BRIEF_ITEMS.find((i) => i.key === briefKey);
    if (item?.label) return item.label;
  }
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const equip = String(
    op.equipment_name ?? op.equipmentName ?? op.particular ?? op.equipment ?? '',
  ).trim();
  return toBillingTrackableFullName(equip) || equip || 'Equipment';
}

/** BHS-package included units for palette-selected equipment on one flight. */
export function formatAdsFlightBhsIncludedEntries(
  lines: BillingSourceRow[],
): AdsFlightBhsIncludedEntry[] {
  const byLabel = new Map<string, number>();
  for (const line of lines) {
    const included = adsRowBhsIncludedQuantity(line);
    if (included <= 0) continue;
    const label = adsBriefLabelForRow(line);
    byLabel.set(label, (byLabel.get(label) ?? 0) + included);
  }
  return [...byLabel.entries()].map(([label, count]) => ({ label, count }));
}

export type AdsFlightChargedEntry = {
  label: string;
  count: number;
};

function isCrewCoachBriefLabel(label: string): boolean {
  return /CREW\s*COACH/i.test(label) || compactBriefName(normalizeBriefName(label)).includes('CREWCOACH');
}

function isTurnaroundFlightRow(row: BillingSourceRow): boolean {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  if (op.turnaroundCrewCoachCapped === true) return true;
  const handling = String(
    op.typeOfHandling ??
      op.TypeofHandling ??
      op.ops ??
      op.opsType ??
      op.typeOfFlight ??
      op.Typeofflight ??
      '',
  )
    .trim()
    .toLowerCase();
  if (handling.includes('turnaround') || handling === 'ta') return true;
  const flightNo = String(
    op.flightNo ??
      op.flightNoEquipmentNo ??
      row.sourceRef?.flightNo ??
      '',
  ).trim();
  if (flightNo.includes('/')) return true;
  const arrival = String(op.ArrivalFltNo ?? op.arrivalFltNo ?? '').trim();
  const departure = String(op.DepartureFltNo ?? op.departureFltNo ?? '').trim();
  return Boolean(arrival && departure && arrival !== departure);
}

/** Billable units after BHS free allowance (palette-selected equipment per flight). */
export function formatAdsFlightChargedEntries(
  lines: BillingSourceRow[],
): AdsFlightChargedEntry[] {
  const byLabel = new Map<string, number>();
  for (const line of lines) {
    const charged = adsRowChargedQuantity(line);
    if (charged <= 0) continue;
    const label = adsBriefLabelForRow(line);
    byLabel.set(label, (byLabel.get(label) ?? 0) + charged);
  }

  // Turnaround: one shared Crew Coach → charged column shows at most 1.
  const turnaround = lines.some(isTurnaroundFlightRow);
  if (turnaround) {
    for (const [label, count] of byLabel) {
      if (isCrewCoachBriefLabel(label) && count > 1) {
        byLabel.set(label, 1);
      }
    }
  }

  return [...byLabel.entries()].map(([label, count]) => ({ label, count }));
}

/** Summarise equipment engagement times for a flight (optionally palette-filtered lines). */
export function formatAdsFlightEngagementSummary(lines: BillingSourceRow[]): string {
  const entries = formatAdsFlightEngagementEntries(lines);
  if (entries.length === 0) return '—';
  return entries
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join('; ');
}

function formatSelectedAdsBriefLabels(
  selected: ReadonlySet<BillingAdsBriefKey>,
): string {
  const labels: string[] = [];
  const consumed = new Set<BillingAdsBriefKey>();

  for (const group of MOTORISED_NB_WB_PALETTE_GROUPS) {
    if (group.keys.every((key) => selected.has(key))) {
      labels.push(group.label);
      for (const key of group.keys) consumed.add(key);
    }
  }

  for (const key of selected) {
    if (consumed.has(key)) continue;
    const item = BILLING_ADS_BRIEF_ITEMS.find((i) => i.key === key);
    labels.push(item?.label ?? key);
  }

  return labels.join(', ');
}

export const EMPTY_BILLING_ADS_BRIEF_STATS = Object.fromEntries(
  BILLING_ADS_BRIEF_KEYS.map((key) => [key, 0]),
) as BillingAdsBriefStats;

function normalizeBriefName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact form without spaces — helps `ASU-WB` ↔ `ASUWB`, `PAX Coach` ↔ `PAXCOACH`. */
function compactBriefName(value: string): string {
  return value.replace(/\s+/g, '');
}

function addCandidateName(names: Set<string>, raw: unknown): void {
  const text = String(raw ?? '').trim();
  if (!text) return;

  const normalized = normalizeBriefName(text);
  if (!normalized) return;
  names.add(normalized);
  const compact = compactBriefName(normalized);
  if (compact && compact !== normalized) names.add(compact);

  // Split combined labels: "Wheel Chair -WCHR", "ADS - Equipment - Lower Deck Loader"
  for (const part of text.split(/\s*[-–—:/|]\s*/)) {
    const partNorm = normalizeBriefName(part);
    if (!partNorm || partNorm === normalized) continue;
    names.add(partNorm);
    const partCompact = compactBriefName(partNorm);
    if (partCompact && partCompact !== partNorm) names.add(partCompact);
  }

  // Trailing code token in parentheses: "Wheel Chair (R)", "Wheel Chair (C)"
  const paren = /\(([A-Z0-9.]+)\)\s*$/i.exec(text);
  if (paren?.[1]) {
    const code = normalizeBriefName(paren[1]);
    if (code) names.add(code);
  }
}

/**
 * Candidates from scheduled FHR equipment only — not master catalog `particular`
 * or rate-card service codes (those remapped Cones↔Chocks and double-counted).
 */
function candidateNames(row: BillingSourceRow): Set<string> {
  const op = row.operationalData;
  const rawValues = [
    op.equipment_name,
    op.equipmentName,
    op.equipmentCode,
    op.equipment_code,
    op.abbr,
    op.particular,
    op.equipment,
    op.adsParticular,
  ];
  const names = new Set<string>();

  for (const raw of rawValues) {
    addCandidateName(names, raw);
  }
  return names;
}

const NORMALIZED_ALIASES = new Map(
  BILLING_ADS_BRIEF_ITEMS.map((item) => {
    const aliases = new Set<string>();
    for (const alias of item.aliases) {
      const normalized = normalizeBriefName(alias);
      if (!normalized) continue;
      aliases.add(normalized);
      const compact = compactBriefName(normalized);
      if (compact) aliases.add(compact);
    }
    return [item.key, aliases] as const;
  }),
);

function hasMatchingAlias(candidates: ReadonlySet<string>, aliases: ReadonlySet<string>): boolean {
  for (const candidate of candidates) {
    if (aliases.has(candidate)) return true;
  }
  return false;
}

/** Looser match for long equipment labels (GPU full names / KV variants). */
function hasFuzzyAliasMatch(
  candidates: ReadonlySet<string>,
  aliases: ReadonlySet<string>,
): boolean {
  for (const candidate of candidates) {
    const cc = compactBriefName(candidate);
    if (cc.length < 4) continue;
    for (const alias of aliases) {
      const ac = compactBriefName(alias);
      if (ac.length < 4) continue;
      // Alias-contains-candidate (`NARROWBODY` inside `GROUNDPOWERUNITNARROWBODY`)
      // stole ASU / GPU-WB lines onto the wrong chip. The candidate must contain
      // the alias (KV suffix variants), not the other way around.
      if (cc === ac || cc.includes(ac)) return true;
    }
  }
  return false;
}

function aircraftLooksWideBody(row: BillingSourceRow): boolean {
  const op = row.operationalData ?? {};
  const body = String(op.aircraftBody ?? op.AircraftBody ?? '')
    .trim()
    .toUpperCase();
  if (body === 'WB' || body.includes('WIDE')) return true;
  if (body === 'NB' || body.includes('NARROW')) return false;

  const aircraft = String(op.aircraftType ?? op.TypeCraft ?? op.typeCraft ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s/_-]+/g, '');
  if (!aircraft) return false;
  return /A330|A340|A350|A380|B747|B777|B787|747|777|787|380|350|330|340/.test(
    aircraft,
  );
}

/**
 * FHR stores GPU as KV class (`GPU-90KV`), not always GPU-NB.
 * Map only real GPU scheduled names onto NB/WB — never generic non-GPU text.
 */
function inferGpuBriefKeys(
  row: BillingSourceRow,
  candidates: ReadonlySet<string>,
): BillingAdsBriefKey[] {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isGpu =
    /\bGPU\b/.test(blob) ||
    compact.startsWith('GPU') ||
    compact.includes('GROUNDPOWER');
  if (!isGpu) return [];

  const explicitWb =
    /\bGPU\s*WB\b|\bGPUWB\b|\bWIDE\s*BODY\b/.test(blob) ||
    compact.includes('GPUWB') ||
    compact.includes('WIDEBODY') ||
    /180KV|280KV|180KVA|280KVA/.test(compact);
  const explicitNb =
    /\bGPU\s*NB\b|\bGPUNB\b|\bNARROW\s*BODY\b/.test(blob) ||
    compact.includes('GPUNB') ||
    compact.includes('NARROWBODY') ||
    /90KV|140KV|90KVA|140KVA/.test(compact);

  if (explicitWb && !explicitNb) return ['gpuWb'];
  if (explicitNb && !explicitWb) return ['gpuNb'];
  if (explicitWb && explicitNb) {
    return [aircraftLooksWideBody(row) ? 'gpuWb' : 'gpuNb'];
  }

  // Bare GPU / Ground Power Unit → body from aircraft type.
  return [aircraftLooksWideBody(row) ? 'gpuWb' : 'gpuNb'];
}

/** Map bare / scheduled ACU names onto ACU-NB / ACU-WB palette chips. */
function inferAcuBriefKeys(
  row: BillingSourceRow,
  candidates: ReadonlySet<string>,
): BillingAdsBriefKey[] {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isAcu =
    /\bACU\b/.test(blob) ||
    compact.includes('ACU') ||
    compact.includes('AIRCONDITION');
  if (!isAcu) return [];

  const keys = new Set<BillingAdsBriefKey>();
  const explicitWb =
    /\bACU\s*WB\b|\bACUWB\b|\bWIDE\s*BODY\b/.test(blob) ||
    compact.includes('ACUWB') ||
    compact.includes('WIDEBODY');
  const explicitNb =
    /\bACU\s*NB\b|\bACUNB\b|\bNARROW\s*BODY\b/.test(blob) ||
    compact.includes('ACUNB') ||
    compact.includes('NARROWBODY');

  if (explicitWb) keys.add('acuWb');
  if (explicitNb) keys.add('acuNb');

  if (keys.size === 0) {
    keys.add(aircraftLooksWideBody(row) ? 'acuWb' : 'acuNb');
  }

  return [...keys];
}

/** Map bare / scheduled ASU names onto ASU-NB / ASU-WB palette chips. */
function inferAsuBriefKeys(
  row: BillingSourceRow,
  candidates: ReadonlySet<string>,
): BillingAdsBriefKey[] {
  const blob = [...candidates].join(' ');
  const compact = compactBriefName(blob);
  const isAsu =
    /\bASU\b/.test(blob) ||
    compact.includes('AIRSTART') ||
    compact.includes('ASUNB') ||
    compact.includes('ASUWB');
  if (!isAsu) return [];

  const explicitWb =
    /\bASU\s*WB\b|\bASUWB\b|\bWIDE\s*BODY\b/.test(blob) ||
    compact.includes('ASUWB') ||
    compact.includes('WIDEBODY');
  const explicitNb =
    /\bASU\s*NB\b|\bASUNB\b|\bNARROW\s*BODY\b/.test(blob) ||
    compact.includes('ASUNB') ||
    compact.includes('NARROWBODY');

  if (explicitWb && !explicitNb) return ['asuWb'];
  if (explicitNb && !explicitWb) return ['asuNb'];
  return [aircraftLooksWideBody(row) ? 'asuWb' : 'asuNb'];
}

/**
 * Split labels like `Air Conditioner Unit - Wide Body` also yield the generic
 * `Air Conditioner Unit` token. Prefer body-specific palettes over the bare code.
 */
function preferSpecificBriefKeys(keys: BillingAdsBriefKey[]): BillingAdsBriefKey[] {
  const set = new Set(keys);
  if (set.has('acuWb') || set.has('acuNb')) set.delete('acu');
  if (set.has('srCsa')) set.delete('csa');
  if (set.has('longTowbar') || set.has('shortTowbar')) set.delete('tow');
  // One FHR line is one family. Body-class fragments ("Narrow Body") must not
  // also keep a GPU/ACU chip when the line is an air start or air conditioner.
  if (set.has('asuNb') || set.has('asuWb')) {
    set.delete('gpuNb');
    set.delete('gpuWb');
    set.delete('acu');
    set.delete('acuNb');
    set.delete('acuWb');
  } else if (set.has('acuNb') || set.has('acuWb')) {
    set.delete('gpuNb');
    set.delete('gpuWb');
  }
  return BILLING_ADS_BRIEF_KEYS.filter((key) => set.has(key));
}

/** WCHR / WCHS / WCHC subtype for wheelchair ADS lines (equipment_name is usually the code). */
export function inferWheelchairSubtype(
  row: BillingSourceRow,
): BillingAdsWchSubtype | null {
  const op = row.operationalData ?? {};
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  const rawValues = [
    op.equipment_name,
    op.equipmentName,
    op.equipmentCode,
    op.equipment_code,
    op.particular,
    op.adsParticular,
    op.equipment,
    op.abbr,
    rate.serviceCode,
  ];

  for (const raw of rawValues) {
    const text = String(raw ?? '').trim().toUpperCase();
    if (!text) continue;
    const compact = compactBriefName(normalizeBriefName(text));
    if (
      compact.includes('WCHC') ||
      compact.endsWith('WCC') ||
      /\bWCH\s*C\b/.test(text) ||
      text.includes('(C)')
    ) {
      return 'wchc';
    }
    if (
      compact.includes('WCHS') ||
      compact.endsWith('WCS') ||
      /\bWCH\s*S\b/.test(text) ||
      text.includes('(S)')
    ) {
      return 'wchs';
    }
    if (
      compact.includes('WCHR') ||
      compact.endsWith('WCR') ||
      /\bWCH\s*R\b/.test(text) ||
      text.includes('(R)')
    ) {
      return 'wchr';
    }
  }

  const candidates = candidateNames(row);
  const compact = compactBriefName([...candidates].join(' '));
  if (compact.includes('WCHC')) return 'wchc';
  if (compact.includes('WCHS')) return 'wchs';
  if (compact.includes('WCHR')) return 'wchr';

  return null;
}

function matchingBriefKeys(row: BillingSourceRow): BillingAdsBriefKey[] {
  const candidates = candidateNames(row);
  const exact: BillingAdsBriefKey[] = [];
  const fuzzy: BillingAdsBriefKey[] = [];
  for (const item of BILLING_ADS_BRIEF_ITEMS) {
    const aliases = NORMALIZED_ALIASES.get(item.key);
    if (!aliases) continue;
    if (hasMatchingAlias(candidates, aliases)) {
      exact.push(item.key);
      continue;
    }
    // Fuzzy is only a fallback for GPU KV / spelling variants. An exact hit on
    // the real equipment (ASU, ACU, GPU-WB, …) must not lose to a fragment
    // such as "Wide Body" sitting inside a longer GPU alias.
    if (
      (item.key === 'gpuNb' || item.key === 'gpuWb') &&
      hasFuzzyAliasMatch(candidates, aliases)
    ) {
      fuzzy.push(item.key);
    }
  }
  const matches = exact.length > 0 ? [...exact] : [...fuzzy];
  for (const key of inferGpuBriefKeys(row, candidates)) {
    if (!matches.includes(key)) matches.push(key);
  }
  for (const key of inferAcuBriefKeys(row, candidates)) {
    if (!matches.includes(key)) matches.push(key);
  }
  for (const key of inferAsuBriefKeys(row, candidates)) {
    if (!matches.includes(key)) matches.push(key);
  }
  return preferSpecificBriefKeys(matches);
}

/** One palette bucket per scheduled equipment line (no multi-chip double count). */
function primaryBriefKey(row: BillingSourceRow): BillingAdsBriefKey | null {
  const keys = matchingBriefKeys(row);
  if (keys.length === 0) return null;
  // Prefer longer/body-specific codes when several still remain.
  const ranked = [...keys].sort((a, b) => {
    const la = BILLING_ADS_BRIEF_ITEMS.find((i) => i.key === a)?.label.length ?? 0;
    const lb = BILLING_ADS_BRIEF_ITEMS.find((i) => i.key === b)?.label.length ?? 0;
    return lb - la;
  });
  return ranked[0] ?? null;
}

export function billingAdsRowMatchesBrief(
  row: BillingSourceRow,
  key: BillingAdsBriefKey,
): boolean {
  return primaryBriefKey(row) === key;
}

/**
 * Stable flight identity for ADS usage rows (many equipment lines per flight).
 * Prefer FHR serial; never use usageRowId as the primary key (that inflates counts).
 */
export function billingAdsFlightKey(row: BillingSourceRow): string {
  const op = row.operationalData ?? {};
  const serial = String(
    row.sourceRef.serialNo ?? op.serialNumber ?? op.SerialNo ?? '',
  ).trim();
  if (serial && serial !== '0') return `s:${serial}`;

  const flightNo = String(
    row.sourceRef.flightNo ??
      op.flightNo ??
      op.flightNoEquipmentNo ??
      '',
  ).trim();
  const date = String(
    op.billingDateYmd ??
      op.dateKey ??
      op.date ??
      op.from_date ??
      op.fromDate ??
      '',
  ).trim();
  const customer = String(op.customerCode ?? '')
    .trim()
    .toUpperCase();
  if (flightNo && date) return `f:${date}|${flightNo}|${customer}`;
  if (flightNo) return `f:${flightNo}|${customer}`;
  return '';
}

export function countUniqueAdsFlights(rows: BillingSourceRow[]): number {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = billingAdsFlightKey(row);
    if (key) keys.add(key);
  }
  return keys.size;
}

function toWholeAdsUnits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const whole = Math.round(value);
  return whole > 0 ? whole : 1;
}

/**
 * Parse billable count from FHR `equipmentDetails.remarks`.
 * Examples: `06TRIP`, `Arrival 04 // Departure 04`, `13:20 08`.
 */
export function parseAdsRemarksQuantity(raw: unknown): number | null {
  const text = String(raw ?? '').trim();
  if (!text || text === '-' || text === '–') return null;

  const trip = text.match(/(\d+)\s*TRIPS?\b/i);
  if (trip) {
    const n = Number(trip[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const arrDep = text.match(
    /Arrival\s*[:=\-]?\s*(\d+)\s*(?:\/\/|\/|,|;|\||\s+)\s*Departure\s*[:=\-]?\s*(\d+)/i,
  );
  if (arrDep) {
    const a = Number(arrDep[1]);
    const d = Number(arrDep[2]);
    if (Number.isFinite(a) && Number.isFinite(d) && a + d > 0) return a + d;
  }

  const ad = text.match(/\bA\s*[:=\-]?\s*(\d+)\b.*?\bD\s*[:=\-]?\s*(\d+)\b/i);
  if (ad) {
    const a = Number(ad[1]);
    const d = Number(ad[2]);
    if (Number.isFinite(a) && Number.isFinite(d) && a + d > 0) return a + d;
  }

  const timeCount = text.match(/^\d{1,3}:\d{2}\s+(\d+)\b/);
  if (timeCount) {
    const n = Number(timeCount[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  if (/^\d{1,4}$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

function isTimeBasedAdsUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (/per\s*hour|per\s*half\s*hour|per\s*15\s*min/.test(raw)) return true;
  if (/^hr$/i.test(raw) || /^min$/i.test(raw)) return true;
  return false;
}

/**
 * Used units for a usage line — same preference order as invoice enrichment.
 * For non-time UOMs, FHR remarks count (e.g. `06TRIP`) is source of truth.
 */
export function adsRowUsedUnits(row: BillingSourceRow): number {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  const particular = String(
    op.adsParticular ??
      op.particular ??
      op.equipment ??
      op.equipment_name ??
      op.equipmentName ??
      '',
  ).trim();
  const uom =
    String(rate.uom ?? op.adsUom ?? op.uom ?? '').trim() ||
    guessAdsEquipmentUom(particular);
  const qtyRaw = Number(op.qty ?? op.equipment_quantity ?? op.quantity ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const remarksFromField = Number(op.remarksQuantity);
  const remarksQuantity =
    Number.isFinite(remarksFromField) && remarksFromField > 0
      ? remarksFromField
      : parseAdsRemarksQuantity(op.remarks ?? op.Remarks ?? op.remark);

  // Non-time UOMs: remarks count drives invoice used units.
  if (!isTimeBasedAdsUom(uom) && remarksQuantity != null && remarksQuantity > 0) {
    return capTurnaroundCrewCoachUsedClient(
      toWholeAdsUnits(qty * remarksQuantity),
      row,
      particular,
    );
  }

  const used = Number(rate.usedUnits ?? op.adsUsedUnits);
  if (Number.isFinite(used) && used > 0) {
    return capTurnaroundCrewCoachUsedClient(toWholeAdsUnits(used), row, particular);
  }

  if (!isTimeBasedAdsUom(uom)) {
    return capTurnaroundCrewCoachUsedClient(toWholeAdsUnits(qty), row, particular);
  }

  const chargeable = Number(op.chargeableUnits);
  if (Number.isFinite(chargeable) && chargeable > 0) {
    return capTurnaroundCrewCoachUsedClient(
      toWholeAdsUnits(chargeable),
      row,
      particular,
    );
  }
  const hours = Number(op.usageHours);
  if (Number.isFinite(hours) && hours > 0) {
    return capTurnaroundCrewCoachUsedClient(
      toWholeAdsUnits(qty * hours),
      row,
      particular,
    );
  }
  return capTurnaroundCrewCoachUsedClient(toWholeAdsUnits(qty), row, particular);
}

function capTurnaroundCrewCoachUsedClient(
  used: number,
  row: BillingSourceRow,
  particular: string,
): number {
  if (used <= 0) return 0;
  const briefKey = primaryBriefKey(row);
  const isCrew =
    briefKey === 'crewCoach' || isCrewCoachBriefLabel(particular);
  if (!isCrew) return used;
  if (!isTurnaroundFlightRow(row)) return used;
  return Math.min(1, used);
}

/** Best-effort ADS UOM when enrichment has not stamped adsUom yet. */
function guessAdsEquipmentUom(particular: string): string {
  const key = particular
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
  if (!key) return '';
  if (/^PAX\s*COACH|PASSENGER\s*COACH|CREW\s*COACH/.test(key)) return 'Per Trip';
  if (/^ASU/.test(key)) return 'Per start';
  if (/^AMB|AMBULIFT/.test(key)) return 'Per Usage';
  if (/TOWBAR|^TOW$/.test(key)) return 'Per push/tow';
  if (/^ISTNB|^ISTWB|TOW-NB|TOW-WB/.test(key)) return 'Per Tow';
  if (/^PBNB|^PBWB|PUSH\s*BACK/.test(key)) return 'Per service';
  if (/^GPU|^ACU|^BFL|^LDL|^MDL|^UDL|^EBT|^DT|^RC|^TRE|^MPSL/.test(key)) {
    return 'Per Hour';
  }
  if (/^HS|HEAD\s*SET|PSL-TOWABLE|^WW\b/.test(key)) return 'Per Turnaround';
  return '';
}

function adsRowFreeAllowance(row: BillingSourceRow): number {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  const free = Number(rate.freeAllowance ?? op.adsFreeAllowance ?? 0);
  if (!Number.isFinite(free) || free <= 0) return 0;
  // Package-inclusive sentinel from enrichment.
  if (free >= Number.MAX_SAFE_INTEGER / 4) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round(free));
}

function adsRowPricingBasis(row: BillingSourceRow): string {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  return String(rate.pricingBasis ?? op.adsPricingBasis ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Charged quantity for palette — matches invoice ADS compose:
 * Charged = max(0, Used − freeAllowance). Non-billable pricing bases contribute 0.
 */
export function adsRowChargedQuantity(row: BillingSourceRow): number {
  const pricingBasis = adsRowPricingBasis(row);
  if (
    pricingBasis === 'ads_excluded' ||
    pricingBasis === 'not_on_contract' ||
    pricingBasis === 'package_inclusive'
  ) {
    return 0;
  }

  const unitPrice = Number(row.rateMatch?.unitPrice ?? 0);
  // Invoice skips zero-price lines; keep palette aligned once enrichment priced the row.
  if (Number.isFinite(unitPrice) && unitPrice <= 0 && pricingBasis) {
    return 0;
  }

  const used = adsRowUsedUnits(row);
  const free = adsRowFreeAllowance(row);
  return Math.max(0, used - free);
}

/**
 * MIS-style count: one engagement per FHR equipment/manpower line (uses `qty` /
 * `equipment_quantity`). Does **not** multiply by usage hours — GPU Per Hour
 * billing hours stay on invoice only, not palette totals.
 */
export function adsRowOperationalQuantity(row: BillingSourceRow): number {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const qtyRaw = Number(op.qty ?? op.equipment_quantity ?? op.quantity ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  return toWholeAdsUnits(qty);
}

/**
 * Palette = sum of FHR engagement qty by equipment code for the loaded
 * date-filter rows (MIS parity: 1 per equipment line × qty, not billable hours).
 */
export function computeBillingAdsBriefStats(rows: BillingSourceRow[]): BillingAdsBriefStats {
  const perFlight = new Map<string, Partial<Record<BillingAdsBriefKey, number>>>();

  for (const row of rows) {
    const flightKey =
      billingAdsFlightKey(row) ||
      `line:${String(row.sourceRef.usageRowId ?? '')}:${String(row.sourceRef.serialNo ?? '')}`;
    const briefKey = primaryBriefKey(row);
    if (!briefKey) continue;
    const used = adsRowOperationalQuantity(row);
    if (used <= 0) continue;
    const flightBucket = perFlight.get(flightKey) ?? {};
    flightBucket[briefKey] = (flightBucket[briefKey] ?? 0) + used;
    perFlight.set(flightKey, flightBucket);
  }

  const stats = { ...EMPTY_BILLING_ADS_BRIEF_STATS };
  for (const flightBucket of perFlight.values()) {
    for (const key of BILLING_ADS_BRIEF_KEYS) {
      const n = flightBucket[key];
      if (n) stats[key] += n;
    }
  }
  return stats;
}

/** Per-subtype counts for the combined WCH palette chip. */
export function computeBillingAdsWchBreakdown(
  rows: BillingSourceRow[],
): BillingAdsWchBreakdown {
  const breakdown = { ...EMPTY_BILLING_ADS_WCH_BREAKDOWN };
  for (const row of rows) {
    const briefKey = primaryBriefKey(row);
    if (briefKey !== 'wch') continue;
    const used = adsRowOperationalQuantity(row);
    if (used <= 0) continue;
    const subtype = inferWheelchairSubtype(row);
    if (subtype) breakdown[subtype] += used;
  }
  return breakdown;
}

/** Map ADS exclusive rate-card service codes/descriptions to palette keys. */
export function briefKeysForAdsRateCardServices(
  services: ReadonlyArray<{ serviceCode: string; description?: string }>,
): Set<BillingAdsBriefKey> {
  const keys = new Set<BillingAdsBriefKey>();
  for (const service of services) {
    const synthetic: BillingSourceRow = {
      sourceType: 'ads',
      sourceRef: {},
      operationalData: {
        equipment_name: service.serviceCode,
        equipmentName: service.serviceCode,
        abbr: service.serviceCode,
        description: service.description ?? service.serviceCode,
      },
      billingEligibility: { eligible: true },
      contractMatch: { matched: false },
      rateMatch: { matched: true, serviceCode: service.serviceCode },
      validationStatus: { passed: true, errors: [] },
    };
    const key = primaryBriefKey(synthetic);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Prefer keys from exclusive rate-card labels; fall back to usage rows whose
 * rateMatch.serviceCode is in the exclusive set.
 */
export function briefKeysForAdsExclusiveGate(
  exclusiveCards: ReadonlyArray<{ serviceCode: string; description?: string }>,
  usageRows: BillingSourceRow[] = [],
): Set<BillingAdsBriefKey> {
  const fromCards = briefKeysForAdsRateCardServices(exclusiveCards);
  if (fromCards.size > 0) return fromCards;

  const codes = new Set(
    exclusiveCards
      .map((row) => row.serviceCode.trim().toUpperCase())
      .filter(Boolean),
  );
  if (codes.size === 0) return fromCards;

  const keys = new Set<BillingAdsBriefKey>();
  for (const row of usageRows) {
    const matchedCode = String(row.rateMatch?.serviceCode ?? '')
      .trim()
      .toUpperCase();
    const particular = String(
      row.operationalData.adsParticular ??
        row.operationalData.particular ??
        row.operationalData.equipment ??
        '',
    )
      .trim()
      .toUpperCase();
    if (
      (matchedCode && codes.has(matchedCode)) ||
      (particular && [...codes].some((code) => particular.includes(code) || code.includes(particular)))
    ) {
      const key = primaryBriefKey(row);
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function gateBillingAdsBriefStats(
  stats: BillingAdsBriefStats,
  allowedKeys: ReadonlySet<BillingAdsBriefKey> | null,
): BillingAdsBriefStats {
  if (!allowedKeys) return stats;
  const gated = { ...EMPTY_BILLING_ADS_BRIEF_STATS };
  for (const key of BILLING_ADS_BRIEF_KEYS) {
    gated[key] = allowedKeys.has(key) ? stats[key] : 0;
  }
  return gated;
}

export function filterBillingRowsByAdsBriefs(
  rows: BillingSourceRow[],
  selected: ReadonlySet<BillingAdsBriefKey>,
): BillingSourceRow[] {
  if (selected.size === 0) return rows;
  return rows.filter((row) => {
    const key = primaryBriefKey(row);
    return key != null && selected.has(key);
  });
}

export type AdsBriefSelectionTotals = {
  label: string;
  engagements: number;
  uom: string;
  usedUnits: number;
  chargedUnits: number;
};

function adsRowDisplayUom(row: BillingSourceRow): string {
  const op = (row.operationalData ?? {}) as Record<string, unknown>;
  const rate = (row.rateMatch ?? {}) as Record<string, unknown>;
  const explicit = String(rate.uom ?? op.adsUom ?? op.uom ?? '').trim();
  if (explicit) return explicit;
  const particular = String(
    op.adsParticular ??
      op.particular ??
      op.equipment ??
      op.equipment_name ??
      op.equipmentName ??
      row.rateMatch?.serviceCode ??
      '',
  ).trim();
  return guessAdsEquipmentUom(particular) || 'Per Service';
}

/**
 * Invoice-oriented totals for the currently selected palette chip(s):
 * UOM + used (qty × remarks count / hours) + charged (used − free).
 * Palette chip number stays MIS engagement count; this card is billable units.
 */
export function computeAdsBriefSelectionTotals(
  rows: BillingSourceRow[],
  selected: ReadonlySet<BillingAdsBriefKey>,
): AdsBriefSelectionTotals | null {
  if (selected.size === 0) return null;
  const filtered = filterBillingRowsByAdsBriefs(rows, selected);
  if (filtered.length === 0) {
    return {
      label: formatSelectedAdsBriefLabels(selected),
      engagements: 0,
      uom: '—',
      usedUnits: 0,
      chargedUnits: 0,
    };
  }

  let usedUnits = 0;
  let chargedUnits = 0;
  let engagements = 0;
  const uomCounts = new Map<string, number>();
  /** Per-flight Crew Coach charged on turnaround — max 1. */
  const turnaroundCrewChargedByFlight = new Map<string, number>();

  for (const row of filtered) {
    engagements += adsRowOperationalQuantity(row);
    usedUnits += adsRowUsedUnits(row);
    let charged = adsRowChargedQuantity(row);
    const briefKey = primaryBriefKey(row);
    if (
      charged > 0 &&
      briefKey === 'crewCoach' &&
      isTurnaroundFlightRow(row)
    ) {
      const flightKey =
        billingAdsFlightKey(row) ||
        `line:${String(row.sourceRef.usageRowId ?? '')}`;
      const already = turnaroundCrewChargedByFlight.get(flightKey) ?? 0;
      const room = Math.max(0, 1 - already);
      charged = Math.min(charged, room);
      turnaroundCrewChargedByFlight.set(flightKey, already + charged);
    }
    chargedUnits += charged;
    const uom = adsRowDisplayUom(row);
    uomCounts.set(uom, (uomCounts.get(uom) ?? 0) + 1);
  }

  let uom = 'Per Service';
  let best = 0;
  for (const [value, count] of uomCounts) {
    if (count > best) {
      best = count;
      uom = value;
    }
  }

  const labels = formatSelectedAdsBriefLabels(selected);

  return {
    label: labels,
    engagements: toWholeAdsUnits(engagements),
    uom,
    usedUnits: toWholeAdsUnits(usedUnits),
    chargedUnits: Math.max(0, Math.round(chargedUnits)),
  };
}
