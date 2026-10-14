'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { MIS_PAGES, misPagePermissionLabel } from '@/features/fris/mis/mis-pages';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import {
  isPanelEmployeeSession,
  isSubPageAllowed,
  parseUserNavFlags,
} from '@/lib/nav-permissions';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function MisIndexPage() {
  const visiblePages = useMemo(() => {
    if (typeof window === 'undefined') return [];
    if (isFrisAdminLikeSession()) return MIS_PAGES;
    if (!isPanelEmployeeSession()) return [];
    const flags = parseUserNavFlags(localStorage.getItem('userFlags'));
    if (!flags) return [];
    return MIS_PAGES.filter((page) =>
      isSubPageAllowed(flags, 'mis', misPagePermissionLabel(page)),
    );
  }, []);

  if (visiblePages.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">No MIS sections are assigned to your account.</p>
        <p className="mt-2 text-sm text-slate-500">Contact your administrator to request access.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary featureName="MIS analytics">
      <div className="min-h-[calc(100vh-5rem)] bg-emerald-50">
      <div className="mx-auto max-w-4xl px-4 py-4 md:px-6 lg:px-8 xl:px-10">
        <FrisPageHeader title="MIS" icon={BarChart3} />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8"
        >
          <ul className="space-y-3">
            {visiblePages.map((page) => (
              <li key={page.path}>
                <Link
                  href={page.path}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-4 transition-all hover:border-emerald-200/80 hover:bg-emerald-50/40"
                >
                  <span>
                    <span className="block font-semibold text-slate-800">{page.label}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">{page.description}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </Link>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
