const KNOWN_CITY_OR_NAME_TO_IATA: Record<string, string> = {
  trichy: 'TRZ',
  tiruchirappalli: 'TRZ',
  tiruchirapalli: 'TRZ',
  tiruchi: 'TRZ',
  tir: 'TRZ',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  kempegowda: 'BLR',
  mumbai: 'BOM',
  bombay: 'BOM',
  chennai: 'MAA',
  madras: 'MAA',
  delhi: 'DEL',
  'new delhi': 'DEL',
  trivandrum: 'TRV',
  thiruvananthapuram: 'TRV',
  kochi: 'COK',
  cochin: 'COK',
  coimbatore: 'CJB',
  chandigarh: 'IXC',
  mohali: 'IXC',
  goa: 'GOI',
  dabolim: 'GOI',
  mopa: 'GOI',
  agartala: 'IXA',
  imphal: 'IMF',
  noida: 'DXN',
  jewar: 'DXN',
  agra: 'AGR',
  juhu: 'VAJJ',
  hyderabad: 'HYD',
  ahmedabad: 'AMD',
  ahmadabad: 'AMD',
  lucknow: 'LKO',
  mangalore: 'IXE',
  mangaluru: 'IXE',
  kolkata: 'CCU',
  calcutta: 'CCU',
};

/**
 * Resolve the canonical clean IATA station code (e.g. `DEL`, `IXC`, `MAA`, `TRZ`).
 *
 * Prefers canonical IATA resolution from explicit `stationCode`, then known
 * city / name / code aliases (e.g. `Trichy` / `Tiruchirappalli` -> `TRZ`),
 * then falls back to the registry `code` prefix (e.g. `DEL-01` -> `DEL`).
 */
export function deriveStationCode(input: {
  stationCode?: string | null;
  code?: string | null;
  city?: string | null;
  name?: string | null;
}): string {
  const explicit = String(input.stationCode ?? '').trim().toUpperCase();

  // If explicit stationCode matches a known 3-4 letter IATA code or alias
  if (explicit) {
    const mapped = KNOWN_CITY_OR_NAME_TO_IATA[explicit.toLowerCase()];
    if (mapped) return mapped;
    if (/^[A-Z]{3,4}$/.test(explicit)) return explicit;
  }

  // Check city against known aliases
  const cityKey = String(input.city ?? '').trim().toLowerCase();
  if (cityKey && KNOWN_CITY_OR_NAME_TO_IATA[cityKey]) {
    return KNOWN_CITY_OR_NAME_TO_IATA[cityKey];
  }

  // Check name against known aliases
  const nameKey = String(input.name ?? '').trim().toLowerCase();
  if (nameKey) {
    for (const [kw, iata] of Object.entries(KNOWN_CITY_OR_NAME_TO_IATA)) {
      if (nameKey.includes(kw)) {
        return iata;
      }
    }
  }

  // Check code prefix against known aliases
  const code = String(input.code ?? '').trim();
  if (code) {
    const prefix = (code.split('-')[0] ?? code).trim().toLowerCase();
    if (KNOWN_CITY_OR_NAME_TO_IATA[prefix]) {
      return KNOWN_CITY_OR_NAME_TO_IATA[prefix];
    }
    if (explicit) return explicit;
    return prefix.toUpperCase();
  }

  if (explicit) return explicit;
  return '';
}
