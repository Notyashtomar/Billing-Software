'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, FileText, Loader2, Receipt, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  advanceDocId,
  createNonScheduledBooking,
  fetchAdvanceTerminalCodes,
  fetchNonScheduledBookingReferenceAircraft,
  fetchNonScheduledBookingReferenceAirlines,
  toNonScheduledBookingKey,
  updateNonScheduledBooking,
  type NonScheduledBookingRecord,
} from '@/lib/api';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeSelect24 } from '@/components/ui/TimeSelect24';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { ScrollToError } from '@/components/ui/form-error-alert';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  airlineCode,
  creationFlightNumber,
  displayDate,
  fileMaxSize,
  fileType,
  normalizeText,
  required,
  runValidators,
  selectRequired,
  time24,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import {
  BOOKING_CONTROL,
  BOOKING_CONTROL_READONLY,
  BOOKING_DROPDOWN,
  BOOKING_FIELD_WRAP,
  BOOKING_FORM_CARD,
  BOOKING_FORM_GRID_4,
  BOOKING_FORM_HEADER,
  BOOKING_FORM_INNER,
  BOOKING_LABEL,
  BOOKING_RADIO_INPUT,
  BOOKING_RADIO_LABEL,
  BOOKING_BTN_PRIMARY,
  BOOKING_BTN_SECONDARY,
  BOOKING_SAVE_BTN,
} from './bookingPageLayout';
import NonScheduledSavedScheduleSection from './NonScheduledSavedScheduleSection';
import NonScheduledCustomBillingDialog from './NonScheduledCustomBillingDialog';
import {
  buildAdvanceInvoiceFromForm,
  openNonScheduledAdvanceInvoice,
  parseAdvanceAmount,
} from './nonScheduledAdvanceInvoice';

const BOOKING_BASE_PATH = '/fris/flights/non-scheduled-airlines/non-scheduled-booking';
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];

const FIELD_ORDER = [
  'mailReceivedFrom',
  'mailReceivedBy',
  'mailSubject',
  'operator',
  'airlineBillTo',
  'flightNo',
  'staDate',
  'staTime',
  'stdDate',
  'stdTime',
  'attachment',
] as const;

type BookingField = (typeof FIELD_ORDER)[number];
type BookingChannel = 'mail' | 'direct';
type AdvanceChoice = 'yes' | 'no';

const OPS_TYPE_OPTIONS = [
  'Turnaround',
  'Transit',
  'Technical',
  'Originate',
  'Terminate',
  'Ferry In/Ferry Out',
  'Ferry In/Load Out',
  'Load In/Ferry Out',
  'Load In/Terminate',
  'Ferry In/Terminate',
  'Ferry Out Only',
  'Load Out Only',
  'Ramp Handling Only',
  'Diverted Flight',
  'Return to Ramp Flight',
] as const;

const CATEGORY_OPTIONS = [
  'International',
  'Domestic',
  'International BME',
  'Domestic BME',
  'International-Cargo',
  'Domestic-Cargo',
  'International-Domestic',
  'Domestic-International',
] as const;

const AIRCRAFT_BODY_OPTIONS = ['NB', 'WB'] as const;
const FLIGHT_TYPE_FIXED = 'Non-Scheduled';
const TERMINAL_FALLBACK = ['AFT', 'CGO', 'T1D', 'T2', 'T3'];

type AirlineOption = { value: string; label: string; code: string };
type AircraftOption = { value: string; label: string; body: 'NB' | 'WB' };

function formatDisplayDate(date = new Date()): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function createInitialForm() {
  return {
    operator: '',
    mailReceivedFrom: '',
    mailReceivedBy: '',
    mailSubject: '',
    bookingDate: formatDisplayDate(),
    airlineBillTo: '',
    companyName: '',
    airlineCode: '',
    flightNo: '',
    registrationNo: '',
    routing: '',
    staDate: formatDisplayDate(),
    staTime: '',
    stdDate: formatDisplayDate(),
    stdTime: '',
    aircraftType: '',
    aircraftBody: '' as '' | 'NB' | 'WB',
    mtow: '',
    terminalCode: '',
    opsType: '',
    categoryOfFlight: '',
    advance: 'no' as AdvanceChoice,
    amount: '0',
  };
}

