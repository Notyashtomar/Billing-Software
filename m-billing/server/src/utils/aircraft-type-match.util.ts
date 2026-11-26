/**
 * Parent aircraft matching: rate card "A320" applies when the flight string
 * contains that token (e.g. A320-800, B737/A320). Longer tokens win (B737 MAX before B737).
 */

function compactAircraft(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Equipment codes on flight rows → the marketing type stored on rate cards.
 * Neo and MAX codes that do not contain the parent digits are listed here.
 */
const AIRCRAFT_CODE_ALIASES: Record<string, string> = {
  '77F': 'B777F',
  B77F: 'B777F',
  '77L': 'B777',
  B77L: 'B777',
  '772': 'B777',
  B772: 'B777',
  '773': 'B777',
  B773: 'B777',
  '77W': 'B777',
  B77W: 'B777',
  A19N: 'A319',
  A20N: 'A320',
  A21N: 'A321',
  B38M: 'B737',
  B39M: 'B737',
  B3XM: 'B737',
  B738: 'B737',
  B739: 'B737',
  B788: 'B787',
  B789: 'B787',
  B78X: 'B787',
  A359: 'A350',
  A35K: 'A350',
  A388: 'A380',
  B744: 'B747',
  B748: 'B747',
};

function canonicalAircraft(value: string): string {
  const compact = compactAircraft(value);
  return AIRCRAFT_CODE_ALIASES[compact] ?? compact;
}

export type StoredFlightCategory = 'Dom' | 'Int' | 'Ta' | 'DomCargo' | 'IntCargo';

/**
 * Price-card category, including cargo rows.
 * Plain flight labels stay Dom / Int / Ta so existing billing keeps its sector.
 * "International-Cargo" and "Domestic-Cargo" stay distinct from those sectors.
 */
export function normalizeStoredFlightCategory(raw: string): StoredFlightCategory | null {
  const compact = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (compact === 'domcargo' || compact === 'domesticcargo') return 'DomCargo';
  if (compact === 'intcargo' || compact === 'internationalcargo') return 'IntCargo';
  return normalizeFlightCategory(raw);
}

function isStoredFlightCategory(raw: string): boolean {
  return normalizeStoredFlightCategory(raw) != null;
}

export function normalizeFlightCategory(raw: string): 'Dom' | 'Int' | 'Ta' | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const normalizeToken = (token: string): 'Dom' | 'Int' | 'Ta' | null => {
    const t = token.trim().toLowerCase();
    if (!t) return null;
    if (t.startsWith('dom') || t === 'd') return 'Dom';
    if (t.startsWith('int') || t === 'i') return 'Int';
    if (t.startsWith('turn') || t === 'ta' || t === 'turnaround') return 'Ta';
    return null;
  };

  // Mixed labels are stored as arrival-departure in some sources.
  // Use departure side (second token) for billing category resolution.
  const parts = s
    .split(/[\/>|-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const normalizedParts = parts
    .map((part) => normalizeToken(part))
    .filter((part): part is 'Dom' | 'Int' | 'Ta' => part != null);
  if (normalizedParts.length >= 2) return normalizedParts[1];
  if (normalizedParts.length === 1) return normalizedParts[0];

  const direct = normalizeToken(s);
  if (direct) return direct;

  return null;
}

type RateCardAircraftShape = {
  aircraftType?: string | null;
  category?: string | null;
};

function rateCardFlightCategory(
  rateCard: RateCardAircraftShape,
): StoredFlightCategory | null {
  return normalizeStoredFlightCategory((rateCard.category ?? '').trim());
}

export function rateCardAircraftTokens(rateCard: RateCardAircraftShape): string[] {
  const tokens: string[] = [];
  const aircraft = (rateCard.aircraftType ?? '').trim();
  if (aircraft) {
    // Strip commercial notes "(Flight less than 35)" then split A330/A350 groups.
    const withoutNotes = aircraft.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ').trim();
    const parts = withoutNotes.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) tokens.push(part);
    } else if (withoutNotes) {
      tokens.push(withoutNotes);
    } else {
      tokens.push(aircraft);
    }
  }

  const category = (rateCard.category ?? '').trim();
  if (category && !isStoredFlightCategory(category)) {
    for (const part of category.split(/[/,]+/)) {
      const token = part.trim();
      if (token) tokens.push(token);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    const key = compactAircraft(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(token);
  }
  return unique;
}

/** A320-200 and A20N share A320. A330-300 shares A330. B777F stays off B777. */
export function aircraftPriceFamily(value: string): string {
  const compact = canonicalAircraft(value);
  if (!compact) return '';
  if (compact === 'B777F' || /^B777\d*F$/.test(compact)) return 'B777F';
  const airbusWide = compact.match(/^A3([3458])/);
  if (airbusWide) return `A3${airbusWide[1]}0`;
  const airbusNarrow = compact.match(/^A3(18|19|20|21)/);
  if (airbusNarrow) return `A3${airbusNarrow[1]}`;
  const boeing = compact.match(/^B7([3-8])/);
  if (boeing) {
    if (boeing[1] === '7' && /F$/.test(compact) && !compact.includes('P2F')) return 'B777F';
    return `B7${boeing[1]}7`;
  }
  const other = compact.match(/^(A380|Q400|ATR\d{2,3}|CRJ\d{0,3}|E1\d{2})/);
  return other?.[1] ?? '';
}

function aircraftSubtypeTag(compact: string): string {
  if (compact.includes('MAX')) return 'MAX';
  if (compact.includes('NEO')) return 'NEO';
  return '';
}

export function aircraftTokenMatchesFlight(
  flightAircraft: string,
  token: string,
): boolean {
  const haystack = canonicalAircraft(flightAircraft);
  const needle = canonicalAircraft(token);
  if (!haystack || !needle) return false;
  if (haystack === needle || haystack.includes(needle)) return true;

  const flightFamily = aircraftPriceFamily(haystack);
  const cardFamily = aircraftPriceFamily(needle);
  if (flightFamily && cardFamily && flightFamily !== cardFamily) return false;
  if (needle.startsWith(haystack) || haystack.startsWith(needle)) return true;
  return (
    flightFamily.length > 0 &&
    flightFamily === cardFamily &&
    aircraftSubtypeTag(haystack) === aircraftSubtypeTag(needle)
  );
}

export function rateCardMatchesFlightAircraft(
  rateCard: RateCardAircraftShape,
  flightAircraft: string,
): boolean {
  const tokens = rateCardAircraftTokens(rateCard);
  if (tokens.length === 0) return true;
  const flight = flightAircraft.trim();
  if (!flight) return false;
  return tokens.some((token) => aircraftTokenMatchesFlight(flight, token));
}

export function rateCardMatchesFlightCategory(
  rateCard: RateCardAircraftShape,
  categoryOfFlight: string,
): boolean {
  const cardCategory = rateCardFlightCategory(rateCard);
  const flightCategory = normalizeStoredFlightCategory(categoryOfFlight);
  if (!cardCategory) return true;
  if (!flightCategory) return true;
  if (cardCategory === flightCategory) return true;
  // Airlines without a cargo row keep billing cargo flights on Domestic / International.
  if (flightCategory === 'IntCargo' && cardCategory === 'Int') return true;
  if (flightCategory === 'DomCargo' && cardCategory === 'Dom') return true;
  return false;
}

function categorySpecificity(
  cardCategory: string | null | undefined,
  categoryOfFlight: string,
): number {
  const card = normalizeStoredFlightCategory(cardCategory ?? '');
  const flight = normalizeStoredFlightCategory(categoryOfFlight);
  if (!card || !flight) return 0;
  return card === flight ? 2 : 1;
}

/** Higher score wins. An exact type beats a parent, and a parent beats a sibling variant. */
function tokenMatchScore(flightAircraft: string, token: string): number {
  if (!aircraftTokenMatchesFlight(flightAircraft, token)) return 0;
  const haystack = canonicalAircraft(flightAircraft);
  const needle = canonicalAircraft(token);
  if (haystack === needle) return 3000;
  if (haystack.startsWith(needle) || needle.startsWith(haystack)) {
    return 2000 + Math.min(haystack.length, needle.length);
  }
  if (haystack.includes(needle)) return 1000 + needle.length;
  return 100 - Math.min(99, Math.abs(haystack.length - needle.length));
}

function bestTokenMatchLength(flightAircraft: string, tokens: string[]): number {
  let max = 0;
  for (const token of tokens) {
    max = Math.max(max, tokenMatchScore(flightAircraft, token));
  }
  return max;
}

export function pickBestRateCardForFlight<
  T extends RateCardAircraftShape & { validFrom?: Date | string; updatedAt?: Date | string },
>(
  candidates: T[],
  flightAircraft: string,
  categoryOfFlight: string,
): T | null {
  const flight = flightAircraft.trim();
  const matching = candidates.filter(
    (card) =>
      rateCardMatchesFlightCategory(card, categoryOfFlight) &&
      rateCardMatchesFlightAircraft(card, flight),
  );

  if (matching.length === 0) {
    const categoryOnly = candidates.filter((card) =>
      rateCardMatchesFlightCategory(card, categoryOfFlight),
    );
    const generic = categoryOnly.filter((card) => rateCardAircraftTokens(card).length === 0);
    if (generic.length > 0) {
      return generic.sort((a, b) => {
        const rank =
          categorySpecificity(b.category, categoryOfFlight) -
          categorySpecificity(a.category, categoryOfFlight);
        if (rank !== 0) return rank;
        return String(b.validFrom).localeCompare(String(a.validFrom));
      })[0];
    }
    return null;
  }

  if (!flight) {
    return matching.sort((a, b) => {
      const rank =
        categorySpecificity(b.category, categoryOfFlight) -
        categorySpecificity(a.category, categoryOfFlight);
      if (rank !== 0) return rank;
      return String(b.validFrom).localeCompare(String(a.validFrom));
    })[0];
  }

  matching.sort((a, b) => {
    const rank =
      categorySpecificity(b.category, categoryOfFlight) -
      categorySpecificity(a.category, categoryOfFlight);
    if (rank !== 0) return rank;
    const lenDiff =
      bestTokenMatchLength(flight, rateCardAircraftTokens(b)) -
      bestTokenMatchLength(flight, rateCardAircraftTokens(a));
    if (lenDiff !== 0) return lenDiff;
    return String(b.validFrom ?? '').localeCompare(String(a.validFrom ?? ''));
  });

  return matching[0];
}
