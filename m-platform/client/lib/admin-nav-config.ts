import {
  Activity,
  Bell,
  Download,
  GraduationCap,
  Key,
  LayoutDashboard,
  Radio,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminPanelSection =
  | 'dashboard'
  | 'users'
  | 'user-credentials'
  | 'departments'
  | 'stations'
  | 'training'
  | 'tickets'
  | 'notifications'
  | 'user-activity'
  | 'export'
  | 'system-check';

export type AdminNavItem = {
  section: AdminPanelSection;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { section: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { section: 'users', label: 'Users', href: '/admin/users', icon: Users },
  {
    section: 'user-credentials',
    label: 'User ID & Password',
    href: '/admin/user-credentials',
    icon: Key,
  },
  { section: 'stations', label: 'Stations & Depts', href: '/admin/stations', icon: Radio },
  { section: 'training', label: 'Training', href: '/admin/training', icon: GraduationCap },
  {
    section: 'tickets',
    label: 'Raise ticket query',
    href: '/admin/tickets',
    icon: Ticket,
  },
  {
    section: 'notifications',
    label: 'Notifications',
    href: '/admin/notifications',
    icon: Bell,
  },
  {
    section: 'user-activity',
    label: 'User activity',
    href: '/admin/user-activity',
    icon: Activity,
  },
  {
    section: 'system-check',
    label: 'System check',
    href: '/admin/system-check',
    icon: ShieldCheck,
  },
  { section: 'export', label: 'Export data', href: '/admin/export', icon: Download },
];

/** All toggleable admin-panel sections (label + key) for the permissions UI. */
export const ADMIN_PERMISSION_SECTIONS: { section: AdminPanelSection; label: string }[] =
  ADMIN_NAV_ITEMS.map(({ section, label }) => ({ section, label }));

/**
 * Filter the admin nav by the sections an account is allowed to see.
 *
 * Backward-compatible: `null`/`undefined` (legacy accounts with no configured
 * list) grants the full nav. A concrete list restricts to those sections only.
 */
export function filterAdminNavBySections(
  allowedSections: string[] | null | undefined,
): AdminNavItem[] {
  if (allowedSections == null) return ADMIN_NAV_ITEMS;
  const allowed = new Set(allowedSections);
  // Backward compat: 'departments' was merged into the 'stations' nav item.
  if (allowed.has('departments')) allowed.add('stations');
  return ADMIN_NAV_ITEMS.filter((item) => allowed.has(item.section));
}

/** Pick the most specific nav item for the current pathname (longest href wins). */
export function resolveActiveAdminNavItem(
  pathname: string | null,
  items: AdminNavItem[] = ADMIN_NAV_ITEMS,
): AdminNavItem | undefined {
  if (!pathname) return undefined;

  let best: AdminNavItem | undefined;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) {
        best = item;
      }
    }
  }
  return best;
}

export function getAdminSectionFromPathname(pathname: string | null): AdminPanelSection | null {
  if (!pathname) return null;

  if (pathname === '/admin/dashboard' || pathname.startsWith('/admin/dashboard/')) {
    return 'dashboard';
  }
  if (pathname === '/admin/users' || pathname.startsWith('/admin/user/')) {
    return 'users';
  }
  if (
    pathname === '/admin/user-credentials' ||
    pathname.startsWith('/admin/user-credentials/')
  ) {
    return 'user-credentials';
  }
  if (
    pathname === '/admin/departments' ||
    pathname.startsWith('/admin/department/') ||
    pathname === '/admin/stations' ||
    pathname.startsWith('/admin/stations/')
  ) {
    return 'stations';
  }
  if (pathname === '/admin/training' || pathname.startsWith('/admin/training/')) {
    return 'training';
  }
  if (pathname === '/admin/tickets' || pathname.startsWith('/admin/tickets/')) {
    return 'tickets';
  }
  if (pathname === '/admin/notifications' || pathname.startsWith('/admin/notifications/')) {
    return 'notifications';
  }
  if (pathname === '/admin/user-activity' || pathname.startsWith('/admin/user-activity/')) {
    return 'user-activity';
  }
  if (pathname === '/admin/system-check' || pathname.startsWith('/admin/system-check/')) {
    return 'system-check';
  }
  if (pathname === '/admin/export' || pathname.startsWith('/admin/export/')) {
    return 'export';
  }

  return null;
}

export function isAdminPanelPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return getAdminSectionFromPathname(pathname) !== null;
}
