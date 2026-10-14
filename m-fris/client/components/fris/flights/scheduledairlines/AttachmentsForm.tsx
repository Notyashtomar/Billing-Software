'use client';

import React, { useState, useEffect } from 'react';
import { Paperclip, Save, ArrowLeft, FileText } from 'lucide-react';
import {
  FlightData,
  MainDetailsData,
  AttachmentsData,
  normalizeAttachmentsData,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getNsRawFormSavedUrl } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { toast } from 'sonner';
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
  checked: boolean;
  reportName: string;
  reportNo: string;
}

export interface AttachmentsFormProps {
  flight: FlightData;
  fhrNo?: string;
  onBack?: () => void;
  showBackButton?: boolean;
  mainDetails?: MainDetailsData | null;
}

export default function AttachmentsForm({ 
  flight, 
  fhrNo: fhrNoProp,
  onBack, 
  showBackButton = true,
  mainDetails,
}: AttachmentsFormProps) {
  const displayAirline  = mainDetails?.airlineName  ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode    ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType  ?? flight.aircraft;
  const [reports, setReports] = useState<ReportRow[]>([
    { id: 1, checked: false, reportName: '', reportNo: '' },
    { id: 2, checked: false, reportName: '', reportNo: '' },
    { id: 3, checked: false, reportName: '', reportNo: '' },
    { id: 4, checked: false, reportName: '', reportNo: '' },
    { id: 5, checked: false, reportName: '', reportNo: '' },
    { id: 6, checked: false, reportName: '', reportNo: '' },
  ]);

  const [noOfScanReports, setNoOfScanReports] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [savingStates, setSavingStates] = useState<{ [key: number]: boolean }>({});
  const [isSavingMain, setIsSavingMain] = useState(false);
  const { errors, clearField, applyAndFocus, setFieldError } =
    useFieldErrors<AttachmentField>(ATTACHMENT_FIELD_ORDER);

  const displayFhrNo =
    (fhrNoProp && fhrNoProp.trim()) ||
    (flight.destination != null && flight.slNo != null
      ? `${String(flight.destination).trim()}/${flight.slNo}`
      : flight.flightNo?.trim() || '—');

  const attachmentsApiUrl = () =>
    getNsRawFormSavedUrl('attachments-details', nsFormSerialForFlight(flight));

  const buildPayload = (): Record<string, unknown> => ({
    reports: reports.map((r) => ({
      checked: r.checked,
      reportName: r.reportName,
      reportNo: r.reportNo,
    })),
    noOfScanReports: noOfScanReports.trim() || undefined,
    attachmentFileName: attachmentFile?.name || undefined,
  });

  const persistAttachments = async (): Promise<boolean> => {
    if (!flight?.slNo) return false;
    const res = await fetch(attachmentsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      toast.error(text ? `Save failed: ${text.slice(0, 120)}` : 'Failed to save attachments');
      return false;
    }
    toast.success('Attachments saved');
    return true;
  };

  useEffect(() => {
    if (!flight?.slNo) return;
    const url = attachmentsApiUrl();
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const data = normalizeAttachmentsData(raw) as AttachmentsData | null;
        if (data?.reports && data.reports.length > 0) {
          setReports(prev =>
            prev.map((r, i) => {
              const from = data.reports![i];
              if (!from) return r;
              return {
                id: r.id,
                checked: from.checked ?? false,
                reportName: from.reportName ?? '',
                reportNo: from.reportNo ?? '',
              };
            })
          );
        }
        if (data?.noOfScanReports != null) setNoOfScanReports(data.noOfScanReports);
      })
      .catch(() => {});
  }, [flight?.slNo]);

  const updateReport = (id: number, field: keyof ReportRow, value: string | boolean) => {
    setReports(prev =>
      prev.map(report =>
        report.id === id ? { ...report, [field]: value } : report
      )
    );
  };

  const handleSaveReport = async (id: number) => {
    setSavingStates((prev) => ({ ...prev, [id]: true }));
    try {
      await persistAttachments();
    } finally {
      setSavingStates((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (attachmentFile) {
      const fileErr = runValidators(
        fileType(attachmentFile, ATTACHMENT_ALLOWED_EXT, 'Attachment'),
        fileMaxSize(attachmentFile, ATTACHMENT_MAX_BYTES, 'Attachment'),
      );
      if (applyAndFocus(fileErr ? { attachmentFile: fileErr } : {})) return;
    }
    setIsSavingMain(true);
    try {
      await persistAttachments();
    } finally {
      setIsSavingMain(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all duration-200 hover:border-emerald-400 hover:shadow-sm active:scale-[0.98]';
  
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1.5 transition-colors duration-200';
  
  const checkboxClass = 'w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 transition-all duration-200 hover:scale-110 hover:border-emerald-400';

  const saveButtonClass = 'px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-300 transition-colors duration-200 active:scale-[0.98] shadow-sm disabled:opacity-70 disabled:cursor-not-allowed';

  return (
    <div className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-gradient-to-br from-gray-50 to-white animate-fadeIn`}>
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-3 text-white shadow-md sm:px-4">
        {showBackButton && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-emerald-700 transition-all duration-200 hover:scale-105 active:scale-95 group"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg shadow-sm backdrop-blur-sm">
            <Paperclip className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">Attachments in Scheduled / Additional Flight</h2>
            <p className="text-xs text-emerald-100 mt-0.5">
              Sl. No. {displayScheduledAirlinesTableSerial(flight)} • Flight {displayFlightNo || '—'} •{' '}
              {displayAirline || '—'}
              {displayAircraft ? ` • ${displayAircraft}` : ''}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveMain} className={`${FLIGHT_DETAILS_FORM_BODY_CLASS} animate-slideUp`}>
        {/* FHR No */}
        <section className={FLIGHT_DETAILS_SECTION_CLASS}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700">FHR No:</span>
            <span className="text-2xl font-bold text-emerald-600">{displayFhrNo}</span>
          </div>
        </section>

        {/* Reports Section */}
        <section className={`${FLIGHT_DETAILS_SECTION_CLASS} p-5 transition-all duration-300 hover:shadow-md`}>
          <div className="space-y-4">
            {reports.map((report) => (
              <div 
                key={report.id} 
                className="flex flex-col gap-3 rounded-lg border border-gray-100 p-3 transition-all duration-200 hover:border-emerald-200 hover:bg-gradient-to-r hover:from-emerald-50/30 hover:to-transparent sm:grid sm:grid-cols-12 sm:items-center"
              >
                {/* Checkbox */}
                <div className="sm:col-span-3">
                  <div className="flex min-h-[42px] items-center gap-3">
                    <input
                      type="checkbox"
                      checked={report.checked}
                      onChange={(e) => updateReport(report.id, 'checked', e.target.checked)}
                      className={checkboxClass}
                      id={`report-${report.id}-check`}
                    />
                    <label
                      htmlFor={`report-${report.id}-check`}
                      className="cursor-pointer text-sm font-medium text-gray-700"
                    >
                      Report {report.id}
                    </label>
                  </div>
                  <FormFieldError />
                </div>

                {/* Report Name */}
                <div className="sm:col-span-4">
                  <div>
                    <label className={labelClass}>
                      <span className="text-emerald-600 font-semibold">Report Name</span>
                    </label>
                    <input
                      type="text"
                      value={report.reportName}
                      onChange={(e) => updateReport(report.id, 'reportName', e.target.value)}
                      className={inputClass}
                      placeholder="Enter report name"
                    />
                    <FormFieldError />
                  </div>
                </div>

                {/* Report No */}
                <div className="sm:col-span-3">
                  <div>
                    <label className={labelClass}>
                      <span className="text-emerald-600 font-semibold">Report No.</span>
                    </label>
                    <input
                      type="text"
                      value={report.reportNo}
                      onChange={(e) => updateReport(report.id, 'reportNo', e.target.value)}
                      className={inputClass}
                      placeholder="Enter report no."
                    />
                    <FormFieldError />
                  </div>
                </div>

                {/* Save Button */}
                <div className={cn('sm:col-span-2 sm:flex sm:items-end', FLIGHT_FILTER_ACTIONS_PB)}>
                  <button
                    type="button"
                    onClick={() => handleSaveReport(report.id)}
                    disabled={savingStates[report.id]}
                    className={saveButtonClass}
                  >
                    {savingStates[report.id] ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="text-xs">Saving...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* No of Scan Reports & Attachment */}
        <section className={`${FLIGHT_DETAILS_SECTION_CLASS} p-5 transition-all duration-300 hover:shadow-md`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* No of Scan Reports */}
            <div className="group">
              <label className={`${labelClass} text-sm font-semibold text-gray-800`}>
                No of Scan Reports
              </label>
              <input
                type="text"
                value={noOfScanReports}
                onChange={(e) => setNoOfScanReports(e.target.value)}
                className={inputClass}
                placeholder="Enter number of scan reports"
              />
              <FormFieldError />
            </div>

            {/* Attachment */}
            <div className="group">
              <label htmlFor="field-attachmentFile" className={`${labelClass} text-sm font-semibold text-gray-800`}>
                Attachment
              </label>
              <div className="relative">
                <input
                  id="field-attachmentFile"
                  type="file"
                  accept={ATTACHMENT_ALLOWED_EXT.join(',')}
                  onChange={handleFileChange}
                  aria-invalid={Boolean(errors.attachmentFile)}
                  aria-describedby={errors.attachmentFile ? 'field-attachmentFile-error' : undefined}
                  className={cn(
                    'block w-full text-sm text-gray-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 file:cursor-pointer cursor-pointer border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 hover:border-emerald-400 transition-all duration-200',
                    errors.attachmentFile && FRIS_INVALID_CONTROL,
                  )}
                />
                <FormFieldError id="field-attachmentFile-error" message={errors.attachmentFile} />
                {attachmentFile && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">{attachmentFile.name}</span>
                    <span className="text-gray-500">
                      ({(attachmentFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Save Button */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSavingMain}
              className={`${saveButtonClass} px-6 py-3 text-base`}
            >
              {isSavingMain ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  <span>Save All</span>
                </div>
              )}
            </button>
          </div>
        </section>

      </form>
    </div>
  );
}
