'use client';

import React from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

const DelayReportDashboard = dynamic(
  () => import('@/components/fris/reports/delay-report/DelayReportDashboard'),
  { ssr: false }
);
import { FRIS_REPORTS_PAGE_SHELL_CLASS } from '@/lib/fris-reports-responsive';

export default function DelayReportContent() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`${FRIS_REPORTS_PAGE_SHELL_CLASS} w-full bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/35`}
    >
      <div className="mx-auto w-full max-w-[1600px] pt-6 md:pt-8">
        <DelayReportDashboard />
      </div>
    </motion.div>
  );
}
