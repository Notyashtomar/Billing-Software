/**
 * BHS price-card aircraft column: one airframe name per row.
 * These airlines keep a shared commercial group on one row (A319/A320/…).
 */
export const BHS_GROUPED_AIRCRAFT_CUSTOMERS = new Set([
  'UL',
  'AY',
  'CA',
  'VJ',
  'AF',
  'C6',
  'XJ',
  'VS',
]);

const AIRCRAFT_RE =
  /^(?:A\d{3}[A-Z0-9-]*|B7\d{2}[A-Z0-9-]*|B74[A-Z0-9-]*|B727[A-Z0-9-]*|B757[A-Z0-9-]*|B767[A-Z0-9-]*|MD-?\d+[A-Z0-9-]*|DC-?[A-Z0-9-]*|IL-?\d+[A-Z0-9-]*|AN-?\d+[A-Z0-9-]*|Q-?\d{3}[A-Z0-9-]*|ATR-?\d+[A-Z0-9-]*|DASH-?\d*[A-Z0-9-]*|DH8-?[A-Z0-9-]*|CRJ-?\d+[A-Z0-9-]*|E-?\d{3}[A-Z0-9-]*)$/;

const VARIANT_SUFFIX_RE = /^(?:\d{1,4}[A-Z]{0,4}|MAX\d*|\d+MAX\d*|CEO|NEO)$/;

function familyOf(token) {
  const match = String(token).match(
    /^(A\d{3}|B7\d{2}|B74|B727|B757|B767|MD\d+|ATR\d*|Q\d{3}|DASH\d*|CRJ\d*|E\d{3}|AN\d+|IL\d+|DC[A-Z0-9]*)/,
  );
  return match ? match[1] : token;
}

function prettyAircraft(token) {
  let name = String(token ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  name = name.replace(/^(A\d{3}|B7\d{2}|B74\d|B727|B757|B767)(NEO|CEO|MAX)(\d*)$/, '$1-$2$3');
  return name;
}

function isAircraftToken(token) {
  return AIRCRAFT_RE.test(token);
}

function isVariantSuffix(token) {
  return VARIANT_SUFFIX_RE.test(token) && !isAircraftToken(token);
}

function applySuffix(family, suffix) {
  return `${family}-${suffix}`;
}

/**
 * Pull "(Flight less than 35)" / "[…]" commercial notes off the aircraft column.
 * @returns {{ label: string, condition: string }}
 */
export function stripBhsAircraftCondition(label) {
  const original = String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!original) return { label: '', condition: '' };
  const bits = [];
  let text = original.replace(/\s*\(([^)]*)\)\s*/g, (_, inner) => {
    const bit = String(inner ?? '').trim();
    if (bit) bits.push(bit);
    return ' ';
  });
  text = text.replace(/\s*\[([^\]]*)\]\s*/g, (_, inner) => {
    const bit = String(inner ?? '').trim();
    if (bit) bits.push(bit);
    return ' ';
  });
  return {
    label: text.replace(/\s+/g, ' ').trim() || original,
    condition: bits.join('; '),
  };
}

/**
 * Split a combined aircraft label into one name per row.
 * Labels without "/" stay as a single row (volume bands, ancillary text).
 * @returns {{ aircraft: string[], condition: string }}
 */
export function expandBhsAircraftLabel(label) {
  const original = String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!original || !original.includes('/')) {
    const stripped = stripBhsAircraftCondition(original);
    return {
      aircraft: stripped.label ? [stripped.label] : [],
      condition: stripped.condition,
    };
  }

  const stripped = stripBhsAircraftCondition(original);
  let condition = stripped.condition;
  let text = stripped.label;

  text = text
    .replace(/^(?:CODE\s*[-–]?\s*[A-Z]\s*[-–]?|RATE\s+FOR)\s+/i, (prefix) => {
      const bit = prefix.trim();
      condition = condition ? `${bit}; ${condition}` : bit;
      return '';
    })
    .trim();

  const parts = text
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { aircraft: [stripped.label || original], condition };
  }

  const compactParts = parts.map((part) => part.replace(/\s+/g, '').toUpperCase());
  if (compactParts.every((part) => /^(DASH8?|Q-?400|400|DH8D?)$/.test(part))) {
    return { aircraft: ['Q400'], condition };
  }

  const out = [];
  let family = '';
  for (const part of parts) {
    const token = part.replace(/\s+/g, '').toUpperCase();
    if (!token) continue;
    if (isAircraftToken(token)) {
      const name = prettyAircraft(token);
      family = familyOf(name);
      out.push(name);
      continue;
    }
    if (family && isVariantSuffix(token)) {
      const variant = prettyAircraft(applySuffix(family, token));
      if (out.length > 0 && out[out.length - 1] === family) out[out.length - 1] = variant;
      else out.push(variant);
      continue;
    }
    const embedded = token.match(
      /(A\d{3}(?:-[A-Z0-9]+)*|B7\d{2}(?:-[A-Z0-9]+)*|B74\d(?:-[A-Z0-9]+)*|MD-?\d+[A-Z0-9]*|Q-?400|ATR-?\d+)/,
    );
    if (embedded) {
      const name = prettyAircraft(embedded[1]);
      family = familyOf(name);
      out.push(name);
    }
  }

  const aircraft = [];
  const seen = new Set();
  for (const name of out) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    aircraft.push(name);
  }
  if (aircraft.length === 0) return { aircraft: [stripped.label || original], condition };
  return { aircraft, condition };
}

/** Commercial group label for airlines that price several types on one row. */
export function groupedBhsAircraftLabel(equipmentHeader, fallback) {
  const header = String(equipmentHeader ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const source = header.includes('/') ? header : String(fallback ?? '').trim() || header;
  const { label } = stripBhsAircraftCondition(source);
  return (label || source).toUpperCase();
}

export function appendBhsAircraftCondition(remarks, condition) {
  const extra = String(condition ?? '').trim();
  const base = String(remarks ?? '').trim();
  if (!extra) return base;
  if (base.toLowerCase().includes(extra.toLowerCase())) return base.slice(0, 240);
  return [base, extra].filter(Boolean).join(' — ').slice(0, 240);
}

/** Replace a grouped aircraft label inside remarks with the single type name. */
export function remarksForSplitAircraft(originalRemarks, originalLabel, aircraftType, condition) {
  const label = String(originalLabel ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  let text = String(originalRemarks ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (label && text === label) text = aircraftType;
  else if (label && text.includes(label)) text = text.replace(label, aircraftType);
  return appendBhsAircraftCondition(text, condition);
}
