'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  getNonScheduledBooking,
  listNonScheduledBookings,
  saveNonScheduledChallan,
  toNonScheduledBookingKey,
  type NonScheduledBookingRecord,
} from '@/lib/api';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  maxLength,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import {
  BOOKING_CONTROL,
  BOOKING_CONTROL_READONLY,
  BOOKING_FIELD_WRAP,
  BOOKING_FORM_CARD,
  BOOKING_FORM_GRID_4,
  BOOKING_FORM_HEADER,
  BOOKING_FORM_INNER,
  BOOKING_GET_BTN,
  BOOKING_LABEL,
  BOOKING_MOBILE_CARD,
  BOOKING_MOBILE_CARD_LIST,
  BOOKING_SAVE_BTN,
  BOOKING_SEARCH_CARD,
  BOOKING_TABLE,
  BOOKING_TABLE_HEAD,
  BOOKING_TABLE_HEAD_COL,
  BOOKING_TABLE_SCROLL_REGION,
  BOOKING_TABLE_TD_WRAP,
} from './bookingPageLayout';

const BOOKING_BASE_PATH = '/fris/flights/non-scheduled-airlines/non-scheduled-booking';

const SEARCH_FIELD_ORDER = ['bookingNo', 'challanNo', 'searchDate'] as const;
type SearchField = (typeof SEARCH_FIELD_ORDER)[number];

const SAVE_FIELD_ORDER = ['bookingNo', 'challanDate', 'bayNo', 'noOfPax', 'noOfFerryIssued', 'ghRepresentative', 'airlineRepresentative', 'remarks'] as const;
type SaveField = (typeof SAVE_FIELD_ORDER)[number];

type ChallanFormState = {
  challanDate: string;
  bayNo: string;
  noOfFerryIssued: string;
  airlineRepresentative: string;
  noOfPax: string;
  ghRepresentative: string;
  remarks: string;
};

const BOOKING_DETAIL_COLUMNS: {
  key: keyof NonScheduledBookingRecord | 'channelLabel';
  label: string;
}[] = [
  { key: 'bookingNo', label: 'Booking No' },
  { key: 'bookingDate', label: 'Booking Date' },
  { key: 'channelLabel', label: 'Booking' },
  { key: 'operator', label: 'Operator' },
  { key: 'airlineBillTo', label: 'Airline (Bill To)' },
  { key: 'airlineCode', label: 'Airline Code' },
  { key: 'flightNo', label: 'Flight No' },
  { key: 'registrationNo', label: 'Registration No' },
  { key: 'routing', label: 'Routing' },
  { key: 'staDate', label: 'STA Date' },
  { key: 'staTime', label: 'STA Time' },
  { key: 'stdDate', label: 'STD Date' },
  { key: 'stdTime', label: 'STD Time' },
  { key: 'aircraftType', label: 'Aircraft Type' },
  { key: 'aircraftBody', label: 'Aircraft Body' },
  { key: 'mtow', label: 'MTOW' },
  { key: 'terminalCode', label: 'Terminal' },
  { key: 'opsType', label: 'Ops Type' },
  { key: 'categoryOfFlight', label: 'Category' },
  { key: 'flightType', label: 'Flight Type' },
  { key: 'advance', label: 'Advance' },
  { key: 'amount', label: 'Amount' },
];

