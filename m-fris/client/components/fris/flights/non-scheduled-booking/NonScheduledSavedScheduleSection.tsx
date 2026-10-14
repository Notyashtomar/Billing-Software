'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteNonScheduledBooking,
  listNonScheduledBookings,
  toNonScheduledBookingKey,
  type NonScheduledBookingRecord,
} from '@/lib/api';
import { DatePicker } from '@/components/ui/DatePicker';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { isFrisElevatedRole } from '@/lib/fris-session';
import {
  FRIS_INVALID_CONTROL,
  FRIS_INVALID_PICKER_WRAP,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';
import {
  BOOKING_CONTROL,
  BOOKING_DELETE_BTN,
  BOOKING_EDIT_BTN,
  BOOKING_FIELD_WRAP,
  BOOKING_FILTER_ACTION,
  BOOKING_FILTER_FIELDS,
  BOOKING_FILTER_WITH_ACTION,
  BOOKING_FORM_CARD,
  BOOKING_FORM_HEADER,
  BOOKING_FORM_INNER,
  BOOKING_GET_BTN,
  BOOKING_LABEL,
  BOOKING_MOBILE_CARD,
  BOOKING_MOBILE_CARD_LIST,
  BOOKING_TABLE,
  BOOKING_TABLE_HEAD,
  BOOKING_TABLE_HEAD_COL,
  BOOKING_TABLE_SCROLL_REGION,
  BOOKING_TABLE_TD,
  BOOKING_TABLE_TD_ACTIONS,
  BOOKING_TABLE_TD_WRAP,
} from './bookingPageLayout';

type SavedScheduleFilters = {
  fromDate: string;
  flightNo: string;
  bookingNo: string;
  challanNo: string;
};

const EMPTY_FILTERS: SavedScheduleFilters = {
  fromDate: '',
  flightNo: '',
  bookingNo: '',
  challanNo: '',
};

const FILTER_FIELD_ORDER = ['fromDate', 'flightNo', 'bookingNo', 'challanNo'] as const;
type FilterField = (typeof FILTER_FIELD_ORDER)[number];

const TABLE_COLUMNS = [
  'Booking Date',
  'Flight No',
  'Booking No',
  'Performa No',
  'Airline',
  'STA Date',
  'STA Time',
  'STD Date',
  'STD Time',
  'Actions',
] as const;

function hasAnyFilter(f: SavedScheduleFilters): boolean {
  return Boolean(
    f.fromDate.trim() ||
      f.flightNo.trim() ||
      f.bookingNo.trim() ||
      f.challanNo.trim(),
  );
}

type NonScheduledSavedScheduleSectionProps = {
  refreshToken?: number;
  editingBookingKey?: string | null;
  onEdit: (row: NonScheduledBookingRecord) => void;
  /** Called after a successful delete so the parent can exit edit mode. */
  onDeleted?: (bookingKey: string) => void;
};

export default function NonScheduledSavedScheduleSection({
  refreshToken = 0,
  editingBookingKey,
  onEdit,
  onDeleted,
}: NonScheduledSavedScheduleSectionProps) {
  const [filters, setFilters] = useState<SavedScheduleFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<SavedScheduleFilters | null>(null);
  const [rows, setRows] = useState<NonScheduledBookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [canManageActions, setCanManageActions] = useState(false);
  const { errors, clearField, clearAll, applyAndFocus } =
    useFieldErrors<FilterField>(FILTER_FIELD_ORDER);

  useEffect(() => {
    setCanManageActions(isFrisElevatedRole(localStorage.getItem('userRole')));
  }, []);

  const patchFilter = useCallback(
    (partial: Partial<SavedScheduleFilters>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
      for (const key of Object.keys(partial) as FilterField[]) {
        clearField(key);
      }
      // Clearing any filter clears the shared "at least one" error on fromDate.
      clearField('fromDate');
    },
    [clearField],
  );

  const loadRows = useCallback(
    async (nextFilters: SavedScheduleFilters) => {
      const next: FieldErrors<FilterField> = {};
      if (!hasAnyFilter(nextFilters)) {
        next.fromDate =
          'Enter From Date, Flight No, Booking No, or Performa No.';
      } else if (nextFilters.fromDate.trim()) {
        const dateErr = validDate(nextFilters.fromDate, 'From date');
        if (dateErr) next.fromDate = dateErr;
      }
      if (applyAndFocus(next)) return;

      setLoading(true);
      try {
        const list = await listNonScheduledBookings({
          fromDate: nextFilters.fromDate.trim() || undefined,
          flightNo: nextFilters.flightNo.trim() || undefined,
          bookingNo: nextFilters.bookingNo.trim() || undefined,
          challanNo: nextFilters.challanNo.trim() || undefined,
        });
        setRows(list);
        setSearched(true);
        setApplied(nextFilters);
        clearAll();
        if (list.length === 0) {
          toast.message('No saved schedules match these filters.');
        }
      } catch (err) {
        setRows([]);
        setSearched(true);
        toast.error(err instanceof Error ? err.message : 'Could not load schedules.');
      } finally {
        setLoading(false);
      }
    },
    [applyAndFocus, clearAll],
  );

  // Re-run last search after create/update — only if user already clicked Get.
  useEffect(() => {
    if (!applied || refreshToken === 0) return;
    void loadRows(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh after save only
  }, [refreshToken]);

  const handleGet = useCallback(() => {
    void loadRows(filters);
  }, [filters, loadRows]);

  const handleDelete = useCallback(
    async (row: NonScheduledBookingRecord) => {
      const key =
        row.bookingKey?.trim() || toNonScheduledBookingKey(row.bookingNo);
      if (!key) return;

      const label = row.bookingNo || row.flightNo || 'this booking';
      if (
        !window.confirm(
          `Delete ${label}? This cannot be undone.${
            row.challanNo?.trim()
              ? ' Promoted flights will also be removed from the schedule list.'
              : ''
          }`,
        )
      ) {
        return;
      }

      setDeletingKey(key);
      try {
        await deleteNonScheduledBooking(key);
        toast.success('Schedule deleted.');
        onDeleted?.(key);
        if (applied) void loadRows(applied);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed.');
      } finally {
        setDeletingKey(null);
      }
    },
    [applied, loadRows, onDeleted],
  );

  const showTable = searched;

  return (
    <div className={BOOKING_FORM_CARD}>
      <div className={BOOKING_FORM_HEADER}>
        <h3 className="text-base font-semibold text-white">Saved Schedule</h3>
      </div>

      <div className={cn(BOOKING_FORM_INNER, 'space-y-4')}>
        <p className="text-xs text-slate-500 sm:text-sm">
          Enter From Date, Flight No, Booking No, or Performa No, then click Get to show the table.
        </p>

        <div className={BOOKING_FILTER_WITH_ACTION}>
          <div className={BOOKING_FILTER_FIELDS}>
            <div className={BOOKING_FIELD_WRAP}>
              <label htmlFor="field-fromDate" className={BOOKING_LABEL}>
                From Date
              </label>
              <div className={cn(errors.fromDate && FRIS_INVALID_PICKER_WRAP)}>
                <DatePicker
                  id="field-fromDate"
                  value={filters.fromDate}
                  onChange={(value) => patchFilter({ fromDate: value })}
                  valueFormat="yyyy-MM-dd"
                />
              </div>
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>
            <div className={BOOKING_FIELD_WRAP}>
              <label htmlFor="field-flightNo" className={BOOKING_LABEL}>
                Flight No
              </label>
              <input
                id="field-flightNo"
                type="text"
                value={filters.flightNo}
                onChange={(e) =>
                  patchFilter({ flightNo: e.target.value.toUpperCase() })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGet();
                }}
                className={cn(
                  BOOKING_CONTROL,
                  errors.flightNo && FRIS_INVALID_CONTROL,
                )}
                placeholder="Flight no"
                autoComplete="off"
                aria-invalid={Boolean(errors.flightNo)}
              />
              <FormFieldError id="field-flightNo-error" message={errors.flightNo} />
            </div>
            <div className={BOOKING_FIELD_WRAP}>
              <label htmlFor="field-bookingNo" className={BOOKING_LABEL}>
                Booking No
              </label>
              <input
                id="field-bookingNo"
                type="text"
                value={filters.bookingNo}
                onChange={(e) => patchFilter({ bookingNo: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGet();
                }}
                className={cn(
                  BOOKING_CONTROL,
                  errors.bookingNo && FRIS_INVALID_CONTROL,
                )}
                placeholder="Booking no"
                autoComplete="off"
                aria-invalid={Boolean(errors.bookingNo)}
              />
              <FormFieldError
                id="field-bookingNo-error"
                message={errors.bookingNo}
              />
            </div>
            <div className={BOOKING_FIELD_WRAP}>
              <label htmlFor="field-challanNo" className={BOOKING_LABEL}>
                Performa No
              </label>
              <input
                id="field-challanNo"
                type="text"
                value={filters.challanNo}
                onChange={(e) => patchFilter({ challanNo: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGet();
                }}
                className={cn(
                  BOOKING_CONTROL,
                  errors.challanNo && FRIS_INVALID_CONTROL,
                )}
                placeholder="Performa no"
                autoComplete="off"
                aria-invalid={Boolean(errors.challanNo)}
              />
              <FormFieldError
                id="field-challanNo-error"
                message={errors.challanNo}
              />
            </div>
          </div>
          <div className={cn(BOOKING_FILTER_ACTION, FLIGHT_FILTER_ACTIONS_PB)}>
            <button
              type="button"
              onClick={handleGet}
              disabled={loading}
              className={BOOKING_GET_BTN}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              Get
            </button>
          </div>
        </div>

        {!showTable && !loading ? (
          <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 px-3 py-6 text-center text-sm text-slate-600">
            Enter a filter above and click Get to view saved schedules.
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden />
            Loading schedules…
          </div>
        ) : null}

        {showTable && !loading && rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No saved schedules match these filters.
          </p>
        ) : null}

        {showTable && !loading && rows.length > 0 ? (
          <>
            <div className={BOOKING_MOBILE_CARD_LIST}>
              {rows.map((row) => {
                const rowKey =
                  row.bookingKey?.trim() || toNonScheduledBookingKey(row.bookingNo);
                const isEditing = Boolean(
                  editingBookingKey && rowKey === editingBookingKey,
                );
                const isDeleting = deletingKey === rowKey;
                return (
                  <article
                    key={row._id || row.bookingNo}
                    className={cn(BOOKING_MOBILE_CARD, isEditing && 'ring-2 ring-amber-300')}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {row.flightNo || '—'}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-slate-500">
                        {row.bookingNo || '—'}
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-slate-500">Booking Date</dt>
                        <dd className="font-medium text-slate-800">
                          {row.bookingDate || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Airline</dt>
                        <dd className="break-words font-medium text-slate-800">
                          {row.airlineBillTo || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">STA</dt>
                        <dd className="font-medium text-slate-800">
                          {row.staDate || '—'} {row.staTime || ''}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">STD</dt>
                        <dd className="font-medium text-slate-800">
                          {row.stdDate || '—'} {row.stdTime || ''}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-slate-500">Performa No</dt>
                        <dd className="break-words font-medium text-slate-800">
                          {row.challanNo || '—'}
                        </dd>
                      </div>
                    </dl>
                    {canManageActions ? (
                      <div className="mt-3 inline-flex flex-nowrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEdit(row);
                          }}
                          title="Edit booking"
                          aria-label={`Edit booking ${row.bookingNo}`}
                          className={BOOKING_EDIT_BTN}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleDelete(row);
                          }}
                          disabled={isDeleting}
                          title="Delete schedule"
                          aria-label={`Delete ${row.bookingNo}`}
                          className={BOOKING_DELETE_BTN}
                        >
                          {isDeleting ? (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <div
              className={cn(BOOKING_TABLE_SCROLL_REGION, 'hidden rounded-lg md:block')}
              tabIndex={0}
              role="region"
              aria-label="Saved non-scheduled schedules"
            >
              <table className={cn(BOOKING_TABLE, 'min-w-[68rem]')}>
                <thead className={BOOKING_TABLE_HEAD}>
                  <tr>
                    {TABLE_COLUMNS.filter(
                      (label) => canManageActions || label !== 'Actions',
                    ).map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className={cn(
                          BOOKING_TABLE_HEAD_COL,
                          label === 'Actions' &&
                            'sticky right-0 z-[2] min-w-[6.5rem] whitespace-nowrap shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.18)]',
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowKey =
                      row.bookingKey?.trim() || toNonScheduledBookingKey(row.bookingNo);
                    const isEditing = Boolean(
                      editingBookingKey && rowKey === editingBookingKey,
                    );
                    const isDeleting = deletingKey === rowKey;

                    return (
                      <tr
                        key={row._id || row.bookingNo}
                        className={cn(isEditing && 'bg-amber-50/80')}
                      >
                        <td className={BOOKING_TABLE_TD}>{row.bookingDate || '—'}</td>
                        <td className={cn(BOOKING_TABLE_TD, 'font-medium text-slate-900')}>
                          {row.flightNo || '—'}
                        </td>
                        <td className={BOOKING_TABLE_TD_WRAP} title={row.bookingNo}>
                          {row.bookingNo || '—'}
                        </td>
                        <td className={BOOKING_TABLE_TD_WRAP} title={row.challanNo}>
                          {row.challanNo || '—'}
                        </td>
                        <td className={BOOKING_TABLE_TD_WRAP}>{row.airlineBillTo || '—'}</td>
                        <td className={BOOKING_TABLE_TD}>{row.staDate || '—'}</td>
                        <td className={BOOKING_TABLE_TD}>{row.staTime || '—'}</td>
                        <td className={BOOKING_TABLE_TD}>{row.stdDate || '—'}</td>
                        <td className={BOOKING_TABLE_TD}>{row.stdTime || '—'}</td>
                        {canManageActions ? (
                          <td className={BOOKING_TABLE_TD_ACTIONS}>
                            <div className="inline-flex flex-nowrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onEdit(row);
                                }}
                                title="Edit booking"
                                aria-label={`Edit booking ${row.bookingNo}`}
                                className={BOOKING_EDIT_BTN}
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDelete(row);
                                }}
                                disabled={isDeleting}
                                title="Delete schedule"
                                aria-label={`Delete ${row.bookingNo}`}
                                className={BOOKING_DELETE_BTN}
                              >
                                {isDeleting ? (
                                  <Loader2
                                    className="h-4 w-4 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                )}
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
