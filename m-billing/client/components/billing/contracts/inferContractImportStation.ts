const IATA = /^[A-Z]{3}$/;
const SKIP_TOKENS = new Set([
  'SGHA',
  'ADS',
  'BHS',
  'USD',
  'INR',
  'DOM',
  'INT',
  'ALL',
  'THE',
  'AND',
  'AIR',
]);

/** IX-MAA-SGHA-… / BHS-6E-HYD → station IATA, or null. */
export function inferStationFromContractNumber(contractNumber: string): string | null {
  const parts = String(contractNumber ?? '')
    .toUpperCase()
    .split(/[-_/.\s]+/)
    .filter(Boolean);
  if (parts.length >= 2 && IATA.test(parts[1]) && !SKIP_TOKENS.has(parts[1])) {
    return parts[1];
  }
  if (parts.length >= 3 && IATA.test(parts[2]) && !SKIP_TOKENS.has(parts[2])) {
    return parts[2];
  }
  const hit = parts.find((p) => IATA.test(p) && !SKIP_TOKENS.has(p));
  return hit ?? null;
}

/** MAA-all-airlines-contract-import-20260815.xlsx → MAA */
export function inferStationFromImportFileName(name: string): string | null {
  const base = String(name ?? '')
    .replace(/\.[^.]+$/, '')
    .toUpperCase()
    .trim();
  const allAirlines = base.match(/^([A-Z]{3})-ALL-AIRLINES/);
  if (allAirlines?.[1]) return allAirlines[1];
  const leading = base.match(/^([A-Z]{3})[-_]/);
  if (leading?.[1] && !SKIP_TOKENS.has(leading[1])) return leading[1];
  return null;
}

export function collectImportStations(
  contractNumbers: string[],
  fileName?: string,
): string[] {
  const set = new Set<string>();
  for (const n of contractNumbers) {
    const s = inferStationFromContractNumber(n);
    if (s) set.add(s);
  }
  const fromFile = fileName ? inferStationFromImportFileName(fileName) : null;
  if (fromFile) set.add(fromFile);
  return [...set];
}

/**
 * Import may only write the logged-in station.
 * A MAA workbook while logged into HYD must be rejected (no HYD copies).
 */
export function contractImportStationMismatch(
  loginStation: string,
  contractNumbers: string[],
  fileName?: string,
): string | null {
  const login = String(loginStation ?? '').trim().toUpperCase();
  if (!login) return null;
  const stations = collectImportStations(contractNumbers, fileName);
  if (stations.length === 0) return null;
  if (stations.length > 1) {
    return `This file has contracts for more than one station (${stations.join(', ')}). Import only a file for ${login}.`;
  }
  if (stations[0] !== login) {
    return `This file is for ${stations[0]}. You are logged into ${login}. Switch station to ${stations[0]} to import — it will not copy rates onto ${login}.`;
  }
  return null;
}
