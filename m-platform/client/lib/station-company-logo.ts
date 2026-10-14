import { INDIA_AIRPORTS } from '@/data/india-airports';
import { resolveStationDisplayByCode } from '@/lib/login-station-constants';

export type StationCompanyBrand = 'BFS' | 'BAS' | 'GSEC';

export const STATION_COMPANY_LOGOS: Record<StationCompanyBrand, string> = {
  BFS: '/BFS.png',
  BAS: '/BAS.png',
  GSEC: '/GSEC.png',
};

const DEFAULT_BRAND: StationCompanyBrand = 'BAS';

/** Canonical city → company brand (login map stations). */
const CITY_TO_BRAND: Record<string, StationCompanyBrand> = {
  delhi: 'BFS',
  kochi: 'BFS',
  agra: 'BFS',
  noida: 'BFS',
  juhu: 'BFS',
  trichy: 'BAS',
  coimbatore: 'BAS',
  imphal: 'BAS',
  agartala: 'BAS',
  goa: 'BAS',
  chandigarh: 'BAS',
  chennai: 'BAS',
  trivandrum: 'GSEC',
  thiruvananthapuram: 'GSEC',
};

const CODE_TO_BRAND = new Map<string, StationCompanyBrand>();

for (const airport of INDIA_AIRPORTS) {
  const cityKey = normalizeStationCity(airport.city);
  const brand = CITY_TO_BRAND[cityKey];
  if (brand) {
    CODE_TO_BRAND.set(airport.stationCode.trim().toUpperCase(), brand);
  }
}

export function normalizeStationCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ');
}

function companyNameToBrand(company: string): StationCompanyBrand | null {
  const value = company.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('gsec')) return 'GSEC';
  if (value.includes('bird flight')) return 'BFS';
  if (value.includes('bird airport')) return 'BAS';
  return null;
}

export type StationLogoInput = {
  city?: string | null;
  stationCode?: string | null;
  company?: string | null;
};

export function resolveStationCompanyBrand(input?: StationLogoInput): StationCompanyBrand {
  if (!input) return DEFAULT_BRAND;

  const city = normalizeStationCity(input.city ?? '');
  if (city && CITY_TO_BRAND[city]) return CITY_TO_BRAND[city];

  const code = String(input.stationCode ?? '')
    .trim()
    .toUpperCase();
  if (code && CODE_TO_BRAND.has(code)) {
    return CODE_TO_BRAND.get(code)!;
  }

  const fromCompany = companyNameToBrand(String(input.company ?? ''));
  if (fromCompany) return fromCompany;

  return DEFAULT_BRAND;
}

export function resolveStationLogoPath(input?: StationLogoInput): string {
  return STATION_COMPANY_LOGOS[resolveStationCompanyBrand(input)];
}

export function getStoredLoginStationContext(): StationLogoInput {
  if (typeof window === 'undefined') return {};
  return {
    city: localStorage.getItem('userStationCity') ?? undefined,
    stationCode: localStorage.getItem('userStationCode') ?? undefined,
  };
}

export function getSessionStationLogoPath(): string {
  return resolveStationLogoPath(getStoredLoginStationContext());
}

/**
 * The IATA/station code of the station the user is currently logged in to,
 * uppercased. Used on flight reports (FHR, GSE, Team) so the station code is
 * always the active session's station, never a hardcoded value. Falls back to
 * the legacy station (`MAA`) only when no station context is available.
 */
export function getSessionStationCode(): string {
  const code = String(getStoredLoginStationContext().stationCode ?? '')
    .trim()
    .toUpperCase();
  return code || 'MAA';
}

/**
 * Active session's station as `{ airport, code }` for display (e.g.
 * "Indira Gandhi International Airport" + "DEL"). Resolves from the **login
 * station code** first so a stale city in localStorage cannot win.
 */
export function getSessionStationLabel(): { airport: string; code: string } | null {
  const ctx = getStoredLoginStationContext();
  const code = String(ctx.stationCode ?? '')
    .trim()
    .toUpperCase();
  const fromMaster = resolveStationDisplayByCode(code);
  if (fromMaster) {
    const match = INDIA_AIRPORTS.find(
      (a) => a.stationCode.trim().toUpperCase() === fromMaster.stationCode,
    );
    return {
      airport:
        String(match?.airport ?? '').trim() ||
        fromMaster.stationName ||
        fromMaster.stationCity ||
        fromMaster.stationCode,
      code: fromMaster.stationCode,
    };
  }

  const cityRaw = String(ctx.city ?? '').trim();
  const cityMatch = cityRaw
    ? INDIA_AIRPORTS.find(
        (a) => normalizeStationCity(a.city) === normalizeStationCity(cityRaw),
      )
    : undefined;
  const airport = (cityMatch?.airport ?? '').trim() || cityRaw;
  const finalCode =
    code || (cityMatch?.stationCode ?? '').trim().toUpperCase();
  if (!airport && !finalCode) return null;
  return { airport: airport || finalCode, code: finalCode };
}

/**
 * Navbar / profile line: `Chennai (MAA)` from the logged-in station code.
 * Never pairs a stale city with a different code.
 */
export function formatLoginStationDisplay(input?: StationLogoInput): string {
  const code = String(input?.stationCode ?? '')
    .trim()
    .toUpperCase();
  const fromMaster = resolveStationDisplayByCode(code);
  if (fromMaster) {
    const city = fromMaster.stationCity.trim();
    if (city && city !== fromMaster.stationCode) {
      return `${city} (${fromMaster.stationCode})`;
    }
    return fromMaster.stationCode;
  }
  const city = String(input?.city ?? '').trim();
  if (city && code) return `${city} (${code})`;
  if (city) return city;
  return code || '—';
}

/**
 * Header lines for printable schedule views: legal company + `Station-XXX`
 * from the logged-in station (never hardcoded MAA).
 */
export function getSessionStationHeader(): {
  companyName: string;
  stationLine: string;
  stationCode: string;
} {
  const ctx = getStoredLoginStationContext();
  const code = String(ctx.stationCode ?? '')
    .trim()
    .toUpperCase();
  const match = code
    ? INDIA_AIRPORTS.find((a) => a.stationCode.trim().toUpperCase() === code)
    : undefined;

  const stationCode = code || getSessionStationCode();
  const companyName =
    String(match?.company ?? '').trim() ||
    String(ctx.company ?? '').trim() ||
    'Bird Airport Services Private Limited';

  return {
    companyName,
    stationLine: `Station-${stationCode}`,
    stationCode,
  };
}

export function persistLoginStationContext(ctx: {
  stationCode?: string | null;
  stationCity?: string | null;
}): void {
  if (typeof window === 'undefined') return;

  const code = String(ctx.stationCode ?? '').trim().toUpperCase();
  const fallbackCity = String(ctx.stationCity ?? '').trim();

  // Only write when provided — never wipe an existing login station with blanks
  // (callers often pass '' for unknown city after prepareFrisLogin clears storage).
  if (code) {
    localStorage.setItem('userStationCode', code);
    // Airport master wins so profile never shows e.g. "New Delhi (MAA)".
    const fromMaster = resolveStationDisplayByCode(code);
    const resolvedCity =
      (fromMaster &&
      INDIA_AIRPORTS.some(
        (a) => a.stationCode.trim().toUpperCase() === fromMaster.stationCode,
      )
        ? fromMaster.stationCity
        : '') || fallbackCity;
    if (resolvedCity) {
      localStorage.setItem('userStationCity', resolvedCity);
    }
    return;
  }

  if (fallbackCity) localStorage.setItem('userStationCity', fallbackCity);
}
