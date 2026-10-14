import type { UserFlags } from '../schema/user.schema';

/** Mirrors `client/lib/permission-tab-config.ts` (flattened section + part labels). */
export const PERMISSION_SUB_PAGES: Record<string, string[]> = {
  dashboard: ['Dashboard page'],
  creation: ['Scheduled Airlines', 'Additional Flights', 'RAF'],
  advance: [
    'Gateway',
    'Scheduled Airlines',
    'Airline',
    'Aircraft',
    'Equipment',
    'Manpower',
    'Staff',
    'Airline Contact',
    'Logo of Airline',
    'Raf Airline',
    'Non Scheduled Airline',
    'Terminal',
    'Other Services',
    'DCS Master',
    'Aircraft Registration',
    'AMS Services',
    'Schedule Setup',
    'Schedule Equipment Setup',
    'Cargo',
    'Create New Cargo Airline',
    'Create New Scheduled',
    'Services',
    'Flight Creation',
    'Unit Master',
    'GH Representative',
    'Invoicing',
    'Scheduled Flight Data',
    'Cleaning Services',
    'Non Scheduled Flight Data',
    'MAAS Services',
    'RAF (Ramp Assistance Forms)',
    'Cancel Scheduled Flight Data',
    'Cancel Non Scheduled Flight Data',
    'Handling Status Report',
    'Alert Setup',
  ],
  flights: [
    'Scheduled Airlines',
    'FHR Report',
    'GSE Report',
    'Team Report',
    'Scheduled Data Export',
    'MIS Scheduled Flights',
    'Cancellation History',
    'Non-Scheduled Airlines',
    'Non scheduled Booking',
    'Booking Details',
    'Non-Scheduled Data',
    'MIS Non-Scheduled Flights',
    'Non-Scheduled Cancellation History',
    'Flight Schedule',
    'Peak Flights',
    'RAF (Ramp Assistance Forms)',
  ],
  reports: [
    'Pax Shift Report',
    'Pax Shift Analysis Report',
    'Ramp Shift Report',
    'GSD Shift Report',
    'Quality Report',
    'Missing FHR Report',
    'Delay Report',
    'Cleaning Services',
    'Consolidated Report',
    'Scheduled FHR Report',
    'Non Scheduled FHR Report',
  ],
  mis: [
    'MIS Station Wise',
    'MIS Airline Wise',
    'MIS Month Wise',
    'MIS Remarks',
    'MIS RAF',
    'MIS BHS',
    'MIS ADS',
    'MIS Checker',
  ],
};

export function buildDepartmentRecord(
  department: string,
  subDepartment?: string,
): Record<string, string> {
  const key =
    department
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'general';
  const value = (subDepartment?.trim() || 'general').toLowerCase().replace(/\s+/g, '_');
  return { [key]: value };
}

export function normalizeAccessSubPages(
  accessTabs: string[] = [],
  accessSubPages: Record<string, string[]> = {},
): Record<string, string[]> {
  const result = { ...accessSubPages };
  for (const tab of accessTabs) {
    if (!result[tab]?.length && PERMISSION_SUB_PAGES[tab]) {
      result[tab] = [...PERMISSION_SUB_PAGES[tab]];
    }
  }
  return result;
}

/** Keep only explicitly selected sub-pages (no tab auto-expansion). */
export function prunePermissionSelection(input: {
  accessTabs?: string[];
  accessSubPages?: Record<string, string[]>;
}): { accessTabs: string[]; accessSubPages: Record<string, string[]> } {
  const accessSubPages: Record<string, string[]> = {};
  for (const [tab, pages] of Object.entries(input.accessSubPages ?? {})) {
    const selected = (pages ?? []).map((page) => page.trim()).filter(Boolean);
    if (selected.length > 0) {
      accessSubPages[tab] = selected;
    }
  }

  const accessTabs = Object.keys(accessSubPages);
  return { accessTabs, accessSubPages };
}

const SCHEDULED_AIRLINE_REPORT_BUTTONS = [
  'FHR Report',
  'GSE Report',
  'Team Report',
] as const;

/** Must match the client marker in `permission-tab-config.ts`. */
const SCHEDULED_REPORT_BUTTONS_CHOICE = 'Scheduled Report Button Choice';

/**
 * Older accounts granted "Scheduled Airlines" before FHR / GSE / Team had their
 * own toggles. Leave those flag keys absent so the navbar still shows all three
 * buttons. An explicit choice (any button saved, or the choice marker) writes 0/1.
 */
function applyScheduledReportButtonFlags(
  nested: Record<string, number>,
  selectedPages: string[],
): void {
  const selected = new Set(selectedPages);
  const explicit =
    selected.has(SCHEDULED_REPORT_BUTTONS_CHOICE) ||
    SCHEDULED_AIRLINE_REPORT_BUTTONS.some((label) => selected.has(label));
  const parentOn = selected.has('Scheduled Airlines');
  for (const label of SCHEDULED_AIRLINE_REPORT_BUTTONS) {
    if (selected.has(label)) nested[label] = 1;
    else if (explicit || !parentOn) nested[label] = 0;
    else delete nested[label];
  }
}

export function buildFlagsFromPermissions(
  accessSubPages: Record<string, string[]>,
): UserFlags {
  const flags: UserFlags = {};

  for (const [tabKey, allPages] of Object.entries(PERMISSION_SUB_PAGES)) {
    const selectedPages = accessSubPages[tabKey] ?? [];
    const selected = new Set(selectedPages);
    const nested: Record<string, number> = {};
    for (const page of allPages) {
      nested[page] = selected.has(page) ? 1 : 0;
    }
    if (tabKey === 'flights') {
      applyScheduledReportButtonFlags(nested, selectedPages);
    }
    flags[tabKey] = nested;
  }

  return flags;
}