const CHALLAN_LIST_COLUMNS: {
  key: keyof NonScheduledBookingRecord;
  label: string;
}[] = [
  { key: 'bookingDate', label: 'Booking Date' },
  { key: 'flightNo', label: 'Flight No' },
  { key: 'bookingNo', label: 'Booking No' },
  { key: 'challanNo', label: 'Performa No' },
  { key: 'challanDate', label: 'Performa Date' },
  { key: 'bayNo', label: 'Bay No' },
  { key: 'noOfPax', label: 'No Of Pax' },
  { key: 'noOfFerryIssued', label: 'Ferry Issued' },
  { key: 'ghRepresentative', label: 'GH Rep' },
  { key: 'airlineRepresentative', label: 'Airline Rep' },
  { key: 'airlineBillTo', label: 'Airline' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
];

function emptyChallanForm(): ChallanFormState {
  return {
    challanDate: '',
    bayNo: '',
    noOfFerryIssued: '',
    airlineRepresentative: '',
    noOfPax: '',
    ghRepresentative: '',
    remarks: '',
  };
}

function channelLabel(channel: string | undefined): string {
  if (channel === 'mail') return 'By Mail';
  if (channel === 'direct') return 'Direct';
  return '';
}

function cellValue(
  booking: NonScheduledBookingRecord,
  key: (typeof BOOKING_DETAIL_COLUMNS)[number]['key'],
): string {
  if (key === 'channelLabel') return channelLabel(booking.channel);
  const raw = booking[key as keyof NonScheduledBookingRecord];
  if (raw === undefined || raw === null) return '';
  return String(raw);
}

function listCellValue(
  row: NonScheduledBookingRecord,
  key: keyof NonScheduledBookingRecord,
): string {
  const raw = row[key];
  if (raw === undefined || raw === null) return '';
  return String(raw);
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

type NonScheduledChallanPanelProps = {
  bookingNo?: string | null;
};

export default function NonScheduledChallanPanel({
  bookingNo: bookingNoProp,
}: NonScheduledChallanPanelProps) {
  const router = useRouter();
  const linkedBookingKey = String(bookingNoProp ?? '').trim();
  const isFormMode = Boolean(linkedBookingKey);

  const [form, setForm] = useState<ChallanFormState>(emptyChallanForm);
  const [booking, setBooking] = useState<NonScheduledBookingRecord | null>(null);
  const [rows, setRows] = useState<NonScheduledBookingRecord[]>([]);
  const [bookingNoQuery, setBookingNoQuery] = useState('');
  const [challanNoQuery, setChallanNoQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    errors: searchErrors,
    clearField: clearSearchField,
    applyAndFocus: applySearchErrors,
  } = useFieldErrors<SearchField>(SEARCH_FIELD_ORDER);
  const {
    errors: saveFieldErrors,
    clearField: clearSaveField,
    clearAll: clearSaveErrors,
    applyAndFocus: applySaveErrors,
  } = useFieldErrors<SaveField>(SAVE_FIELD_ORDER);

  const patch = useCallback(
    (partial: Partial<ChallanFormState>) => {
      setForm((prev) => ({ ...prev, ...partial }));
      if ('remarks' in partial) clearSaveField('remarks');
      if ('challanDate' in partial) clearSaveField('challanDate');
    },
    [clearSaveField],
  );

  const applyBookingToForm = useCallback((row: NonScheduledBookingRecord) => {
    setBooking(row);
    // Performa date always mirrors booking date.
    const bookingDate = String(row.bookingDate ?? '').trim();
    setForm({
      challanDate: String(row.challanDate ?? '').trim() || bookingDate,
      bayNo: String(row.bayNo ?? ''),
      noOfFerryIssued: String(row.noOfFerryIssued ?? ''),
      airlineRepresentative: String(row.airlineRepresentative ?? ''),
      noOfPax: String(row.noOfPax ?? ''),
      ghRepresentative: String(row.ghRepresentative ?? ''),
      remarks: String(row.remarks ?? ''),
    });
    setLoadError(null);
  }, []);

  const loadLinkedBooking = useCallback(
    async (bookingNoOrKey: string) => {
      const key = toNonScheduledBookingKey(bookingNoOrKey);
      if (!key) return;
      setLoading(true);
      setLoadError(null);
      try {
        const row = await getNonScheduledBooking(key);
        applyBookingToForm(row);
      } catch (err) {
        setBooking(null);
        setForm(emptyChallanForm());
        setLoadError(err instanceof Error ? err.message : 'Failed to load booking.');
      } finally {
        setLoading(false);
      }
    },
    [applyBookingToForm],
  );

  const handleSearch = useCallback(async () => {
    const bookingNo = bookingNoQuery.trim();
    const challanNo = challanNoQuery.trim();
    const date = searchDate.trim();
    const next: FieldErrors<SearchField> = {};

    if (!bookingNo && !challanNo && !date) {
      next.bookingNo = 'Enter Booking No, Performa No, or From Date.';
    }
    if (date) {
      const dateErr = validDate(date, 'From date');
      if (dateErr) next.searchDate = dateErr;
    }
    if (applySearchErrors(next)) {
      setSearched(false);
      setRows([]);
      return;
    }

    setListing(true);
    setLoadError(null);
    try {
      const list = await listNonScheduledBookings({
        bookingNo: bookingNo || undefined,
        challanNo: challanNo || undefined,
        fromDate: date || undefined,
      });
      setRows(list);
      setSearched(true);
      if (list.length === 0) {
        toast.message('No record found for this booking / performa number.');
      } else if (list.length === 1) {
        toast.success('1 record found.');
      } else {
        toast.message(`${list.length} records found.`);
      }
    } catch (err) {
      setRows([]);
      setSearched(true);
      setLoadError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setListing(false);
    }
  }, [applySearchErrors, bookingNoQuery, challanNoQuery, searchDate]);

  useEffect(() => {
    if (isFormMode) {
      void loadLinkedBooking(linkedBookingKey);
      return;
    }
    // Browse mode: no auto-load — wait for Booking No / Performa No + Get.
    setRows([]);
    setSearched(false);
    setLoadError(null);
  }, [isFormMode, linkedBookingKey, loadLinkedBooking]);

  const handleBackToList = useCallback(() => {
    router.replace(`${BOOKING_BASE_PATH}?section=challan`, { scroll: false });
  }, [router]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    const key = toNonScheduledBookingKey(
      booking?.bookingKey || booking?.bookingNo || linkedBookingKey,
    );
    const bookingNo = String(booking?.bookingNo ?? '').trim();
    const challanDate =
      String(booking?.bookingDate ?? form.challanDate ?? '').trim();

    const next: FieldErrors<SaveField> = {};
    if (!key || !bookingNo) {
      next.bookingNo = 'Booking No is required.';
    }
    if (!challanDate) {
      next.challanDate = 'Performa date is required.';
    }
    const remarksErr = maxLength(form.remarks, 500, 'Remarks');
    if (remarksErr) next.remarks = remarksErr;
    if (form.bayNo && !/^[A-Za-z0-9]+$/.test(form.bayNo)) {
      next.bayNo = 'Bay No may only contain letters and numbers.';
    }
    if (form.noOfPax && !/^[A-Za-z0-9]+$/.test(form.noOfPax)) {
      next.noOfPax = 'No of Pax may only contain letters and numbers.';
    }
    if (form.noOfFerryIssued && !/^\d+$/.test(form.noOfFerryIssued)) {
      next.noOfFerryIssued = 'Ferry issued may only contain numbers.';
    }
    if (form.ghRepresentative && !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(form.ghRepresentative.trim())) {
      next.ghRepresentative = 'GH Representative may only contain letters.';
    }
    if (
      form.airlineRepresentative &&
      !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(form.airlineRepresentative.trim())
    ) {
      next.airlineRepresentative = 'Airline Representative may only contain letters.';
    }

    if (applySaveErrors(next)) return;

    if (!key) {
      setSaveError('Create a booking before saving performa.');
      return;
    }

    const wasExistingChallan = Boolean(booking?.challanNo?.trim());

    setSaving(true);
    try {
      const saved = await saveNonScheduledChallan(key, {
        challanDate,
        bayNo: form.bayNo,
        noOfFerryIssued: form.noOfFerryIssued,
        noOfPax: form.noOfPax,
        ghRepresentative: form.ghRepresentative,
        airlineRepresentative: form.airlineRepresentative,
        remarks: form.remarks,
      });
      applyBookingToForm(saved);
      clearSaveErrors();
      if (!saved.challanNo?.trim()) {
        throw new Error('Performa number was not generated. Try again.');
      }
      toast.success(
        wasExistingChallan
          ? `Performa ${saved.challanNo} updated — flight is on Non-Scheduled Airlines`
          : `Performa ${saved.challanNo} generated — flight is now on Non-Scheduled Airlines`,
      );
      const nextKey = saved.bookingKey || toNonScheduledBookingKey(saved.bookingNo);

      if (wasExistingChallan || saved.status === 'flight_ready') {
        router.replace(`${BOOKING_BASE_PATH}?section=challan`, { scroll: false });
        return;
      }

      // Optional next step: passengers. Flight is already listable with Open.
      router.push(
        `${BOOKING_BASE_PATH}?section=add-passenger&bookingNo=${encodeURIComponent(nextKey)}`,
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [
    applyBookingToForm,
    applySaveErrors,
    booking,
    clearSaveErrors,
    form,
    linkedBookingKey,
    router,
  ]);

  const isEditingExisting = Boolean(booking?.challanNo?.trim());

  if (!isFormMode) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <div className={BOOKING_FORM_CARD}>
          <div className={BOOKING_FORM_HEADER}>
            <h3 className="text-base font-semibold text-white">Search performa</h3>
          </div>
          <div className={cn(BOOKING_FORM_INNER, 'space-y-3')}>
            <p className="text-xs leading-relaxed text-slate-500 sm:text-sm">
              Enter <strong>Booking No</strong>, <strong>Performa No</strong>, or{' '}
              <strong>From Date</strong>, then click Get. The table appears only after a
              successful search.
            </p>

            {loadError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{loadError}</span>
              </div>
            ) : null}

            <div className={BOOKING_FORM_GRID_4}>
              <div>
                <label htmlFor="field-bookingNo" className={BOOKING_LABEL}>
                  Booking No
                </label>
                <input
                  id="field-bookingNo"
                  type="search"
                  value={bookingNoQuery}
                  onChange={(e) => {
                    setBookingNoQuery(e.target.value);
                    clearSearchField('bookingNo');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  className={cn(
                    BOOKING_CONTROL,
                    searchErrors.bookingNo && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="e.g. MAA/BKG/000001/…"
                  autoComplete="off"
                  aria-invalid={Boolean(searchErrors.bookingNo)}
                />
                <FormFieldError
                  id="field-bookingNo-error"
                  message={searchErrors.bookingNo}
                />
              </div>
              <div>
                <label htmlFor="field-challanNo" className={BOOKING_LABEL}>
                  Performa No
                </label>
                <input
                  id="field-challanNo"
                  type="search"
                  value={challanNoQuery}
                  onChange={(e) => {
                    setChallanNoQuery(e.target.value);
                    clearSearchField('challanNo');
                    clearSearchField('bookingNo');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  className={cn(
                    BOOKING_CONTROL,
                    searchErrors.challanNo && FRIS_INVALID_CONTROL,
                  )}
                  placeholder="e.g. MAA/CLN/000001/…"
                  autoComplete="off"
                  aria-invalid={Boolean(searchErrors.challanNo)}
                />
                <FormFieldError
                  id="field-challanNo-error"
                  message={searchErrors.challanNo}
                />
              </div>
              <div>
                <label htmlFor="field-searchDate" className={BOOKING_LABEL}>
                  From Date
                </label>
                <div className={cn(searchErrors.searchDate && FRIS_INVALID_PICKER_WRAP)}>
                  <DatePicker
                    id="field-searchDate"
                    value={searchDate}
                    onChange={(value) => {
                      setSearchDate(value);
                      clearSearchField('searchDate');
                      clearSearchField('bookingNo');
                    }}
                    valueFormat="yyyy-MM-dd"
                  />
                </div>
                <FormFieldError
                  id="field-searchDate-error"
                  message={searchErrors.searchDate}
                />
              </div>
              <div className={cn('flex items-end', FLIGHT_FILTER_ACTIONS_PB)}>
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={listing}
                  className={BOOKING_GET_BTN}
                >
                  {listing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden />
                  )}
                  Get
                </button>
              </div>
            </div>
          </div>
        </div>

        {!searched && !listing ? (
          <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 px-3 py-8 text-center text-sm text-slate-600">
            Enter Booking No, Performa No, or From Date above and click Get to view records.
          </p>
        ) : null}

        {listing ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-white px-4 py-8 text-sm text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden />
            Loading performa records…
          </div>
        ) : null}

        {searched && !listing ? (
        <div className={BOOKING_FORM_CARD}>
          <div className={BOOKING_FORM_HEADER}>
            <h3 className="text-base font-semibold text-white">Performa records</h3>
          </div>
          <div className="p-0">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-500">
                No records found for this booking / performa number.
              </p>
            ) : (
              <>
                {/* Phone: card list */}
                <div className={BOOKING_MOBILE_CARD_LIST}>
                  {rows.map((row) => (
                    <article
                      key={row._id || row.bookingNo}
                      className={BOOKING_MOBILE_CARD}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {row.flightNo || '—'}
                        </p>
                        <p className="mt-0.5 break-words text-xs text-slate-500">
                          {row.bookingNo || '—'}
                        </p>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-slate-500">Performa No</dt>
                          <dd className="break-words font-medium text-slate-800">
                            {row.challanNo || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Date</dt>
                          <dd className="font-medium text-slate-800">
                            {row.challanDate || row.bookingDate || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Airline</dt>
                          <dd className="break-words font-medium text-slate-800">
                            {row.airlineBillTo || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Status</dt>
                          <dd className="font-medium text-slate-800">{row.status || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Bay / Pax</dt>
                          <dd className="font-medium text-slate-800">
                            {row.bayNo || '—'} / {row.noOfPax || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">GH Rep</dt>
                          <dd className="break-words font-medium text-slate-800">
                            {row.ghRepresentative || '—'}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>

                {/* Tablet / desktop: table */}
                <div
                  className={cn(
                    BOOKING_TABLE_SCROLL_REGION,
                    'hidden rounded-none border-0 shadow-none md:block',
                  )}
                  tabIndex={0}
                  role="region"
                  aria-label="Performa records table"
                >
                  <table className={cn(BOOKING_TABLE, 'min-w-[72rem]')}>
                    <thead className={BOOKING_TABLE_HEAD}>
                      <tr>
                        {CHALLAN_LIST_COLUMNS.map((col) => (
                          <th key={col.key} scope="col" className={BOOKING_TABLE_HEAD_COL}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row._id || row.bookingNo} className="hover:bg-amber-50/40">
                          {CHALLAN_LIST_COLUMNS.map((col) => (
                            <td key={col.key} className={BOOKING_TABLE_TD_WRAP}>
                              {listCellValue(row, col.key) || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={BOOKING_SEARCH_CARD}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-slate-700">
            {isEditingExisting
              ? 'Editing performa — update details and save.'
              : 'New booking linked — save performa to list this flight on Non-Scheduled Airlines (Open). Passengers are optional next.'}
          </p>
          <button
            type="button"
            onClick={handleBackToList}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:min-h-10 sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to list
          </button>
        </div>
      </div>

      <div className={BOOKING_FORM_CARD}>
        <div className={BOOKING_FORM_HEADER}>
          <h3 className="text-base font-semibold text-white">
            {isEditingExisting ? 'Edit Performa' : 'Performa'}
          </h3>
        </div>

        <div className={BOOKING_FORM_INNER}>
          {loadError ? (
            <div
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{loadError}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden />
              Loading booking…
            </div>
          ) : null}

          <div className={BOOKING_FORM_GRID_4}>
            <Field
              label="Performa Date :"
              htmlFor="field-challanDate"
              error={saveFieldErrors.challanDate}
              errorId="field-challanDate-error"
            >
              <input
                id="field-challanDate"
                type="text"
                value={
                  form.challanDate ||
                  booking?.bookingDate ||
                  ''
                }
                readOnly
                className={cn(
                  BOOKING_CONTROL_READONLY,
                  saveFieldErrors.challanDate && FRIS_INVALID_CONTROL,
                )}
                aria-readonly="true"
                aria-invalid={Boolean(saveFieldErrors.challanDate)}
                title="Same as booking date"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Same as booking date
              </p>
            </Field>

            <Field
              label="Booking No :"
              htmlFor="field-bookingNo"
              error={saveFieldErrors.bookingNo}
              errorId="field-bookingNo-error"
            >
              <input
                id="field-bookingNo"
                type="text"
                value={booking?.bookingNo ?? ''}
                readOnly
                className={cn(
                  BOOKING_CONTROL_READONLY,
                  saveFieldErrors.bookingNo && FRIS_INVALID_CONTROL,
                )}
                aria-readonly="true"
                aria-invalid={Boolean(saveFieldErrors.bookingNo)}
              />
            </Field>

            <Field label="Performa No :" htmlFor="challan-no">
              <input
                id="challan-no"
                type="text"
                value={booking?.challanNo ?? ''}
                readOnly
                className={BOOKING_CONTROL_READONLY}
                aria-readonly="true"
                placeholder="Generated on save (Station/CLN/…)"
              />
            </Field>

            <Field
              label="Bay No :"
              htmlFor="field-bayNo"
              error={saveFieldErrors.bayNo}
              errorId="field-bayNo-error"
            >
              <input
                id="field-bayNo"
                type="text"
                value={form.bayNo}
                onChange={(e) => {
                  clearSaveField('bayNo');
                  patch({ bayNo: e.target.value.replace(/[^A-Za-z0-9]/g, '') });
                }}
                className={cn(BOOKING_CONTROL, saveFieldErrors.bayNo && FRIS_INVALID_CONTROL)}
                autoComplete="off"
                aria-invalid={Boolean(saveFieldErrors.bayNo)}
                aria-describedby={saveFieldErrors.bayNo ? 'field-bayNo-error' : undefined}
              />
            </Field>

            <Field
              label="No Of Pax :"
              htmlFor="field-noOfPax"
              error={saveFieldErrors.noOfPax}
              errorId="field-noOfPax-error"
            >
              <input
                id="field-noOfPax"
                type="text"
                value={form.noOfPax}
                onChange={(e) => {
                  clearSaveField('noOfPax');
                  patch({ noOfPax: e.target.value.replace(/[^A-Za-z0-9]/g, '') });
                }}
                className={cn(BOOKING_CONTROL, saveFieldErrors.noOfPax && FRIS_INVALID_CONTROL)}
                autoComplete="off"
                aria-invalid={Boolean(saveFieldErrors.noOfPax)}
                aria-describedby={saveFieldErrors.noOfPax ? 'field-noOfPax-error' : undefined}
              />
            </Field>

            <Field
              label="No. of Ferry issued :"
              htmlFor="field-noOfFerryIssued"
              error={saveFieldErrors.noOfFerryIssued}
              errorId="field-noOfFerryIssued-error"
            >
              <input
                id="field-noOfFerryIssued"
                type="text"
                inputMode="numeric"
                value={form.noOfFerryIssued}
                onChange={(e) => {
                  clearSaveField('noOfFerryIssued');
                  patch({ noOfFerryIssued: e.target.value.replace(/\D/g, '') });
                }}
                className={cn(
                  BOOKING_CONTROL,
                  saveFieldErrors.noOfFerryIssued && FRIS_INVALID_CONTROL,
                )}
                autoComplete="off"
                aria-invalid={Boolean(saveFieldErrors.noOfFerryIssued)}
                aria-describedby={
                  saveFieldErrors.noOfFerryIssued ? 'field-noOfFerryIssued-error' : undefined
                }
              />
            </Field>

            <Field
              label="GH Representative :"
              htmlFor="field-ghRepresentative"
              error={saveFieldErrors.ghRepresentative}
              errorId="field-ghRepresentative-error"
            >
              <input
                id="field-ghRepresentative"
                type="text"
                value={form.ghRepresentative}
                onChange={(e) => {
                  clearSaveField('ghRepresentative');
                  patch({ ghRepresentative: e.target.value.replace(/[^A-Za-z ]/g, '') });
                }}
                className={cn(
                  BOOKING_CONTROL,
                  saveFieldErrors.ghRepresentative && FRIS_INVALID_CONTROL,
                )}
                autoComplete="name"
                aria-invalid={Boolean(saveFieldErrors.ghRepresentative)}
                aria-describedby={
                  saveFieldErrors.ghRepresentative ? 'field-ghRepresentative-error' : undefined
                }
              />
            </Field>

            <Field
              label="Airline Representative :"
              htmlFor="field-airlineRepresentative"
              error={saveFieldErrors.airlineRepresentative}
              errorId="field-airlineRepresentative-error"
            >
              <input
                id="field-airlineRepresentative"
                type="text"
                value={form.airlineRepresentative}
                onChange={(e) => {
                  clearSaveField('airlineRepresentative');
                  patch({ airlineRepresentative: e.target.value.replace(/[^A-Za-z ]/g, '') });
                }}
                className={cn(
                  BOOKING_CONTROL,
                  saveFieldErrors.airlineRepresentative && FRIS_INVALID_CONTROL,
                )}
                autoComplete="name"
                aria-invalid={Boolean(saveFieldErrors.airlineRepresentative)}
                aria-describedby={
                  saveFieldErrors.airlineRepresentative
                    ? 'field-airlineRepresentative-error'
                    : undefined
                }
              />
            </Field>

            <Field
              label="Remarks :"
              htmlFor="field-remarks"
              className="sm:col-span-2 lg:col-span-2"
              error={saveFieldErrors.remarks}
              errorId="field-remarks-error"
            >
              <textarea
                id="field-remarks"
                rows={2}
                value={form.remarks}
                onChange={(e) => patch({ remarks: e.target.value })}
                className={cn(
                  BOOKING_CONTROL,
                  'h-auto min-h-[2.75rem] resize-y py-2 leading-relaxed',
                  saveFieldErrors.remarks && FRIS_INVALID_CONTROL,
                )}
                aria-invalid={Boolean(saveFieldErrors.remarks)}
                aria-describedby={
                  saveFieldErrors.remarks ? 'field-remarks-error' : undefined
                }
              />
            </Field>
          </div>

          {saveError ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{saveError}</span>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading || !booking?.bookingNo}
              className={BOOKING_SAVE_BTN}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {isEditingExisting ? 'Update Performa' : 'Save Performa'}
            </button>
          </div>
        </div>
      </div>

      <div className={BOOKING_FORM_CARD}>
        <div className={BOOKING_FORM_HEADER}>
          <h3 className="text-base font-semibold text-white">Booking</h3>
        </div>
        <div className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden />
              Loading booking…
            </div>
          ) : !booking ? (
            <p className="px-4 py-8 text-sm text-slate-500">No booking to display.</p>
          ) : (
            <>
              <dl className={cn(BOOKING_MOBILE_CARD_LIST, 'md:hidden')}>
                <div className={BOOKING_MOBILE_CARD}>
                  <div className="grid grid-cols-1 gap-2.5 xs:grid-cols-2">
                    {BOOKING_DETAIL_COLUMNS.slice(0, 8).map((col) => (
                      <div key={col.key}>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {col.label}
                        </dt>
                        <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">
                          {cellValue(booking, col.key) || '—'}
                        </dd>
                      </div>
                    ))}
                  </div>
                </div>
              </dl>
              <div
                className={cn(
                  BOOKING_TABLE_SCROLL_REGION,
                  'hidden rounded-none border-0 shadow-none md:block',
                )}
                tabIndex={0}
                role="region"
                aria-label="Booking details table"
              >
                <table className={cn(BOOKING_TABLE, 'min-w-max')}>
                  <caption className="sr-only">
                    Booking details for {booking.bookingNo}
                  </caption>
                  <thead className={BOOKING_TABLE_HEAD}>
                    <tr>
                      {BOOKING_DETAIL_COLUMNS.map((col) => (
                        <th key={col.key} scope="col" className={BOOKING_TABLE_HEAD_COL}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {BOOKING_DETAIL_COLUMNS.map((col) => (
                        <td key={col.key} className={BOOKING_TABLE_TD_WRAP}>
                          {cellValue(booking, col.key) || '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
