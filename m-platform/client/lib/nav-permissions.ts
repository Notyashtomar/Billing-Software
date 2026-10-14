/**
 * Maps FRIS navbar items to admin-panel permission tabs (see PERMISSION_TAB_CONFIG).
 * Flags shape matches server `buildFlagsFromPermissions` output.
 */
import {
  hasAssignedFrisFlags,
  isFrisElevatedRole,
  normalizeFrisUserRole,
} from '@/lib/fris-session';
import { isUniversalSuperadminSession } from '@/lib/universal-superadmin';
export type UserNavFlags = Record<string, number | Record<string, number>>;

export type NavPermissionTabKey =
  | 'dashboard'
  | 'creation'
  | 'advance'
  | 'flights'
  | 'reports'
  | 'mis'
  | 'others';

/** Top-level navbar label → permission tab key */
export const NAV_LABEL_TO_TAB: Record<string, NavPermissionTabKey> = {
  Dashboard: 'dashboard',
  Creation: 'creation',
  Advance: 'advance',
  Flights: 'flights',
  Reports: 'reports',
  MIS: 'mis',
  Others: 'others',
};

/** Navbar dropdown entries for permission-only top-level sections */
export const PERMISSION_NAV_DROPDOWNS: Record<
  'dashboard' | 'creation' | 'advance',
  { label: string; path: string }[]
> = {
  dashboard: [{ label: 'Dashboard page', path: '/fris/dashboard' }],
  creation: [
    { label: 'Scheduled Airlines', path: '/fris/creation?section=scheduled-airlines' },
    { label: 'Additional Flights', path: '/fris/creation?section=additional-flights' },
    { label: 'RAF', path: '/fris/creation?section=raf' },
  ],
  advance: [
    { label: 'Gateway', path: '/fris/advance?tab=gateway' },
    { label: 'Schedule Setup', path: '/fris/advance?tab=schedule' },
    {
      label: 'Schedule Equipment Setup',
      path: '/fris/advance?tab=schedule-equipment',
    },
    { label: 'Cargo', path: '/fris/advance?tab=cargo' },
    { label: 'GH Representative', path: '/fris/advance?tab=gh-representative' },
    { label: 'Invoicing', path: '/fris/advance?tab=invoicing' },
    { label: 'Alert Setup', path: '/fris/advance?tab=alert' },
  ],
};

/** Advance page tab id → permission sub-page label */
export const ADVANCE_TAB_PERMISSION_LABEL: Record<string, string> = {
  gateway: 'Gateway',
  schedule: 'Schedule Setup',
  'schedule-equipment': 'Schedule Equipment Setup',
  cargo: 'Cargo',
  'gh-representative': 'GH Representative',
  invoicing: 'Invoicing',
  alert: 'Alert Setup',
};

/** Creation page section id → permission sub-page label */
export const CREATION_SECTION_PERMISSION_LABEL: Record<string, string> = {
  'scheduled-airlines': 'Scheduled Airlines',
  'additional-flights': 'Additional Flights',
  raf: 'RAF',
};

/** Navbar labels that differ from permission sub-page names in the DB */
export const NAV_PAGE_LABEL_ALIASES: Record<string, string> = {
  'Scheduled FHR & GSE Report': 'Scheduled FHR Report',
  'Non Scheduled FHR & GSE Report': 'Non Scheduled FHR Report',
  'Equipment Manpower': 'Equipment',
  'MIS Monthwise': 'MIS Station Wise',
  'Scheduled MIS Monthwise': 'MIS Station Wise',
  'Non Schedule MIS Monthwise': 'MIS Station Wise',
  'Scheduled MIS Station Wise': 'MIS Station Wise',
  'Non Schedule MIS Station Wise': 'MIS Station Wise',
  'MIS - Scheduled Month Wise': 'MIS Month Wise',
  'MIS - Non Schedule Month Wise': 'MIS Month Wise',
  'MIS Airline Wise Schedule': 'MIS Airline Wise',
  'MIS Airline Wise Non Schedule': 'MIS Airline Wise',
  'Scheduled Flights': 'Dashboard page',
  'Non scheduled flights': 'Dashboard page',
};

export function canonicalPageLabel(label: string): string {
  return NAV_PAGE_LABEL_ALIASES[label] ?? label;
}

/** Pages moved from Others → Flights (Non-Scheduled Airlines); keep legacy flags working. */
const FLIGHTS_LEGACY_PERMISSION_SOURCES: Record<
  string,
  { tab: NavPermissionTabKey; label: string }[]
> = {
  'Non scheduled Booking': [{ tab: 'others', label: 'Direct Booking' }],
  'Booking Details': [{ tab: 'others', label: 'Booking Details' }],
  'RAF (Ramp Assistance Forms)': [{ tab: 'creation', label: 'RAF' }],
};

