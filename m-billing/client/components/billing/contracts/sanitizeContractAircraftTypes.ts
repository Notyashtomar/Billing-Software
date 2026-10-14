const SERVICE_LABEL_RE =
  /\b(TOILET|COACH|CART|MANPOWER|HOUSEKEEPING|GPU|ACU|ASU|TOW|TOWING|PUSH\s*BACK|WHEEL\s*CHAIR|WHEELCHAIR|CLEANING|CLEAN|DRIVER|SUPERVISOR|COLLAR|LADDER|HEADSET|AMBULIFT|TUG|TRACTOR|WATER\s*SERVICE|WATER\s*CART|ADDITIONAL\s+(PB|MANPOWER|F|SERVICE)|INTER\s*STAND|OFFICE|UNIT\s*HEAD|\bUH\b|PAX[\s-]*COACH|CREW[\s-]*COACH|C[\s-]*COACH|PS-TS|PS-WS|PBNB|CREW\s*TRANSPORT)\b/i;

const AIRFRAME_RE =
  /^(A\d{2,3}([-/]?[A-Z0-9]+)?|B\d{3}([-/]?[A-Z0-9]+)?|ATR\d{0,3}([-/]?[A-Z0-9]+)?|CRJ\d{0,3}|DH[C8]\d{0,3}|Q4\d{2}|E[17]\d{2}|EMB\d{0,4}|ERJ\d{0,4}|C\d{3}|F2TH|A109S|B737MAX|DC-?1[0O]|DCIO|AN-?12|IL-?\d{2}F?|MD-?\d{2,3}|[A-Z]{1,2}\d{2,4}([-/]?[A-Z0-9]+)?)$/i;

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export function sanitizeContractAircraftTypes(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const token = normalize(raw);
    if (!token) continue;
    const compact = token.replace(/\s+/g, '');
    if (SERVICE_LABEL_RE.test(token) && !AIRFRAME_RE.test(compact)) continue;
    if (!AIRFRAME_RE.test(compact)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
