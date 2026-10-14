/** Shared price-card handling helpers (server + client). */

export type PriceCardHandlingType = 'BHS' | 'ADS' | 'RAF';

export const PRICE_CARD_HANDLING_TYPES: PriceCardHandlingType[] = ['BHS', 'ADS', 'RAF'];

export function mergeHandlingTypes(
  existing: PriceCardHandlingType[] | undefined,
  next: PriceCardHandlingType,
): PriceCardHandlingType[] {
  const merged = new Set<PriceCardHandlingType>(existing ?? []);
  merged.add(next);
  return PRICE_CARD_HANDLING_TYPES.filter((type) => merged.has(type));
}
