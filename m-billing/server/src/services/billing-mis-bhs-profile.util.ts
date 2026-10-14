import { previousCalendarMonth } from './billing-mis-bhs-reco-skd.util';

/** Station layout profiles learned from reference BHS MIS workbooks (MAA + DEL). */

export type BhsMisLayout = 'maa' | 'del';

export type BhsMisSheetDef = {
  id: string;
  label: string;
  sheetName: string;
  description: string;
};

export type BhsMisStationProfile = {
  layout: BhsMisLayout;
  templateFile: string;
  stationLabel: string;
  sheets: BhsMisSheetDef[];
  revSummarySheet: string;
  recoSheet: string;
  projSheet: string;
  scheduleSheet?: string;
};

const MAA_SHEETS: BhsMisSheetDef[] = [
  {
    id: 'schedule-fris',
    label: 'Schedule-FRIS',
    sheetName: 'Schedule-FRIS',
    description: 'Weekly schedule pattern from FRIS / advance gateway.',
  },
  {
    id: 'proj-skd',
    label: 'Proj_Skd',
    sheetName: 'Proj_Skd',
    description: 'Daily scheduled-flight counts by IATA airline × TypeCraft.',
  },
  {
    id: 'reco-skd',
    label: 'Reco_skd',
    sheetName: 'Reco_skd',
    description: 'Schedule reconciliation from Advance setup + closed flights.',
  },
  {
    id: 'addl-xxld',
    label: 'Addl & XXLD Flt',
    sheetName: 'Addl & XXLD Flt',
    description: 'Additional and cancelled / XXLD flights for the month.',
  },
  {
    id: 'delay-working',
    label: 'Delay Working',
    sheetName: 'Delay Working',
    description: 'Delay charge working sheet (formula-driven).',
  },
  {
    id: 'delay-flt',
    label: 'Delay Flt',
    sheetName: 'Delay Flt',
    description: 'Delay flight summary linked to working sheet.',
  },
  {
    id: 'rev-summary',
    label: 'Rev_summary',
    sheetName: 'Rev_summary',
    description: 'Revenue summary vs billed BHS invoices.',
  },
];

const DEL_SHEETS: BhsMisSheetDef[] = [
  {
    id: 'fris-data',
    label: 'FRIS Data',
    sheetName: 'FRIS Data',
    description: 'FRIS operational extract (Delhi layout).',
  },
  {
    id: 'fris-data-1',
    label: 'FRIS Data_1',
    sheetName: 'FRIS Data_1',
    description: 'Primary FRIS flight dump for reconciliation.',
  },
  {
    id: 'fris-data-2',
    label: 'FRIS Data_2',
    sheetName: 'FRIS Data_2',
    description: 'Secondary FRIS operational dump.',
  },
  {
    id: 'proj-skd',
    label: 'Proj_Skd',
    sheetName: 'Proj_Skd',
    description: 'Daily scheduled-flight counts by IATA airline × TypeCraft.',
  },
  {
    id: 'reco-skd',
    label: 'Reco_Skd',
    sheetName: 'Reco_Skd',
    description: 'Schedule reconciliation from Advance setup + closed flights.',
  },
  {
    id: 'addl-xxld',
    label: 'Addl & XXLD Flt',
    sheetName: 'Addl & XXLD Flt',
    description: 'Additional and cancelled / XXLD flights for the month.',
  },
  {
    id: 'delay-flt',
    label: 'Delay Flt',
    sheetName: 'Delay Flt',
    description: 'Delay flight summary.',
  },
  {
    id: 'ceiling-rates',
    label: 'Ceiling Rates',
    sheetName: 'Ceiling Rates',
    description: 'Ceiling rate reference (Delhi).',
  },
  {
    id: 'rev-summary',
    label: 'Rev_Summary',
    sheetName: 'Rev_Summary',
    description: 'Revenue summary vs billed BHS invoices.',
  },
];

const STATION_OVERRIDES: Record<string, Partial<BhsMisStationProfile>> = {
  MAA: { stationLabel: 'Chennai' },
  DEL: { stationLabel: 'Delhi' },
  IXC: { stationLabel: 'Chandigarh' },
  CHANDIGARH: { stationLabel: 'Chandigarh' },
};

