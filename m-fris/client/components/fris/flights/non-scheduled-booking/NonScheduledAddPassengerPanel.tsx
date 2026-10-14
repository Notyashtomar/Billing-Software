'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getNonScheduledBooking,
  getNonScheduledBookingByChallan,
  listNonScheduledBookings,
  saveNonScheduledPassengers,
  toNonScheduledBookingKey,
  type NonScheduledBookingRecord,
} from '@/lib/api';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  normalizeText,
  personName,
  required,
  runValidators,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import { AddPassengerResultTables } from './AddPassengerResultTables';
import type { AddPassengerSearchRecord } from './add-passenger-record';
import {
  BOOKING_CONTROL,
  BOOKING_FORM_CARD,
  BOOKING_FORM_HEADER,
  BOOKING_FORM_INNER,
  BOOKING_GET_BTN,
  BOOKING_LABEL,
  BOOKING_RADIO_INPUT,
  BOOKING_RADIO_LABEL,
  BOOKING_SAVE_BTN,
  BOOKING_SEARCH_CARD,
} from './bookingPageLayout';

type SearchMode = 'challan-no' | 'challan-date';

const SEARCH_FIELD_ORDER = ['challanNo', 'challanDate'] as const;
type SearchField = (typeof SEARCH_FIELD_ORDER)[number];

const PAX_FIELD_ORDER = ['passengerName'] as const;
type PaxField = (typeof PAX_FIELD_ORDER)[number];

type PassengerRow = {
  id: string;
  name: string;
};

type PassengerDraftRow = {
  id: string;
  name: string;
};

function createPassengerDraftRow(name = ''): PassengerDraftRow {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
  };
}

function createInitialPassengerDrafts(count = 2): PassengerDraftRow[] {
  return Array.from({ length: count }, () => createPassengerDraftRow());
}

function bookingToSearchRecord(
  row: NonScheduledBookingRecord,
): AddPassengerSearchRecord {
  return {
    challan: {
      challanNo: row.challanNo || '',
      fhrNo: row.flightSerialNo ? String(row.flightSerialNo) : '',
      challanDate: row.challanDate || '',
      bayNo: row.bayNo || '',
      noOfFerryIssued: row.noOfFerryIssued || '',
      ghRepresentative: row.ghRepresentative || '',
      airlineRepresentative: row.airlineRepresentative || '',
      remarks: row.remarks || '',
    },
    booking: {
      bookingNo: row.bookingNo || '',
      bookingDate: row.bookingDate || '',
      booking: row.channel === 'mail' ? 'By Mail' : 'Direct',
      mailReceivedFrom: row.mailReceivedFrom || '',
      mailReceivedBy: row.mailReceivedBy || '',
      mailSubject: row.mailSubject || '',
      service: row.serviceType || '',
      operator: row.operator || '',
      airlineBillTo: row.airlineBillTo || '',
    },
    flight: {
      airlineCode: row.airlineCode || '',
      flightNo: row.flightNo || '',
      registrationNo: row.registrationNo || '',
      routing: row.routing || '',
      staDate: row.staDate || '',
      staTime: row.staTime || '',
      stdDate: row.stdDate || '',
      stdTime: row.stdTime || '',
      aircraftType: row.aircraftType || '',
      aircraftBody: row.aircraftBody || '',
      mtow: row.mtow || '',
      terminalCode: row.terminalCode || '',
      opsType: row.opsType || '',
      categoryOfFlight: row.categoryOfFlight || '',
      flightType: row.flightType || '',
    },
    advance: {
      advance: row.advance || 'no',
      amount: row.amount || '0',
    },
  };
}

function passengersFromBooking(row: NonScheduledBookingRecord): PassengerRow[] {
  return (row.passengers ?? []).map((p, index) => ({
    id: `pax-${index}-${p.name}`,
    name: p.name,
  }));
}

type NonScheduledAddPassengerPanelProps = {
  bookingNo?: string | null;
};

