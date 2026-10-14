'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { FlightData } from '@/utils/dataProcessor';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import { gatherPaxShiftReportDataBatch, type PaxShiftReportGathered } from '@/components/fris/reports/paxShiftReportData';
import { readPaxShiftReportViewFlight } from '@/components/fris/reports/paxShiftReportStorageKeys';
import { buildPaxShiftReportMailBody } from '@/components/fris/reports/paxShiftReportMailto';
import PaxShiftReportSendEmailModal from '@/components/fris/reports/PaxShiftReportSendEmailModal';
import { sendPaxShiftReportEmail } from '@/lib/api';
import PaxShiftReportFlightDetailsSection from '@/components/fris/reports/PaxShiftReportFlightDetailsSection';
import { paxShiftReportPlain as r } from '@/components/fris/reports/paxShiftReportPlainUi';
import {
  buildRosterLeaveTableBody,
  buildStaffDetailsTableBody,
  buildSupTlOnDutyRow,
  flightHandlingField,
  paxShiftReportFlightDate,
  paxShiftReportFlightLockDisplay,
} from '@/components/fris/reports/paxShiftReportTableModel';

function emptyFlightData(slNo: string): FlightData {
  return {
    destination: '',
    slNo,
    flightNo: '',
    airline: '',
    aircraft: '',
    staDate: '',
    staTime: '',
    stdDate: '',
    stdTime: '',
    exportedNAV: '',
    rampLocked: '',
    paxLocked: '',
    gsdLocked: '',
    flightType: '',
    hClose: '',
    fBag: '',
    lBag: '',
    isCancelled: false,
  };
}

function readCachedFlight(slNo: string): FlightData | null {
  const parsed = readPaxShiftReportViewFlight(slNo);
  if (!parsed || !String(parsed.slNo ?? '').trim()) return null;
  return { ...emptyFlightData(String(parsed.slNo)), ...(parsed as FlightData) };
}

