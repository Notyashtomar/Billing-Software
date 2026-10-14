/** True when UOM is billed by the hour (always charged on ADS). */
export function isAdsHourlyUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim();
  if (!raw) return false;
  if (/^hr$/i.test(raw)) return true;
  if (/per\s*hour/i.test(raw)) return true;
  return /hour/i.test(raw);
}

/** True when UOM is billed per 15-minute block (always charged on ADS). */
export function isAdsFifteenMinuteUom(uom: unknown): boolean {
  const raw = String(uom ?? '').trim();
  if (!raw) return false;
  return /per\s*15\s*min(?:ute)?s?|\b15\s*min(?:ute)?s?\b/i.test(raw);
}
