/**
 * Parent aircraft matching: rate card "A320" applies when the flight string
 * contains that token (e.g. A320-800, B737/A320). Longer tokens win (B737 MAX before B737).
 */

function compactAircraft(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** IATA equipment codes used on FHR rows → the marketing type stored on rate cards. */
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

export function aircraftTokenMatchesFlight(
  flightAircraft: string,
  token: string,
): boolean {
  const haystack = canonicalAircraft(flightAircraft);
  const needle = canonicalAircraft(token);
  return needle.length > 0 && haystack.includes(needle);
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

function bestTokenMatchLength(flightAircraft: string, tokens: string[]): number {
  let max = 0;
  for (const token of tokens) {
    if (aircraftTokenMatchesFlight(flightAircraft, token)) {
      max = Math.max(max, compactAircraft(token).length);
    }
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
