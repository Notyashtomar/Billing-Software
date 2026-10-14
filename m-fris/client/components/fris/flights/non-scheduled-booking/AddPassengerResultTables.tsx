'use client';

import { ChevronRight, Trash2, UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AddPassengerSearchRecord } from './add-passenger-record';
import {
  BOOKING_BTN_PRIMARY,
  BOOKING_PASSENGER_CARD,
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
  BOOKING_TABLE_TH,
  BOOKING_TABLE_TD_WRAP,
  BOOKING_TABLE_TH_WRAP,
  BOOKING_TABLE_WRAP,
} from './bookingPageLayout';

type PassengerRow = { id: string; name: string };

type Column = {
  key: string;
  label: string;
  wide?: boolean;
  section: 'challan' | 'booking' | 'flight' | 'advance';
};

const ALL_COLUMNS: Column[] = [
  { key: 'challanNo', label: 'Performa No', wide: true, section: 'challan' },
  { key: 'fhrNo', label: 'FHR No', section: 'challan' },
  { key: 'challanDate', label: 'Performa Date', section: 'challan' },
  { key: 'bayNo', label: 'Bay No', section: 'challan' },
  { key: 'noOfPax', label: 'No Of Pax', section: 'challan' },
  { key: 'noOfFerryIssued', label: 'No Of Ferry Issued', wide: true, section: 'challan' },
  { key: 'ghRepresentative', label: 'GH Representative', wide: true, section: 'challan' },
  { key: 'airlineRepresentative', label: 'Airline Representative', wide: true, section: 'challan' },
  { key: 'remarks', label: 'Remarks', wide: true, section: 'challan' },
  { key: 'bookingNo', label: 'Booking No', wide: true, section: 'booking' },
  { key: 'bookingDate', label: 'Booking Date', section: 'booking' },
  { key: 'booking', label: 'Booking', section: 'booking' },
  { key: 'mailReceivedFrom', label: 'Mail Received From', wide: true, section: 'booking' },
  { key: 'mailReceivedBy', label: 'Mail Received By', wide: true, section: 'booking' },
  { key: 'mailSubject', label: 'Mail Subject', wide: true, section: 'booking' },
  { key: 'service', label: 'Service', wide: true, section: 'booking' },
  { key: 'operator', label: 'Operator', wide: true, section: 'booking' },
  { key: 'airlineBillTo', label: 'Airline (B To)', wide: true, section: 'booking' },
  { key: 'airlineCode', label: 'Airline Code', section: 'flight' },
  { key: 'flightNo', label: 'Flight No', section: 'flight' },
  { key: 'registrationNo', label: 'Registration No', section: 'flight' },
  { key: 'routing', label: 'Routing', section: 'flight' },
  { key: 'staDate', label: 'STA Date', section: 'flight' },
  { key: 'staTime', label: 'STA Time', section: 'flight' },
  { key: 'stdDate', label: 'STD Date', section: 'flight' },
  { key: 'stdTime', label: 'STD Time', section: 'flight' },
  { key: 'aircraftType', label: 'Aircraft Type', wide: true, section: 'flight' },
  { key: 'aircraftBody', label: 'Aircraft Body', section: 'flight' },
  { key: 'mtow', label: 'MTOW', section: 'flight' },
  { key: 'terminalCode', label: 'Terminal Code', section: 'flight' },
  { key: 'opsType', label: 'Ops Type', section: 'flight' },
  { key: 'categoryOfFlight', label: 'Category of Flight', section: 'flight' },
  { key: 'flightType', label: 'Flight Type', section: 'flight' },
  { key: 'advance', label: 'Advance', section: 'advance' },
  { key: 'amount', label: 'Amount', section: 'advance' },
];

const SECTION_GROUPS: {
  label: string;
  section: Column['section'];
}[] = [
  { label: 'Performa Detail', section: 'challan' },
  { label: 'Booking Detail', section: 'booking' },
  { label: 'Flight', section: 'flight' },
  { label: 'Advance', section: 'advance' },
];

