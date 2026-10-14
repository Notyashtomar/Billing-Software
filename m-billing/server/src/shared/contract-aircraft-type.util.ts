/**
 * Contract "aircraft types" must be airframes (A320, B737-800).
 * HYD imports mixed additional services into the same list (toilet, coaches, UH).
 */

const SERVICE_LABEL_RE =
  /\b(TOILET|COACH|CART|MANPOWER|HOUSEKEEPING|GPU|ACU|ASU|TOW|TOWING|PUSH\s*BACK|WHEEL\s*CHAIR|WHEELCHAIR|CLEANING|CLEAN|DRIVER|SUPERVISOR|COLLAR|LADDER|HEADSET|AMBULIFT|TUG|TRACTOR|WATER\s*SERVICE|WATER\s*CART|ADDITIONAL\s+(PB|MANPOWER|F|SERVICE)|INTER\s*STAND|OFFICE|UNIT\s*HEAD|\bUH\b|PAX[\s-]*COACH|CREW[\s-]*COACH|C[\s-]*COACH|PS-TS|PS-WS|PBNB|CREW\s*TRANSPORT)\b/i;

const AIRFRAME_RE =
  /^(A\d{2,3}([-/]?[A-Z0-9]+)?|B\d{3}([-/]?[A-Z0-9]+)?|ATR\d{0,3}([-/]?[A-Z0-9]+)?|CRJ\d{0,3}|DH[C8]\d{0,3}|Q4\d{2}|E[17]\d{2}|EMB\d{0,4}|ERJ\d{0,4}|C\d{3}|F2TH|A109S|B737MAX|DC-?1[0O]|DCIO|AN-?12|IL-?\d{2}F?|MD-?\d{2,3}|[A-Z]{1,2}\d{2,4}([-/]?[A-Z0-9]+)?)$/i;

export function normalizeContractAircraftToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function isServiceLabelMisfiledAsAircraft(value: unknown): boolean {
  const token = normalizeContractAircraftToken(value);
  if (!token) return false;
  if (AIRFRAME_RE.test(token.replace(/\s+/g, ''))) return false;
  return SERVICE_LABEL_RE.test(token);
}

export function isLikelyAirframeType(value: unknown): boolean {
  const token = normalizeContractAircraftToken(value);
  if (!token) return false;
  if (isServiceLabelMisfiledAsAircraft(token)) return false;
  const compact = token.replace(/\s+/g, '');
  return AIRFRAME_RE.test(compact);
}

export function sanitizeContractAircraftTypes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const token = normalizeContractAircraftToken(raw);
    if (!token || isServiceLabelMisfiledAsAircraft(token)) continue;
    if (!isLikelyAirframeType(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function sanitizeAdsRuleAircraftTypes<T extends { aircraftType?: string; aircraftTypes?: string[] }>(
  rule: T,
): T {
  const multi = sanitizeContractAircraftTypes(rule.aircraftTypes ?? []);
  const legacy = sanitizeContractAircraftTypes(rule.aircraftType ? [rule.aircraftType] : []);
  const aircraftTypes = multi.length > 0 ? multi : legacy;
  return {
    ...rule,
    aircraftTypes,
    aircraftType: aircraftTypes[0],
  };
}
