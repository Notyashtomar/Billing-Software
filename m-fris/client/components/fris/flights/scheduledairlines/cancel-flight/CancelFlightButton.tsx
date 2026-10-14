'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  email,
  fileMaxSize,
  required,
  selectRequired,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { cn } from '@/lib/utils';
import { joinDatetimeLocal, splitDatetimeLocal } from '@/lib/datetimeLocal';
import { frisFetch } from '@/lib/fris-auth-fetch';
import type { FlightData } from '@/utils/dataProcessor';
import { nsFormSerialForFlight } from '@/utils/dataProcessor';
import { getApiBase } from '@/lib/api';
import {
  stashCancellationHistoryFocusDate,
  stashCancellationHistoryHighlight,
} from '@/contexts/DashboardNotificationContext';
import { broadcastCancellationEvent } from '@/lib/cancellation-bell';

const fetch = frisFetch;

const INTIMATION_MODE_OPTIONS = [
  { value: '', label: 'Select mode' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'In Person', label: 'In Person' },
  { value: 'Other', label: 'Other' },
];

const OTP1_FIELD_ORDER = ['otpStepOne'] as const;
const OTP2_FIELD_ORDER = ['otpStepTwo'] as const;
const INTIMATION_FIELD_ORDER = [
  'intimationDate',
  'intimationTimeOfDay',
  'intimatedBy',
  'intimationPersonEmail',
  'intimationMode',
  'proofFile',
] as const;

type Otp1Field = (typeof OTP1_FIELD_ORDER)[number];
type Otp2Field = (typeof OTP2_FIELD_ORDER)[number];
type IntimationField = (typeof INTIMATION_FIELD_ORDER)[number];

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  flight: FlightData;
  onCancelled?: () => void;
};

