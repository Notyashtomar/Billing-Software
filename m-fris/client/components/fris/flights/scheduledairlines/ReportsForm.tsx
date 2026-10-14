'use client';

import React, { useState, useEffect } from 'react';
import {
  FlightData,
  MainDetailsData,
  ReportData,
  normalizeReportData,
  normalizeRampDetails2List,
  mapRampDetails2ToEmployeeAllocation,
  type EmployeeAllocationRowData,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getApiBase, getNsRawFormSavedUrl } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { Mail, FileText, Loader2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { email, FRIS_INVALID_CONTROL, required } from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';
import {
  scheduleStaDateDisplay,
  scheduleStdDateDisplay,
  scheduleStaTimeRawDisplay,
  scheduleStdTimeRawDisplay,
} from './scheduledRowSchedule';
import { persistEquipmentReportHeaderPrefill } from './scheduledEquipmentReportHeader';

const fetch = frisFetch;

const EMAIL_FIELD_ORDER = ['emailAddress'] as const;
type EmailField = (typeof EMAIL_FIELD_ORDER)[number];

export type ReportType = 'fhr-report' | 'equipment-sheet' | 'safety-report' | 'ramp-duty-allocation';

export interface ReportsFormProps {
  flight: FlightData;
  mainDetails?: MainDetailsData | null;
}

function getLoggedInUserName(): string {
  if (typeof window === 'undefined') return '';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.name || user.username || user.fullName || user.displayName || '';
    }
  } catch {
    // ignore parse errors
  }
  return '';
}