export default function PaxShiftReportViewContent({ flightSerial }: { flightSerial: string }) {
  const fs = String(flightSerial ?? '').trim();
  const [flight, setFlight] = useState<FlightData | null>(null);
  const [data, setData] = useState<PaxShiftReportGathered | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    if (!fs) {
      setFlight(null);
      return;
    }
    setFlight(readCachedFlight(fs) ?? emptyFlightData(fs));
  }, [fs]);

  const reloadData = useCallback(async () => {
    if (!fs) {
      setError('Missing flight serial.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const batchResult = await gatherPaxShiftReportDataBatch([fs]);
      setData(batchResult[fs] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load report data.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fs]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  const flightForActions = useMemo(() => flight ?? emptyFlightData(fs), [flight, fs]);

  const handleDownloadPdf = () => {
    void toast.promise(
      import('@/components/fris/reports/paxShiftReportPdf').then((mod) =>
        mod.downloadPaxShiftReportPdf(flightForActions, data ?? undefined),
      ),
      {
        loading: 'Building PDF…',
        success: 'PDF downloaded',
        error: (e) => (e instanceof Error ? e.message : 'Could not generate PDF'),
      },
    );
  };

  const serialLabel = useMemo(
    () => displayFlightInstanceSerial(fs || flightForActions.slNo),
    [fs, flightForActions.slNo],
  );

  const table1Row = useMemo(() => {
    const fh = data?.flightHandling ?? null;
    return {
      airline: String(flightForActions.airline ?? '').trim() || '—',
      flightNo: String(flightForActions.flightNo ?? '').trim() || '—',
      flightLock: paxShiftReportFlightLockDisplay(flightForActions),
      date: paxShiftReportFlightDate(flightForActions, fh),
      fhrNo: String(serialLabel ?? '').trim() || '—',
    };
  }, [data?.flightHandling, flightForActions, serialLabel]);

  const handleSendEmail = async (emails: string[]) => {
    if (!data) return;
    setEmailBusy(true);
    try {
      const { buildPaxShiftReportPdfBase64 } = await import(
        '@/components/fris/reports/paxShiftReportPdf'
      );
      const { base64, filename } = await buildPaxShiftReportPdfBase64(flightForActions, data ?? undefined);
      if (!base64) {
        throw new Error('Could not generate PDF attachment.');
      }
      const sent = await sendPaxShiftReportEmail({
        flightSerial: fs,
        airline: String(flightForActions.airline ?? '').trim(),
        flightNo: String(flightForActions.flightNo ?? '').trim(),
        emails,
        pdfBase64: base64,
        pdfFilename: filename,
        emailBody: buildPaxShiftReportMailBody(flightForActions, data),
      });
      toast.success(`Pax shift report sent to: ${sent.toEmails.join(', ')}`);
      setEmailModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email');
    } finally {
      setEmailBusy(false);
    }
  };

  const overtimeRow = useMemo(() => {
    const fh = data?.flightHandling ?? null;
    return {
      uh: flightHandlingField(fh, 'uhCounters') || '—',
      reason: flightHandlingField(fh, 'overtimeReason') || '—',
      staff: flightHandlingField(fh, 'staffOvertime') || '—',
    };
  }, [data?.flightHandling]);

  return (
    <div className={r.page}>
      <div className={r.maxWidth}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={r.headerBar}
        >
          <div className="min-w-0 space-y-2">
            <Link href="/fris/reports/pax-shift" className={r.linkBack}>
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Back to Pax Shift Report
            </Link>
            <h1 className={r.docTitle}>PAX SHIFT REPORT</h1>
            <p className={`${r.note} text-center sm:text-left`}>
              Serial{' '}
              <span className="font-mono font-semibold text-[var(--dash-text-strong)]">{serialLabel}</span>
              {flight?.flightNo ? (
                <>
                  {' '}
                  · {flight.airline} {flight.flightNo}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={handleDownloadPdf} className={r.btnPrimary}>
              <Download className="h-4 w-4" aria-hidden />
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => setEmailModalOpen(true)}
              disabled={!data || loading}
              className={!data || loading ? r.btnDisabled : r.btnSecondary}
              title={loading ? 'Loading report…' : !data ? 'Report data unavailable' : undefined}
            >
              <Mail className="h-4 w-4" aria-hidden />
              Send email
            </button>
          </div>
        </motion.div>

        {loading && (
          <div className={r.panelLarge}>
            <Loader2 className={r.spinner} aria-hidden />
            <p className="font-medium text-[var(--dash-text-strong)]">Loading tabular report…</p>
          </div>
        )}

        {!loading && error && (
          <div className={r.panel}>
            <p className="font-semibold text-[var(--dash-text-strong)]">Could not load data</p>
            <p className="mt-1 text-[var(--dash-text-muted)]">{error}</p>
            <button type="button" onClick={() => void reloadData()} className={`${r.btnPrimary} mt-4 px-3 py-1.5`}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            <section aria-label="Flight summary">
              <h2 className={r.sectionTitle}>Flight summary</h2>
              <div className={r.tableWrap}>
                <table className={`min-w-[520px] ${r.table}`}>
                  <thead>
                    <tr>
                      <th className={r.th}>Airline name</th>
                      <th className={r.th}>Flight no.</th>
                      <th className={r.th}>Flight lock</th>
                      <th className={r.th}>Date</th>
                      <th className={r.th}>FHR No.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={r.td}>{table1Row.airline}</td>
                      <td className={r.td}>{table1Row.flightNo}</td>
                      <td className={r.td}>{table1Row.flightLock}</td>
                      <td className={r.td}>{table1Row.date}</td>
                      <td className={`${r.td} font-mono`}>{table1Row.fhrNo}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className={r.note}>
                Flight lock rules can be wired later; this cell currently reflects schedule pax lock when set.
              </p>
            </section>

            <section>
              <h2 className={r.sectionTitle}>Staff On Duty (Sup/TL)</h2>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>Details</th>
                      <th className={r.th}>Count</th>
                      <th className={r.th}>Name of staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const row = buildSupTlOnDutyRow(data);
                      return (
                        <tr key="sup-tl">
                          <td className={r.td}>{row.detail}</td>
                          <td className={`${r.td} tabular-nums`}>{row.count}</td>
                          <td className={`${r.td} max-w-xl whitespace-pre-wrap break-words`}>{row.names}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <p className={r.blockLabel}>Staff rostered/Duty</p>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>Details</th>
                      <th className={r.th}>Count</th>
                      <th className={r.th}>Name of staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildRosterLeaveTableBody(data).map((row) => (
                      <tr key={row.detail}>
                        <td className={r.td}>{row.detail}</td>
                        <td className={`${r.td} tabular-nums`}>{row.count}</td>
                        <td className={`${r.td} max-w-xl whitespace-pre-wrap break-words`}>{row.names}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={r.blockLabel}>Staff Details</p>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>Details</th>
                      <th className={r.th}>Count</th>
                      <th className={r.th}>Name of staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildStaffDetailsTableBody(data).map((row) => (
                      <tr key={row.detail}>
                        <td className={r.td}>{row.detail}</td>
                        <td className={`${r.td} tabular-nums`}>{row.count}</td>
                        <td className={`${r.td} max-w-xl whitespace-pre-wrap break-words`}>{row.names}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-label="Counters and overtime">
              <h2 className={r.sectionTitle}>Counters &amp; overtime</h2>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>UH counter</th>
                      <th className={r.th}>Overtime reason</th>
                      <th className={r.th}>Staff of overtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={r.td}>{overtimeRow.uh}</td>
                      <td className={`${r.td} max-w-md whitespace-pre-wrap break-words`}>{overtimeRow.reason}</td>
                      <td className={`${r.td} max-w-md whitespace-pre-wrap break-words`}>{overtimeRow.staff}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className={r.note}>From Flight Details → Counters &amp; overtime (saved to server or browser snapshot for PDF).</p>
            </section>

            <section>
              <h2 className={r.sectionTitle}>Short shipped bag</h2>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>Label</th>
                      <th className={r.th}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={r.td}>No. of bags</td>
                      <td className={r.td}>{data.shortShipped.noOfBags !== '' ? data.shortShipped.noOfBags : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className={r.tableWrap}>
                <table className={r.table}>
                  <thead>
                    <tr>
                      <th className={r.th}>Sr.</th>
                      <th className={r.th}>Option section</th>
                      <th className={r.th}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shortShipped.rows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className={r.td}>
                          No detail rows.
                        </td>
                      </tr>
                    ) : (
                      data.shortShipped.rows.map((row, idx) => (
                        <tr key={row.id}>
                          <td className={r.td}>{idx + 1}</td>
                          <td className={r.td}>{row.optionSection || '—'}</td>
                          <td className={`${r.td} max-w-md whitespace-pre-wrap break-words`}>{row.remarks || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <p className={`${r.note} mb-3`}>
                Flight Details values come from the Flight Details form in the Pax shift sidebar (save to server or
                browser snapshot for the PDF).
              </p>
              <PaxShiftReportFlightDetailsSection flightHandling={data.flightHandling} />
            </section>
          </div>
        )}
      </div>

      <PaxShiftReportSendEmailModal
        open={emailModalOpen}
        busy={emailBusy}
        flightNo={String(flightForActions.flightNo ?? '').trim()}
        serialLabel={serialLabel}
        onClose={() => !emailBusy && setEmailModalOpen(false)}
        onSend={handleSendEmail}
      />
    </div>
  );
}
