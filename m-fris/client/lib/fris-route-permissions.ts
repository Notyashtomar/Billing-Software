import { MIS_PAGES, misPagePermissionLabel } from '@/features/fris/mis/mis-pages';
import {
  ADVANCE_TAB_PERMISSION_LABEL,
  CREATION_SECTION_PERMISSION_LABEL,
  canonicalPageLabel,
  isSubPageAllowed,
  PERMISSION_NAV_DROPDOWNS,
  tabHasAnyAccess,
  type NavPermissionTabKey,
  type UserNavFlags,
} from '@/lib/nav-permissions';
import {
  getPermissionTabPageLabels,
  PERMISSION_TAB_ORDER,
  type PermissionTabKey,
} from '@/lib/permission-tab-config';

type RouteRule = {
  prefix: string;
  tab: NavPermissionTabKey;
  label: string;
};

const FLIGHT_ROUTE_RULES: RouteRule[] = [
  {
    prefix: '/fris/flights/scheduledairlines/data-export',
    tab: 'flights',
    label: 'Scheduled Data Export',
  },
  {
    prefix: '/fris/flights/non-scheduled-airlines/data-export',
    tab: 'flights',
    label: 'Non-Scheduled Data',
  },
  {
    prefix: '/fris/flights/non-scheduled-airlines/mis',
    tab: 'flights',
    label: 'MIS Non-Scheduled Flights',
  },
  {
    prefix: '/fris/flights/Non-Scheduled-Airlines',
    tab: 'flights',
    label: 'Non-Scheduled Airlines',
  },
  {
    prefix: '/fris/flights/non-scheduled-airlines',
    tab: 'flights',
    label: 'Non-Scheduled Airlines',
  },
  {
    prefix: '/fris/flights/cancellation-history',
    tab: 'flights',
    label: 'Cancellation History',
  },
  {
    prefix: '/fris/flights/flight-schedule',
    tab: 'flights',
    label: 'Flight Schedule',
  },
  {
    prefix: '/fris/flights/peak-flights',
    tab: 'flights',
    label: 'Peak Flights',
  },
  {
    prefix: '/fris/flights/ramp-assistance-forms',
    tab: 'flights',
    label: 'RAF (Ramp Assistance Forms)',
  },
  {
    prefix: '/fris/flights/scheduledairlines',
    tab: 'flights',
    label: 'Scheduled Airlines',
  },
];

const REPORT_ROUTE_RULES: RouteRule[] = [
  {
    prefix: '/fris/reports/consolidated/scheduled-fhr',
    tab: 'reports',
    label: 'Scheduled FHR Report',
  },
  {
    prefix: '/fris/reports/consolidated/non-scheduled-fhr',
    tab: 'reports',
    label: 'Non Scheduled FHR Report',
  },
  {
    prefix: '/fris/reports/pax-shift-analysis',
    tab: 'reports',
    label: 'Pax Shift Analysis Report',
  },
  { prefix: '/fris/reports/pax-shift', tab: 'reports', label: 'Pax Shift Report' },
  { prefix: '/fris/reports/ramp-shift', tab: 'reports', label: 'Ramp Shift Report' },
  { prefix: '/fris/reports/gsd-shift', tab: 'reports', label: 'GSD Shift Report' },
  { prefix: '/fris/reports/quality', tab: 'reports', label: 'Quality Report' },
  {
    prefix: '/fris/reports/missing-fhr',
    tab: 'reports',
    label: 'Missing FHR Report',
  },
  { prefix: '/fris/reports/delay', tab: 'reports', label: 'Delay Report' },
  {
    prefix: '/fris/reports/cleaning-services',
    tab: 'reports',
    label: 'Cleaning Services',
  },
];

/**
 * Routes every authenticated FRIS user may open regardless of admin-assigned
 * nav permission flags (e.g. their own profile). Matched as exact path or a
 * sub-path (`/fris/profile/...`).
 */
const ALWAYS_ALLOWED_FRIS_PREFIXES: readonly string[] = ['/fris/profile'];

