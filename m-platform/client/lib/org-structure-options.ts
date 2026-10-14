import { LANDING_STATION_OPTIONS } from '@/data/india-airports';
import type { StationRecord } from '@/lib/stationAnalyticsMock';
import {
  buildSearchableSelectOptions,
  dedupeSelectOptions,
  matchCanonicalOption,
} from '@/lib/searchable-select-other';

/**
 * Canonical department / sub-department lists for admin user, invite, and filter forms.
 * Sub-departments align with FRIS permission keys (e.g. operations → ramp).
 */

export const DEPARTMENT_SUB_DEPARTMENTS = {
  Operations: [
    'Ramp',
    'Passenger',
    'Cargo',
    'GSD',
    'NSOP',
    'Load Control',
    'Customer Care',
    'GSE & Equipment',
    'Baggage',
    'Check-in',
    'Turnaround Coordination',
  ],
  Administration: ['HR and Admin', 'Time Office', 'General Administration'],
  Security: ['Security', 'Vigilance'],
  'Safety & Quality': ['Safety', 'Quality'],
  'Finance & Accounts': ['Finance', 'Accounts'],
  Stores: ['Store', 'Inventory'],
  Management: ['Management'],
  MIS: ['MIS'],
  Booking: ['Non scheduled Booking', 'Booking Details'],
} as const;

export type DepartmentOption = keyof typeof DEPARTMENT_SUB_DEPARTMENTS;

export const DEPARTMENT_OPTIONS: DepartmentOption[] = Object.keys(
  DEPARTMENT_SUB_DEPARTMENTS,
) as DepartmentOption[];

/** Free-text entry when the canonical list does not apply. */
export const FORM_OTHER_OPTION = 'Other';

/** Bundled fallback when the companies API is unavailable. */
export const ADMIN_COMPANIES_FALLBACK = [
  'Bird Flight Services (India) Pvt. Ltd.',
  'GlobeGround India Pvt. Ltd.',
  'GSEC Bird Airport Services Pvt. Ltd.',
  'Bird Airport Services (Trichy) Pvt. Ltd.',
  'Bird Airport Services (Coimbatore) Pvt. Ltd.',
  'Bird Airport Services (Imphal) Pvt. Ltd.',
  'Bird Airport Services (Agartala) Pvt. Ltd.',
  'Bird Airport Services (Konkan) Pvt. Ltd.',
  'Bird Airport Services (Mohali) Pvt. Ltd.',
  'Bird Airport Services (Chennai) Private Limited',
] as const;

/** @deprecated Use fetchCompanyOptions() — kept for legacy imports. */
export const COMPANY_OPTIONS = ADMIN_COMPANIES_FALLBACK;

export function resolveDepartmentKey(department: string): DepartmentOption | null {
  const trimmed = department.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return null;

  if ((DEPARTMENT_OPTIONS as readonly string[]).includes(trimmed)) {
    return trimmed as DepartmentOption;
  }

  const normalized = trimmed.toLowerCase();
  const matched = DEPARTMENT_OPTIONS.find((key) => key.toLowerCase() === normalized);
  return matched ?? null;
}

export function matchSubDepartmentOption(
  subDepartment: string,
  options: readonly string[],
): string | null {
  const trimmed = subDepartment.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return null;

  const exact = options.find((option) => option === trimmed);
  if (exact) return exact;

  const normalized = trimmed.toLowerCase();
  const caseInsensitive = options.find((option) => option.toLowerCase() === normalized);
  return caseInsensitive ?? null;
}

export function getSubDepartmentOptions(department: string): string[] {
  const key = resolveDepartmentKey(department);
  if (!key) return [];
  return [...DEPARTMENT_SUB_DEPARTMENTS[key]];
}

export function buildDepartmentFilterOptions(existingFromEmployees: string[]) {
  const known = new Set<string>(DEPARTMENT_OPTIONS);
  const extra = existingFromEmployees.filter(
    (value) => value && value !== '—' && !known.has(value),
  );
  return ['All Departments', ...DEPARTMENT_OPTIONS, ...extra];
}

export function normalizeStationFilterKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const head = trimmed.split(/\s*[—–-]\s*/)[0]?.trim() ?? trimmed;
  return head.toUpperCase();
}

export function matchesStationFilter(
  recordStation: string | undefined,
  filterStation: string,
): boolean {
  if (!filterStation || filterStation === 'All Stations') return true;
  const record = recordStation?.trim();
  if (!record || record === '—') return false;
  if (record === filterStation) return true;
  return normalizeStationFilterKey(record) === normalizeStationFilterKey(filterStation);
}

