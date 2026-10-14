'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Paperclip, Save } from 'lucide-react';
import type { BaseFormProps } from './types';
import { getNsRawFormDefaultUrl, saveNsRawForm, fetchNsRawFormData } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  fileMaxSize,
  fileType,
  runValidators,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';

const fetch = frisFetch;

const ATTACHMENT_FIELD_ORDER = ['attachmentFile'] as const;
type AttachmentField = (typeof ATTACHMENT_FIELD_ORDER)[number];
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];

interface ReportRow {
  id: number;
  label: string;
  checked: boolean;
  reportName: string;
  reportNo: string;
}

interface AttachmentsFormProps extends BaseFormProps {
  onSaveReport?: (report: ReportRow) => void;
  onSaveAttachment?: (data: { noOfScanReports: string; file: File | null }) => void;
}

const INITIAL_REPORTS: ReportRow[] = [
  { id: 1, label: 'Report 1', checked: false, reportName: '', reportNo: '' },
  { id: 2, label: 'Report 2', checked: false, reportName: '', reportNo: '' },
  { id: 3, label: 'Report 3', checked: false, reportName: '', reportNo: '' },
  { id: 4, label: 'Report 4', checked: false, reportName: '', reportNo: '' },
  { id: 5, label: 'Report 5', checked: false, reportName: '', reportNo: '' },
  { id: 6, label: 'Report 6', checked: false, reportName: '', reportNo: '' },
];

