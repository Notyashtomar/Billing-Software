'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchFhrCollectionFlightLean } from '@/lib/api';
import type { FlightData, MainDetailsData } from '@/utils/dataProcessor';
import { cn } from '@/lib/utils';
import {
  formatSignedAt,
  resolveSignaturesForPdf,
} from '@/components/fris/flights/scheduledairlines/signatures/signaturePdf';
import {
  buildRafCleaningReportData,
  RAF_CLEANING_SOP_STATEMENT,
  type RafCleaningReportData,
  type RafCleaningReportKind,
  type RafCleaningReportSignature,
} from './rafCleaningReportData';

/** Above FRIS Navbar (`z-[100]`) and nav dropdowns (`z-[101]`). */
const OVERLAY_Z = 'z-[200]';
const DIALOG_Z = 'z-[210]';

export type RafCleaningReportPreviewProps = {
  open: boolean;
  flight: FlightData | null;
  kind: RafCleaningReportKind | null;
  mainDetails?: MainDetailsData | null;
  onClose: () => void;
};

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 text-[11px] leading-snug sm:text-xs', className)}>
      <span className="font-semibold text-gray-900">{label}</span>{' '}
      <span className="text-gray-800">{value?.trim() || '—'}</span>
    </div>
  );
}

export default function RafCleaningReportPreview({
  open,
  flight,
  kind,
  mainDetails = null,
  onClose,
}: RafCleaningReportPreviewProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<RafCleaningReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !flight || !kind) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const serial = String(flight.slNo ?? '').trim();
        const [fhr, signatures] = await Promise.all([
          serial ? fetchFhrCollectionFlightLean(serial) : Promise.resolve(null),
          serial ? resolveSignaturesForPdf(serial, 'fhr') : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setData(
          buildRafCleaningReportData({
            flight,
            kind,
            mainDetails,
            fhr,
            signatures,
          }),
        );
      } catch {
        if (cancelled) return;
        setData(
          buildRafCleaningReportData({
            flight,
            kind,
            mainDetails,
            fhr: null,
            signatures: null,
          }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, flight, kind, mainDetails]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open, onClose]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    setDownloading(true);
    try {
      const { downloadRafCleaningReportPdf } = await import('./rafCleaningReportPdf');
      await downloadRafCleaningReportPdf(
        data,
        `${data.title.replace(/\s+/g, '_')}_${data.serialNo || 'raf'}.pdf`,
      );
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not download PDF');
    } finally {
      setDownloading(false);
    }
  }, [data]);

  if (!mounted || typeof document === 'undefined') return null;

  const dialog = (
    <AnimatePresence>
      {open && flight && kind ? (
        <div className={cn('fixed inset-0', OVERLAY_Z)} role="presentation">
          <motion.button
            type="button"
            aria-label="Close report preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="raf-cleaning-report-title"
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'pointer-events-auto relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl',
                'max-h-[min(92dvh,920px)]',
                DIALOG_Z,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky chrome — always visible */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <h2
                    id="raf-cleaning-report-title"
                    className="truncate text-sm font-semibold text-gray-900 sm:text-base"
                  >
                    {data?.title ?? 'Cleaning Report'} — Preview
                  </h2>
                  <p className="truncate text-xs text-gray-500">
                    Flight {flight.flightNo} · SL {flight.slNo}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={!data || downloading || loading}
                    onClick={() => void handleDownload()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-4 w-4" aria-hidden />
                    )}
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-100"
                    aria-label="Close preview"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable report page only */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-100 px-3 py-4 sm:px-5 sm:py-5">
                {loading || !data ? (
                  <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600" aria-hidden />
                    Loading report…
                  </div>
                ) : (
                  <div className="fris-report-preview mx-auto w-full max-w-[210mm] rounded-sm border border-gray-300 bg-white p-5 text-gray-900 shadow-md sm:p-8">
                    <div className="mb-4 space-y-1 text-center text-sm text-gray-500">
                      <div>—</div>
                      <div>—</div>
                      <div>—</div>
                      <div>— / —</div>
                    </div>

                    <h3 className="mb-3 text-center text-base font-bold tracking-wide text-gray-900">
                      {data.title}
                    </h3>
                    <div className="mb-4 border-t border-gray-800" />

                    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                      <Field label="Airline" value={data.airline} />
                      <Field label="Code" value={data.airlineCode} />
                      <Field label="Flight No" value={data.flightNo} />

                      <Field label="Aircraft Type" value={data.aircraftType} />
                      <Field label="Reg." value={data.registration} />
                      <Field label="Route" value={data.route} />

                      <Field label="STA Date" value={data.staDate} />
                      <Field label="STA Time" value={data.staTime} />
                      <Field label="STD Date" value={data.stdDate} />

                      <Field label="STD Time" value={data.stdTime} />
                      <Field label="ATA Date" value={data.ataDate} />
                      <Field label="ATA Time" value={data.ataTime} />

                      <Field label="ATD Date" value={data.atdDate} />
                      <Field label="ATD Time" value={data.atdTime} />
                      <div className="hidden sm:block" />

                      <Field label="Started From" value={data.startedFrom} />
                      <Field label="Cleaning Ended" value={data.cleaningEnded} />
                      <Field label="Duration" value={data.duration} />

                      <Field
                        label="Cleaning Supervisor"
                        value={data.cleaningSupervisor}
                        className="sm:col-span-3"
                      />
                    </div>

                    <div className="my-5 border-t border-gray-800" />

                    <p className="text-[11px] leading-relaxed text-gray-800 sm:text-xs">
                      <span className="font-medium">{data.title}</span> {RAF_CLEANING_SOP_STATEMENT}
                    </p>

                    <div className="mt-5">
                      <p className="text-[11px] font-semibold text-gray-900 sm:text-xs">
                        Remarks (if any)
                      </p>
                      <div className="mt-2 min-h-[2.5rem] border-b border-gray-700 pb-2 text-[11px] text-gray-800 sm:text-xs">
                        {data.remarks.trim() || '\u00A0'}
                      </div>
                    </div>

                    <div className="mt-10 grid grid-cols-2 gap-6 border-t border-gray-800 pt-8 text-[11px] text-gray-900 sm:text-xs">
                      <SignatureBlock
                        label="GH Signature"
                        repName={data.ghRepName}
                        signature={data.ghSignature}
                      />
                      <SignatureBlock
                        label="Airline Signature"
                        repName={data.airlineRepName}
                        signature={data.airlineSignature}
                        align="right"
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}

function SignatureBlock({
  label,
  repName,
  signature,
  align = 'left',
}: {
  label: string;
  repName: string;
  signature: RafCleaningReportSignature | null;
  align?: 'left' | 'right';
}) {
  const signedAt = formatSignedAt(signature?.signedAt);
  const url = signature?.signatureUrl?.trim() || '';
  return (
    <div className={cn('flex min-w-0 flex-col', align === 'right' && 'items-end text-right')}>
      <div
        className={cn(
          'mb-2 flex h-16 w-full max-w-[200px] items-center justify-center border border-dashed border-gray-300 bg-gray-50',
          align === 'right' && 'ml-auto',
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signature data URL / API blob
          <img
            src={url}
            alt={`${label} image`}
            className="max-h-14 max-w-full object-contain"
          />
        ) : (
          <span className="text-[10px] font-normal text-gray-400">No signature</span>
        )}
      </div>
      <span className="font-semibold">{label}</span>
      {repName.trim() ? (
        <span className="mt-0.5 font-normal text-gray-700">{repName.trim()}</span>
      ) : null}
      {signedAt ? (
        <span className="mt-0.5 text-[10px] font-normal text-gray-500">Signed: {signedAt}</span>
      ) : null}
    </div>
  );
}