export function buildStationFilterOptions(
  adminStations: readonly (Pick<StationRecord, 'code' | 'name' | 'city'> & {
    stationCode?: string;
  })[],
  existingFromEmployees: string[],
): string[] {
  const labels = new Set<string>();
  for (const station of adminStations) {
    const label = formatAdminStationLabel(station);
    if (label) labels.add(label);
  }
  for (const value of existingFromEmployees) {
    const trimmed = value?.trim();
    if (trimmed && trimmed !== '—') labels.add(trimmed);
  }
  return ['All Stations', ...Array.from(labels).sort((a, b) => a.localeCompare(b))];
}

function resolveStationDisplayCode(
  station: Pick<StationRecord, 'code' | 'name'> & { stationCode?: string },
): string {
  const registryCode = station.stationCode?.trim();
  if (registryCode) return registryCode.toUpperCase();
  const head = station.code.trim().split(/\s*-\s*/)[0]?.trim() ?? '';
  return head.toUpperCase();
}

/** IATA / registry code used for billing filters and stationCode fields. */
export function resolveAdminStationCode(
  station: Pick<StationRecord, 'code' | 'name' | 'city'> & { stationCode?: string },
): string {
  return resolveStationDisplayCode(station);
}

/** Registration / login label: `CODE — airport name`. */
export function formatAdminStationLabel(
  station: Pick<StationRecord, 'code' | 'name' | 'city'> & { stationCode?: string },
): string {
  const code = resolveStationDisplayCode(station);
  const airportName = station.name.trim();
  if (!code) return airportName;
  if (!airportName || airportName.toUpperCase() === code) return code;
  return `${code} — ${airportName}`;
}

/** Station picker options sourced from admin Stations registry (login-options API). */
export function buildStationFormOptionsFromAdminStations(
  stations: readonly (Pick<StationRecord, 'code' | 'name' | 'city'> & { stationCode?: string })[],
  currentStation?: string,
): string[] {
  const labels = dedupeSelectOptions(
    stations.map((station) => formatAdminStationLabel(station)).filter(Boolean),
  ).sort((a, b) => a.localeCompare(b));

  return buildSearchableSelectOptions(labels, {
    includeOther: true,
    currentValue: currentStation,
  });
}

/** Legacy landing-page station labels (prefer admin registry via buildStationFormOptionsFromAdminStations). */
export function buildStationFormOptions(currentStation?: string): string[] {
  const options = [...LANDING_STATION_OPTIONS];
  const current = currentStation?.trim();
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return options;
}

export function buildCompanyFormOptions(
  companies: readonly string[],
  currentCompany?: string,
): string[] {
  const deduped = dedupeSelectOptions(companies).sort((a, b) => a.localeCompare(b));
  return buildSearchableSelectOptions(deduped, {
    includeOther: true,
    currentValue: currentCompany,
  });
}

export function buildDepartmentFormOptions(currentDepartment?: string): string[] {
  return buildSearchableSelectOptions([...DEPARTMENT_OPTIONS], {
    includeOther: true,
    currentValue: currentDepartment,
  });
}

export function buildSubDepartmentFormOptions(
  department: string,
  currentSubDepartment?: string,
): string[] {
  const base = getSubDepartmentOptions(department);
  const current = currentSubDepartment?.trim();
  const canonical = current ? matchCanonicalOption(current, base) : null;

  return buildSearchableSelectOptions(base, {
    includeOther: true,
    currentValue: canonical ? undefined : current,
  });
}

/** Clear sub-department only when the department changes and the value cannot apply. */
export function reconcileSubDepartment(
  department: string,
  subDepartment: string,
  previousDepartment?: string,
): string {
  const trimmedSub = subDepartment.trim();
  if (!trimmedSub) return '';

  const options = getSubDepartmentOptions(department);
  const matched = options.length ? matchSubDepartmentOption(trimmedSub, options) : null;
  if (matched) return matched;

  const deptUnchanged =
    previousDepartment !== undefined &&
    resolveDepartmentKey(previousDepartment) === resolveDepartmentKey(department);

  if (!options.length || deptUnchanged) {
    return trimmedSub;
  }

  return '';
}

export function normalizeSubDepartmentForDepartment(
  department: string,
  subDepartment: string,
): string {
  const trimmed = subDepartment.trim();
  if (!trimmed || trimmed === FORM_OTHER_OPTION) return trimmed;
  const options = getSubDepartmentOptions(department);
  return matchSubDepartmentOption(trimmed, options) ?? trimmed;
}

export function stringsToSearchableOptions(
  values: readonly string[],
): { id: string; label: string }[] {
  return values.map((value) => ({ id: value, label: value }));
}