export function resolveBhsMisLayout(stationCode: string): BhsMisLayout {
  const code = String(stationCode ?? '').trim().toUpperCase();
  return code === 'DEL' ? 'del' : 'maa';
}

export function getBhsMisStationProfile(stationCode: string): BhsMisStationProfile {
  const code = String(stationCode ?? '').trim().toUpperCase() || 'STN';
  const layout = resolveBhsMisLayout(code);
  const override = STATION_OVERRIDES[code] ?? {};

  if (layout === 'del') {
    return {
      layout,
      templateFile: 'del-template.xlsx',
      stationLabel: override.stationLabel ?? code,
      sheets: DEL_SHEETS,
      revSummarySheet: 'Rev_Summary',
      recoSheet: 'Reco_Skd',
      projSheet: 'Proj_Skd',
    };
  }

  return {
    layout,
    templateFile: 'maa-template.xlsx',
    stationLabel: override.stationLabel ?? code,
    sheets: MAA_SHEETS,
    revSummarySheet: 'Rev_summary',
    recoSheet: 'Reco_skd',
    projSheet: 'Proj_Skd',
    scheduleSheet: 'Schedule-FRIS',
  };
}

const TITLE_MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Delhi Rev_Summary title stamp. 2026-08-01 → Aug' 26 */
export function formatDelhiRevTitleMonth(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(fromYmd ?? '').trim());
  if (!match) return '';
  const abbr = TITLE_MONTH_ABBR[Number(match[2]) - 1];
  if (!abbr) return '';
  return `${abbr}' ${match[1].slice(2)}`;
}

const DELHI_REV_TITLE_MONTH = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'\s?\d{2}\b/i;

/** Swap the template month in the Rev_Summary banner. Leaves the rest of the title as-is. */
export function stampDelhiRevSummaryTitle(title: string, fromYmd: string): string {
  const stamp = formatDelhiRevTitleMonth(fromYmd);
  if (!stamp) return title;
  return title.replace(DELHI_REV_TITLE_MONTH, stamp);
}

/** e.g. 2026-05-01 → MAY-26 */
export function formatMisMonthToken(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(fromYmd ?? '').trim());
  if (!match) return 'MON-YY';
  const year = match[1].slice(2);
  const monthIndex = Number(match[2]) - 1;
  const abbr = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ][monthIndex] ?? 'MON';
  return `${abbr}-${year}`;
}

export type DelhiRevSummaryHeaders = {
  flightOf: string;
  invoiceAmount: string;
  invoiceInr: string;
  prevInr: string;
  prevOnly: string;
};

/** Delhi Rev_Summary headers. August 2026 → previous month July 2026. */
export function delhiRevSummaryHeaders(fromYmd: string): DelhiRevSummaryHeaders {
  const current = formatMisMonthTitle(fromYmd);
  const previous = formatMisMonthTitle(previousCalendarMonth(fromYmd).from);
  return {
    flightOf: `Flight of ${previous}`,
    invoiceAmount: `Actual Invoice Amount for ${current}`,
    invoiceInr: `Actual Invoice Amount in INR for ${current}`,
    prevInr: `Amount of ${previous} in INR`,
    prevOnly: `Adjusted Revenue of ${previous}`,
  };
}

/** Keep status cards to sheets that exist in the station workbook, in workbook order. */
export function workbookSheetDefs(
  defs: BhsMisSheetDef[],
  workbookSheetNames: string[],
): BhsMisSheetDef[] {
  const allowed = new Set(workbookSheetNames);
  return defs
    .filter((def) => allowed.has(def.sheetName))
    .sort(
      (a, b) =>
        workbookSheetNames.indexOf(a.sheetName) - workbookSheetNames.indexOf(b.sheetName),
    );
}

export function formatMisMonthTitle(fromYmd: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(fromYmd ?? '').trim());
  if (!match) return 'Selected month';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const monthName = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][monthIndex] ?? 'Month';
  return `${monthName} ${year}`;
}
