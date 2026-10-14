import type { IndiaAirportRecord } from '../data/india-airports';
import { INDIA_AIRPORTS } from '../data/india-airports';
import type { StationRecord } from './stationAnalyticsMock';

export type LoginStationQuery = {
  stationCode: string;
  stationName: string;
  stationCity: string;
};

/** Virtual FRIS station. Not an airport and not on the station map. */
export const TESTING_STATION_CODE = 'TEST';
export const TESTING_STATION_NAME = 'Testing Station';
export const TESTING_STATION_CITY = 'Testing';

export function isTestingStationCode(
  stationCode: string | null | undefined,
): boolean {
  const code = String(stationCode ?? '')
    .trim()
    .toUpperCase()
    .split('-')[0];
  return code === TESTING_STATION_CODE;
}

export function testingStationQuery(): LoginStationQuery {
  return {
    stationCode: TESTING_STATION_CODE,
    stationName: TESTING_STATION_NAME,
    stationCity: TESTING_STATION_CITY,
  };
}

/** Login URL for the sidebar Testing FRIS entry. */
export function buildTestingStationLoginUrl(): string {
  const params = new URLSearchParams({
    stationCode: TESTING_STATION_CODE,
    stationName: TESTING_STATION_NAME,
    stationCity: TESTING_STATION_CITY,
  });
  return `/login?${params.toString()}`;
}

/** Resolve display name/city from airport master so code never pairs with a wrong city. */
export function resolveStationDisplayByCode(
  stationCode: string | undefined | null,
): LoginStationQuery | null {
  const code = String(stationCode ?? '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  if (isTestingStationCode(code)) return testingStationQuery();
  const airport = INDIA_AIRPORTS.find(
    (a) => a.stationCode.trim().toUpperCase() === code,
  );
  if (!airport) {
    return {
      stationCode: code,
      stationName: code,
      stationCity: code,
    };
  }
  return {
    stationCode: code,
    stationName: airport.airport.trim() || airport.city.trim() || code,
    stationCity: airport.city.trim() || airport.airport.trim() || code,
  };
}

/**
 * Prefer airport-master city/name for a code. Keeps caller label only when no
 * master row exists (custom / unknown stations).
 */
export function coalesceStationDisplay(
  stationCode: string | undefined | null,
  fallbackName?: string | null,
  fallbackCity?: string | null,
): LoginStationQuery | null {
  const fromMaster = resolveStationDisplayByCode(stationCode);
  if (!fromMaster) return null;
  if (isTestingStationCode(fromMaster.stationCode)) return fromMaster;
  const airport = INDIA_AIRPORTS.find(
    (a) => a.stationCode.trim().toUpperCase() === fromMaster.stationCode,
  );
  if (airport) return fromMaster;
  const name = String(fallbackName ?? '').trim();
  const city = String(fallbackCity ?? '').trim();
  return {
    stationCode: fromMaster.stationCode,
    stationName: name || city || fromMaster.stationCode,
    stationCity: city || name || fromMaster.stationCode,
  };
}

export function buildLoginStationUrl(airport: Pick<
  IndiaAirportRecord,
  'stationCode' | 'airport' | 'city'
>): string {
  const params = new URLSearchParams({
    stationCode: airport.stationCode.trim(),
    stationName: airport.airport.trim(),
    stationCity: airport.city.trim(),
  });
  return `/login?${params.toString()}`;
}

export function parseLoginStationQuery(
  searchParams: Pick<URLSearchParams, 'get'>,
): LoginStationQuery | null {
  const stationCode = searchParams.get('stationCode')?.trim() ?? '';
  if (!stationCode) return null;
  if (isTestingStationCode(stationCode)) return testingStationQuery();

  const fromMaster = resolveStationDisplayByCode(stationCode);
  if (fromMaster) {
    // Always trust airport master for known IATA codes — ignore stale
    // stationName/city query params (e.g. IXC + "New Delhi").
    const known = INDIA_AIRPORTS.some(
      (a) => a.stationCode.trim().toUpperCase() === fromMaster.stationCode,
    );
    if (known) return fromMaster;
  }

  return {
    stationCode: stationCode.toUpperCase(),
    stationName:
      searchParams.get('stationName')?.trim() ||
      searchParams.get('stationCity')?.trim() ||
      stationCode,
    stationCity: searchParams.get('stationCity')?.trim() || '',
  };
}

/** True when login URL includes a station from the map (or legacy stationId). */
export function hasLoginStationContext(
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  if (searchParams.get('stationCode')?.trim()) return true;
  if (searchParams.get('stationId')?.trim()) return true;
  return false;
}

const SESSION_REASONS = new Set(['expired', 'forbidden']);

/** True when `/login` should render (station pick, post-logout, return URL, or session message). */
export function hasLoginPageContext(
  searchParams: Pick<URLSearchParams, 'get'>,
): boolean {
  if (searchParams.get('logout') === '1') return true;
  if (hasLoginStationContext(searchParams)) return true;
  if (searchParams.get('next')?.trim()) return true;
  const reason = searchParams.get('reason')?.trim().toLowerCase() ?? '';
  return SESSION_REASONS.has(reason);
}

/** Query param on `/` to skip the landing intro (logout, change station from login). */
export const SKIP_LANDING_INTRO_PARAM = 'skipIntro';

/** Session flag: skip landing intro when returning from login to pick a station. */
export const SKIP_LANDING_INTRO_KEY = 'fris.skipLandingIntro';

/** SSR-safe: read skip-intro from request search params. */
export function shouldSkipLandingIntroFromSearchParams(
  searchParams: Pick<URLSearchParams, 'get'> | Record<string, string | string[] | undefined>,
): boolean {
  if ('get' in searchParams && typeof searchParams.get === 'function') {
    return searchParams.get(SKIP_LANDING_INTRO_PARAM) === '1';
  }
  const raw = (searchParams as Record<string, string | string[] | undefined>)[
    SKIP_LANDING_INTRO_PARAM
  ];
  if (typeof raw === 'string') return raw.trim() === '1';
  if (Array.isArray(raw)) return raw[0]?.trim() === '1';
  return false;
}

/** Home map path used when changing station from login. */
export function buildLandingMapSelectUrl(): string {
  return `/?${SKIP_LANDING_INTRO_PARAM}=1`;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_]+/g, '-');
}

