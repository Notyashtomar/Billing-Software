'use client';

import React, { useState, useEffect } from 'react';
import {
  FlightData,
  MainDetailsData,
  RemarksData,
  AIRLINE_REMARKS_RATINGS,
  normalizeRemarksData,
  displayScheduledAirlinesTableSerial,
  staDateStringToIsoYmd,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getFormApiUrl, FORM_PATHS } from '@/lib/api';
import { frisFetch } from '@/lib/fris-auth-fetch';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  maxLength,
  selectRequired,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import {
  FLIGHT_DETAILS_FORM_BODY_CLASS,
  FLIGHT_DETAILS_FORM_ROOT_CLASS,
  FLIGHT_DETAILS_SECTION_CLASS,
} from './flightDetailsFormLayout';

const fetch = frisFetch;

const REMARKS_FIELD_ORDER = ['rating', 'ghRemarks', 'airlineRemarks', 'feedback'] as const;
type RemarksField = (typeof REMARKS_FIELD_ORDER)[number];
const REMARKS_MAX = 500;

export interface RemarksFormProps {
  flight: FlightData;
  /** Server-verified main details — preferred over raw FlightData for airline, flight code, and aircraft type */
  mainDetails?: MainDetailsData | null;
}

export default function RemarksForm({ flight, mainDetails }: RemarksFormProps) {
  const displayAirline  = mainDetails?.airlineName  ?? flight.airline;
  const displayFlightNo = mainDetails?.flightCode    ?? flight.flightNo;
  const displayAircraft = mainDetails?.aircraftType  ?? flight.aircraft;
  const [ghRemarks, setGhRemarks] = useState('');
  const [airlineRemarks, setAirlineRemarks] = useState('');
  const [airlineRemarksRating, setAirlineRemarksRating] = useState('');
  const [wantFeedback, setWantFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  /** True when a remarks document already exists for this flight (use PATCH, not POST). */
  const [isExisting, setIsExisting] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<RemarksField>(REMARKS_FIELD_ORDER);

  useEffect(() => {
    const ser = nsFormSerialForFlight(flight);
    if (!ser) return;
    const url = getFormApiUrl(ser, FORM_PATHS.remarks);
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        const data = normalizeRemarksData(raw) as RemarksData | null;
        if (data) {
          setIsExisting(true);
          if (data.ghRemarks != null) setGhRemarks(data.ghRemarks);
          if (data.airlineRemarks != null) setAirlineRemarks(data.airlineRemarks);
          if (data.airlineRemarksRating != null) {
            setAirlineRemarksRating(String(data.airlineRemarksRating));
          }
          if (data.wantFeedback != null) setWantFeedback(data.wantFeedback);
          if (data.feedbackRemarks != null) setFeedbackText(data.feedbackRemarks);
        }
      })
      .catch(() => {});
  }, [flight?.slNo, flight?.legacySlNo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    const ratingTrim = airlineRemarksRating.trim();
    const next: FieldErrors<RemarksField> = {};
    const ratingErr =
      selectRequired(ratingTrim, 'rating') ||
      (!AIRLINE_REMARKS_RATINGS.includes(ratingTrim as (typeof AIRLINE_REMARKS_RATINGS)[number])
        ? 'Select a valid rating.'
        : null);
    if (ratingErr) next.rating = ratingErr;
    const ghErr = maxLength(ghRemarks, REMARKS_MAX, 'GH remarks');
    if (ghErr) next.ghRemarks = ghErr;
    const airlineErr = maxLength(airlineRemarks, REMARKS_MAX, 'Airline remarks');
    if (airlineErr) next.airlineRemarks = airlineErr;
    if (wantFeedback) {
      const fbErr = maxLength(feedbackText, REMARKS_MAX, 'Feedback');
      if (fbErr) next.feedback = fbErr;
    }
    if (applyAndFocus(next)) return;

    const flightStaDateIso = staDateStringToIsoYmd(flight.staDate);
    if (!flightStaDateIso) {
      setSaveError('This flight has no usable STA date; remarks cannot be saved for the dashboard date range.');
      return;
    }

    setIsSaving(true);

    const payload: Omit<RemarksData, '_id' | 'serialNo'> = {
      airline: displayAirline,
      flightNo: displayFlightNo,
      toOpenInTab: false,
      ghRemarks,
      ghRep: '',
      airlineRemarks,
      airlineRemarksRating: ratingTrim,
      flightStaDateIso,
      wantFeedback,
      feedbackRemarks: feedbackText,
      airlineRep: '',
    };

    const url = getFormApiUrl(nsFormSerialForFlight(flight), FORM_PATHS.remarks);
    /** POST upserts on server (create or replace by serial). */
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        setSaveError(`Failed to save: ${res.status} ${text}`);
      } else {
        setIsExisting(true);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      setSaveError('Network error – could not reach server.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputBase = 'w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all';
  const inputClass = `${inputBase} border-gray-300 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500`;
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className={`${FLIGHT_DETAILS_FORM_ROOT_CLASS} bg-gradient-to-br from-gray-50 to-white`}>
      <div className={FLIGHT_DETAILS_FORM_BODY_CLASS}>
        <form onSubmit={handleSave} className="w-full min-w-0 space-y-6">
          {/* Flight Identification */}
          <div className={FLIGHT_DETAILS_SECTION_CLASS}>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Flight</h3>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-600">SNo :</span>{' '}
                <span className="font-medium text-gray-900">
                  {displayScheduledAirlinesTableSerial(flight)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Airline :</span>{' '}
                <span className="font-medium text-gray-900">{displayAirline || '—'}</span>
              </div>
              <div>
                <span className="text-gray-600">Flight No. :</span>{' '}
                <span className="font-medium text-gray-900">{displayFlightNo || '—'}</span>
              </div>
              <div>
                <span className="text-gray-600">Aircraft Type :</span>{' '}
                <span className="font-medium text-gray-900">{displayAircraft || '—'}</span>
              </div>
            </div>
          </div>

          {/* GH Remarks & Airline Remarks */}
          <div className={FLIGHT_DETAILS_SECTION_CLASS}>
            <div className="mb-4">
              <label htmlFor="field-rating" className={labelClass}>
                Rating <span className="text-red-600">*</span>
              </label>
              <AdminRadioDropdown
                id="field-rating"
                value={airlineRemarksRating}
                onChange={(v) => {
                  setAirlineRemarksRating(v);
                  clearField('rating');
                }}
                options={AIRLINE_REMARKS_RATINGS.map((r) => ({ value: r, label: r }))}
                placeholder="Select rating…"
                className={cn(inputClass, errors.rating && FRIS_INVALID_CONTROL)}
                aria-invalid={Boolean(errors.rating)}
                aria-describedby={errors.rating ? 'field-rating-error' : undefined}
              />
              <FormFieldError id="field-rating-error" message={errors.rating} />
              <p className="mt-1 text-xs text-gray-500">Required to save. Used for the Airline Remarks dashboard chart.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="field-ghRemarks" className={labelClass}>
                  GH Remarks:
                </label>
                <textarea
                  id="field-ghRemarks"
                  value={ghRemarks}
                  onChange={(e) => {
                    setGhRemarks(e.target.value);
                    clearField('ghRemarks');
                  }}
                  rows={6}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.ghRemarks)}
                  aria-describedby={errors.ghRemarks ? 'field-ghRemarks-error' : undefined}
                  className={cn(
                    inputClass,
                    'resize-y min-h-[120px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                    errors.ghRemarks && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="Enter GH remarks…"
                />
                <FormFieldError id="field-ghRemarks-error" message={errors.ghRemarks} />
              </div>
              <div>
                <label htmlFor="field-airlineRemarks" className={labelClass}>
                  Airline Remarks:
                </label>
                <textarea
                  id="field-airlineRemarks"
                  value={airlineRemarks}
                  onChange={(e) => {
                    setAirlineRemarks(e.target.value);
                    clearField('airlineRemarks');
                  }}
                  rows={6}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.airlineRemarks)}
                  aria-describedby={errors.airlineRemarks ? 'field-airlineRemarks-error' : undefined}
                  className={cn(
                    inputClass,
                    'resize-y min-h-[120px] whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
                    errors.airlineRemarks && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="Enter airline remarks…"
                />
                <FormFieldError id="field-airlineRemarks-error" message={errors.airlineRemarks} />
              </div>
            </div>
          </div>

          {/* Feedback / Area of improvement */}
          <div className={FLIGHT_DETAILS_SECTION_CLASS}>
            <div className="flex flex-wrap items-start gap-4">
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="radio"
                  checked={wantFeedback}
                  onChange={() => setWantFeedback(true)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">
                  If you want to give Feedback/area of improvement
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="radio"
                  checked={!wantFeedback}
                  onChange={() => setWantFeedback(false)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">No</span>
              </label>
            </div>
            {wantFeedback && (
              <div className="mt-4">
                <label htmlFor="field-feedback" className={labelClass}>
                  Feedback/area of improvement:
                </label>
                <input
                  id="field-feedback"
                  type="text"
                  value={feedbackText}
                  onChange={(e) => {
                    setFeedbackText(e.target.value);
                    clearField('feedback');
                  }}
                  maxLength={REMARKS_MAX}
                  aria-invalid={Boolean(errors.feedback)}
                  aria-describedby={errors.feedback ? 'field-feedback-error' : undefined}
                  className={cn(inputClass, errors.feedback && FRIS_INVALID_CONTROL)}
                  placeholder="Enter feedback or area of improvement…"
                />
                <FormFieldError id="field-feedback-error" message={errors.feedback} />
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center justify-end gap-4">
            {saveError && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
            {saveSuccess && (
              <span className="text-sm text-emerald-600 font-medium">Saved successfully.</span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-70"
            >
              {isSaving ? 'Saving…' : isExisting ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
