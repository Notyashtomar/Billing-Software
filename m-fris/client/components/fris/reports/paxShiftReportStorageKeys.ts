type StashableFlight = { slNo?: string };

/** One report-view flight for the tab. Replaced when another flight is opened. */
export const PAX_SHIFT_REPORT_VIEW_KEY = 'fris-pax-shift-report-view-flight';

const PAX_SHIFT_PREFIX = 'fris-pax-shift-';

const EMPLOYEE_SECTION_IDS = [
  'staff-on-duty',
  'sick-leave',
  'casual-leave',
  'comp-off',
  'annual-leave',
  'absence',
  'chk-in-staff-d',
  'chk-in-staff-n',
  'csh-in-staff-d',
  'csh-in-staff-n',
  'mhb-staff-d',
  'mhb-staff-n',
  'short-shipped-bag',
  'flight-details',
] as const;

/** Session snapshot written when the user clicks Save on Flight Details (flight handling form). */
export function paxShiftFlightHandlingStorageKey(flightSerial: string): string {
  const s = String(flightSerial ?? '').trim() || 'unknown';
  return `fris-pax-shift-flight-handling-${s}`;
}

export function paxShiftEmployeeStorageKey(flightSerial: string, sectionId: string): string {
  const serial = String(flightSerial ?? '').trim() || 'unknown';
  return `fris-pax-shift-emp-${serial}-${sectionId}`;
}

export function paxShiftShortShippedStorageKey(flightSerial: string): string {
  const serial = String(flightSerial ?? '').trim() || 'unknown';
  return `fris-pax-shift-ssb-${serial}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

function serialOfKey(key: string): string | null {
  const handlingPrefix = 'fris-pax-shift-flight-handling-';
  if (key.startsWith(handlingPrefix)) return key.slice(handlingPrefix.length);
  const empPrefix = 'fris-pax-shift-emp-';
  if (key.startsWith(empPrefix)) {
    const rest = key.slice(empPrefix.length);
    for (const sectionId of EMPLOYEE_SECTION_IDS) {
      const suffix = `-${sectionId}`;
      if (rest.endsWith(suffix)) return rest.slice(0, -suffix.length);
    }
  }
  const ssbPrefix = 'fris-pax-shift-ssb-';
  if (key.startsWith(ssbPrefix)) return key.slice(ssbPrefix.length);
  const legacyViewPrefix = 'fris-pax-shift-report-view-flight-';
  if (key.startsWith(legacyViewPrefix)) return key.slice(legacyViewPrefix.length);
  return null;
}

/** Drop every pax-shift scratch key except the flight currently open. */
export function retainPaxShiftSessionForSerial(
  flightSerial: string,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  const serial = String(flightSerial ?? '').trim();
  if (!serial) return;
  for (const key of storageKeys(storage)) {
    if (!key.startsWith(PAX_SHIFT_PREFIX)) continue;
    if (key === PAX_SHIFT_REPORT_VIEW_KEY) continue;
    const owner = serialOfKey(key);
    if (owner && owner !== serial) storage.removeItem(key);
  }
}

/** Drop all pax-shift scratch when the report date changes. */
export function clearPaxShiftSessionScratch(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  for (const key of storageKeys(storage)) {
    if (key.startsWith(PAX_SHIFT_PREFIX)) storage.removeItem(key);
  }
}

export function paxShiftReportViewHref(flightSerial: string): string {
  const serial = String(flightSerial ?? '').trim();
  return `/fris/reports/pax-shift/report/${encodeURIComponent(serial)}`;
}

/** Cache the one open flight before navigating to the report view. */
export function stashPaxShiftReportViewFlight(
  flight: StashableFlight,
  storage: Storage | null = browserStorage(),
): boolean {
  const serial = String(flight.slNo ?? '').trim();
  if (!serial || !storage) return false;
  try {
    retainPaxShiftSessionForSerial(serial, storage);
    storage.setItem(PAX_SHIFT_REPORT_VIEW_KEY, JSON.stringify(flight));
    return true;
  } catch {
    return false;
  }
}

export function readPaxShiftReportViewFlight(
  flightSerial: string,
  storage: Storage | null = browserStorage(),
): StashableFlight | null {
  if (!storage) return null;
  const wanted = String(flightSerial ?? '').trim();
  if (!wanted) return null;
  try {
    const raw = storage.getItem(PAX_SHIFT_REPORT_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StashableFlight;
    if (!parsed || typeof parsed !== 'object') return null;
    if (String(parsed.slNo ?? '').trim() !== wanted) return null;
    return parsed;
  } catch {
    return null;
  }
}
