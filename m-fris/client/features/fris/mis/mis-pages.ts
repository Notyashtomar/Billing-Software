/** MIS navbar routes and permission sub-page labels (keep in sync with admin permissions). */

export type StationWiseFlightScope = 'scheduled' | 'nonScheduled';

export type MisPageDef = {
  slug: string;
  label: string;
  path: string;
  description: string;
  /**
   * Admin permission sub-page label. Defaults to `label`.
   * Use when display label differs from the ACL key (e.g. Station Wise children).
   */
  permissionLabel?: string;
  /** Scheduled vs ns_fhr (Station Wise and Month Wise). */
  flightScope?: StationWiseFlightScope;
  /** Navbar accordion group. */
  navGroup?: 'station-wise' | 'month-wise' | 'airline-wise';
};

export const MIS_PAGES: MisPageDef[] = [
  {
    slug: 'station-wise',
    label: 'Scheduled MIS Station Wise',
    permissionLabel: 'MIS Station Wise',
    path: '/fris/mis/station-wise',
    flightScope: 'scheduled',
    navGroup: 'station-wise',
    description:
      'Scheduled FHR month-wise workbook with live Excel formulas (calendar From / To).',
  },
  {
    slug: 'station-wise-ns',
    label: 'Non Schedule MIS Station Wise',
    permissionLabel: 'MIS Station Wise',
    path: '/fris/mis/station-wise-ns',
    flightScope: 'nonScheduled',
    navGroup: 'station-wise',
    description:
      'Non-scheduled FHR month-wise workbook — same layout and formulas as Scheduled.',
  },
  {
    slug: 'airline-wise',
    label: 'MIS Airline Wise Schedule',
    permissionLabel: 'MIS Airline Wise',
    path: '/fris/mis/airline-wise',
    flightScope: 'scheduled',
    navGroup: 'airline-wise',
    description:
      'Scheduled all-station airline workbooks (6E_MONTHWISE layout). Same logic as Non Schedule.',
  },
  {
    slug: 'airline-wise-ns',
    label: 'MIS Airline Wise Non Schedule',
    permissionLabel: 'MIS Airline Wise',
    path: '/fris/mis/airline-wise-ns',
    flightScope: 'nonScheduled',
    navGroup: 'airline-wise',
    description:
      'Non-scheduled all-station airline workbooks — same layout and formulas as Schedule.',
  },
  {
    slug: 'month-wise',
    label: 'MIS - Scheduled Month Wise',
    permissionLabel: 'MIS Month Wise',
    path: '/fris/mis/month-wise',
    flightScope: 'scheduled',
    navGroup: 'month-wise',
    description: 'Airline-per-month performance workbook (LH layout, Station Wise EM–FA metrics).',
  },
  {
    slug: 'month-wise-ns',
    label: 'MIS - Non Schedule Month Wise',
    permissionLabel: 'MIS Month Wise',
    path: '/fris/mis/month-wise-ns',
    flightScope: 'nonScheduled',
    navGroup: 'month-wise',
    description: 'Non-scheduled airline-per-month performance workbook — same layout as Scheduled.',
  },
  {
    slug: 'remarks',
    label: 'MIS Remarks',
    path: '/fris/mis/remarks',
    description:
      'Station-scoped airline remarks workbook (month sheets, rating summary, flight preview).',
  },
  {
    slug: 'raf',
    label: 'MIS RAF',
    path: '/fris/mis/raf',
    description: 'Ramp assistance form MIS reporting.',
  },
  {
    slug: 'bhs',
    label: 'MIS BHS',
    path: '/fris/mis/bhs',
    description: 'Baggage handling system MIS reporting.',
  },
  {
    slug: 'ads',
    label: 'MIS ADS',
    path: '/fris/mis/ads',
    description: 'ADS MIS reporting.',
  },
  {
    slug: 'mis-checker',
    label: 'MIS Checker',
    path: '/billing/mis-checker',
    description: 'Bill check hub — BHS, ADS, and RAF analysis.',
  },
];

export const MIS_DEFAULT_PATH = MIS_PAGES[0]?.path ?? '/fris/mis/station-wise';

/** Navbar accordion headings (Flights → Scheduled Airlines pattern). */
export const MIS_STATION_WISE_NAV_LABEL = 'MIS Station Wise';
export const MIS_AIRLINE_WISE_NAV_LABEL = 'MIS Airline Wise';
export const MIS_MONTH_WISE_NAV_LABEL = 'MIS Month Wise';
/** @deprecated Use MIS_STATION_WISE_NAV_LABEL */
export const MIS_MONTHWISE_NAV_LABEL = MIS_STATION_WISE_NAV_LABEL;

export const STATION_WISE_SCOPE_OPTIONS: Array<{
  slug: string;
  label: string;
  path: string;
  flightScope: StationWiseFlightScope;
}> = [
  {
    slug: 'station-wise',
    label: 'Scheduled MIS Station Wise',
    path: '/fris/mis/station-wise',
    flightScope: 'scheduled',
  },
  {
    slug: 'station-wise-ns',
    label: 'Non Schedule MIS Station Wise',
    path: '/fris/mis/station-wise-ns',
    flightScope: 'nonScheduled',
  },
];

export function getMisPageBySlug(slug: string): MisPageDef | undefined {
  return MIS_PAGES.find((page) => page.slug === slug);
}

export function misPagePermissionLabel(page: MisPageDef): string {
  return page.permissionLabel ?? page.label;
}

export function isStationWiseSlug(slug: string): boolean {
  return slug === 'station-wise' || slug === 'station-wise-ns';
}

export function isMonthWiseSlug(slug: string): boolean {
  return slug === 'month-wise' || slug === 'month-wise-ns';
}

export function isAirlineWiseSlug(slug: string): boolean {
  return slug === 'airline-wise' || slug === 'airline-wise-ns';
}

export function misNavGroupForPath(
  path: string | null | undefined,
): MisPageDef['navGroup'] {
  const p = String(path ?? '').split('?')[0];
  return MIS_PAGES.find((page) => page.path === p)?.navGroup;
}

/** Open the MIS accordion that matches the current route. Default Station Wise. */
export function misNestedNavLabelForPath(path: string | null | undefined): string {
  const group = misNavGroupForPath(path);
  if (group === 'month-wise') return MIS_MONTH_WISE_NAV_LABEL;
  if (group === 'airline-wise') return MIS_AIRLINE_WISE_NAV_LABEL;
  return MIS_STATION_WISE_NAV_LABEL;
}

export function isMisMonthwisePath(path: string | null | undefined): boolean {
  return misNavGroupForPath(path) !== undefined;
}