function isAlwaysAllowedFrisRoute(pathname: string): boolean {
  return ALWAYS_ALLOWED_FRIS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const SORTED_ROUTE_RULES: RouteRule[] = [
  ...REPORT_ROUTE_RULES,
  ...FLIGHT_ROUTE_RULES,
  ...MIS_PAGES.map((page) => ({
    prefix: page.path,
    tab: 'mis' as const,
    label: misPagePermissionLabel(page),
  })),
].sort((a, b) => b.prefix.length - a.prefix.length);

const LANDING_CANDIDATES: Array<{ path: string; tab: NavPermissionTabKey; label: string }> = [
  { path: '/fris/dashboard', tab: 'dashboard', label: 'Dashboard page' },
  {
    path: '/fris/creation?section=scheduled-airlines',
    tab: 'creation',
    label: 'Scheduled Airlines',
  },
  {
    path: '/fris/creation?section=additional-flights',
    tab: 'creation',
    label: 'Additional Flights',
  },
  { path: '/fris/creation?section=raf', tab: 'creation', label: 'RAF' },
  { path: '/fris/advance?tab=gateway', tab: 'advance', label: 'Gateway' },
  {
    path: '/fris/advance?tab=schedule',
    tab: 'advance',
    label: 'Schedule Setup',
  },
  {
    path: '/fris/advance?tab=schedule-equipment',
    tab: 'advance',
    label: 'Schedule Equipment Setup',
  },
  { path: '/fris/advance?tab=cargo', tab: 'advance', label: 'Cargo' },
  {
    path: '/fris/advance?tab=gh-representative',
    tab: 'advance',
    label: 'GH Representative',
  },
  { path: '/fris/advance?tab=invoicing', tab: 'advance', label: 'Invoicing' },
  { path: '/fris/advance?tab=alert', tab: 'advance', label: 'Alert Setup' },
  { path: '/fris/flights/scheduledairlines', tab: 'flights', label: 'Scheduled Airlines' },
  {
    path: '/fris/flights/scheduledairlines/data-export',
    tab: 'flights',
    label: 'Scheduled Data Export',
  },
  {
    path: '/fris/flights/cancellation-history',
    tab: 'flights',
    label: 'Cancellation History',
  },
  {
    path: '/fris/flights/Non-Scheduled-Airlines',
    tab: 'flights',
    label: 'Non-Scheduled Airlines',
  },
  {
    path: '/fris/flights/flight-schedule',
    tab: 'flights',
    label: 'Flight Schedule',
  },
  { path: '/fris/flights/peak-flights', tab: 'flights', label: 'Peak Flights' },
  {
    path: '/fris/flights/ramp-assistance-forms',
    tab: 'flights',
    label: 'RAF (Ramp Assistance Forms)',
  },
  ...MIS_PAGES.map((page) => ({
    path: page.path,
    tab: 'mis' as const,
    label: misPagePermissionLabel(page),
  })),
];

function matchRouteRule(pathname: string): RouteRule | undefined {
  return SORTED_ROUTE_RULES.find((rule) => pathname.startsWith(rule.prefix));
}

function parsePathAndSearch(pathWithSearch: string): {
  pathname: string;
  searchParams: URLSearchParams;
} {
  const [pathname, search = ''] = pathWithSearch.split('?');
  return {
    pathname: pathname || '/',
    searchParams: new URLSearchParams(search),
  };
}

export function isFrisRouteAllowed(
  pathname: string,
  flags: UserNavFlags,
  searchParams?: URLSearchParams | null,
  options?: { appAccess?: string[] | null },
): boolean {
  if (pathname.startsWith('/billing')) {
    if (isSubPageAllowed(flags, 'advance', 'Invoicing')) return true;
    // Admin BWMS tools → Billing tile grant (stationAppAccess billing-finance).
    if (
      Array.isArray(options?.appAccess) &&
      options.appAccess.includes('billing-finance')
    ) {
      return true;
    }
    return false;
  }

  if (!pathname.startsWith('/fris')) {
    return true;
  }

  if (isAlwaysAllowedFrisRoute(pathname)) {
    return true;
  }

  if (pathname === '/fris' || pathname === '/fris/') {
    return Object.values(flags).some(
      (tabFlags) =>
        tabFlags &&
        typeof tabFlags === 'object' &&
        Object.values(tabFlags as Record<string, number>).some((v) => v === 1),
    );
  }

  if (pathname === '/fris/dashboard') {
    return isSubPageAllowed(flags, 'dashboard', 'Dashboard page');
  }

  if (pathname.startsWith('/fris/creation')) {
    const section = searchParams?.get('section')?.trim();
    if (!section) {
      return tabHasAnyAccess(flags, 'creation');
    }
    const label = CREATION_SECTION_PERMISSION_LABEL[section];
    return label ? isSubPageAllowed(flags, 'creation', label) : false;
  }

  if (pathname.startsWith('/fris/advance')) {
    const tab = searchParams?.get('tab')?.trim();
    if (!tab) {
      return tabHasAnyAccess(flags, 'advance');
    }
    const label = ADVANCE_TAB_PERMISSION_LABEL[tab];
    return label ? isSubPageAllowed(flags, 'advance', label) : false;
  }

  if (pathname === '/fris/reports') {
    return tabHasAnyAccess(flags, 'reports');
  }

  const matched = matchRouteRule(pathname);
  if (matched) {
    return isSubPageAllowed(flags, matched.tab, matched.label);
  }

  return false;
}

export function isFrisPathAllowedFromUrl(
  pathWithSearch: string,
  flags: UserNavFlags,
  options?: { appAccess?: string[] | null },
): boolean {
  const { pathname, searchParams } = parsePathAndSearch(pathWithSearch);
  return isFrisRouteAllowed(pathname, flags, searchParams, options);
}

const PERMISSION_LABEL_DEFAULT_PATHS: Partial<
  Record<NavPermissionTabKey, Record<string, string>>
> = {
  dashboard: Object.fromEntries(
    PERMISSION_NAV_DROPDOWNS.dashboard.map((item) => [item.label, item.path]),
  ),
  creation: Object.fromEntries(
    PERMISSION_NAV_DROPDOWNS.creation.map((item) => [item.label, item.path]),
  ),
  advance: Object.fromEntries(
    PERMISSION_NAV_DROPDOWNS.advance.map((item) => [item.label, item.path]),
  ),
  flights: Object.fromEntries([
    ...FLIGHT_ROUTE_RULES.map((rule) => [rule.label, rule.prefix] as const),
    ['Scheduled Airlines', '/fris/flights/scheduledairlines'],
    ['Non-Scheduled Airlines', '/fris/flights/Non-Scheduled-Airlines'],
    ['Non scheduled Booking', '/fris/flights/non-scheduled-airlines/non-scheduled-booking'],
    ['Booking Details', '/fris/flights/non-scheduled-airlines/booking-details'],
    [
      'Non-Scheduled Cancellation History',
      '/fris/flights/non-scheduled-airlines/cancellation-history',
    ],
    ['MIS Scheduled Flights', '/fris/flights/scheduledairlines/mis'],
  ]),
  reports: Object.fromEntries(
    REPORT_ROUTE_RULES.map((rule) => [rule.label, rule.prefix] as const),
  ),
  mis: Object.fromEntries(
    MIS_PAGES.filter(
      (page, index, all) =>
        all.findIndex((other) => misPagePermissionLabel(other) === misPagePermissionLabel(page)) ===
        index,
    ).map((page) => [misPagePermissionLabel(page), page.path] as const),
  ),
  others: {
    Billing: '/billing/insights/payables',
  },
};

function resolveDefaultPathForPermissionLabel(
  tab: NavPermissionTabKey,
  pageLabel: string,
): string | null {
  const key = canonicalPageLabel(pageLabel);
  return PERMISSION_LABEL_DEFAULT_PATHS[tab]?.[key] ?? null;
}

/** First allowed FRIS page in admin tab order (Dashboard → … → Others). */
function getFirstAllowedFrisPathInTabOrder(flags: UserNavFlags): string | null {
  for (const tab of PERMISSION_TAB_ORDER as PermissionTabKey[]) {
    if (!tabHasAnyAccess(flags, tab)) continue;

    for (const label of getPermissionTabPageLabels(tab)) {
      if (!isSubPageAllowed(flags, tab, label)) continue;
      const path = resolveDefaultPathForPermissionLabel(tab, label);
      if (path) return path;
    }
  }

  if (tabHasAnyAccess(flags, 'reports')) {
    return '/fris/reports';
  }

  return null;
}

export function resolveLandingPathFromAccessSubPages(
  accessSubPages: Record<string, string[]>,
): string | null {
  for (const tab of PERMISSION_TAB_ORDER as PermissionTabKey[]) {
    const pages = accessSubPages[tab] ?? [];
    for (const label of pages) {
      const path = resolveDefaultPathForPermissionLabel(tab, label);
      if (path) return path;
    }
  }
  return null;
}

export function getDefaultFrisLandingPath(
  flags: UserNavFlags | null,
  permissionScope?: { accessSubPages?: Record<string, string[]> } | null,
): string {
  const scopedPages = permissionScope?.accessSubPages;
  if (scopedPages && Object.keys(scopedPages).length > 0) {
    const fromScope = resolveLandingPathFromAccessSubPages(scopedPages);
    if (fromScope) return fromScope;
  }

  if (typeof window !== 'undefined') {
    const storedLanding = localStorage.getItem('userLandingPath')?.trim();
    if (storedLanding?.startsWith('/') && !storedLanding.startsWith('//')) {
      return storedLanding;
    }
  }

  if (!flags || Object.keys(flags).length === 0) {
    return '/fris/flights/scheduledairlines';
  }

  for (const candidate of LANDING_CANDIDATES) {
    if (isSubPageAllowed(flags, candidate.tab, candidate.label)) {
      return candidate.path;
    }
  }

  const firstAllowed = getFirstAllowedFrisPathInTabOrder(flags);
  if (firstAllowed) {
    return firstAllowed;
  }

  return '/fris/profile';
}

/** Reject protocol-relative and other unsafe post-login redirect targets. */
export function isSafeRelativeRedirect(path: string): boolean {
  const value = String(path ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || value.includes('@')) return false;
  return true;
}
