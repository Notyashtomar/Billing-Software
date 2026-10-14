'use client';

import { useCallback, useState } from 'react';
import { ExternalLink, FileText, Users, Wrench } from 'lucide-react';
import type { BaseFormProps } from './types';
import type { NonScheduledReportType } from './nonScheduledReportDownloads';
import { openNonScheduledReportPreview } from './nonScheduledReportPreview';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const REPORT_OPTIONS = [
  {
    id: 'fhr' as const,
    title: 'FHR Report',
    description: 'Complete flight handling report',
    icon: FileText,
  },
  {
    id: 'gse' as const,
    title: 'GSE Report',
    description: 'Equipment and manpower summary',
    icon: Wrench,
  },
  {
    id: 'team' as const,
    title: 'Team Report',
    description: 'Detailed equipment and manpower allocation',
    icon: Users,
  },
] as const;

export default function ReportsForm({ flight }: BaseFormProps) {
  const [selectedReport, setSelectedReport] = useState<NonScheduledReportType>('fhr');
  const [openError, setOpenError] = useState<string | null>(null);

  const handleOpenPreview = useCallback(() => {
    if (!flight) return;
    setOpenError(null);
    try {
      openNonScheduledReportPreview(flight, selectedReport);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : 'Could not open report preview.');
    }
  }, [flight, selectedReport]);

  return (
    <div
      className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-gradient-to-br from-gray-50 to-white`}
    >
      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <div className="w-full min-w-0 space-y-4 sm:space-y-6">
          <header>
            <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose a report, open the preview, then download the PDF from that page.
            </p>
          </header>

          <section
            className={FLIGHT_DETAILS_SECTION_CLASS}
            aria-labelledby="reports-flight-heading"
          >
            <div className="mb-4 flex items-center gap-2">
              <FileText
                className="h-5 w-5 text-emerald-600"
                aria-hidden="true"
              />
              <h3
                id="reports-flight-heading"
                className="text-sm font-semibold text-gray-800"
              >
                Flight Information
              </h3>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Serial No', flight?.sNo || '—'],
                ['Airline', flight?.airline || '—'],
                ['Flight No', flight?.flightNo || '—'],
                ['Aircraft', flight?.aircraft || '—'],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg bg-gray-50 p-3">
                  <dt className="mb-1 text-xs text-gray-500">{label}</dt>
                  <dd
                    className={`truncate font-semibold ${
                      label === 'Flight No'
                        ? 'text-emerald-600'
                        : 'text-gray-900'
                    }`}
                    title={String(value)}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            className={`${FLIGHT_DETAILS_SECTION_CLASS} w-full`}
            aria-labelledby="report-selection-heading"
          >
            <fieldset>
              <legend
                id="report-selection-heading"
                className="mb-4 text-sm font-semibold text-gray-800"
              >
                Select Report Type
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REPORT_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors focus-within:ring-2 focus-within:ring-emerald-500/40 ${
                      selectedReport === option.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportType"
                      value={option.id}
                      checked={selectedReport === option.id}
                      onChange={() => setSelectedReport(option.id)}
                      className="h-4 w-4 shrink-0 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <option.icon
                      className="h-5 w-5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm ${
                        selectedReport === option.id
                          ? 'font-medium text-emerald-800'
                          : 'text-gray-700'
                        }`}
                      >
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-6">
              <button
                type="button"
                onClick={handleOpenPreview}
                disabled={!flight}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 disabled:shadow-none disabled:active:scale-100 sm:ml-auto sm:w-auto"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View {selectedReport.toUpperCase()} Preview
              </button>
              {openError && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="mt-3 text-sm text-red-600"
                >
                  {openError}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