export default function CancelFlightButton({ flight, onCancelled }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stepOneOtpOpen, setStepOneOtpOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [stepTwoOtpOpen, setStepTwoOtpOpen] = useState(false);
  const [otpStepOne, setOtpStepOne] = useState('');
  const [otpStepTwo, setOtpStepTwo] = useState('');
  const [stepOneSent, setStepOneSent] = useState(false);
  const [stepTwoSent, setStepTwoSent] = useState(false);
  const [intimationTime, setIntimationTime] = useState('');
  const [intimatedBy, setIntimatedBy] = useState('');
  const [intimationPersonEmail, setIntimationPersonEmail] = useState('');
  const [intimationMode, setIntimationMode] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofAttachment, setProofAttachment] = useState<{
    fileName: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const otp1 = useFieldErrors<Otp1Field>(OTP1_FIELD_ORDER);
  const otp2 = useFieldErrors<Otp2Field>(OTP2_FIELD_ORDER);
  const intimation = useFieldErrors<IntimationField>(INTIMATION_FIELD_ORDER);

  const { date: intDate, time: intTime } = useMemo(() => splitDatetimeLocal(intimationTime), [intimationTime]);

  const flightId = String(nsFormSerialForFlight(flight) || flight.slNo || '').trim();
  const isCancelled = Boolean(flight.isCancelled);

  const authHeaders = () => {
    return {
      'Content-Type': 'application/json',
    };
  };

  const resetFlow = () => {
    setStepOneOtpOpen(false);
    setFormOpen(false);
    setStepTwoOtpOpen(false);
    setOtpStepOne('');
    setOtpStepTwo('');
    setStepOneSent(false);
    setStepTwoSent(false);
    setIntimationTime('');
    setIntimatedBy('');
    setIntimationPersonEmail('');
    setIntimationMode('');
    setProofNote('');
    setProofAttachment(null);
    otp1.clearAll();
    otp2.clearAll();
    intimation.clearAll();
  };

  const sendOtpStepOne = async () => {
    if (!flightId) {
      toast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ flightId, purpose: 'cancel-step-1' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'Failed to send OTP');
      setStepOneSent(true);
      toast.success('OTP sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtpStepOne = async () => {
    if (!flightId) {
      toast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    const otpErr =
      required(otpStepOne, 'OTP') ||
      (!/^\d{6}$/.test(otpStepOne) ? 'OTP must be exactly 6 digits.' : null);
    if (otp1.applyAndFocus(otpErr ? { otpStepOne: otpErr } : {})) return;
    setBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ flightId, purpose: 'cancel-step-1', otp: otpStepOne }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'OTP verification failed');
      toast.success('OTP verified');
      setStepOneOtpOpen(false);
      setFormOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const onProofFileChange = async (file: File | null) => {
    if (!file) {
      setProofAttachment(null);
      intimation.clearField('proofFile');
      return;
    }
    const sizeErr = fileMaxSize(file, PROOF_MAX_BYTES, 'Proof file');
    if (sizeErr) {
      intimation.setFieldError('proofFile', sizeErr);
      setProofAttachment(null);
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      intimation.clearField('proofFile');
      setProofAttachment({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
      });
    } catch (err) {
      intimation.setFieldError(
        'proofFile',
        err instanceof Error ? err.message : 'Failed to process file.',
      );
    }
  };

  const sendOtpStepTwo = async () => {
    if (!flightId) {
      toast.error('Flight identifier missing. Unable to send OTP.');
      return;
    }
    setBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/send-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ flightId, purpose: 'cancel-step-2' }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'Failed to send OTP');
      setStepTwoSent(true);
      toast.success('Final OTP sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send final OTP');
    } finally {
      setBusy(false);
    }
  };

  const onSubmitIntimationForm = async () => {
    const next: FieldErrors<IntimationField> = {};
    if (!intDate.trim()) next.intimationDate = 'Intimation date is required.';
    const timeErr = required(intTime, 'Intimation time') || time24(intTime, 'Intimation time');
    if (timeErr) next.intimationTimeOfDay = timeErr;
    const byErr = required(intimatedBy, 'Intimated by');
    if (byErr) next.intimatedBy = byErr;
    const emailErr = email(intimationPersonEmail, 'Intimation person email');
    if (emailErr) next.intimationPersonEmail = emailErr;
    const modeErr = selectRequired(intimationMode, 'intimation mode');
    if (modeErr) next.intimationMode = modeErr;
    if (intimation.applyAndFocus(next)) return;

    setFormOpen(false);
    setStepTwoOtpOpen(true);
    setOtpStepTwo('');
    setStepTwoSent(false);
    await sendOtpStepTwo();
  };

  const verifyOtpStepTwoAndCancel = async () => {
    if (!flightId) {
      toast.error('Flight identifier missing. Unable to verify OTP.');
      return;
    }
    const otpErr =
      required(otpStepTwo, 'OTP') ||
      (!/^\d{6}$/.test(otpStepTwo) ? 'OTP must be exactly 6 digits.' : null);
    if (otp2.applyAndFocus(otpErr ? { otpStepTwo: otpErr } : {})) return;
    setBusy(true);
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/verify-otp`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          flightId,
          purpose: 'cancel-step-2',
          otp: otpStepTwo,
          cancellationForm: {
            intimationTime,
            intimatedBy,
            intimationPersonEmail,
            intimationMode,
            proofNote,
            attachment: proofAttachment,
          },
          flightSnapshot: {
            airlineName: flight.airline,
            serialNumber: flightId,
            flightNo: flight.flightNo,
            aircraftType: flight.aircraft,
            route: flight.route,
            staDate: flight.staDate,
            staTime: flight.staTime,
            stdDate: flight.stdDate,
            stdTime: flight.stdTime,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.message || 'Final OTP verification failed');
      }
      const cancelledDateYmd = String(json.cancelledDate ?? '').trim();
      if (cancelledDateYmd) {
        stashCancellationHistoryFocusDate(cancelledDateYmd);
        if (json.cancellationId) {
          stashCancellationHistoryHighlight(String(json.cancellationId));
        }
      }
      toast.success('Flight cancelled successfully');
      broadcastCancellationEvent({
        cancelledAt: Date.now(),
        cancellationId: json.cancellationId,
        flightKind: 'scheduled',
      });
      setStepTwoOtpOpen(false);
      onCancelled?.();
      resetFlow();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Final OTP verification failed');
    } finally {
      setBusy(false);
    }
  };

  if (isCancelled) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center rounded bg-red-300 px-2 py-1 text-xs font-semibold text-white"
      >
        Cancelled
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
      >
        Cancel Flight
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Flight Cancellation</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to cancel this flight? This action requires OTP verification.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-4 py-2 text-sm text-white"
                onClick={() => {
                  setConfirmOpen(false);
                  resetFlow();
                  setStepOneOtpOpen(true);
                }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {stepOneOtpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">OTP Verification - Step 1</h3>
            <p className="mt-2 text-sm text-gray-600">
              Verify first OTP to unlock cancellation intimation form.
            </p>
            <div className="mt-4">
              <input
                id="field-otpStepOne"
                type="text"
                maxLength={6}
                value={otpStepOne}
                onChange={(e) => {
                  setOtpStepOne(e.target.value.replace(/\D/g, '').slice(0, 6));
                  otp1.clearField('otpStepOne');
                }}
                aria-invalid={Boolean(otp1.errors.otpStepOne)}
                aria-describedby={otp1.errors.otpStepOne ? 'field-otpStepOne-error' : undefined}
                className={cn('w-full rounded border px-3 py-2', otp1.errors.otpStepOne && FRIS_INVALID_CONTROL)}
                placeholder="Enter 6-digit OTP"
              />
              <FormFieldError id="field-otpStepOne-error" message={otp1.errors.otpStepOne} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => {
                  setStepOneOtpOpen(false);
                  resetFlow();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendOtpStepOne}
                className="rounded border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-60"
              >
                Send OTP
              </button>
              <button
                type="button"
                disabled={!stepOneSent || busy}
                onClick={() => void verifyOtpStepOne()}
                className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Validate OTP
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900">Flight Cancellation Intimation Form</h3>
            <p className="mt-1 text-sm text-gray-600">
              Fill cancellation intimation details. On submit, final OTP will be sent for confirmation.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2 space-y-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Intimation time</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={cn(intimation.errors.intimationDate && FRIS_INVALID_PICKER_WRAP)}>
                    <span className="mb-1 block text-[11px] text-gray-500">Date</span>
                    <DatePicker
                      id="field-intimationDate"
                      value={intDate}
                      valueFormat="yyyy-MM-dd"
                      placeholder="Select date"
                      onChange={(d) => {
                        setIntimationTime(joinDatetimeLocal(d, intTime));
                        intimation.clearField('intimationDate');
                      }}
                      className="w-full"
                    />
                    <FormFieldError
                      id="field-intimationDate-error"
                      message={intimation.errors.intimationDate}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] text-gray-500">Time (24h)</span>
                    <TimeSelect24
                      hourSelectId="field-intimationTimeOfDay"
                      value={intTime}
                      onChange={(t) => {
                        setIntimationTime(joinDatetimeLocal(intDate, t));
                        intimation.clearField('intimationTimeOfDay');
                      }}
                      className={cn(
                        'w-full',
                        intimation.errors.intimationTimeOfDay && FRIS_INVALID_CONTROL,
                      )}
                    />
                    <FormFieldError
                      id="field-intimationTimeOfDay-error"
                      message={intimation.errors.intimationTimeOfDay}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="field-intimatedBy" className="mb-1 block text-xs font-medium text-gray-700">
                  Intimated By
                </label>
                <input
                  id="field-intimatedBy"
                  type="text"
                  value={intimatedBy}
                  onChange={(e) => {
                    setIntimatedBy(e.target.value);
                    intimation.clearField('intimatedBy');
                  }}
                  aria-invalid={Boolean(intimation.errors.intimatedBy)}
                  className={cn(
                    'w-full rounded border px-3 py-2 text-sm',
                    intimation.errors.intimatedBy && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="Enter name/designation"
                />
                <FormFieldError id="field-intimatedBy-error" message={intimation.errors.intimatedBy} />
              </div>
              <div>
                <label
                  htmlFor="field-intimationPersonEmail"
                  className="mb-1 block text-xs font-medium text-gray-700"
                >
                  Intimation person email
                </label>
                <input
                  id="field-intimationPersonEmail"
                  type="email"
                  value={intimationPersonEmail}
                  onChange={(e) => {
                    setIntimationPersonEmail(e.target.value);
                    intimation.clearField('intimationPersonEmail');
                  }}
                  aria-invalid={Boolean(intimation.errors.intimationPersonEmail)}
                  className={cn(
                    'w-full rounded border px-3 py-2 text-sm',
                    intimation.errors.intimationPersonEmail && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="email@airline.com"
                />
                <FormFieldError
                  id="field-intimationPersonEmail-error"
                  message={intimation.errors.intimationPersonEmail}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Intimation Mode</label>
                <AdminRadioDropdown
                  id="field-intimationMode"
                  value={intimationMode}
                  onChange={(v) => {
                    setIntimationMode(v);
                    intimation.clearField('intimationMode');
                  }}
                  options={INTIMATION_MODE_OPTIONS}
                  className={cn('min-h-10', intimation.errors.intimationMode && FRIS_INVALID_CONTROL)}
                  aria-invalid={Boolean(intimation.errors.intimationMode)}
                />
                <FormFieldError
                  id="field-intimationMode-error"
                  message={intimation.errors.intimationMode}
                />
              </div>
              <div>
                <label htmlFor="field-proofFile" className="mb-1 block text-xs font-medium text-gray-700">
                  Upload Proof of Intimation
                </label>
                <input
                  id="field-proofFile"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void onProofFileChange(file);
                  }}
                  aria-invalid={Boolean(intimation.errors.proofFile)}
                  className={cn(
                    'w-full rounded border px-3 py-2 text-sm',
                    intimation.errors.proofFile && FRIS_INVALID_CONTROL,
                  )}
                />
                <FormFieldError id="field-proofFile-error" message={intimation.errors.proofFile} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-700">Proof Details / Notes</label>
                <textarea
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  rows={3}
                  className="w-full rounded border px-3 py-2 text-sm"
                  placeholder="Add any details about proof of intimation"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => {
                  setFormOpen(false);
                  resetFlow();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void onSubmitIntimationForm()}
                disabled={busy}
              >
                Submit & Send Final OTP
              </button>
            </div>
          </div>
        </div>
      )}

      {stepTwoOtpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">Final OTP Verification - Step 2</h3>
            <p className="mt-2 text-sm text-gray-600">
              Enter final OTP to cancel flight, update DB status, and send confirmation mail.
            </p>
            <div className="mt-4">
              <input
                id="field-otpStepTwo"
                type="text"
                maxLength={6}
                value={otpStepTwo}
                onChange={(e) => {
                  setOtpStepTwo(e.target.value.replace(/\D/g, '').slice(0, 6));
                  otp2.clearField('otpStepTwo');
                }}
                aria-invalid={Boolean(otp2.errors.otpStepTwo)}
                aria-describedby={otp2.errors.otpStepTwo ? 'field-otpStepTwo-error' : undefined}
                className={cn('w-full rounded border px-3 py-2', otp2.errors.otpStepTwo && FRIS_INVALID_CONTROL)}
                placeholder="Enter final 6-digit OTP"
              />
              <FormFieldError id="field-otpStepTwo-error" message={otp2.errors.otpStepTwo} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => {
                  setStepTwoOtpOpen(false);
                  resetFlow();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={sendOtpStepTwo}
                className="rounded border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-60"
              >
                Resend OTP
              </button>
              <button
                type="button"
                disabled={!stepTwoSent || busy}
                onClick={() => void verifyOtpStepTwoAndCancel()}
                className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Verify & Cancel Flight
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
