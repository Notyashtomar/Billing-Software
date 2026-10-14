'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  required,
  validateYmdDateRange,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import { BookingReportResultTables } from './BookingReportResultTables';
import type { AddPassengerSearchRecord } from './add-passenger-record';
import { exportBookingRecordsToExcel } from './export-booking-records-excel';
import {
  BOOKING_CONTROL,
  BOOKING_FORM_CARD,
  BOOKING_FORM_HEADER,
  BOOKING_FORM_INNER,
  BOOKING_GET_BTN,
  BOOKING_LABEL,
  BOOKING_RADIO_INPUT,
  BOOKING_RADIO_LABEL,
  BOOKING_SEARCH_CARD,
} from './bookingPageLayout';

type SearchMode = 'challan-no' | 'challan-date';

const FIELD_ORDER = ['challanNo', 'fromDate', 'toDate'] as const;
type ReportField = (typeof FIELD_ORDER)[number];

const EXPORT_BTN =
  'inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

export default function NonScheduledReportsPanel() {
  const [searchMode, setSearchMode] = useState<SearchMode>('challan-date');
  const [challanNo, setChallanNo] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [records, setRecords] = useState<AddPassengerSearchRecord[]>([]);
  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<ReportField>(FIELD_ORDER);

  const filterEndMinDate = useMemo(() => {
    if (!fromDate?.trim()) return undefined;
    const parts = fromDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return undefined;
    const [y, m, day] = parts;
    return new Date(y!, m! - 1, day!);
  }, [fromDate]);

  const filterStartMaxDate = useMemo(() => {
    if (!toDate?.trim()) return new Date();
    const parts = toDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
    const [y, m, day] = parts;
    const end = new Date(y!, m! - 1, day!);
    const cap = new Date();
    cap.setHours(0, 0, 0, 0);
    return end.getTime() <= cap.getTime() ? end : cap;
  }, [toDate]);

  const handleSearch = useCallback(async () => {
    const next: FieldErrors<ReportField> = {};
    if (searchMode === 'challan-no') {
      const err = required(challanNo, 'Performa No');
      if (err) next.challanNo = err;
    } else {
      Object.assign(
        next,
        validateYmdDateRange(fromDate, toDate, { toNotAfterToday: true }),
      );
    }
    if (applyAndFocus(next)) return;

    setSearching(true);
    setSearched(false);
    setRecords([]);

    try {
      setRecords([]);
      setSearched(true);
    } catch {
      toast.error('Search failed. Try again.');
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [applyAndFocus, challanNo, fromDate, searchMode, toDate]);

  const handleExport = useCallback(() => {
    if (records.length === 0) {
      toast.message('Search first to export results.');
      return;
    }
    void exportBookingRecordsToExcel(records).then(() => {
      toast.success('Excel file downloaded.');
    });
  }, [records]);

  const handleReport = useCallback((record: AddPassengerSearchRecord) => {
    toast.success(`Opening report for ${record.challan.challanNo}.`);
  }, []);

  return (
    <div className="space-y-5">
      <div className={BOOKING_FORM_CARD}>
        <div className={BOOKING_FORM_HEADER}>
          <h3 className="text-base font-semibold text-white">Find record</h3>
        </div>

        <div className={cn(BOOKING_FORM_INNER, 'space-y-4')}>
          <fieldset className="flex flex-col gap-3 border-0 p-0 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2">
            <legend className="sr-only">Find record by</legend>
            <span className="text-sm font-semibold text-slate-800">Find record by</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className={BOOKING_RADIO_LABEL}>
                <input
                  type="radio"
                  name="report-search-mode"
                  checked={searchMode === 'challan-no'}
                  onChange={() => {
                    setSearchMode('challan-no');
                    clearAll();
                  }}
                  className={BOOKING_RADIO_INPUT}
                />
                <span className="font-semibold">Performa No</span>
              </label>
              <label className={BOOKING_RADIO_LABEL}>
                <input
                  type="radio"
                  name="report-search-mode"
                  checked={searchMode === 'challan-date'}
                  onChange={() => {
                    setSearchMode('challan-date');
                    clearAll();
                  }}
                  className={BOOKING_RADIO_INPUT}
                />
                <span className="font-semibold">Performa Date</span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end xl:gap-3">
            {searchMode === 'challan-no' ? (
              <div className="min-w-0 w-full sm:max-w-xs xl:w-56 xl:flex-none">
                <label htmlFor="field-challanNo" className={BOOKING_LABEL}>
                  Performa No
                </label>
                <input
                  id="field-challanNo"
                  type="text"
                  value={challanNo}
                  onChange={(e) => {
                    setChallanNo(e.target.value.toUpperCase());
                    clearField('challanNo');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  className={cn(
                    BOOKING_CONTROL,
                    errors.challanNo && FRIS_INVALID_CONTROL,
                  )}
                  autoComplete="off"
                  placeholder="Enter performa number"
                  aria-invalid={Boolean(errors.challanNo)}
                />
                <FormFieldError
                  id="field-challanNo-error"
                  message={errors.challanNo}
                />
              </div>
            ) : (
              <>
                <div className="min-w-0 w-full sm:max-w-[11rem] xl:w-40 xl:flex-none">
                  <label htmlFor="field-fromDate" className={BOOKING_LABEL}>
                    From Date
                  </label>
                  <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                    <DatePicker
                      id="field-fromDate"
                      value={fromDate}
                      onChange={(value) => {
                        setFromDate(value);
                        clearField('fromDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      maxDate={filterStartMaxDate}
                    />
                  </div>
                  <FormFieldError
                    id="field-fromDate-error"
                    message={errors.fromDate}
                  />
                </div>
                <div className="min-w-0 w-full sm:max-w-[11rem] xl:w-40 xl:flex-none">
                  <label htmlFor="field-toDate" className={BOOKING_LABEL}>
                    To Date
                  </label>
                  <div className={cn(errors.toDate && FRIS_INVALID_PICKER_WRAP)}>
                    <DatePicker
                      id="field-toDate"
                      value={toDate}
                      onChange={(value) => {
                        setToDate(value);
                        clearField('toDate');
                      }}
                      valueFormat="yyyy-MM-dd"
                      minDate={filterEndMinDate}
                      maxDate={new Date()}
                    />
                  </div>
                  <FormFieldError id="field-toDate-error" message={errors.toDate} />
                </div>
              </>
            )}

            <div
              className={cn(
                'flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:ml-auto xl:w-auto',
                FLIGHT_FILTER_ACTIONS_PB,
              )}
            >
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching}
                className={cn(BOOKING_GET_BTN, 'w-full sm:w-auto')}
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4" aria-hidden />
                )}
                Search
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={records.length === 0}
                className={EXPORT_BTN}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
                Export to Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {searched && records.length > 0 ? (
          <motion.div
            key="report-results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <BookingReportResultTables records={records} onReport={handleReport} />
          </motion.div>
        ) : null}

        {searched && records.length === 0 ? (
          <motion.div
            key="report-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={BOOKING_SEARCH_CARD}
          >
            <p className="text-sm text-slate-600">No performa or booking records found.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