export default function AttachmentsForm({
  flight,
  onSaveReport,
  onSaveAttachment,
}: AttachmentsFormProps) {
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [noOfScanReports, setNoOfScanReports] = useState('');

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingReportId, setSavingReportId] = useState<number | null>(null);
  const { errors, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AttachmentField>(ATTACHMENT_FIELD_ORDER);

  useEffect(() => {
    const serial = flight?.sNo != null ? String(flight.sNo) : null;
    if (!serial) {
      setReports(INITIAL_REPORTS);
      setNoOfScanReports('');
      return;
    }
    const serialNo = serial;
    let cancelled = false;
    async function load() {
      try {
        // GET .../ns-raw-flight-data/attachments-details/:serialNo — load saved data from DB
        const doc = await fetchNsRawFormData('attachments-details', serialNo);
        if (cancelled) return;
        if (doc && typeof doc === 'object') {
          const d = (doc as Record<string, unknown>).data ?? doc;
          const data = d as Record<string, unknown>;
          if (data?.noOfScanReports !== undefined) setNoOfScanReports(String(data.noOfScanReports ?? ''));
          const reportsArr = data?.reports as Array<{ reportName?: string; reportNo?: string }> | undefined;
          if (Array.isArray(reportsArr) && reportsArr.length > 0)
            setReports((prev) =>
              reportsArr.slice(0, prev.length).map((r, i) => ({
                ...prev[i],
                reportName: r.reportName ?? '',
                reportNo: r.reportNo ?? '',
              }))
            );
          return;
        }
        await fetch(getNsRawFormDefaultUrl('attachments-details', serialNo), { method: 'GET' });
      } catch {
        if (!cancelled) {
          setReports(INITIAL_REPORTS);
          setNoOfScanReports('');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [flight?.sNo]);

  const handleReportChange = (id: number, field: keyof ReportRow, value: string | boolean) => {
    setReports((prev) =>
      prev.map((report) =>
        report.id === id ? { ...report, [field]: value } : report
      )
    );
  };

  const saveToServer = useCallback(async (payload: { reports: ReportRow[]; noOfScanReports: string; attachmentFileName?: string; attachmentPath?: string }) => {
    if (!flight) return;
    const serial = flight.sNo != null ? String(flight.sNo) : null;
    if (!serial) return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveNsRawForm('attachments-details', serial, {
        reports: payload.reports.map((r) => ({ checked: r.checked, reportName: r.reportName, reportNo: r.reportNo })),
        noOfScanReports: payload.noOfScanReports,
        attachmentFileName: payload.attachmentFileName ?? '',
        attachmentPath: payload.attachmentPath ?? '',
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveStatus('error');
    }
  }, [flight]);

  const handleSaveReport = useCallback(async (id: number) => {
    const report = reports.find((r) => r.id === id);
    if (report) {
      setSavingReportId(id);
      try {
        onSaveReport?.(report);
        await saveToServer({ reports, noOfScanReports, attachmentFileName: attachmentFile?.name, attachmentPath: '' });
      } finally {
        setSavingReportId(null);
      }
    }
  }, [reports, noOfScanReports, attachmentFile, onSaveReport, saveToServer]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setAttachmentFile(null);
      clearField('attachmentFile');
      return;
    }
    const fileErr = runValidators(
      fileType(file, ATTACHMENT_ALLOWED_EXT, 'Attachment'),
      fileMaxSize(file, ATTACHMENT_MAX_BYTES, 'Attachment'),
    );
    if (fileErr) {
      setFieldError('attachmentFile', fileErr);
      setAttachmentFile(null);
      e.target.value = '';
      return;
    }
    clearField('attachmentFile');
    setAttachmentFile(file);
  }, [clearField, setFieldError]);

  const handleSaveAttachment = useCallback((event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (attachmentFile) {
      const fileErr = runValidators(
        fileType(attachmentFile, ATTACHMENT_ALLOWED_EXT, 'Attachment'),
        fileMaxSize(attachmentFile, ATTACHMENT_MAX_BYTES, 'Attachment'),
      );
      if (applyAndFocus(fileErr ? { attachmentFile: fileErr } : {})) return;
    }
    onSaveAttachment?.({
      noOfScanReports,
      file: attachmentFile,
    });
    saveToServer({
      reports,
      noOfScanReports,
      attachmentFileName: attachmentFile?.name ?? '',
      attachmentPath: '',
    });
  }, [noOfScanReports, attachmentFile, reports, onSaveAttachment, saveToServer, applyAndFocus]);

  const inputClassName =
    'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] duration-200 hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
  const actionClassName =
    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';
  const hasFlightSerial = flight?.sNo != null && String(flight.sNo).trim() !== '';

  return (
    <div className={FLIGHT_DETAILS_FORM_ROOT_CLASS}>
      <header className="shrink-0 bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-white shadow-sm sm:px-5">
        <div className="flex w-full min-w-0 items-center gap-3">
          <span className="rounded-lg bg-white/15 p-2" aria-hidden="true">
            <Paperclip className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">Attachments</h2>
            <p className="mt-0.5 truncate text-xs text-emerald-50">
              SNo {flight?.sNo || '—'} • Flight {flight?.flightNo || '—'} • {flight?.airline || '—'}
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSaveAttachment} className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className="w-full min-w-0 space-y-6">
          <section className={FLIGHT_DETAILS_SECTION_CLASS} aria-labelledby="attachments-context">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 id="attachments-context" className="text-sm font-semibold text-gray-700">FHR No:</h3>
              <span className="text-xl font-bold text-emerald-600">{flight?.sNo || '—'}</span>
              <div aria-live="polite" className="text-sm sm:ml-auto">
                {!hasFlightSerial && <span className="text-amber-700">Select a flight before saving.</span>}
                {saveStatus === 'saving' && <span className="text-gray-600">Saving…</span>}
                {saveStatus === 'success' && <span className="font-medium text-emerald-600">Saved.</span>}
                {saveStatus === 'error' && saveError && <span className="text-red-600">{saveError}</span>}
              </div>
            </div>
          </section>

          <section className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-3`} aria-labelledby="reports-heading">
            <div>
              <h3 id="reports-heading" className="text-sm font-semibold text-gray-900">Reports</h3>
              <p className="mt-1 text-xs text-gray-500">Save any row after updating its report details.</p>
            </div>

            {reports.map((report) => {
              const isSavingRow = savingReportId === report.id;
              return (
                <div
                  key={report.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:grid sm:grid-cols-12 sm:items-end"
                >
                  <div className="sm:col-span-3">
                    <div className="flex min-h-11 items-center">
                      <input
                        id={`attachment-report-${report.id}-checked`}
                        type="checkbox"
                        checked={report.checked}
                        onChange={(e) => handleReportChange(report.id, 'checked', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label
                        htmlFor={`attachment-report-${report.id}-checked`}
                        className="ml-2 cursor-pointer text-sm font-medium text-gray-700"
                      >
                        {report.label}
                      </label>
                    </div>
                    <FormFieldError />
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor={`attachment-report-${report.id}-name`} className="mb-1.5 block text-xs font-medium text-gray-700">
                      Report Name
                    </label>
                    <input
                      id={`attachment-report-${report.id}-name`}
                      type="text"
                      value={report.reportName}
                      onChange={(e) => handleReportChange(report.id, 'reportName', e.target.value)}
                      className={inputClassName}
                      placeholder="Enter report name"
                    />
                    <FormFieldError />
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor={`attachment-report-${report.id}-number`} className="mb-1.5 block text-xs font-medium text-gray-700">
                      Report No.
                    </label>
                    <input
                      id={`attachment-report-${report.id}-number`}
                      type="text"
                      value={report.reportNo}
                      onChange={(e) => handleReportChange(report.id, 'reportNo', e.target.value)}
                      className={inputClassName}
                      placeholder="Enter report number"
                    />
                    <FormFieldError />
                  </div>

                  <div className={cn('sm:col-span-2', FLIGHT_FILTER_ACTIONS_PB)}>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSaveReport(report.id)}
                      disabled={!hasFlightSerial || saveStatus === 'saving'}
                      title={!hasFlightSerial ? 'Select a flight before saving' : undefined}
                      className={actionClassName}
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {isSavingRow ? 'Saving…' : 'Save'}
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className={`${FLIGHT_DETAILS_SECTION_CLASS} space-y-5`} aria-labelledby="scan-attachments-heading">
            <div>
              <h3 id="scan-attachments-heading" className="text-sm font-semibold text-gray-900">Scan report metadata</h3>
              <p className="mt-1 text-xs text-gray-500">
                Current save stores selected file name only; file bytes are not uploaded.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="attachment-scan-count" className="mb-1.5 block text-sm font-medium text-gray-700">
                  No of Scan Reports
                </label>
                <input
                  id="attachment-scan-count"
                  type="text"
                  value={noOfScanReports}
                  onChange={(e) => setNoOfScanReports(e.target.value)}
                  className={inputClassName}
                  placeholder="Enter number of scan reports"
                />
              <FormFieldError />
              </div>

              <div>
                <label htmlFor="field-attachmentFile" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Attachment file
                </label>
                <input
                  id="field-attachmentFile"
                  type="file"
                  accept={ATTACHMENT_ALLOWED_EXT.join(',')}
                  onChange={handleFileChange}
                  aria-invalid={Boolean(errors.attachmentFile)}
                  aria-describedby={
                    errors.attachmentFile
                      ? 'field-attachmentFile-error'
                      : 'attachment-file-help'
                  }
                  className={cn(
                    'block min-h-11 w-full cursor-pointer rounded-lg border border-gray-300 bg-white text-sm text-gray-700 file:mr-3 file:min-h-11 file:cursor-pointer file:border-0 file:bg-emerald-50 file:px-4 file:py-2.5 file:font-medium file:text-emerald-700 hover:border-emerald-400 hover:file:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                    errors.attachmentFile && FRIS_INVALID_CONTROL,
                  )}
                />
                <FormFieldError id="field-attachmentFile-error" message={errors.attachmentFile} />
                <p id="attachment-file-help" className="mt-1.5 text-xs text-gray-500">
                  Selecting a file records metadata only. Max 5 MB; PDF, images, or Office docs.
                </p>
                {attachmentFile && (
                  <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate font-medium">{attachmentFile.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 pt-4">
              <motion.button
                type="submit"
                whileTap={{ scale: 0.98 }}
                disabled={!hasFlightSerial || saveStatus === 'saving'}
                title={!hasFlightSerial ? 'Select a flight before saving' : undefined}
                className={actionClassName}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saveStatus === 'saving' && savingReportId === null ? 'Saving…' : 'Save All'}
              </motion.button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
