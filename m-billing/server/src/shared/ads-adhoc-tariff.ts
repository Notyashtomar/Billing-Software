/**
 * Adhoc equipment / services / manpower tariff (Bird Flight Services — Pan India).
 * Source: "Adhoc Charges List w.e.f 01 April 2026 till 31 March 2027".
 * Used when no exclusive rate-card price (and no row rateINR/rateUSD) is available.
 */

export type AdsAdhocTariffEntry = {
  /** Display / match label */
  label: string;
  domesticInr: number;
  intlUsd: number;
  uom: string;
  section?: string;
};

/** Normalize for fuzzy match: lower-case, strip punctuation, collapse spaces. */
export function normalizeAdhocKey(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RAW_ENTRIES: AdsAdhocTariffEntry[] = [
  // Equipment
  { label: 'Ambulift', domesticInr: 13885, intlUsd: 182, uom: 'Per Usage', section: '2.1.3(a)6' },
  { label: 'Ground Power Unit (GPU) 90 KV', domesticInr: 12206, intlUsd: 160, uom: 'Per Hour', section: '3.3.3(a)' },
  { label: 'GPU 90 KV', domesticInr: 12206, intlUsd: 160, uom: 'Per Hour', section: '3.3.3(a)' },
  { label: 'Ground Power Unit (GPU) 140 KV', domesticInr: 16784, intlUsd: 220, uom: 'Per Hour', section: '3.3.3(a)' },
  { label: 'GPU 140 KV', domesticInr: 16784, intlUsd: 220, uom: 'Per Hour', section: '3.3.3(a)' },
  { label: 'Hook on power at aerobridge bay', domesticInr: 1591, intlUsd: 21, uom: 'Per flight', section: '3.3.3(a)' },
  { label: 'Air Conditioner unit (ACU) Narrow Body', domesticInr: 17623, intlUsd: 231, uom: 'Per Hour', section: '3.4.1(a)' },
  { label: 'ACU Narrow Body', domesticInr: 17623, intlUsd: 231, uom: 'Per Hour', section: '3.4.1(a)' },
  { label: 'Air Conditioner unit (ACU) Wide Body', domesticInr: 21361, intlUsd: 280, uom: 'Per Hour', section: '3.4.1(a)' },
  { label: 'ACU Wide Body', domesticInr: 21361, intlUsd: 280, uom: 'Per Hour', section: '3.4.1(a)' },
  {
    label: 'Ramp to Flight Deck Communication Narrow Body',
    domesticInr: 5340,
    intlUsd: 70,
    uom: 'Per Turnaround',
    section: '3.5.1',
  },
  {
    label: 'Ramp to Flight Deck Communication Wide Body',
    domesticInr: 9155,
    intlUsd: 120,
    uom: 'Per Turnaround',
    section: '3.5.1',
  },
  { label: 'Step Ladder (remote bay) Towable', domesticInr: 5035, intlUsd: 66, uom: 'Per Turnaround', section: '3.6.1(a)' },
  { label: 'Step Ladder Motorized Narrow Body', domesticInr: 7171, intlUsd: 94, uom: 'Per Hour', section: '3.6.1(a)' },
  { label: 'Step Ladder Motorized Wide Body', domesticInr: 9231, intlUsd: 121, uom: 'Per Hour', section: '3.6.1(a)' },
  { label: 'Passenger Bus', domesticInr: 3815, intlUsd: 50, uom: 'Per Trip', section: '3.6.2(a)1' },
  { label: 'Crew Coach', domesticInr: 3357, intlUsd: 44, uom: 'Per Trip', section: '3.6.2(a)2' },
  { label: 'Conveyor belt loader', domesticInr: 10070, intlUsd: 132, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Lower Deck Loader (LDL)', domesticInr: 23268, intlUsd: 305, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'LDL', domesticInr: 23268, intlUsd: 305, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Main Deck Loader (MDL)', domesticInr: 26473, intlUsd: 347, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'MDL', domesticInr: 26473, intlUsd: 347, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Fork Lift 10 Ton', domesticInr: 11444, intlUsd: 150, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Fork Lift 5 Tons', domesticInr: 9155, intlUsd: 120, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Fork Lift 3 Tons', domesticInr: 6485, intlUsd: 85, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Air Start Unit (ASU) Narrow Body', domesticInr: 15258, intlUsd: 200, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'ASU Narrow Body', domesticInr: 15258, intlUsd: 200, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'Air Start Unit (ASU) Wide Body', domesticInr: 19073, intlUsd: 250, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'ASU Wide Body', domesticInr: 19073, intlUsd: 250, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'Towbar', domesticInr: 3357, intlUsd: 44, uom: 'Per push/tow', section: '3.9.2(b)' },
  { label: 'Long Towbar', domesticInr: 3357, intlUsd: 44, uom: 'Per push/tow', section: '3.9.2(b)' },
  { label: 'Short Towbar', domesticInr: 3357, intlUsd: 44, uom: 'Per push/tow', section: '3.9.2(b)' },
  { label: 'Push Back Narrow Body', domesticInr: 12588, intlUsd: 165, uom: 'Per service', section: '3.9.3(a)' },
  { label: 'Push Back Wide Body', domesticInr: 18462, intlUsd: 242, uom: 'Per service', section: '3.9.3(a)' },
  { label: 'Tow Inter Stand Narrow Body', domesticInr: 14724, intlUsd: 193, uom: 'Per Tow', section: '3.9.3(b)' },
  { label: 'Tow Inter Stand Wide Body', domesticInr: 23497, intlUsd: 308, uom: 'Per Tow', section: '3.9.3(b)' },
  { label: 'Wing Walkers', domesticInr: 5340, intlUsd: 70, uom: 'Per turnaround', section: '3.9.3(d)' },
  { label: 'Toilet service', domesticInr: 6332, intlUsd: 83, uom: 'Per service', section: '3.12.1(a)' },
  { label: 'Water service', domesticInr: 5493, intlUsd: 72, uom: 'Per service', section: '3.13.1(a)' },
  { label: 'Brake Cooling Fan', domesticInr: 3433, intlUsd: 45, uom: 'Per Hour', section: '' },

  // Passenger / terminal / manpower
  { label: 'Unaccompanied minor handling', domesticInr: 2289, intlUsd: 30, uom: 'Per minor', section: '2.1.3(a)1' },
  { label: 'Wheel Chair WCHR', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'Wheel Chair -WCHR', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'Wheel Chair WCHS', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'Wheel Chair-WCHC', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'WCHC', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'WCHR', domesticInr: 2289, intlUsd: 30, uom: 'Per service', section: '2.1.3(a)2' },
  { label: 'VIPs / MAAS', domesticInr: 3433, intlUsd: 45, uom: 'Per passenger', section: '2.1.3(a)3' },
  { label: 'MAAS', domesticInr: 3433, intlUsd: 45, uom: 'Per passenger', section: '2.1.3(a)3' },
  { label: 'Transit w/o visa pax', domesticInr: 3433, intlUsd: 45, uom: 'Per passenger', section: '2.1.3(a)4' },
  { label: 'TWOVs', domesticInr: 3433, intlUsd: 45, uom: 'Per passenger', section: '2.1.3(a)4' },
  { label: 'Deportees', domesticInr: 3433, intlUsd: 45, uom: 'Per passenger', section: '2.1.3(a)5' },
  { label: 'Floor Walkers/Welcome staff', domesticInr: 1678, intlUsd: 22, uom: 'Per personnel/hr', section: '2.1.3(a)7' },
  { label: 'Manpower (White collar)', domesticInr: 2441, intlUsd: 32, uom: 'Per personnel/hr', section: '2.1.3(a)7' },
  { label: 'Manpower (Blue collar)', domesticInr: 1755, intlUsd: 23, uom: 'Per personnel/hr', section: '2.1.3(a)7' },
  { label: 'Val Handling', domesticInr: 8163, intlUsd: 107, uom: 'Per service', section: '3.6.10(a)' },
  { label: 'Ballast Bags Refill', domesticInr: 1297, intlUsd: 17, uom: 'Per refill', section: '3.6.9(a)' },
  { label: 'Interior cleaning (Transit) Narrow Body', domesticInr: 11062, intlUsd: 145, uom: 'Per service', section: '3.11.1' },
  { label: 'Interior cleaning (Transit) Wide Body', domesticInr: 19607, intlUsd: 257, uom: 'Per service', section: '3.11.1' },
  { label: 'Interior cleaning (Transit) ATR', domesticInr: 6332, intlUsd: 83, uom: 'Per service', section: '3.11.1' },
  { label: 'Mini Deep Cleaning Narrow Body', domesticInr: 16021, intlUsd: 210, uom: 'Per service', section: '3.11.2' },
  { label: 'Mini Deep Cleaning Wide Body', domesticInr: 27388, intlUsd: 359, uom: 'Per service', section: '3.11.2' },
  { label: 'Mini Deep Cleaning ATR', domesticInr: 9231, intlUsd: 121, uom: 'Per service', section: '3.11.2' },
  { label: 'Flight Deck cleaning', domesticInr: 4120, intlUsd: 54, uom: 'Per service', section: '3.11.2' },
  { label: 'Waste Disposal', domesticInr: 1297, intlUsd: 17, uom: 'Per service', section: '3.11.10' },
  { label: 'Crew Hotel accommodation', domesticInr: 2060, intlUsd: 27, uom: 'Per service', section: '4.9.2(b)' },
  { label: 'Crew Transportation', domesticInr: 2060, intlUsd: 27, uom: 'Per service', section: '4.9.3(b)' },
  { label: 'C.I.Q. assistance', domesticInr: 2441, intlUsd: 32, uom: 'Per clearance', section: '4.9.4' },
  { label: 'Live Animal Handling', domesticInr: 2289, intlUsd: 30, uom: 'Per AVI', section: '5.5.1(e)' },
  { label: 'AVIH', domesticInr: 2289, intlUsd: 30, uom: 'Per AVI', section: '5.5.1(e)' },
  { label: 'ULD Storage LD3', domesticInr: 687, intlUsd: 9, uom: 'Per day', section: '6.3.1(a)' },
  { label: 'ULD Storage LD11', domesticInr: 2289, intlUsd: 30, uom: 'Per day', section: '6.3.1(a)' },
  { label: 'Stacking of Pallets', domesticInr: 2289, intlUsd: 30, uom: 'Per stack per day', section: '6.3.1(a)' },
  { label: 'Valet Service', domesticInr: 1824, intlUsd: 24, uom: 'Per valet/shift', section: '' },
  { label: 'Baggage Trolly', domesticInr: 532, intlUsd: 7, uom: 'Per Hour', section: '' },
  { label: 'Baggage Trolley', domesticInr: 532, intlUsd: 7, uom: 'Per Hour', section: '' },
  { label: 'Container Dollies', domesticInr: 532, intlUsd: 7, uom: 'Per Hour', section: '' },
  { label: 'Pallet Dollies', domesticInr: 532, intlUsd: 7, uom: 'Per Hour', section: '' },
  { label: 'Diesel / Battery Tractor', domesticInr: 3496, intlUsd: 46, uom: 'Per Hour', section: '' },
  { label: 'Diesel Tractor', domesticInr: 3496, intlUsd: 46, uom: 'Per Hour', section: '' },
  { label: 'Ground Power Unit - Narrow Body', domesticInr: 12206, intlUsd: 160, uom: 'Per Hour', section: '3.3.3(a)' },
  { label: 'Air Conditioner Unit - Narrow Body', domesticInr: 17623, intlUsd: 231, uom: 'Per Hour', section: '3.4.1(a)' },
  { label: 'Air Conditioner Unit - Wide Body', domesticInr: 21361, intlUsd: 280, uom: 'Per Hour', section: '3.4.1(a)' },
  { label: 'Air Start Unit - Narrow Body', domesticInr: 15258, intlUsd: 200, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'Air Start Unit - Wide Body', domesticInr: 19073, intlUsd: 250, uom: 'Per start', section: '3.7.1(a)' },
  { label: 'Inter Stand Tow Narrow Body', domesticInr: 14724, intlUsd: 193, uom: 'Per Tow', section: '3.9.3(b)' },
  { label: 'Inter Stand Tow Wide Body', domesticInr: 23497, intlUsd: 308, uom: 'Per Tow', section: '3.9.3(b)' },
  { label: 'Passenger Step Ladder Towable', domesticInr: 5035, intlUsd: 66, uom: 'Per Turnaround', section: '3.6.1(a)' },
  { label: 'Wing Walking', domesticInr: 5340, intlUsd: 70, uom: 'Per turnaround', section: '3.9.3(d)' },
  { label: 'Water Cart', domesticInr: 5493, intlUsd: 72, uom: 'Per service', section: '3.13.1(a)' },
  { label: 'Upper Deck Loader', domesticInr: 23125, intlUsd: 303, uom: 'Per Hour', section: '' },
  { label: 'Main Deck Loader', domesticInr: 26473, intlUsd: 347, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Lower Deck Loader', domesticInr: 23268, intlUsd: 305, uom: 'Per Hour', section: '3.6.3(a)' },
  { label: 'Ramp Car', domesticInr: 1672, intlUsd: 22, uom: 'Per Hour', section: '' },
  { label: 'Marshaler', domesticInr: 3000, intlUsd: 39, uom: 'Per service', section: '' },
  { label: 'UDL', domesticInr: 23125, intlUsd: 303, uom: 'Per Hour', section: '' },
  { label: 'Trestle Above 6FT to 12 FT', domesticInr: 11138, intlUsd: 146, uom: 'Per Hour', section: '' },
  { label: 'Trestle Up to 6 FT', domesticInr: 6027, intlUsd: 79, uom: 'Per Hour', section: '' },
  { label: 'Steering Pin', domesticInr: 600, intlUsd: 8, uom: 'Per service', section: '' },
];

const BY_KEY = new Map<string, AdsAdhocTariffEntry>();
for (const entry of RAW_ENTRIES) {
  BY_KEY.set(normalizeAdhocKey(entry.label), entry);
}

export function isAdsFamilySourceType(sourceType: string | undefined): boolean {
  const t = String(sourceType ?? '').trim().toLowerCase();
  return t === 'ads' || t === 'equipment' || t === 'manpower' || t === 'cleaning';
}

/**
 * Lookup adhoc rate by equipment / service / manpower particular or serviceCode.
 * Tries exact normalized match, then substring contains either way.
 */
export function lookupAdhocRate(
  particular: string,
  opts?: { domestic?: boolean },
): { unitPrice: number; uom: string; label: string; pricingBasis: 'adhoc' } | null {
  const key = normalizeAdhocKey(particular);
  if (!key) return null;

  let hit = BY_KEY.get(key) ?? null;
  if (!hit) {
    for (const [k, entry] of BY_KEY) {
      if (key.includes(k) || k.includes(key)) {
        hit = entry;
        break;
      }
    }
  }
  if (!hit) {
    // Match trailing tokens like "WCHR" inside "Scheduled - Equipment - WCHR"
    const tokens = key.split(' ').filter((t) => t.length >= 3);
    for (const token of tokens.reverse()) {
      for (const [k, entry] of BY_KEY) {
        if (k.includes(token) || token.includes(k.split(' ').pop() ?? '')) {
          hit = entry;
          break;
        }
      }
      if (hit) break;
    }
  }
  if (!hit) return null;

  const domestic = opts?.domestic !== false;
  return {
    unitPrice: domestic ? hit.domesticInr : hit.intlUsd,
    uom: hit.uom,
    label: hit.label,
    pricingBasis: 'adhoc',
  };
}

export function listAdhocTariffEntries(): readonly AdsAdhocTariffEntry[] {
  return RAW_ENTRIES;
}
