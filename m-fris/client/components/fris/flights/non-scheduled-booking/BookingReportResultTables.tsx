'use client';

import type { ElementType } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AddPassengerSearchRecord } from './add-passenger-record';
import {
  BOOKING_RECORD_COLUMNS,
  BOOKING_RECORD_SECTION_GROUPS,
  bookingRecordCellValue,
  columnsForBookingSection,
} from './booking-record-columns';
import {
  BOOKING_BTN_PRIMARY,
  BOOKING_RESULT_ACTION_BAR,
  BOOKING_RESULT_BADGE,
  BOOKING_RESULT_FIELD_GRID,
  BOOKING_RESULT_FIELD_LABEL,
  BOOKING_RESULT_FIELD_VALUE,
  BOOKING_RESULT_SECTION_CARD,
  BOOKING_RESULT_SECTION_HEADER,
  BOOKING_TABLE,
  BOOKING_TABLE_HEAD,
  BOOKING_TABLE_HEAD_COL,
  BOOKING_TABLE_HEAD_SECTION,
  BOOKING_TABLE_ROW_ALT,
  BOOKING_TABLE_SCROLL_REGION,
  BOOKING_TABLE_TD,
  BOOKING_TABLE_TD_WRAP,
  BOOKING_TABLE_TH_WRAP,
} from './bookingPageLayout';

type RowActionConfig = {
  headerLabel: string;
  buttonLabel: string;
  icon: ElementType<{ className?: string }>;
  onAction: (record: AddPassengerSearchRecord, index: number) => void;
};

function SectionFieldCard({
  label,
  record,
}: {
  label: string;
  record: AddPassengerSearchRecord;
}) {
  const section = BOOKING_RECORD_SECTION_GROUPS.find((g) => g.label === label)?.section;
  const columns = section ? columnsForBookingSection(section) : [];

  return (
    <section className={BOOKING_RESULT_SECTION_CARD}>
      <h4 className={BOOKING_RESULT_SECTION_HEADER}>{label}</h4>
      <dl className={BOOKING_RESULT_FIELD_GRID}>
        {columns.map((col) => (
          <div key={col.key} className={cn('min-w-0', col.wide && 'sm:col-span-2')}>
            <dt className={BOOKING_RESULT_FIELD_LABEL}>{col.label}</dt>
            <dd className={BOOKING_RESULT_FIELD_VALUE}>
              {bookingRecordCellValue(record, col.key)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MobileRecordCard({
  record,
  index,
  action,
}: {
  record: AddPassengerSearchRecord;
  index: number;
  action: RowActionConfig;
}) {
  const ActionIcon = action.icon;

  return (
    <article className="space-y-3 rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-slate-900">Record {index + 1}</p>
          <div className="flex flex-wrap gap-2">
            <span className={BOOKING_RESULT_BADGE} title={record.challan.challanNo}>
              <span className="shrink-0 text-amber-700/80">Performa</span>
              <span className="break-words">{record.challan.challanNo}</span>
            </span>
            <span className={BOOKING_RESULT_BADGE}>
              <span className="shrink-0 text-amber-700/80">Flight</span>
              <span>
                {record.flight.airlineCode} {record.flight.flightNo}
              </span>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => action.onAction(record, index)}
          className={BOOKING_BTN_PRIMARY}
        >
          <ActionIcon className="h-4 w-4 shrink-0" aria-hidden />
          {action.buttonLabel}
        </button>
      </div>

      {BOOKING_RECORD_SECTION_GROUPS.map((group) => (
        <SectionFieldCard
          key={`${index}-${group.section}`}
          label={group.label}
          record={record}
        />
      ))}
    </article>
  );
}

function DesktopWideTable({
  records,
  action,
}: {
  records: AddPassengerSearchRecord[];
  action: RowActionConfig;
}) {
  const ActionIcon = action.icon;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-xs text-slate-500">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        Scroll horizontally to view all columns
      </p>
      <div
        className={BOOKING_TABLE_SCROLL_REGION}
        tabIndex={0}
        role="region"
        aria-label="Performa, booking, and flight report details"
      >
        <table className={cn(BOOKING_TABLE, 'min-w-max')}>
          <caption className="sr-only">
            Performa, booking, flight, and advance details for report results
          </caption>
          <thead className={BOOKING_TABLE_HEAD}>
            <tr>
              <th
                className={cn(
                  BOOKING_TABLE_HEAD_SECTION,
                  'sticky left-0 z-20 min-w-[8.5rem] border-r border-white/25 text-left',
                )}
                rowSpan={2}
                scope="col"
              >
                {action.headerLabel}
              </th>
              {BOOKING_RECORD_SECTION_GROUPS.map((group) => {
                const span = columnsForBookingSection(group.section).length;
                return (
                  <th
                    key={group.section}
                    colSpan={span}
                    className={cn(
                      BOOKING_TABLE_HEAD_SECTION,
                      'border-l border-white/20',
                    )}
                    scope="colgroup"
                  >
                    {group.label}
                  </th>
                );
              })}
            </tr>
            <tr>
              {BOOKING_RECORD_COLUMNS.map((col, colIndex) => {
                const prev = BOOKING_RECORD_COLUMNS[colIndex - 1];
                const isSectionStart = !prev || prev.section !== col.section;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      col.wide ? BOOKING_TABLE_TH_WRAP : BOOKING_TABLE_HEAD_COL,
                      isSectionStart && 'border-l border-white/25',
                    )}
                    scope="col"
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {records.map((record, rowIndex) => (
              <tr key={`${record.challan.challanNo}-${rowIndex}`}>
                <td
                  className={cn(
                    BOOKING_TABLE_TD,
                    'sticky left-0 z-10 min-w-[8.5rem] border-r border-amber-200/80 bg-white',
                    rowIndex % 2 === 1 && 'bg-amber-50/30',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => action.onAction(record, rowIndex)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-[0.98]"
                  >
                    <ActionIcon className="h-4 w-4 shrink-0" aria-hidden />
                    {action.buttonLabel}
                  </button>
                </td>
                {BOOKING_RECORD_COLUMNS.map((col, colIndex) => {
                  const prev = BOOKING_RECORD_COLUMNS[colIndex - 1];
                  const isSectionStart = !prev || prev.section !== col.section;
                  const value = bookingRecordCellValue(record, col.key);
                  const isEmpty = value === '—' || value === '';
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        BOOKING_TABLE_TD_WRAP,
                        isSectionStart && 'border-l border-amber-100',
                        rowIndex % 2 === 1 && BOOKING_TABLE_ROW_ALT,
                        isEmpty && 'text-center text-slate-400',
                      )}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Props = {
  records: AddPassengerSearchRecord[];
  onReport: (record: AddPassengerSearchRecord, index: number) => void;
};

export function BookingReportResultTables({ records, onReport }: Props) {
  const action: RowActionConfig = {
    headerLabel: 'Report',
    buttonLabel: 'Report',
    icon: FileText,
    onAction: onReport,
  };

  if (records.length === 0) return null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className={cn(BOOKING_RESULT_ACTION_BAR, 'lg:hidden')}>
        <p className="text-sm font-semibold text-slate-900">
          {records.length} record{records.length === 1 ? '' : 's'} found
        </p>
      </div>

      <div className="space-y-4 lg:hidden">
        {records.map((record, index) => (
          <MobileRecordCard key={`${record.challan.challanNo}-${index}`} record={record} index={index} action={action} />
        ))}
      </div>

      <div className="hidden lg:block">
        <DesktopWideTable records={records} action={action} />
      </div>
    </div>
  );
}
