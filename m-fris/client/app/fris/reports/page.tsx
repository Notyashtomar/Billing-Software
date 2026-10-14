'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import {
  AlertCircle,
  BarChart3,
  Clock,
  Database,
  FileText,
  PieChart,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  isPanelEmployeeSession,
  isSubPageAllowed,
  parseUserNavFlags,
} from '@/lib/nav-permissions';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/fris/reports/pax-shift', label: 'Pax Shift Report', icon: Users },
  { href: '/fris/reports/pax-shift-analysis', label: 'Pax Shift Analysis Report', icon: PieChart },
  { href: '/fris/reports/ramp-shift', label: 'Ramp Shift Report', icon: Shield },
  { href: '/fris/reports/gsd-shift', label: 'GSD Shift Report', icon: FileText },
  { href: '/fris/reports/quality', label: 'Quality Report', icon: AlertCircle },
  { href: '/fris/reports/missing-fhr', label: 'Missing FHR Report', icon: AlertCircle },
  { href: '/fris/reports/delay', label: 'Delay Report', icon: Clock },
  { href: '/fris/reports/cleaning-services', label: 'Cleaning Services', icon: Sparkles },
  {
    href: '/fris/reports/consolidated/scheduled-fhr',
    label: 'Scheduled FHR Report',
    icon: Database,
  },
  {
    href: '/fris/reports/consolidated/non-scheduled-fhr',
    label: 'Non Scheduled FHR Report',
    icon: Database,
  },
];

export default function ReportsIndexPage() {
  const visibleLinks = (() => {
    if (typeof window === 'undefined') return [];
    if (isFrisAdminLikeSession()) return LINKS;
    if (!isPanelEmployeeSession()) return [];
    const flags = parseUserNavFlags(localStorage.getItem('userFlags'));
    if (!flags) return [];
    return LINKS.filter((link) => isSubPageAllowed(flags, 'reports', link.label));
  })();

  if (visibleLinks.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">No Reports sections are assigned to your account.</p>
        <p className="mt-2 text-sm text-slate-500">Contact your administrator to request access.</p>
      </div>
    );
  }

  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-emerald-50`}>
      <div className="mx-auto max-w-3xl">
        <FrisPageHeader title="Reports" icon={BarChart3} />
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm">
          {visibleLinks.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 text-slate-700 transition-colors hover:bg-amber-50/80 hover:text-amber-900"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-medium">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
