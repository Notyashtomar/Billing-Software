'use client';

import { useParams } from 'next/navigation';
import { ReportsPage } from '@/features/bill-receivables/ReportsPage';
import type { ReportId } from '@/features/bill-receivables/report-sheets';

export default function Page() {
  const params = useParams<{ report: string }>();
  const report: ReportId = params.report === '2' || params.report === '3' ? params.report : '1';
  return <ReportsPage report={report} />;
}
