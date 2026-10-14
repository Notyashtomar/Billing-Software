/**
 * Admin panel permission tabs — grouped sections mirror FRIS app navigation.
 * Keep in sync with `server/src/user/utils/permissions-to-flags.ts`.
 */

export type PermissionTabKey =
  | 'dashboard'
  | 'creation'
  | 'advance'
  | 'flights'
  | 'reports'
  | 'mis';

export type PermissionSection = {
  /** Stored permission key. Must stay stable for existing grants. */
  label: string;
  /** FRIS navbar label when it differs from the stored key. */
  title?: string;
  parts?: { label: string; title?: string }[];
};

export type PermissionTabConfig = {
  label: string;
  sections: PermissionSection[];
};

export const PERMISSION_TAB_CONFIG: Record<PermissionTabKey, PermissionTabConfig> = {
  dashboard: {
    label: 'Dashboard',
    sections: [
      {
        label: 'Dashboard page',
        title: 'Scheduled Flights & Non scheduled flights',
      },
    ],
  },
  creation: {
    label: 'Creation',
    sections: [
      { label: 'Scheduled Airlines' },
      { label: 'Additional Flights' },
      { label: 'RAF' },
    ],
  },
  advance: {
    label: 'Advance',
    sections: [
      {
        label: 'Gateway',
        parts: [
          { label: 'Scheduled Airlines' },
          { label: 'Airline' },
          { label: 'Aircraft' },
          { label: 'Equipment' },
          { label: 'Manpower' },
          { label: 'Staff' },
          { label: 'Airline Contact' },
          { label: 'Logo of Airline' },
          { label: 'Raf Airline' },
          { label: 'Non Scheduled Airline' },
          { label: 'Terminal' },
          { label: 'Other Services' },
          { label: 'DCS Master' },
          { label: 'Aircraft Registration' },
          { label: 'AMS Services' },
        ],
      },
      { label: 'Schedule Setup' },
      { label: 'Schedule Equipment Setup' },
      {
        label: 'Cargo',
        parts: [
          { label: 'Create New Cargo Airline' },
          { label: 'Create New Scheduled' },
          { label: 'Services' },
          { label: 'Flight Creation' },
          { label: 'Unit Master' },
        ],
      },
      { label: 'GH Representative' },
      {
        label: 'Invoicing',
        parts: [
          { label: 'Scheduled Flight Data' },
          { label: 'Cleaning Services' },
          { label: 'Non Scheduled Flight Data' },
          { label: 'MAAS Services' },
          { label: 'RAF (Ramp Assistance Forms)' },
          { label: 'Cancel Scheduled Flight Data' },
          { label: 'Cancel Non Scheduled Flight Data' },
          { label: 'Handling Status Report' },
        ],
      },
      { label: 'Alert Setup' },
    ],
  },
  flights: {
    label: 'Flights',
    sections: [
      {
        label: 'Scheduled Airlines',
        parts: [
          { label: 'FHR Report', title: 'FHR' },
          { label: 'GSE Report', title: 'GSE' },
          { label: 'Team Report', title: 'Team' },
          { label: 'Scheduled Data Export' },
          { label: 'MIS Scheduled Flights' },
          { label: 'Cancellation History' },
        ],
      },
      {
        label: 'Non-Scheduled Airlines',
        parts: [
          { label: 'Non scheduled Booking' },
          { label: 'Booking Details' },
          { label: 'Non-Scheduled Data' },
          { label: 'MIS Non-Scheduled Flights' },
          { label: 'Non-Scheduled Cancellation History' },
        ],
      },
      { label: 'Flight Schedule' },
      { label: 'Peak Flights' },
      { label: 'RAF (Ramp Assistance Forms)', title: 'Ramp Assistance Forms' },
    ],
  },
  reports: {
    label: 'Reports',
    sections: [
      { label: 'Pax Shift Report' },
      { label: 'Pax Shift Analysis Report' },
      { label: 'Ramp Shift Report' },
      { label: 'GSD Shift Report' },
      { label: 'Quality Report' },
      { label: 'Missing FHR Report' },
      { label: 'Delay Report' },
      { label: 'Cleaning Services' },
      {
        label: 'Consolidated Report',
        parts: [
          { label: 'Scheduled FHR Report', title: 'Scheduled FHR, GSE & Team Report' },
          { label: 'Non Scheduled FHR Report', title: 'Non Scheduled FHR, GSE & Team Report' },
        ],
      },
    ],
  },
  mis: {
    label: 'MIS',
    sections: [
      {
        label: 'MIS Station Wise',
        title: 'Scheduled MIS Station Wise & Non Schedule MIS Station Wise',
      },
      { label: 'MIS Airline Wise' },
      {
        label: 'MIS Month Wise',
        title: 'MIS - Scheduled Month Wise & MIS - Non Schedule Month Wise',
      },
      { label: 'MIS Remarks' },
      { label: 'MIS RAF' },
      { label: 'MIS BHS' },
      { label: 'MIS ADS' },
      { label: 'MIS Checker' },
    ],
  },
};

/** Scheduled Airlines row buttons. Labels must match server `PERMISSION_SUB_PAGES.flights`. */
export const SCHEDULED_AIRLINE_REPORT_BUTTONS = [
  'FHR Report',
  'GSE Report',
  'Team Report',
] as const;

/**
 * Stored on the flights list once an admin sets those three buttons explicitly.
 * Absent + Scheduled Airlines on means the older grant (all three buttons).
 */
export const SCHEDULED_REPORT_BUTTONS_CHOICE = 'Scheduled Report Button Choice';

export function implyScheduledReportButtonGrants(pages: string[]): string[] {
  const hasParent = pages.includes('Scheduled Airlines');
  const explicit =
    pages.includes(SCHEDULED_REPORT_BUTTONS_CHOICE) ||
    SCHEDULED_AIRLINE_REPORT_BUTTONS.some((label) => pages.includes(label));
  if (!hasParent || explicit) return pages;
  return [...pages, ...SCHEDULED_AIRLINE_REPORT_BUTTONS];
}

/** Matches the FRIS navbar: Dashboard, Creation, Advance, Flights, Reports, MIS. */
export const PERMISSION_TAB_ORDER: PermissionTabKey[] = [
  'dashboard',
  'creation',
  'advance',
  'flights',
  'reports',
  'mis',
];

export function pageDisplayName(page: { label: string; title?: string }): string {
  return page.title?.trim() || page.label;
}

export function getSectionPageLabels(section: PermissionSection): string[] {
  const labels = !section.parts?.length
    ? [section.label]
    : [section.label, ...section.parts.map((part) => part.label)];
  return [...new Set(labels)];
}

export function getPermissionTabPageLabels(tab: PermissionTabKey): string[] {
  return PERMISSION_TAB_CONFIG[tab].sections.flatMap((section) => getSectionPageLabels(section));
}
