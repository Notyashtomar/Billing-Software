/** Station layout profiles learned from reference ADS MIS workbooks (MAA + DEL). */

export type AdsMisLayout = 'maa' | 'del';

export type AdsMisSheetDef = {
  id: string;
  label: string;
  sheetName: string;
  description: string;
};

export type AdsMisStationProfile = {
  layout: AdsMisLayout;
  templateFile: string;
  stationLabel: string;
  sheets: AdsMisSheetDef[];
};

const MAA_ADS_SHEETS: AdsMisSheetDef[] = [
  {
    id: 'working-sheet',
    label: 'WorkingSheet',
    sheetName: 'WorkingSheet',
    description: 'Master equipment usage log, durations, and tier calculations.',
  },
  {
    id: 'exported-eq-data',
    label: 'Exported EQ Data',
    sheetName: 'Exported EQ Data',
    description: 'Raw equipment and manpower log export table.',
  },
  {
    id: 'billing-sheet',
    label: 'Billing Sheet',
    sheetName: 'Billing Sheet',
    description: 'High-level customer invoice summary and revenue totals.',
  },
  {
    id: 'check-equip',
    label: 'Check Equip',
    sheetName: 'Check Equip',
    description: 'Equipment matrix quantity breakdown per airline.',
  },
  {
    id: 'check-revenue',
    label: 'Check Revenue',
    sheetName: 'Check Revenue',
    description: 'Revenue verification matrix per equipment code.',
  },
  {
    id: 'revenue-working',
    label: 'Revenue Working',
    sheetName: 'Revenue Working',
    description: 'Monthly revenue working summary with ROE multiplier.',
  },
  {
    id: 'sheet2',
    label: 'Sheet2',
    sheetName: 'Sheet2',
    description: 'Service code summary (ADS vs BHS vs Cleaning).',
  },
  {
    id: 'check-wch',
    label: 'check for wch',
    sheetName: 'check for wch',
    description: 'WCHR / WCHC wheelchair allowance vs extra equipment check.',
  },
];

export function getAdsMisStationProfile(stationCode: string): AdsMisStationProfile {
  const code = (stationCode || '').trim().toUpperCase();
  if (code === 'DEL' || code === 'DELHI') {
    return {
      layout: 'del',
      templateFile: 'del-template.xlsx',
      stationLabel: 'Delhi',
      sheets: MAA_ADS_SHEETS,
    };
  }
  const stationLabel =
    code === 'MAA'
      ? 'Chennai'
      : code === 'IXC' || code === 'CHANDIGARH'
        ? 'Chandigarh'
        : code;
  return {
    layout: 'maa',
    templateFile: 'maa-template.xlsx',
    stationLabel,
    sheets: MAA_ADS_SHEETS,
  };
}

export function formatMisMonthTitle(fromYmd: string): string {
  const [yearStr, monthStr] = (fromYmd || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return fromYmd || '';
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatMisMonthToken(fromYmd: string): string {
  const [yearStr, monthStr] = (fromYmd || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return 'MON-YY';
  const abbr = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = abbr[month - 1];
  const shortYear = String(year).slice(-2);
  return `${monthName}-${shortYear}`;
}
