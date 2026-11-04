/**
 * Flight type → Aircraft Master → ICAO aerodrome letter (A–F).
 * A row whose ICAO is a designator (A333) walks to a shorter parent type
 * that stores the letter. Blank ICAO uses the category code when that is a letter.
 */

export type AircraftMasterTariffRow = {
  aircraftType?: string | null;
  icaoCode?: string | null;
  categoryCode?: string | null;
  stationCode?: string | null;
};

const AERODROME_LETTER = /^[A-F]$/;

function compactType(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** B737-800 and 737-800 share a key; the Boeing "B" before digits is optional. */
function lookupKeys(raw: string): string[] {
  const compact = compactType(raw);
  const keys: string[] = [];
  const add = (key: string) => {
    if (key.length >= 3 && !keys.includes(key)) keys.push(key);
  };
  add(compact);
  add(compact.replace(/^B(?=\d)/, ''));
  return keys;
}

function aerodromeLetter(value: string | null | undefined): string {
  const text = String(value ?? '').trim().toUpperCase();
  return AERODROME_LETTER.test(text) ? text : '';
}

function rowLetter(row: AircraftMasterTariffRow): string {
  const icao = aerodromeLetter(row.icaoCode);
  if (icao) return icao;
  const icaoText = String(row.icaoCode ?? '').trim();
  if (icaoText) return '';
  return aerodromeLetter(row.categoryCode);
}

function stationBonus(row: AircraftMasterTariffRow, stationCode: string | undefined): number {
  const station = String(stationCode ?? '').trim().toUpperCase();
  const rowStation = String(row.stationCode ?? '').trim().toUpperCase();
  if (station && rowStation === station) return 20;
  return 0;
}

/**
 * ICAO letter for a flight type. Null when the master has no usable letter,
 * so billing keeps the existing type / family match.
 */
export function resolveAircraftTariffCode(
  flightAircraft: string,
  rows: AircraftMasterTariffRow[],
  stationCode?: string,
): string | null {
  const flightKeys = lookupKeys(flightAircraft);
  if (flightKeys.length === 0 || rows.length === 0) return null;

  let best: { row: AircraftMasterTariffRow; score: number; key: string } | null = null;
  for (const row of rows) {
    const keys = lookupKeys(String(row.aircraftType ?? ''));
    for (const key of keys) {
      let score = 0;
      if (flightKeys.some((flightKey) => flightKey === key)) score = 10000 + key.length;
      else if (flightKeys.some((flightKey) => flightKey.startsWith(key) && key.length >= 4)) {
        score = 1000 + key.length;
      }
      if (score <= 0) continue;
      score += stationBonus(row, stationCode);
      if (rowLetter(row)) score += 500;
      if (!best || score > best.score) best = { row, score, key };
    }
  }
  if (!best) return null;

  const direct = rowLetter(best.row);
  if (direct) return direct;

  const matchedKeys = lookupKeys(String(best.row.aircraftType ?? ''));
  let parentLetter = '';
  let parentScore = 0;
  for (const row of rows) {
    if (row === best.row) continue;
    const letter = rowLetter(row);
    if (!letter) continue;
    for (const key of lookupKeys(String(row.aircraftType ?? ''))) {
      const shared = matchedKeys.includes(key);
      const prefix = matchedKeys.some(
        (matched) => matched.startsWith(key) && key.length < matched.length && key.length >= 4,
      );
      if (!shared && !prefix) continue;
      const score = (shared ? 10000 : 0) + key.length + stationBonus(row, stationCode);
      if (score > parentScore) {
        parentScore = score;
        parentLetter = letter;
      }
    }
  }
  return parentLetter || null;
}

/** Rate-card aircraft type that is only an ICAO letter, e.g. "Code C" or "C". */
export function priceCardIsTariffCode(aircraftType: string, letter: string): boolean {
  const code = letter.trim().toUpperCase();
  if (!AERODROME_LETTER.test(code)) return false;
  const parts = aircraftType
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = parts.length > 0 ? parts : [aircraftType];
  return candidates.some((part) => {
    const compact = compactType(part);
    return (
      compact === code ||
      compact === `CODE${code}` ||
      compact === `ICAO${code}` ||
      compact === `CAT${code}` ||
      compact === `CATEGORY${code}`
    );
  });
}