function recordToForm(row: NonScheduledBookingRecord) {
  return {
    operator: row.operator ?? '',
    mailReceivedFrom: row.mailReceivedFrom ?? '',
    mailReceivedBy: row.mailReceivedBy ?? '',
    mailSubject: row.mailSubject ?? '',
    bookingDate: row.bookingDate || formatDisplayDate(),
    airlineBillTo: row.airlineBillTo ?? '',
    companyName: row.companyName ?? '',
    airlineCode: row.airlineCode ?? '',
    flightNo: row.flightNo ?? '',
    registrationNo: row.registrationNo ?? '',
    routing: row.routing ?? '',
    staDate: row.staDate || formatDisplayDate(),
    staTime: row.staTime || '',
    stdDate: row.stdDate || formatDisplayDate(),
    stdTime: row.stdTime || '',
    aircraftType: row.aircraftType ?? '',
    aircraftBody: row.aircraftBody === 'WB' || row.aircraftBody === 'NB' ? row.aircraftBody : '',
    mtow: row.mtow ?? '',
    terminalCode: row.terminalCode || '',
    opsType: row.opsType || '',
    categoryOfFlight: row.categoryOfFlight || '',
    advance: row.advance === 'yes' ? 'yes' : 'no',
    amount: row.amount ?? '0',
  } as ReturnType<typeof createInitialForm>;
}

function buildBookingPayload(
  channel: BookingChannel,
  form: ReturnType<typeof createInitialForm>,
  attachmentName: string,
) {
  return {
    channel,
    operator: form.operator.trim(),
    mailReceivedFrom: channel === 'mail' ? form.mailReceivedFrom.trim() : '',
    mailReceivedBy: channel === 'mail' ? form.mailReceivedBy.trim() : '',
    mailSubject: channel === 'mail' ? form.mailSubject.trim() : '',
    bookingDate: form.bookingDate,
    airlineBillTo: form.airlineBillTo.trim(),
    companyName: form.companyName.trim(),
    airlineCode: form.airlineCode.trim(),
    flightNo: form.flightNo.trim(),
    registrationNo: form.registrationNo.trim(),
    routing: form.routing.trim(),
    staDate: form.staDate,
    staTime: form.staTime,
    stdDate: form.stdDate,
    stdTime: form.stdTime,
    aircraftType: form.aircraftType,
    aircraftBody: form.aircraftBody || undefined,
    mtow: form.mtow,
    terminalCode: form.terminalCode,
    opsType: form.opsType,
    categoryOfFlight: form.categoryOfFlight,
    advance: form.advance,
    amount: form.advance === 'yes' ? form.amount : '0',
    attachmentName,
  };
}

function Field({
  label,
  htmlFor,
  children,
  className,
  error,
  errorId,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  error?: string;
  errorId?: string;
}) {
  return (
    <div className={cn(BOOKING_FIELD_WRAP, className)}>
      <label htmlFor={htmlFor} className={BOOKING_LABEL}>
        {label}
      </label>
      {children}
      <FormFieldError id={errorId} message={error} />
    </div>
  );
}