export default function NonScheduledAddPassengerPanel({
  bookingNo: bookingNoProp,
}: NonScheduledAddPassengerPanelProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const [searchMode, setSearchMode] = useState<SearchMode>('challan-no');
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [booking, setBooking] = useState<NonScheduledBookingRecord | null>(null);
  const [record, setRecord] = useState<AddPassengerSearchRecord | null>(null);
  const [passengers, setPassengers] = useState<PassengerRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passengerDrafts, setPassengerDrafts] = useState<PassengerDraftRow[]>(() =>
    createInitialPassengerDrafts(),
  );
  const [addingPassenger, setAddingPassenger] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    errors: searchErrors,
    clearField: clearSearchField,
    clearAll: clearSearchErrors,
    applyAndFocus: applySearchErrors,
  } = useFieldErrors<SearchField>(SEARCH_FIELD_ORDER);
  const {
    errors: paxErrors,
    clearField: clearPaxField,
    clearAll: clearPaxErrors,
    applyAndFocus: applyPaxErrors,
  } = useFieldErrors<PaxField>(PAX_FIELD_ORDER);

  const applyBooking = useCallback((row: NonScheduledBookingRecord) => {
    setBooking(row);
    setRecord(bookingToSearchRecord(row));
    setPassengers(passengersFromBooking(row));
    setSearched(true);
  }, []);

  useEffect(() => {
    const key = String(bookingNoProp ?? '').trim();
    if (!key) return;
    let mounted = true;
    setSearching(true);
    getNonScheduledBooking(key)
      .then((row) => {
        if (!mounted) return;
        if (!row.challanNo?.trim()) {
          toast.warning('Save performa before adding passengers.');
          setSearched(true);
          setRecord(null);
          return;
        }
        applyBooking(row);
        setChallanNo(row.challanNo);
      })
      .catch((err) => {
        if (!mounted) return;
        toast.error(err instanceof Error ? err.message : 'Failed to load booking.');
        setSearched(true);
        setRecord(null);
      })
      .finally(() => {
        if (mounted) setSearching(false);
      });
    return () => {
      mounted = false;
    };
  }, [applyBooking, bookingNoProp]);

  const resetPassengerDrafts = useCallback(() => {
    setPassengerDrafts(createInitialPassengerDrafts());
  }, []);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setDialogOpen(open);
      if (open) {
        resetPassengerDrafts();
        clearPaxErrors();
      }
    },
    [clearPaxErrors, resetPassengerDrafts],
  );

  const updateDraftName = useCallback(
    (id: string, name: string) => {
      setPassengerDrafts((prev) =>
        prev.map((row) => (row.id === id ? { ...row, name } : row)),
      );
      clearPaxField('passengerName');
    },
    [clearPaxField],
  );

  const addDraftRow = useCallback(() => {
    setPassengerDrafts((prev) => [...prev, createPassengerDraftRow()]);
  }, []);

  const removeDraftRow = useCallback((id: string) => {
    setPassengerDrafts((prev) => {
      if (prev.length <= 1) return [createPassengerDraftRow()];
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const paxCount = passengers.length;

  const handleSearch = useCallback(async () => {
    const next: FieldErrors<SearchField> = {};
    if (searchMode === 'challan-no') {
      const err = required(challanNo, 'Performa No');
      if (err) next.challanNo = err;
    } else {
      const err = required(challanDate, 'Performa date');
      if (err) next.challanDate = err;
    }
    if (applySearchErrors(next)) return;

    setSearching(true);
    setSearched(false);
    setRecord(null);
    setBooking(null);
    setPassengers([]);

    try {
      if (searchMode === 'challan-no') {
        const row = await getNonScheduledBookingByChallan(challanNo.trim());
        applyBooking(row);
      } else {
        const list = await listNonScheduledBookings({
          challanDate: challanDate.trim(),
        });
        const withChallan = list.filter((r) => r.challanNo?.trim());
        if (withChallan.length === 0) {
          setSearched(true);
          toast.message('No performa found for that date.');
          return;
        }
        applyBooking(withChallan[0]!);
        if (withChallan.length > 1) {
          toast.message(
            `${withChallan.length} performas on this date — showing the latest.`,
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed.');
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [applyBooking, applySearchErrors, challanDate, challanNo, searchMode]);

  const handleAddPassengersLocal = useCallback(async () => {
    const names = passengerDrafts
      .map((row) => normalizeText(row.name))
      .filter((name) => name.length > 0);

    const next: FieldErrors<PaxField> = {};
    if (names.length === 0) {
      next.passengerName = 'Enter at least one passenger name.';
    } else {
      for (const name of names) {
        const nameErr = runValidators(
          required(name, 'Passenger name'),
          personName(name, 'Passenger name'),
        );
        if (nameErr) {
          next.passengerName = nameErr;
          break;
        }
      }
    }
    if (applyPaxErrors(next)) return;

    setAddingPassenger(true);
    try {
      const base = Date.now();
      setPassengers((prev) => [
        ...prev,
        ...names.map((name, index) => ({
          id: `pax-${base}-${index}`,
          name,
        })),
      ]);
      setDialogOpen(false);
      resetPassengerDrafts();
      clearPaxErrors();
      toast.success(
        names.length === 1 ? '1 passenger added.' : `${names.length} passengers added.`,
      );
    } finally {
      setAddingPassenger(false);
    }
  }, [applyPaxErrors, clearPaxErrors, passengerDrafts, resetPassengerDrafts]);

  const handleRemovePassenger = useCallback((id: string) => {
    setPassengers((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const handleSavePassengers = useCallback(async () => {
    const key = toNonScheduledBookingKey(
      booking?.bookingKey || booking?.bookingNo || bookingNoProp || '',
    );
    if (!key) {
      toast.warning('Select a performa/booking first.');
      return;
    }

    const next: FieldErrors<PaxField> = {};
    if (passengers.length === 0) {
      next.passengerName = 'Add at least one passenger before saving.';
    } else {
      for (const row of passengers) {
        const name = normalizeText(row.name);
        const nameErr = runValidators(
          required(name, 'Passenger name'),
          personName(name, 'Passenger name'),
        );
        if (nameErr) {
          next.passengerName = nameErr;
          break;
        }
      }
    }
    if (applyPaxErrors(next)) {
      if (passengers.length === 0) handleDialogOpenChange(true);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveNonScheduledPassengers(key, {
        passengers: passengers.map((p) => ({ name: p.name })),
        append: false,
      });
      applyBooking(saved);
      clearPaxErrors();
      toast.success(
        `Passengers saved. Flight ${saved.flightNo} is ready on Non-Scheduled Airlines.`,
      );
      router.push('/fris/flights/non-scheduled-airlines');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [
    applyBooking,
    applyPaxErrors,
    booking,
    bookingNoProp,
    clearPaxErrors,
    handleDialogOpenChange,
    passengers,
    router,
  ]);

  return (
    <div className="space-y-5">
      <div className={BOOKING_FORM_CARD}>
        <div className={BOOKING_FORM_HEADER}>
          <h3 className="text-base font-semibold text-white">Performa and booking detail</h3>
        </div>

        <div className={cn(BOOKING_FORM_INNER, 'space-y-4 sm:space-y-5')}>
          <fieldset className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 md:gap-6">
            <legend className="sr-only">Find record by</legend>
            <span className="text-sm font-semibold text-slate-800">Find record by</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
              <label className={BOOKING_RADIO_LABEL}>
                <input
                  type="radio"
                  name="add-pax-search-mode"
                  checked={searchMode === 'challan-no'}
                  onChange={() => {
                    setSearchMode('challan-no');
                    clearSearchErrors();
                  }}
                  className={BOOKING_RADIO_INPUT}
                />
                Performa No
              </label>
              <label className={BOOKING_RADIO_LABEL}>
                <input
                  type="radio"
                  name="add-pax-search-mode"
                  checked={searchMode === 'challan-date'}
                  onChange={() => {
                    setSearchMode('challan-date');
                    clearSearchErrors();
                  }}
                  className={BOOKING_RADIO_INPUT}
                />
                Performa Date
              </label>
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {searchMode === 'challan-no' ? (
              <div className="min-w-0 flex-1">
                <label htmlFor="field-challanNo" className={BOOKING_LABEL}>
                  Performa No
                </label>
                <input
                  id="field-challanNo"
                  type="text"
                  value={challanNo}
                  onChange={(e) => {
                    setChallanNo(e.target.value.toUpperCase());
                    clearSearchField('challanNo');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearch();
                  }}
                  className={cn(
                    BOOKING_CONTROL,
                    searchErrors.challanNo && FRIS_INVALID_CONTROL,
                  )}
                  autoComplete="off"
                  placeholder="Station/CLN/serial/date/airline/flight"
                  aria-invalid={Boolean(searchErrors.challanNo)}
                />
                <FormFieldError
                  id="field-challanNo-error"
                  message={searchErrors.challanNo}
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <label htmlFor="field-challanDate" className={BOOKING_LABEL}>
                  Performa Date
                </label>
                <div className={cn(searchErrors.challanDate && FRIS_INVALID_PICKER_WRAP)}>
                  <DatePicker
                    id="field-challanDate"
                    value={challanDate}
                    onChange={(value) => {
                      setChallanDate(value);
                      clearSearchField('challanDate');
                    }}
                    valueFormat="yyyy-MM-dd"
                    className="[&>button]:box-border [&>button]:h-11 [&>button]:min-h-11 sm:[&>button]:h-10 sm:[&>button]:min-h-10"
                  />
                </div>
                <FormFieldError
                  id="field-challanDate-error"
                  message={searchErrors.challanDate}
                />
              </div>
            )}

            <div className="flex w-full shrink-0 items-end pb-[calc(0.25rem+1.125rem)] sm:w-auto">
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
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {searched && record ? (
          <motion.div
            key="add-pax-results"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            <AddPassengerResultTables
              record={record}
              paxCount={paxCount}
              passengers={passengers}
              onAddPassenger={() => handleDialogOpenChange(true)}
              onRemovePassenger={handleRemovePassenger}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void handleSavePassengers()}
                disabled={saving || passengers.length === 0}
                className={BOOKING_SAVE_BTN}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                Save passengers &amp; generate flight
              </button>
            </div>
          </motion.div>
        ) : null}

        {searched && !record ? (
          <motion.div
            key="add-pax-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={BOOKING_SEARCH_CARD}
          >
            <p className="text-sm text-slate-600">No performa or booking record found.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="flex max-h-[min(92dvh,40rem)] flex-col gap-0 border-amber-100 p-0 sm:max-w-lg"
          aria-labelledby={dialogTitleId}
        >
          <DialogHeader className="shrink-0 border-b border-amber-100 px-4 py-4 sm:px-6">
            <DialogTitle id={dialogTitleId} className="text-slate-900">
              Add Passengers
            </DialogTitle>
            <DialogDescription>
              Add one or more passenger names. Save to generate the non-scheduled flight.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={BOOKING_LABEL}>Passenger names</p>
              <button
                type="button"
                onClick={addDraftRow}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 active:scale-[0.98] sm:min-h-10 sm:w-auto sm:text-sm"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add row
              </button>
            </div>

            <div className="max-h-[min(40vh,16rem)] space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 [scrollbar-width:thin]">
              {passengerDrafts.map((row, index) => (
                <div key={row.id} className="flex items-center gap-2">
                  <label htmlFor={`field-passengerName-${row.id}`} className="sr-only">
                    Passenger {index + 1} name
                  </label>
                  <input
                    id={index === 0 ? 'field-passengerName' : `field-passengerName-${row.id}`}
                    type="text"
                    value={row.name}
                    onChange={(e) => updateDraftName(row.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAddPassengersLocal();
                    }}
                    className={cn(
                      BOOKING_CONTROL,
                      paxErrors.passengerName && FRIS_INVALID_CONTROL,
                    )}
                    autoComplete="name"
                    placeholder={`Passenger ${index + 1} name`}
                    autoFocus={index === 0}
                    aria-invalid={Boolean(paxErrors.passengerName)}
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftRow(row.id)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97] sm:h-10 sm:w-10"
                    aria-label={`Remove passenger row ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <FormFieldError
              id="field-passengerName-error"
              message={paxErrors.passengerName}
            />
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-amber-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={() => handleDialogOpenChange(false)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98] sm:min-h-10 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddPassengersLocal()}
              disabled={addingPassenger}
              className={BOOKING_SAVE_BTN}
            >
              {addingPassenger ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Add all
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
