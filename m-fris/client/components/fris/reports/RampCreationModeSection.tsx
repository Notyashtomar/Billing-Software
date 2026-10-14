'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FRIS_REPORTS_OPEN_BTN_CLASS } from '@/lib/fris-reports-responsive';
import { ReportsResponsiveTable } from '@/components/fris/reports/ReportsResponsiveTable';
import {
  ReportsAdaptiveTable,
  ReportsMobileCard,
  ReportsMobileCardActions,
  ReportsMobileCardButton,
  ReportsMobileCardField,
  ReportsMobileCardGrid,
  ReportsMobileCardHeader,
  ReportsMobileCardList,
  ReportsMobileEmpty,
} from '@/components/fris/reports/ReportsMobileCards';
import { toast } from 'sonner';
import { listRampShiftReportsAsync, type RampShiftSavedReport } from '@/components/fris/reports/rampShiftStorage';

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  shift: 'day' | 'night';
  reportDateYmd: string;
  openReportId: string | null;
  refreshKey: number;
  visible: boolean;
  onOpenReport: (id: string | null) => void;
  onReportsLoaded?: (count: number) => void;
};

export default function RampCreationModeSection({
  shift,
  reportDateYmd,
  openReportId,
  refreshKey,
  visible,
  onOpenReport,
  onReportsLoaded,
}: Props) {
  const router = useRouter();
  const [reports, setReports] = useState<RampShiftSavedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const onReportsLoadedRef = useRef(onReportsLoaded);
  const shiftLabel = shift === 'day' ? 'Day Shift' : 'Night Shift';

  useEffect(() => {
    onReportsLoadedRef.current = onReportsLoaded;
  }, [onReportsLoaded]);

  const openReportView = (reportId: string) => {
    const id = String(reportId ?? '').trim();
    if (!id) return;
    router.push(`/fris/reports/ramp-shift/view/${encodeURIComponent(id)}`);
  };

  const refresh = useCallback(async () => {
    if (!reportDateYmd) {
      setReports([]);
      onReportsLoadedRef.current?.(0);
      return;
    }
    setLoading(true);
    try {
      const list = await listRampShiftReportsAsync(reportDateYmd, shift);
      setReports(list);
      onReportsLoadedRef.current?.(list.length);
    } catch (e) {
      setReports([]);
      onReportsLoadedRef.current?.(0);
      toast.error(e instanceof Error ? e.message : 'Failed to load saved reports');
    } finally {
      setLoading(false);
    }
  }, [reportDateYmd, shift]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (!visible) return null;

  const mobileList = loading ? (
    <ReportsMobileEmpty title="Loading saved reports…" />
  ) : reports.length === 0 ? (
    <ReportsMobileEmpty title="No saved reports" description="For this date and shift." />
  ) : (
    <ReportsMobileCardList className="p-3">
      {reports.map((r) => {
        const isOpen = openReportId === r.id;
        return (
          <ReportsMobileCard key={r.id} tone={isOpen ? 'warning' : 'default'}>
            <ReportsMobileCardHeader
              title={r.createdBy || 'Saved report'}
              subtitle={formatDisplayDate(r.createdAt)}
              badge={
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  {shiftLabel}
                </span>
              }
            />
            <ReportsMobileCardGrid>
              <ReportsMobileCardField label="Mail sent" value={r.mailSent ? 'Yes' : 'No'} />
              <ReportsMobileCardField label="Modified" value={formatDisplayDate(r.modifiedAt)} />
              <ReportsMobileCardField label="Modified by" value={r.modifiedBy || '—'} fullWidth />
            </ReportsMobileCardGrid>
            <ReportsMobileCardActions>
              <ReportsMobileCardButton
                className={isOpen ? 'bg-slate-600 text-white hover:bg-slate-700' : 'bg-blue-600 text-white hover:bg-blue-700'}
                onClick={() => onOpenReport(isOpen ? null : r.id)}
              >
                {isOpen ? 'Close editor' : 'Open editor'}
              </ReportsMobileCardButton>
              <ReportsMobileCardButton variant="secondary" onClick={() => openReportView(r.id)}>
                View PDF
              </ReportsMobileCardButton>
            </ReportsMobileCardActions>
          </ReportsMobileCard>
        );
      })}
    </ReportsMobileCardList>
  );

  const desktopTable = (
    <ReportsResponsiveTable showScrollHint={false}>
      <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-emerald-500 text-white">
            {['', 'Shift', 'Created By', 'Created Date', 'Mail Sent', 'Modify Date', 'Modify By', 'Report'].map(
              (h) => (
                <th
                  key={h || 'open'}
                  className="border-r border-emerald-400/80 px-2 py-2 text-left text-xs font-bold last:border-r-0"
                >
                  {h || 'Open'}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                Loading saved reports…
              </td>
            </tr>
          ) : reports.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                No saved reports for this date and shift.
              </td>
            </tr>
          ) : (
            reports.map((r) => {
              const isOpen = openReportId === r.id;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'transition-colors',
                    isOpen ? 'bg-rose-50/90' : 'bg-white hover:bg-emerald-50/40',
                  )}
                >
                  <td className="border-b border-slate-200/80 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onOpenReport(isOpen ? null : r.id)}
                      className={`${FRIS_REPORTS_OPEN_BTN_CLASS} ${
                        isOpen ? 'bg-slate-600 hover:bg-slate-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {isOpen ? 'Close' : 'Open'}
                    </button>
                  </td>
                  <td className="border-b border-slate-200/80 px-2 py-2 text-blue-700">{shiftLabel}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2 text-blue-700">{r.createdBy}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2">{formatDisplayDate(r.createdAt)}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2">{r.mailSent ? 'Yes' : 'No'}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2">{formatDisplayDate(r.modifiedAt)}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2 text-blue-700">{r.modifiedBy}</td>
                  <td className="border-b border-slate-200/80 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => openReportView(r.id)}
                      className="min-h-[36px] touch-manipulation rounded-lg px-2 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </ReportsResponsiveTable>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-100/90 bg-white shadow-sm shadow-emerald-900/[0.03] ring-1 ring-emerald-900/[0.04]">
      <ReportsAdaptiveTable mobile={mobileList} desktop={desktopTable} />
    </div>
  );
}