export default function NonScheduledBookingForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<BookingChannel>('mail');
  const [form, setForm] = useState(createInitialForm);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [airlineOptions, setAirlineOptions] = useState<AirlineOption[]>([]);
  const [aircraftOptions, setAircraftOptions] = useState<AircraftOption[]>([]);
  const [terminalOptions, setTerminalOptions] = useState<string[]>(TERMINAL_FALLBACK);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingBookingKey, setEditingBookingKey] = useState<string | null>(null);
  const [editingBookingNo, setEditingBookingNo] = useState('');
  const [editingChallanNo, setEditingChallanNo] = useState('');
  const [scheduleRefreshToken, setScheduleRefreshToken] = useState(0);
  const [customBillingOpen, setCustomBillingOpen] = useState(false);
  const { errors, clearAll, clearField, applyAndFocus } =
    useFieldErrors<BookingField>(FIELD_ORDER);

  useEffect(() => {
    let mounted = true;

    async function loadMasters() {
      setMastersLoading(true);
      try {
        const [airlineRows, aircraftRows, terminals] = await Promise.all([
          fetchNonScheduledBookingReferenceAirlines() as Promise<
            Record<string, unknown>[]
          >,
          fetchNonScheduledBookingReferenceAircraft() as Promise<
            Record<string, unknown>[]
          >,
          fetchAdvanceTerminalCodes(TERMINAL_FALLBACK),
        ]);

        if (!mounted) return;

        const airlines: AirlineOption[] = airlineRows
          .map((doc) => {
            const d = advanceDocId(doc);
            const name = String(
              d.airline ?? d.airlines ?? d.name ?? '',
            ).trim();
            const code = String(
              d.airlineCode ?? d.code ?? '',
            )
              .trim()
              .toUpperCase();
            if (!name) return null;
            return { value: name, label: name, code };
          })
          .filter((row): row is AirlineOption => row !== null)
          .sort((a, b) => a.label.localeCompare(b.label));

        const seenAircraft = new Set<string>();
        const aircraft: AircraftOption[] = [];
        for (const doc of aircraftRows) {
          const d = advanceDocId(doc);
          const type = String(d.aircraft ?? d.type ?? d.aircraftType ?? '').trim();
          if (!type) continue;
          const key = type.toLowerCase();
          if (seenAircraft.has(key)) continue;
          seenAircraft.add(key);
          aircraft.push({
            value: type,
            label: type,
            body: d.aircraftBody === 'WB' ? 'WB' : 'NB',
          });
        }
        aircraft.sort((a, b) => a.label.localeCompare(b.label));

        setAirlineOptions(airlines);
        setAircraftOptions(aircraft);
        setTerminalOptions(terminals.length ? terminals : TERMINAL_FALLBACK);
      } catch (e) {
        if (mounted) {
          toast.error(
            e instanceof Error
              ? e.message
              : 'Could not load booking master data.',
          );
        }
      } finally {
        if (mounted) setMastersLoading(false);
      }
    }

    void loadMasters();
    return () => {
      mounted = false;
    };
  }, []);

  const patch = useCallback(
    (updates: Partial<ReturnType<typeof createInitialForm>>) => {
      setForm((prev) => ({ ...prev, ...updates }));
      for (const key of Object.keys(updates)) {
        if ((FIELD_ORDER as readonly string[]).includes(key)) {
          clearField(key as BookingField);
        }
      }
    },
    [clearField],
  );

  const handleAirlineChange = useCallback(
    (airlineName: string) => {
      const hit = airlineOptions.find((row) => row.value === airlineName);
      patch({
        airlineBillTo: airlineName,
        airlineCode: hit?.code ?? '',
      });
      clearField('airlineBillTo');
    },
    [airlineOptions, clearField, patch],
  );

  const handleAircraftChange = useCallback(
    (aircraftType: string) => {
      const hit = aircraftOptions.find((row) => row.value === aircraftType);
      patch({
        aircraftType,
        aircraftBody: hit?.body ?? '',
      });
    },
    [aircraftOptions, patch],
  );

  const amountDisabled = form.advance !== 'yes';

  const canGenerateInvoice =
    form.advance === 'yes' &&
    Number.isFinite(parseAdvanceAmount(form.amount)) &&
    parseAdvanceAmount(form.amount) > 0;

  const handleOpenCustomBilling = useCallback(() => {
    setCustomBillingOpen(true);
  }, []);

  const handleGenerateInvoice = useCallback(() => {
    if (!canGenerateInvoice) {
      toast.error('Set Advance to Yes and enter a valid amount greater than 0');
      return;
    }
    if (!form.airlineBillTo.trim()) {
      toast.error('Select Airline (Bill To) before generating the invoice');
      return;
    }
    const invoice = buildAdvanceInvoiceFromForm({
      amount: form.amount,
      bookingNo: editingBookingNo,
      challanNo: editingChallanNo,
      airlineBillTo: form.airlineBillTo,
      airlineCode: form.airlineCode,
      companyName: form.companyName,
      operator: form.operator,
      flightNo: form.flightNo,
      registrationNo: form.registrationNo,
      routing: form.routing,
      aircraftType: form.aircraftType,
      aircraftBody: form.aircraftBody,
      mtow: form.mtow,
      terminalCode: form.terminalCode,
      opsType: form.opsType,
      categoryOfFlight: form.categoryOfFlight,
      bookingDate: form.bookingDate,
      staDate: form.staDate,
      staTime: form.staTime,
      stdDate: form.stdDate,
      stdTime: form.stdTime,
    });
    openNonScheduledAdvanceInvoice(invoice);
  }, [
    canGenerateInvoice,
    editingBookingNo,
    editingChallanNo,
    form,
  ]);

  const airlineDropdownOptions = useMemo(
    () => airlineOptions.map((row) => ({ value: row.value, label: row.label })),
    [airlineOptions],
  );

  const aircraftDropdownOptions = useMemo(
    () => aircraftOptions.map((row) => ({ value: row.value, label: row.label })),
    [aircraftOptions],
  );

  const handleClearEdit = useCallback(() => {
    setEditingBookingKey(null);
    setEditingBookingNo('');
    setEditingChallanNo('');
    setForm(createInitialForm());
    setAttachment(null);
    setSaveError(null);
    clearAll();
  }, [clearAll]);

  const handleEditSchedule = useCallback(
    (row: NonScheduledBookingRecord) => {
      const key =
        row.bookingKey?.trim() || toNonScheduledBookingKey(row.bookingNo);
      if (!key) {
        toast.warning('This row has no booking key.');
        return;
      }

      setEditingBookingKey(key);
      setEditingBookingNo(String(row.bookingNo ?? '').trim());
      setEditingChallanNo(String(row.challanNo ?? '').trim());
      setChannel(row.channel === 'direct' ? 'direct' : 'mail');
      setForm(recordToForm(row));
      setAttachment(null);
      setSaveError(null);
      clearAll();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.message(`Editing ${row.bookingNo}`);
    },
    [clearAll],
  );

  const validateBooking = useCallback((): FieldErrors<BookingField> => {
    const next: FieldErrors<BookingField> = {};

    if (channel === 'mail') {
      const fromErr = required(form.mailReceivedFrom, 'Mail received from');
      if (fromErr) next.mailReceivedFrom = fromErr;
      const byErr = required(form.mailReceivedBy, 'Mail received by');
      if (byErr) next.mailReceivedBy = byErr;
      const subjectErr = required(form.mailSubject, 'Mail subject');
      if (subjectErr) next.mailSubject = subjectErr;
    }

    const operatorErr = required(form.operator, 'Operator');
    if (operatorErr) next.operator = operatorErr;

    const airlineErr = selectRequired(form.airlineBillTo, 'airline (Bill To)');
    if (airlineErr) next.airlineBillTo = airlineErr;

    const code = normalizeText(form.airlineCode).toUpperCase();
    if (code) {
      const codeErr = airlineCode(code);
      if (codeErr) next.airlineBillTo = codeErr;
    }

    const flightNo = normalizeText(form.flightNo).toUpperCase().replace(/\s/g, '');
    const flightErr = runValidators(
      required(flightNo, 'Flight No'),
      creationFlightNumber(flightNo, 'Flight No'),
    );
    if (flightErr) next.flightNo = flightErr;

    const staDateErr = runValidators(
      required(form.staDate, 'STA date'),
      displayDate(form.staDate, 'STA date'),
    );
    if (staDateErr) next.staDate = staDateErr;

    const staTimeErr = runValidators(
      required(form.staTime, 'STA time'),
      time24(form.staTime, 'STA time'),
    );
    if (staTimeErr) next.staTime = staTimeErr;

    const stdDateErr = runValidators(
      required(form.stdDate, 'STD date'),
      displayDate(form.stdDate, 'STD date'),
    );
    if (stdDateErr) next.stdDate = stdDateErr;

    const stdTimeErr = runValidators(
      required(form.stdTime, 'STD time'),
      time24(form.stdTime, 'STD time'),
    );
    if (stdTimeErr) next.stdTime = stdTimeErr;

    // STA must be on/before STD (arrival at station precedes departure out).
    // Only compare when all four fields are individually valid.
    if (!staDateErr && !staTimeErr && !stdDateErr && !stdTimeErr) {
      const toMs = (dmy: string, hm: string): number | null => {
        const dParts = dmy.split('/');
        const tParts = hm.split(':');
        if (dParts.length !== 3 || tParts.length < 2) return null;
        const [d, m, y] = dParts.map(Number);
        const [hh, mm] = tParts.map(Number);
        if ([d, m, y, hh, mm].some((n) => !Number.isFinite(n))) return null;
        return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
      };
      const staMs = toMs(form.staDate, form.staTime);
      const stdMs = toMs(form.stdDate, form.stdTime);
      if (staMs != null && stdMs != null && staMs > stdMs) {
        next.staDate = 'STA must be on or before STD (non next-day).';
      }
    }

    if (attachment) {
      const typeErr = fileType(attachment, ATTACHMENT_EXTS, 'Attachment');
      const sizeErr = fileMaxSize(attachment, ATTACHMENT_MAX_BYTES, 'Attachment');
      if (typeErr) next.attachment = typeErr;
      else if (sizeErr) next.attachment = sizeErr;
    }

    return next;
  }, [attachment, channel, form]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    if (applyAndFocus(validateBooking())) return;

    setSaving(true);
    try {
      const payload = buildBookingPayload(
        channel,
        form,
        attachment?.name ?? '',
      );

      if (editingBookingKey) {
        const { channel: _channel, ...updateBody } = payload;
        const saved = await updateNonScheduledBooking(editingBookingKey, updateBody);
        toast.success(`Booking ${saved.bookingNo} updated`);
        setEditingBookingKey(
          saved.bookingKey?.trim() || toNonScheduledBookingKey(saved.bookingNo),
        );
        setEditingBookingNo(String(saved.bookingNo ?? '').trim());
        setEditingChallanNo(String(saved.challanNo ?? '').trim());
        setScheduleRefreshToken((n) => n + 1);
        clearAll();
        return;
      }

      const saved = await createNonScheduledBooking(payload);

      toast.success(`Booking ${saved.bookingNo} created`);
      setForm(createInitialForm());
      setAttachment(null);
      clearAll();
      setScheduleRefreshToken((n) => n + 1);
      const key =
        saved.bookingKey?.trim() ||
        String(saved.bookingNo ?? '')
          .trim()
          .replace(/\//g, '_');
      router.push(
        `${BOOKING_BASE_PATH}?section=challan&bookingNo=${encodeURIComponent(key)}`,
      );
    } catch (err) {
      const apiMessage = err instanceof Error ? err.message.trim() : '';
      const hidden =
        !apiMessage ||
        apiMessage === 'Save failed.' ||
        /failed to fetch|networkerror/i.test(apiMessage);
      setSaveError(hidden ? 'Save failed.' : apiMessage);
    } finally {
      setSaving(false);
    }
  }, [
    applyAndFocus,
    attachment,
    channel,
    clearAll,
    editingBookingKey,
    form,
    router,
    validateBooking,
  ]);

  return (
    <div className="space-y-5">
      <div className={BOOKING_FORM_CARD}>
        <div className={BOOKING_FORM_HEADER}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Booking</h3>
            {editingBookingKey ? (
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
                Editing schedule
              </span>
            ) : null}
          </div>
        </div>

        <div className={BOOKING_FORM_INNER}>
          <div className={BOOKING_FORM_GRID_4}>
            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="sr-only">Booking channel</legend>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <label className={BOOKING_RADIO_LABEL}>
                  <input
                    type="radio"
                    name="booking-channel"
                    checked={channel === 'mail'}
                    onChange={() => {
                      setChannel('mail');
                      clearAll();
                    }}
                    className={BOOKING_RADIO_INPUT}
                  />
                  By Mail
                </label>
                <label className={BOOKING_RADIO_LABEL}>
                  <input
                    type="radio"
                    name="booking-channel"
                    checked={channel === 'direct'}
                    onChange={() => {
                      setChannel('direct');
                      clearAll();
                    }}
                    className={BOOKING_RADIO_INPUT}
                  />
                  Direct
                </label>
              </div>
            </fieldset>

            <AnimatePresence initial={false}>
              {channel === 'mail' ? (
                <motion.div
                  key="mail-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden sm:col-span-2 lg:col-span-4"
                >
                  <div className={BOOKING_FORM_GRID_4}>
                    <Field
                      label="Mail Received From :"
                      htmlFor="field-mailReceivedFrom"
                      error={errors.mailReceivedFrom}
                      errorId="field-mailReceivedFrom-error"
                    >
                      <input
                        id="field-mailReceivedFrom"
                        type="text"
                        value={form.mailReceivedFrom}
                        onChange={(e) => patch({ mailReceivedFrom: e.target.value })}
                        className={cn(
                          BOOKING_CONTROL,
                          errors.mailReceivedFrom && FRIS_INVALID_CONTROL,
                        )}
                        autoComplete="off"
                        aria-invalid={Boolean(errors.mailReceivedFrom)}
                        aria-describedby={
                          errors.mailReceivedFrom
                            ? 'field-mailReceivedFrom-error'
                            : undefined
                        }
                      />
                    </Field>
                    <Field
                      label="Mail Received By :"
                      htmlFor="field-mailReceivedBy"
                      error={errors.mailReceivedBy}
                      errorId="field-mailReceivedBy-error"
                    >
                      <input
                        id="field-mailReceivedBy"
                        type="text"
                        value={form.mailReceivedBy}
                        onChange={(e) => patch({ mailReceivedBy: e.target.value })}
                        className={cn(
                          BOOKING_CONTROL,
                          errors.mailReceivedBy && FRIS_INVALID_CONTROL,
                        )}
                        autoComplete="off"
                        aria-invalid={Boolean(errors.mailReceivedBy)}
                        aria-describedby={
                          errors.mailReceivedBy ? 'field-mailReceivedBy-error' : undefined
                        }
                      />
                    </Field>
                    <Field
                      label="Mail Subject :"
                      htmlFor="field-mailSubject"
                      className="sm:col-span-2 lg:col-span-2"
                      error={errors.mailSubject}
                      errorId="field-mailSubject-error"
                    >
                      <input
                        id="field-mailSubject"
                        type="text"
                        value={form.mailSubject}
                        onChange={(e) => patch({ mailSubject: e.target.value })}
                        className={cn(
                          BOOKING_CONTROL,
                          errors.mailSubject && FRIS_INVALID_CONTROL,
                        )}
                        autoComplete="off"
                        aria-invalid={Boolean(errors.mailSubject)}
                        aria-describedby={
                          errors.mailSubject ? 'field-mailSubject-error' : undefined
                        }
                      />
                    </Field>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <fieldset className="sm:col-span-2 lg:col-span-2">
              <legend className="sr-only">Service type</legend>
              <label className={BOOKING_RADIO_LABEL}>
                <input
                  type="radio"
                  name="service-type"
                  checked
                  readOnly
                  className={BOOKING_RADIO_INPUT}
                />
                Comprehensive Handling (Flight)
              </label>
            </fieldset>

            <Field
              label="Operator :"
              htmlFor="field-operator"
              error={errors.operator}
              errorId="field-operator-error"
            >
              <input
                id="field-operator"
                type="text"
                value={form.operator}
                onChange={(e) =>
                  patch({ operator: e.target.value.replace(/[^A-Za-z\s]/g, '') })
                }
                className={cn(BOOKING_CONTROL, errors.operator && FRIS_INVALID_CONTROL)}
                autoComplete="organization"
                inputMode="text"
                pattern="[A-Za-z\s]*"
                title="Only alphabetical characters and spaces are allowed"
                aria-invalid={Boolean(errors.operator)}
                aria-describedby={errors.operator ? 'field-operator-error' : undefined}
              />
            </Field>

            <Field label="Booking Date :" htmlFor="booking-date">
              <DatePicker
                id="booking-date"
                value={form.bookingDate}
                onChange={(value) => patch({ bookingDate: value })}
              />
            </Field>

            <Field label="Airline Code" htmlFor="airline-code">
              <input
                id="airline-code"
                type="text"
                value={form.airlineCode}
                readOnly
                className={BOOKING_CONTROL_READONLY}
                aria-readonly
              />
            </Field>

            <Field
              label="Airline (Bill To) :"
              htmlFor="field-airlineBillTo"
              error={errors.airlineBillTo}
              errorId="field-airlineBillTo-error"
            >
              <AdminRadioDropdown
                id="field-airlineBillTo"
                value={form.airlineBillTo}
                onChange={handleAirlineChange}
                options={airlineDropdownOptions}
                placeholder={
                  mastersLoading
                    ? 'Loading airlines…'
                    : airlineDropdownOptions.length === 0
                      ? 'No airlines for this station'
                      : 'Select airline'
                }
                disabled={mastersLoading}
                className={cn(
                  BOOKING_DROPDOWN,
                  errors.airlineBillTo && FRIS_INVALID_CONTROL,
                )}
                aria-label="Airline Bill To"
                aria-invalid={Boolean(errors.airlineBillTo)}
              />
              {!mastersLoading && airlineDropdownOptions.length === 0 ? (
                <p className="mt-1.5 text-xs text-amber-700">
                  No non-scheduled airlines for this station. Add them under Advance
                  → Non Scheduled Airline, then refresh.
                </p>
              ) : null}
            </Field>

            <Field label="Company Name :" htmlFor="field-companyName">
              <input
                id="field-companyName"
                type="text"
                value={form.companyName}
                onChange={(e) =>
                  patch({ companyName: e.target.value.replace(/[^A-Za-z\s]/g, '') })
                }
                className={BOOKING_CONTROL}
                autoComplete="organization"
                placeholder="Parent company name"
                inputMode="text"
                pattern="[A-Za-z\s]*"
                title="Only alphabetical characters and spaces are allowed"
              />
            </Field>

            <Field
              label="Flight No :"
              htmlFor="field-flightNo"
              error={errors.flightNo}
              errorId="field-flightNo-error"
            >
              <input
                id="field-flightNo"
                type="text"
                value={form.flightNo}
                onChange={(e) => patch({ flightNo: e.target.value.toUpperCase() })}
                className={cn(BOOKING_CONTROL, errors.flightNo && FRIS_INVALID_CONTROL)}
                autoComplete="off"
                aria-invalid={Boolean(errors.flightNo)}
                aria-describedby={errors.flightNo ? 'field-flightNo-error' : undefined}
              />
            </Field>

            <Field label="Registration No :" htmlFor="registration-no">
              <input
                id="registration-no"
                type="text"
                value={form.registrationNo}
                onChange={(e) => patch({ registrationNo: e.target.value.toUpperCase() })}
                className={BOOKING_CONTROL}
                autoComplete="off"
              />
            </Field>

            <Field label="Routing :" htmlFor="routing">
              <input
                id="routing"
                type="text"
                value={form.routing}
                onChange={(e) =>
                  patch({
                    routing: e.target.value.replace(/[^A-Za-z-]/g, '').toUpperCase(),
                  })
                }
                className={BOOKING_CONTROL}
                autoComplete="off"
                inputMode="text"
                pattern="[A-Za-z-]*"
                title="Only alphabetical characters and '-' are allowed"
                placeholder="e.g. DEL-BOM-MAA"
              />
            </Field>

            <Field
              label="STA Date :"
              htmlFor="field-staDate"
              error={errors.staDate}
              errorId="field-staDate-error"
            >
              <div className={cn(errors.staDate && FRIS_INVALID_PICKER_WRAP)}>
                <DatePicker
                  id="field-staDate"
                  value={form.staDate}
                  onChange={(value) => patch({ staDate: value })}
                />
              </div>
            </Field>

            <Field
              label="STA Time :"
              htmlFor="field-staTime"
              error={errors.staTime}
              errorId="field-staTime-error"
            >
              <TimeSelect24
                hourSelectId="field-staTime"
                value={form.staTime}
                onChange={(value) => patch({ staTime: value })}
                className={cn(
                  'w-full max-w-full',
                  errors.staTime && FRIS_INVALID_CONTROL,
                )}
              />
            </Field>

            <Field
              label="STD Date :"
              htmlFor="field-stdDate"
              error={errors.stdDate}
              errorId="field-stdDate-error"
            >
              <div className={cn(errors.stdDate && FRIS_INVALID_PICKER_WRAP)}>
                <DatePicker
                  id="field-stdDate"
                  value={form.stdDate}
                  onChange={(value) => patch({ stdDate: value })}
                />
              </div>
            </Field>

            <Field
              label="STD Time :"
              htmlFor="field-stdTime"
              error={errors.stdTime}
              errorId="field-stdTime-error"
            >
              <TimeSelect24
                hourSelectId="field-stdTime"
                value={form.stdTime}
                onChange={(value) => patch({ stdTime: value })}
                className={cn(
                  'w-full max-w-full',
                  errors.stdTime && FRIS_INVALID_CONTROL,
                )}
              />
            </Field>

            <Field label="Aircraft Type :" htmlFor="aircraft-type">
              <AdminRadioDropdown
                id="aircraft-type"
                value={form.aircraftType}
                onChange={handleAircraftChange}
                options={aircraftDropdownOptions}
                placeholder={
                  mastersLoading
                    ? 'Loading aircraft…'
                    : aircraftDropdownOptions.length === 0
                      ? 'No aircraft for this station'
                      : 'Select aircraft'
                }
                disabled={mastersLoading}
                className={BOOKING_DROPDOWN}
                aria-label="Aircraft Type"
              />
              {!mastersLoading && aircraftDropdownOptions.length === 0 ? (
                <p className="mt-1.5 text-xs text-amber-700">
                  No aircraft types for this station. Add them under Advance → Aircraft,
                  then refresh.
                </p>
              ) : null}
            </Field>

            <div className={BOOKING_FIELD_WRAP}>
              <span className={BOOKING_LABEL}>Aircraft Body &amp; MTOW</span>
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                <AdminRadioDropdown
                  value={form.aircraftBody}
                  onChange={(value) =>
                    patch({ aircraftBody: value === 'WB' || value === 'NB' ? value : '' })
                  }
                  options={[...AIRCRAFT_BODY_OPTIONS]}
                  placeholder="Select body"
                  className={BOOKING_DROPDOWN}
                  aria-label="Aircraft body"
                />
                <input
                  type="text"
                  value={form.mtow}
                  onChange={(e) => {
                    // Keep digits and at most one decimal point; drop everything else.
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    const firstDot = cleaned.indexOf('.');
                    const normalized =
                      firstDot === -1
                        ? cleaned
                        : cleaned.slice(0, firstDot + 1) +
                          cleaned.slice(firstDot + 1).replace(/\./g, '');
                    patch({ mtow: normalized });
                  }}
                  className={BOOKING_CONTROL}
                  aria-label="MTOW"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  title="Only numerical characters are allowed"
                />
              </div>
              <FormFieldError />
            </div>

            <Field label="Terminal Code :" htmlFor="terminal-code">
              <AdminRadioDropdown
                id="terminal-code"
                value={form.terminalCode}
                onChange={(value) => patch({ terminalCode: value })}
                options={terminalOptions}
                placeholder="Select terminal"
                className={BOOKING_DROPDOWN}
              />
            </Field>

            <Field label="Ops Type :" htmlFor="ops-type">
              <AdminRadioDropdown
                id="ops-type"
                value={form.opsType}
                onChange={(value) => patch({ opsType: value })}
                options={[...OPS_TYPE_OPTIONS]}
                placeholder="Select operation type"
                className={BOOKING_DROPDOWN}
              />
            </Field>

            <Field label="Category Of Flight :" htmlFor="category-of-flight">
              <AdminRadioDropdown
                id="category-of-flight"
                value={form.categoryOfFlight}
                onChange={(value) => patch({ categoryOfFlight: value })}
                options={[...CATEGORY_OPTIONS]}
                placeholder="Select category"
                className={BOOKING_DROPDOWN}
              />
            </Field>

            <Field label="Flight Type :" htmlFor="flight-type">
              <input
                id="flight-type"
                type="text"
                value={FLIGHT_TYPE_FIXED}
                readOnly
                className={BOOKING_CONTROL_READONLY}
                aria-readonly
              />
            </Field>

            <div className={BOOKING_FIELD_WRAP}>
              <span className={BOOKING_LABEL}>Advance :</span>
              <div className="flex h-10 flex-wrap items-center gap-4">
                <label className={BOOKING_RADIO_LABEL}>
                  <input
                    type="radio"
                    name="advance"
                    checked={form.advance === 'yes'}
                    onChange={() => patch({ advance: 'yes' })}
                    className={BOOKING_RADIO_INPUT}
                  />
                  Yes
                </label>
                <label className={BOOKING_RADIO_LABEL}>
                  <input
                    type="radio"
                    name="advance"
                    checked={form.advance === 'no'}
                    onChange={() => patch({ advance: 'no', amount: '0' })}
                    className={BOOKING_RADIO_INPUT}
                  />
                  No
                </label>
              </div>
              <FormFieldError />
            </div>

            <Field label="Amount" htmlFor="amount">
              <input
                id="amount"
                type="text"
                value={form.amount}
                onChange={(e) => patch({ amount: e.target.value })}
                disabled={amountDisabled}
                className={cn(
                  amountDisabled ? BOOKING_CONTROL_READONLY : BOOKING_CONTROL,
                )}
                inputMode="decimal"
              />
            </Field>

            <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                <button
                  type="button"
                  onClick={handleGenerateInvoice}
                  disabled={!canGenerateInvoice}
                  className={BOOKING_BTN_PRIMARY}
                  aria-disabled={!canGenerateInvoice}
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Generate Invoice
                </button>
                <button
                  type="button"
                  onClick={handleOpenCustomBilling}
                  className={BOOKING_BTN_SECONDARY}
                >
                  <Receipt className="h-4 w-4" aria-hidden />
                  Custom Billing
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {canGenerateInvoice
                  ? 'Generate Invoice opens advance PDF preview. Custom Billing opens the billing custom form for this flight.'
                  : form.advance !== 'yes'
                    ? 'Set Advance to Yes and amount > 0 for Generate Invoice. Custom Billing is always available.'
                    : 'Enter advance amount greater than 0 for Generate Invoice. Custom Billing is always available.'}
              </p>
            </div>

            <div className="space-y-2 border-t border-amber-50 pt-4 sm:col-span-2 lg:col-span-4">
              <p className="text-sm font-semibold text-rose-600">If Any Attachment</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label
                  className={cn(
                    'inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/60',
                    errors.attachment && 'border-red-500',
                  )}
                >
                  Choose file
                  <input
                    id="field-attachment"
                    type="file"
                    className="hidden"
                    accept={ATTACHMENT_EXTS.join(',')}
                    onChange={(e) => {
                      setAttachment(e.target.files?.[0] ?? null);
                      clearField('attachment');
                    }}
                  />
                </label>
                <span className="text-sm text-slate-500">
                  {attachment ? attachment.name : 'No file chosen'}
                </span>
              </div>
              <FormFieldError id="field-attachment-error" message={errors.attachment} />
            </div>
          </div>

          <ScrollToError
            error={saveError}
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {saveError}
          </ScrollToError>

          <div className="flex flex-col gap-3 border-t border-amber-50 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            {editingBookingKey ? (
              <button
                type="button"
                onClick={handleClearEdit}
                disabled={saving}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
              >
                Clear / New
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || mastersLoading}
              className={BOOKING_SAVE_BTN}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {saving
                ? editingBookingKey
                  ? 'Updating…'
                  : 'Saving…'
                : editingBookingKey
                  ? 'Update'
                  : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <NonScheduledSavedScheduleSection
        refreshToken={scheduleRefreshToken}
        editingBookingKey={editingBookingKey}
        onEdit={handleEditSchedule}
        onDeleted={(key) => {
          if (editingBookingKey && key === editingBookingKey) {
            handleClearEdit();
          }
        }}
      />

      <NonScheduledCustomBillingDialog
        open={customBillingOpen}
        onOpenChange={setCustomBillingOpen}
        airlineOptions={airlineOptions}
        aircraftOptions={aircraftDropdownOptions}
        prefill={{
          airlineCode: form.airlineCode,
          airlineBillTo: form.airlineBillTo,
          companyName: form.companyName,
          flightNo: form.flightNo,
          bookingNo: editingBookingNo,
          registrationNo: form.registrationNo,
          routing: form.routing,
          aircraftType: form.aircraftType,
          opsType: form.opsType,
          categoryOfFlight: form.categoryOfFlight,
          bookingDate: form.bookingDate,
          staDate: form.staDate,
          stdDate: form.stdDate,
          amount: form.amount,
        }}
      />
    </div>
  );
}