function pickBestStationMatch(matches: StationRecord[]): StationRecord | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) => a.code.localeCompare(b.code))[0] ?? null;
}

/**
 * Known IATA codes, cities, and name aliases for stations in the Bird network.
 * Covers regional naming differences (e.g. Trichy vs Tiruchirappalli, Bangalore vs Bengaluru, etc.).
 */
export const AIRPORT_STATION_ALIASES: Record<
  string,
  { code: string; names: string[]; cities: string[]; codes?: string[] }
> = {
  TRZ: {
    code: 'TRZ',
    names: ['tiruchirappalli', 'tiruchirapalli', 'trichy', 'tiruchi'],
    cities: ['trichy', 'tiruchirappalli', 'tiruchirapalli', 'tiruchi'],
    codes: ['TRZ', 'TIR', 'TRICHY'],
  },
  BLR: {
    code: 'BLR',
    names: ['kempegowda', 'bengaluru', 'bangalore'],
    cities: ['bengaluru', 'bangalore'],
    codes: ['BLR', 'BAN'],
  },
  BOM: {
    code: 'BOM',
    names: ['chhatrapati shivaji', 'mumbai', 'bombay'],
    cities: ['mumbai', 'bombay'],
    codes: ['BOM', 'MUM'],
  },
  MAA: {
    code: 'MAA',
    names: ['chennai', 'madras', 'meenambakkam'],
    cities: ['chennai', 'madras'],
    codes: ['MAA', 'CHE'],
  },
  DEL: {
    code: 'DEL',
    names: ['indira gandhi', 'delhi', 'new delhi'],
    cities: ['delhi', 'new delhi'],
    codes: ['DEL', 'NDLS'],
  },
  TRV: {
    code: 'TRV',
    names: ['thiruvananthapuram', 'trivandrum'],
    cities: ['trivandrum', 'thiruvananthapuram'],
    codes: ['TRV', 'TVM'],
  },
  COK: {
    code: 'COK',
    names: ['cochin', 'kochi', 'nedumbassery'],
    cities: ['kochi', 'cochin'],
    codes: ['COK', 'KOC'],
  },
  CJB: {
    code: 'CJB',
    names: ['coimbatore', 'peelamedu'],
    cities: ['coimbatore'],
    codes: ['CJB', 'COI'],
  },
  IXC: {
    code: 'IXC',
    names: ['chandigarh', 'mohali'],
    cities: ['chandigarh', 'mohali'],
    codes: ['IXC', 'CHD'],
  },
  GOI: {
    code: 'GOI',
    names: ['goa', 'dabolim', 'mopa', 'manohar'],
    cities: ['goa', 'dabolim', 'mopa'],
    codes: ['GOI', 'GOX', 'GOA'],
  },
  IXA: {
    code: 'IXA',
    names: ['agartala', 'maharaja bir bikram'],
    cities: ['agartala'],
    codes: ['IXA', 'AGA'],
  },
  IMF: {
    code: 'IMF',
    names: ['imphal', 'bir tikendrajit'],
    cities: ['imphal'],
    codes: ['IMF', 'IMP'],
  },
  DXN: {
    code: 'DXN',
    names: ['noida', 'jewar'],
    cities: ['noida', 'jewar'],
    codes: ['DXN', 'NOI'],
  },
  AGR: {
    code: 'AGR',
    names: ['agra', 'kheria'],
    cities: ['agra'],
    codes: ['AGR'],
  },
  VAJJ: {
    code: 'VAJJ',
    names: ['juhu'],
    cities: ['juhu', 'mumbai'],
    codes: ['VAJJ', 'JUH'],
  },
  HYD: {
    code: 'HYD',
    names: ['rajiv gandhi', 'hyderabad', 'shamshabad'],
    cities: ['hyderabad'],
    codes: ['HYD'],
  },
  AMD: {
    code: 'AMD',
    names: ['sardar vallabhbhai', 'ahmedabad', 'ahmadabad'],
    cities: ['ahmedabad', 'ahmadabad'],
    codes: ['AMD', 'AHM'],
  },
  LKO: {
    code: 'LKO',
    names: ['chaudhary charan singh', 'lucknow', 'amausi'],
    cities: ['lucknow'],
    codes: ['LKO', 'LUC'],
  },
  IXE: {
    code: 'IXE',
    names: ['mangalore', 'mangaluru', 'bajpe'],
    cities: ['mangalore', 'mangaluru'],
    codes: ['IXE', 'MNG'],
  },
  CCU: {
    code: 'CCU',
    names: ['netaji subhash', 'kolkata', 'calcutta', 'dum dum'],
    cities: ['kolkata', 'calcutta'],
    codes: ['CCU', 'KOL'],
  },
};

