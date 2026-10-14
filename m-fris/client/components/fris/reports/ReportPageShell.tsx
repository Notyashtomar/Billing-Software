'use client';

import { motion } from 'framer-motion';
import { FileText, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';

type ReportPageShellProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
};

export default function ReportPageShell({
  title,
  icon: Icon = FileText,
  children,
}: ReportPageShellProps) {
  return (
    <div className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} bg-emerald-50`}>
      <div className="mx-auto max-w-4xl">
        <FrisPageHeader title={title} icon={Icon} />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="text-sm text-slate-600">
            {children ?? <p>This report page is ready for implementation.</p>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