export default function ReportsForm({ flight, mainDetails }: ReportsFormProps) {
  const displayAirline  = mainDetails?.airlineName  ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode    ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType  ?? flight.aircraft;
  const [reportType, setReportType] = useState<ReportType>('fhr-report');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState('');
  const { errors, clearField, clearAll, applyAndFocus } = useFieldErrors<EmailField>(EMAIL_FIELD_ORDER);
  /** Schedule strings come from the table row (`fhr_collection` daily list), not `raw_flight_data`. */
  const scheduleStaDate = scheduleStaDateDisplay(flight, null);
  const scheduleStdDate = scheduleStdDateDisplay(flight, null);
  const scheduleStaTime = scheduleStaTimeRawDisplay(flight, null);
  const scheduleStdTime = scheduleStdTimeRawDisplay(flight, null);

  useEffect(() => {
    setLoggedInUser(getLoggedInUserName());
  }, []);

  useEffect(() => {
    if (!flight?.slNo) return;
    const url = `${getApiBase()}/reports/by-serial/${flight.slNo}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        list.forEach((item: unknown) => normalizeReportData(item));
      })
      .catch(() => {});
  }, [flight?.slNo]);

  const openFHRReportInNewTab = () => {
    const instanceSl = String(flight.slNo ?? '').trim();
    const apiSerial = String(nsFormSerialForFlight(flight) ?? '').trim() || instanceSl;
    const params = new URLSearchParams({
      flightSlNo: apiSerial,
      tableSerial: displayScheduledAirlinesTableSerial(flight),
    });
    if (instanceSl && apiSerial && instanceSl !== apiSerial) {
      params.set('instanceSlNo', instanceSl);
    }
    window.open(`/fris/flights/scheduledairlines/fhr-report?${params.toString()}`, '_blank');
  };

  const openEquipmentReportInNewTab = () => {
    const params = persistEquipmentReportHeaderPrefill(flight, { mainDetails });
    window.open(`/fris/flights/scheduledairlines/equipment-report?${params.toString()}`, '_blank');
  };

  const handleViewPrint = async () => {
    setIsGenerating(true);
    try {
      switch (reportType) {
        case 'fhr-report':
          openFHRReportInNewTab();
          toast.success('Opening FHR Report in new tab');
          break;
        case 'equipment-sheet':
          openEquipmentReportInNewTab();
          toast.success('Opening Equipment Report in new tab');
          break;
        case 'safety-report': {
          const { downloadPlaceholderReportPdf } = await import('./reportsPdf');
          await downloadPlaceholderReportPdf(flight, 'Safety Report');
          toast.success('Safety Report generated');
          break;
        }
        case 'ramp-duty-allocation': {
          const { downloadRampDutyAllocationPdf } = await import('./reportsPdf');
          let allocations: EmployeeAllocationRowData[] = [];
          const serial = nsFormSerialForFlight(flight);
          if (serial) {
            try {
              const res = await fetch(getNsRawFormSavedUrl('ramp-details-2', serial));
              if (res.ok) {
                const raw = await res.json();
                allocations = normalizeRampDetails2List(raw).map(
                  mapRampDetails2ToEmployeeAllocation,
                );
              }
            } catch {
              allocations = [];
            }
          }
          await downloadRampDutyAllocationPdf(flight, allocations);
          toast.success('Ramp Duty Allocation generated');
          break;
        }
      }
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    const reqErr = required(emailAddress, 'Email address');
    const fmtErr = email(emailAddress, 'Email address');
    if (applyAndFocus(reqErr || fmtErr ? { emailAddress: reqErr || fmtErr || undefined } : {})) {
      return;
    }

    setIsSendingEmail(true);
    try {
      const { sendFlightReportEmail } = await import('./reportsPdf');
      const success = await sendFlightReportEmail(flight, emailAddress, mainDetails, loggedInUser);
      if (success) {
        toast.success(`Report sent to ${emailAddress}`);
        setShowEmailModal(false);
        setEmailAddress('');
        clearAll();
      } else {
        toast.error('Failed to send email. Please try again.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send email. Please try again.');
      console.error(error);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleClearAirlineRepSignature = () => {
    toast.info('Clearing airline representative signature...');
  };

  return (
    <div className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-gradient-to-br from-gray-50 to-white`}>
      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className="w-full min-w-0 space-y-6">
          {/* Flight identification */}
          <div className={FLIGHT_DETAILS_SECTION_CLASS}>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Flight Information</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 text-xs block mb-1">Serial No</span>
                <span className="font-semibold text-gray-900">
                  {displayScheduledAirlinesTableSerial(flight)}
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 text-xs block mb-1">Airline</span>
                <span className="font-semibold text-gray-900">{displayAirline || '—'}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 text-xs block mb-1">Flight No</span>
                <span className="font-semibold text-emerald-600">{displayFlightNo || '—'}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-gray-500 text-xs block mb-1">Aircraft</span>
                <span className="font-semibold text-gray-900">{displayAircraft || '—'}</span>
              </div>
            </div>
          </div>

          {/* Report type selection */}
          <div className={`${FLIGHT_DETAILS_SECTION_CLASS} shadow-sm transition-shadow hover:shadow-md`}>
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Select Report Type</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { value: 'fhr-report', label: 'FHR Report', icon: '📋' },
                { value: 'equipment-sheet', label: 'Equipment Sheet', icon: '🔧' },
                { value: 'safety-report', label: 'Safety Report', icon: '🛡️' },
                { value: 'ramp-duty-allocation', label: 'Ramp Duty Allocation', icon: '👷' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    reportType === option.value
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportType"
                    checked={reportType === option.value}
                    onChange={() => setReportType(option.value as ReportType)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                  />
                  <span className="text-lg">{option.icon}</span>
                  <span className={`text-sm ${reportType === option.value ? 'font-medium text-emerald-700' : 'text-gray-700'}`}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                clearAll();
                setShowEmailModal(true);
              }}
              className="px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-sm hover:shadow"
            >
              <Mail className="w-4 h-4" />
              Send Email
            </button>
            <button
              type="button"
              onClick={handleViewPrint}
              disabled={isGenerating}
              className="px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors flex items-center gap-2 shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening...
                </>
              ) : (reportType === 'fhr-report' || reportType === 'equipment-sheet') ? (
                <>
                  <ExternalLink className="w-4 h-4" />
                  View Report
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  View/Print
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClearAirlineRepSignature}
              className="px-4 py-2.5 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition-colors shadow-sm hover:shadow"
            >
              Clear Airline Rep. Signature
            </button>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-500" />
                Send Flight Report
              </h3>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  clearAll();
                }}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Send the flight report for <span className="font-medium">{displayFlightNo}</span> to the specified email address.
            </p>
            
            <div className="mb-5">
              <label htmlFor="field-emailAddress" className="block text-sm font-medium text-gray-700 mb-2">
                Recipient Email Address
              </label>
              <input
                id="field-emailAddress"
                type="email"
                value={emailAddress}
                onChange={(e) => {
                  setEmailAddress(e.target.value);
                  clearField('emailAddress');
                }}
                placeholder="example@email.com"
                aria-invalid={Boolean(errors.emailAddress)}
                aria-describedby={errors.emailAddress ? 'field-emailAddress-error' : undefined}
                className={cn(
                  'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all',
                  errors.emailAddress && FRIS_INVALID_CONTROL,
                )}
              />
              <FormFieldError id="field-emailAddress-error" message={errors.emailAddress} />
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowEmailModal(false);
                  clearAll();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={isSendingEmail}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