/** Match landing-map airport code (e.g. DEL, TRZ) to an admin-stations record (e.g. TRZ-01, TIR-01). */
export function findAdminStationForAirportCode(
  stations: StationRecord[],
  stationCode: string,
  hints?: Pick<LoginStationQuery, 'stationName' | 'stationCity'>,
): StationRecord | null {
  if (!stations || stations.length === 0) return null;
  const rawTarget = String(stationCode ?? '').trim();
  if (!rawTarget && !hints?.stationCity && !hints?.stationName) return null;

  const prefix = normalizeCode(rawTarget);

  // Direct ObjectId match (when stationCode is already a Mongo id)
  if (rawTarget) {
    const directIdMatch = stations.find((s) => s.id === rawTarget);
    if (directIdMatch) return directIdMatch;
  }

  // Look up aliases for the requested code / city / name
  const aliasEntry =
    (prefix ? AIRPORT_STATION_ALIASES[prefix] : undefined) ??
    Object.values(AIRPORT_STATION_ALIASES).find((entry) => {
      const city = hints?.stationCity?.trim().toLowerCase();
      if (city && entry.cities.includes(city)) return true;
      const name = hints?.stationName?.trim().toLowerCase();
      if (name && entry.names.some((n) => name.includes(n))) return true;
      if (prefix && (entry.code === prefix || entry.codes?.includes(prefix))) return true;
      return false;
    });

  const acceptedCodes = new Set<string>();
  if (prefix) acceptedCodes.add(prefix);
  if (aliasEntry) {
    acceptedCodes.add(aliasEntry.code);
    aliasEntry.codes?.forEach((c) => acceptedCodes.add(c));
  }

  // 1. Match by explicit station.stationCode field
  const stationCodeMatches = stations.filter((station) => {
    if (!station.stationCode) return false;
    const sc = normalizeCode(station.stationCode);
    return acceptedCodes.has(sc);
  });
  const stationCodeMatch = pickBestStationMatch(stationCodeMatches);
  if (stationCodeMatch) return stationCodeMatch;

  // 2. Match by station.code (exact, prefix with hyphen, or delimiter-separated)
  const codeMatches = stations.filter((station) => {
    const code = normalizeCode(station.code);
    if (!code) return false;
    for (const target of acceptedCodes) {
      if (
        code === target ||
        code.startsWith(`${target}-`) ||
        code.startsWith(target) ||
        code.endsWith(`-${target}`) ||
        code.includes(`-${target}-`)
      ) {
        return true;
      }
    }
    return false;
  });
  const codeMatch = pickBestStationMatch(codeMatches);
  if (codeMatch) return codeMatch;

  // 3. Match by City (exact and alias groups)
  const targetCity = hints?.stationCity?.trim().toLowerCase();
  const acceptedCities = new Set<string>();
  if (targetCity) acceptedCities.add(targetCity);
  if (aliasEntry) {
    aliasEntry.cities.forEach((c) => acceptedCities.add(c.toLowerCase()));
  }

  if (acceptedCities.size > 0) {
    const cityMatches = stations.filter((station) => {
      const city = station.city?.trim().toLowerCase();
      return city ? acceptedCities.has(city) : false;
    });
    const cityMatch = pickBestStationMatch(cityMatches);
    if (cityMatch) return cityMatch;
  }

  // 4. Match by Name (exact, substring, or alias keywords)
  const targetName = hints?.stationName?.trim().toLowerCase();
  const nameKeywords = new Set<string>();
  if (targetName) nameKeywords.add(targetName);
  if (aliasEntry) {
    aliasEntry.names.forEach((n) => nameKeywords.add(n.toLowerCase()));
  }

  if (nameKeywords.size > 0) {
    const nameMatches = stations.filter((station) => {
      const stationName = station.name?.trim().toLowerCase() ?? '';
      if (!stationName) return false;
      if (
        targetName &&
        (stationName === targetName ||
          stationName.includes(targetName) ||
          targetName.includes(stationName))
      ) {
        return true;
      }
      for (const kw of nameKeywords) {
        if (stationName.includes(kw)) return true;
      }
      return false;
    });
    const nameMatch = pickBestStationMatch(nameMatches);
    if (nameMatch) return nameMatch;
  }

  return null;
}
