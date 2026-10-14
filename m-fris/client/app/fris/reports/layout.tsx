'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import {
  isPanelEmployeeSession,
  isSubPageAllowed,
  parseUserNavFlags,
  tabHasAnyAccess,
  type UserNavFlags,
} from '@/lib/nav-permissions';

type AccessState = 'checking' | 'allowed' | 'denied';

const REPORT_ROUTE_LABELS: Array<{ prefix: string; label: string }> = [
  {
    prefix: '/fris/reports/consolidated/scheduled-fhr',
    label: 'Scheduled FHR Report',
  },
  {
    prefix: '/fris/reports/consolidated/non-scheduled-fhr',
    label: 'Non Scheduled FHR Report',
  },
  { prefix: '/fris/reports/pax-shift-analysis', label: 'Pax Shift Analysis Report' },
  { prefix: '/fris/reports/pax-shift', label: 'Pax Shift Report' },
  { prefix: '/fris/reports/ramp-shift', label: 'Ramp Shift Report' },
  { prefix: '/fris/reports/gsd-shift', label: 'GSD Shift Report' },
  { prefix: '/fris/reports/quality', label: 'Quality Report' },
  { prefix: '/fris/reports/missing-fhr', label: 'Missing FHR Report' },
  { prefix: '/fris/reports/delay', label: 'Delay Report' },
  { prefix: '/fris/reports/cleaning-services', label: 'Cleaning Services' },
];

function hasAnyConsolidatedReportAccess(flags: UserNavFlags): boolean {
  return (
    isSubPageAllowed(flags, 'reports', 'Consolidated Report') ||
    isSubPageAllowed(flags, 'reports', 'Scheduled FHR Report') ||
    isSubPageAllowed(flags, 'reports', 'Non Scheduled FHR Report')
  );
}

function isCurrentReportRouteAllowed(
  pathname: string,
  flags: UserNavFlags,
): boolean {
  if (pathname === '/fris/reports') {
    return tabHasAnyAccess(flags, 'reports');
  }

  if (pathname === '/fris/reports/consolidated') {
    return hasAnyConsolidatedReportAccess(flags);
  }

  const match = REPORT_ROUTE_LABELS.find((route) => pathname.startsWith(route.prefix));
  if (!match) {
    return tabHasAnyAccess(flags, 'reports');
  }

  return isSubPageAllowed(flags, 'reports', match.label);
}

export default function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const accessState = useMemo<AccessState>(() => {
    if (!pathname) return 'checking';
    if (isFrisAdminLikeSession()) return 'allowed';
    if (!isPanelEmployeeSession()) return 'denied';

    const flags = parseUserNavFlags(localStorage.getItem('userFlags'));
    if (!flags) return 'denied';

    return isCurrentReportRouteAllowed(pathname, flags) ? 'allowed' : 'denied';
  }, [pathname]);

  if (accessState === 'checking') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">Loading report permissions...</p>
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">You do not have access to this report.</p>
        <p className="mt-2 text-sm text-slate-500">Contact your administrator to request access.</p>
      </div>
    );
  }

  return <>{children}</>;
}
