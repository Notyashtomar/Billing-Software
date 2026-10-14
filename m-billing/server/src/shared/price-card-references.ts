/** Price card column headings — billing time / unit basis (Chennai price card). */

export type PriceCardReferenceCode =
  | 'TRND'
  | 'TRNS'
  | 'PTD'
  | 'PU'
  | 'PUS'
  | 'PH'
  | 'PST'
  | 'PTRIP'
  | 'PTOW'
  | 'PP'
  | 'PF'
  | 'PM'
  | 'PS';

export type PriceCardReference = {
  code: PriceCardReferenceCode;
  label: string;
  description: string;
  defaultUom: string;
};

export const PRICE_CARD_REFERENCES: readonly PriceCardReference[] = [
  { code: 'TRND', label: 'TRND', description: 'Turnaround / basic handling', defaultUom: 'FLIGHT' },
  { code: 'TRNS', label: 'TRNS', description: 'Transit', defaultUom: 'FLIGHT' },
  { code: 'PTD', label: 'PTD', description: 'Per turnaround', defaultUom: 'FLIGHT' },
  { code: 'PU', label: 'PU', description: 'Per unit', defaultUom: 'EA' },
  { code: 'PUS', label: 'PUS', description: 'Per unit (scheduled)', defaultUom: 'EA' },
  { code: 'PH', label: 'PH', description: 'Per hour (equipment)', defaultUom: 'MIN' },
  { code: 'PST', label: 'PST', description: 'Per start / ASU', defaultUom: 'EA' },
  { code: 'PTRIP', label: 'PTRIP', description: 'Per trip (coaches)', defaultUom: 'TRIP' },
  { code: 'PTOW', label: 'PTOW', description: 'Per towing', defaultUom: 'EA' },
  { code: 'PP', label: 'PP', description: 'Per push', defaultUom: 'EA' },
  { code: 'PF', label: 'PF', description: 'Per flight', defaultUom: 'FLIGHT' },
  { code: 'PM', label: 'PM', description: 'Mode basis (manpower)', defaultUom: 'MIN' },
  { code: 'PS', label: 'PS', description: 'Per service', defaultUom: 'EA' },
] as const;

export const PRICE_CARD_REFERENCE_CODES = PRICE_CARD_REFERENCES.map((r) => r.code);

export const LEGACY_PRICE_CARD_REFERENCE_ALIASES: Record<string, PriceCardReferenceCode> = {
  PTW: 'PTOW',
};

export function normalizePriceCardReference(code: string): string {
  const upper = code.trim().toUpperCase();
  return LEGACY_PRICE_CARD_REFERENCE_ALIASES[upper] ?? upper;
}

export function getPriceCardReference(code: string): PriceCardReference | undefined {
  const normalized = normalizePriceCardReference(code);
  return PRICE_CARD_REFERENCES.find((r) => r.code === normalized);
}

export function defaultUomForPriceCardReference(code: string): string | undefined {
  return getPriceCardReference(code)?.defaultUom;
}