function columnsForSection(section: Column['section']) {
  return ALL_COLUMNS.filter((col) => col.section === section);
}

function cellValue(
  record: AddPassengerSearchRecord,
  paxCount: number,
  key: string,
): string | number {
  if (key === 'noOfPax') return paxCount;
  if (key in record.challan) {
    return record.challan[key as keyof typeof record.challan] ?? '—';
  }
  if (key in record.booking) {
    return record.booking[key as keyof typeof record.booking] ?? '—';
  }
  if (key in record.flight) {
    return record.flight[key as keyof typeof record.flight] ?? '—';
  }
  if (key in record.advance) {
    return record.advance[key as keyof typeof record.advance] ?? '—';
  }
  return '—';
}

function ResultActionBar({
  record,
  paxCount,
  onAddPassenger,
  className,
}: {
  record: AddPassengerSearchRecord;
  paxCount: number;
  onAddPassenger: () => void;
  className?: string;
}) {
  return (
    <div className={cn(BOOKING_RESULT_ACTION_BAR, className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-slate-900">Record found</p>
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
            <span
              className={cn(
                BOOKING_RESULT_BADGE,
                'border-amber-300 bg-amber-100 font-semibold text-amber-900',
              )}
            >
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              No Of Pax: {paxCount}
            </span>
          </div>
        </div>
        <button type="button" onClick={onAddPassenger} className={BOOKING_BTN_PRIMARY}>
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          Add Passenger
        </button>
      </div>
    </div>
  );
}

function SectionFieldCard({
  label,
  columns,
  record,
  paxCount,
}: {
  label: string;
  columns: Column[];
  record: AddPassengerSearchRecord;
  paxCount: number;
}) {
  return (
    <section className={BOOKING_RESULT_SECTION_CARD}>
      <h4 className={BOOKING_RESULT_SECTION_HEADER}>{label}</h4>
      <dl className={BOOKING_RESULT_FIELD_GRID}>
        {columns.map((col) => {
          const value = cellValue(record, paxCount, col.key);
          const isEmpty = value === '—' || value === '';
          return (
          <div key={col.key} className={cn('min-w-0', col.wide && 'sm:col-span-2')}>
            <dt className={BOOKING_RESULT_FIELD_LABEL}>{col.label}</dt>
            <dd
              className={cn(
                BOOKING_RESULT_FIELD_VALUE,
                col.key === 'noOfPax' && 'font-bold text-amber-800',
                isEmpty && 'text-slate-400',
              )}
            >
              {value}
            </dd>
          </div>
          );
        })}
      </dl>
    </section>
  );
}

function PassengerList({
  passengers,
  onRemovePassenger,
  variant,
}: {
  passengers: PassengerRow[];
  onRemovePassenger: (id: string) => void;
  variant: 'card' | 'table';
}) {
  if (passengers.length === 0) return null;

  if (variant === 'card') {
    return (
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-800">
          Passengers added ({passengers.length})
        </h4>
        <ul className="space-y-2">
          {passengers.map((passenger, index) => (
            <li key={passenger.id}>
              <div className={BOOKING_PASSENGER_CARD}>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">
                  {passenger.name}
                </p>
                <button
                  type="button"
                  onClick={() => onRemovePassenger(passenger.id)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97] sm:h-10 sm:w-10"
                  aria-label={`Remove ${passenger.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className={BOOKING_TABLE_WRAP}>
      <table className={cn(BOOKING_TABLE, 'min-w-[24rem]')}>
        <caption className="sr-only">Passengers added to this performa</caption>
        <thead className={BOOKING_TABLE_HEAD}>
          <tr>
            <th className={cn(BOOKING_TABLE_HEAD_COL, 'w-16')} scope="col">
              S.No
            </th>
            <th className={BOOKING_TABLE_HEAD_COL} scope="col">
              Passenger Name
            </th>
            <th className={cn(BOOKING_TABLE_HEAD_COL, 'w-24')} scope="col">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {passengers.map((passenger, index) => (
            <tr
              key={passenger.id}
              className={index % 2 === 0 ? BOOKING_TABLE_ROW_ALT : undefined}
            >
              <td className={BOOKING_TABLE_TD}>{index + 1}</td>
              <td className={cn(BOOKING_TABLE_TD, 'font-medium text-slate-900')}>
                {passenger.name}
              </td>
              <td className={BOOKING_TABLE_TD}>
                <button
                  type="button"
                  onClick={() => onRemovePassenger(passenger.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-[0.97]"
                  aria-label={`Remove ${passenger.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DesktopWideTable({
  record,
  paxCount,
  onAddPassenger,
}: {
  record: AddPassengerSearchRecord;
  paxCount: number;
  onAddPassenger: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        Scroll horizontally to view all columns
      </p>
      <div
        className={BOOKING_TABLE_SCROLL_REGION}
        tabIndex={0}
        role="region"
        aria-label="Performa, booking, and flight details"
      >
        <table className={cn(BOOKING_TABLE, 'min-w-max')}>
          <caption className="sr-only">
            Performa, booking, flight, and advance details for selected record
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
                Add Passenger
              </th>
              {SECTION_GROUPS.map((group) => {
                const span = columnsForSection(group.section).length;
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
              {ALL_COLUMNS.map((col, index) => {
                const prev = ALL_COLUMNS[index - 1];
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
            <tr>
              <td
                className={cn(
                  BOOKING_TABLE_TD,
                  'sticky left-0 z-10 min-w-[8.5rem] border-r border-amber-200/80 bg-white',
                )}
              >
                <button
                  type="button"
                  onClick={onAddPassenger}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-[0.98]"
                >
                  <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden xl:inline">Add Passenger</span>
                  <span className="xl:hidden">Add</span>
                </button>
              </td>
              {ALL_COLUMNS.map((col, index) => {
                const prev = ALL_COLUMNS[index - 1];
                const isSectionStart = !prev || prev.section !== col.section;
                const value = cellValue(record, paxCount, col.key);
                const isEmpty = value === '—' || value === '';
                return (
                  <td
                    key={col.key}
                    className={cn(
                      BOOKING_TABLE_TD_WRAP,
                      col.key === 'noOfPax' && 'font-semibold text-amber-800',
                      isSectionStart && 'border-l border-amber-100',
                      isEmpty && 'text-center text-slate-400',
                    )}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Props = {
  record: AddPassengerSearchRecord;
  paxCount: number;
  passengers: PassengerRow[];
  onAddPassenger: () => void;
  onRemovePassenger: (id: string) => void;
};

export function AddPassengerResultTables({
  record,
  paxCount,
  passengers,
  onAddPassenger,
  onRemovePassenger,
}: Props) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <ResultActionBar
        record={record}
        paxCount={paxCount}
        onAddPassenger={onAddPassenger}
        className="lg:hidden"
      />

      {/* Mobile + tablet: section cards */}
      <div className="space-y-3 sm:space-y-4 lg:hidden">
        {SECTION_GROUPS.map((group) => (
          <SectionFieldCard
            key={group.section}
            label={group.label}
            columns={columnsForSection(group.section)}
            record={record}
            paxCount={paxCount}
          />
        ))}
        <PassengerList
          passengers={passengers}
          onRemovePassenger={onRemovePassenger}
          variant="card"
        />
      </div>

      {/* Desktop: single wide table */}
      <div className="hidden space-y-4 lg:block">
        <DesktopWideTable
          record={record}
          paxCount={paxCount}
          onAddPassenger={onAddPassenger}
        />
        <PassengerList
          passengers={passengers}
          onRemovePassenger={onRemovePassenger}
          variant="table"
        />
      </div>
    </div>
  );
}