export function isSubPageAllowed(
  flags: UserNavFlags,
  tab: NavPermissionTabKey,
  pageLabel: string,
): boolean {
  const tabFlags = flags[tab];
  if (!tabFlags || typeof tabFlags !== 'object') return false;
  const map = tabFlags as Record<string, number>;
  const key = canonicalPageLabel(pageLabel);
  if (map[key] === 1) return true;
  if (key === 'Equipment' && map['Equipment Manpower'] === 1) return true;
  if (key === 'Manpower' && map['Equipment Manpower'] === 1) return true;
  if (tab === 'flights') {
    for (const legacy of FLIGHTS_LEGACY_PERMISSION_SOURCES[key] ?? []) {
      const legacyFlags = flags[legacy.tab];
      if (
        legacyFlags &&
        typeof legacyFlags === 'object' &&
        (legacyFlags as Record<string, number>)[legacy.label] === 1
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Visibility for a Scheduled Airlines report button (FHR / GSE / Team).
 *
 * Granular flag wins when present: `1` shows the button, `0` hides it. When the
 * key is **absent** the flags were built before these per-report toggles
 * existed (older server build, or a user who logged in before the upgrade), so
 * we fall back to the parent "Scheduled Airlines" page grant. This keeps the
 * reports visible for already-provisioned users while still honouring an
 * explicit off-toggle once flags are rebuilt with the key present.
 */
export function isScheduledReportButtonAllowed(
  flags: UserNavFlags,
  reportLabel: 'FHR Report' | 'GSE Report' | 'Team Report',
): boolean {
  const tabFlags = flags.flights;
  if (!tabFlags || typeof tabFlags !== 'object') return false;
  const map = tabFlags as Record<string, number>;
  const value = map[reportLabel];
  if (value === 1) return true;
  if (value === 0) return false;
  return map['Scheduled Airlines'] === 1;
}

export function tabHasAnyAccess(
  flags: UserNavFlags,
  tab: NavPermissionTabKey,
): boolean {
  const tabFlags = flags[tab];
  if (!tabFlags || typeof tabFlags !== 'object') return false;
  return Object.values(tabFlags as Record<string, number>).some((v) => v === 1);
}

/** True when FRIS nav should be limited to admin-panel permission toggles. */
export function shouldUseFlagBasedNav(): boolean {
  if (typeof window === 'undefined') return false;
  // Superadmins always see every FRIS page; flags never hide nav for them.
  if (
    isUniversalSuperadminSession() ||
    normalizeFrisUserRole(localStorage.getItem('userRole')) === 'superadmin'
  ) {
    return false;
  }
  return hasAssignedFrisFlags();
}

/** Panel user from admin (department + flags), not unrestricted FRIS admin login. */
export function isPanelEmployeeSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (shouldUseFlagBasedNav()) return true;
  const role = localStorage.getItem('userRole')?.trim();
  if (isFrisElevatedRole(role)) return false;
  return !!localStorage.getItem('userDepartment')?.trim();
}

export function parseUserNavFlags(raw: string | null): UserNavFlags | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as UserNavFlags;
  } catch {
    return null;
  }
}

type NavDropdownItem = {
  label: string;
  path: string;
  /** When set, ACL checks this instead of `label` (display can differ). */
  permissionLabel?: string;
  hasNestedDropdown?: boolean;
  nestedItems?: { label: string; path: string; permissionLabel?: string }[];
  departments?: string[];
};

type NavItemLike = {
  label: string;
  dropdownItems?: NavDropdownItem[];
};

function filterDropdownItem(
  item: NavDropdownItem,
  tab: NavPermissionTabKey,
  flags: UserNavFlags,
  billingAppGranted = false,
): NavDropdownItem | null {
  if (item.label === 'Billing') {
    return isSubPageAllowed(flags, 'advance', 'Invoicing') || billingAppGranted
      ? item
      : null;
  }

  const nestedAllowed =
    item.nestedItems?.filter((n) =>
      isSubPageAllowed(flags, tab, n.permissionLabel ?? n.label),
    ) ?? [];
  const parentAllowed = isSubPageAllowed(
    flags,
    tab,
    item.permissionLabel ?? item.label,
  );

  if (item.nestedItems?.length) {
    if (nestedAllowed.length > 0) {
      return { ...item, nestedItems: nestedAllowed };
    }
    if (parentAllowed) {
      return { ...item, nestedItems: [] };
    }
    return null;
  }

  return parentAllowed ? item : null;
}

/** Filter a navbar item and its dropdowns using permission flags from admin panel. */
export function filterNavItemByFlags<T extends NavItemLike>(
  item: T,
  flags: UserNavFlags,
): T | null {
  const tab = NAV_LABEL_TO_TAB[item.label];
  const billingAppGranted =
    typeof window !== 'undefined' &&
    (() => {
      try {
        const raw = localStorage.getItem('userAppAccess');
        if (!raw?.trim()) return false;
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) && parsed.includes('billing-finance');
      } catch {
        return false;
      }
    })();

  if (!tab || !tabHasAnyAccess(flags, tab)) {
    // Others → Billing can be granted via BWMS tools without an Others flag.
    if (!(item.label === 'Others' && billingAppGranted)) {
      return null;
    }
  }

  if (!item.dropdownItems?.length) {
    return item;
  }

  const dropdownItems = item.dropdownItems
    .map((d) => filterDropdownItem(d, tab ?? 'others', flags, billingAppGranted))
    .filter((d): d is NavDropdownItem => d != null);

  if (dropdownItems.length === 0) return null;

  return { ...item, dropdownItems } as T;
}
