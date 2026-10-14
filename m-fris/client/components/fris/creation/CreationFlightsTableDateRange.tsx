'use client';

import React from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  clampTableDateRange,
  parseDisplayDate,
} from '@/components/fris/creation/creationTableDateRange';

type CreationFlightsTableDateRangeProps = {
  title: string;
  fromDate: string;
  toDate: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  subtitle?: string;
};

export function CreationFlightsTableDateRange({
  title,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  subtitle,
}: CreationFlightsTableDateRangeProps) {
  const handleFromChange = (value: string) => {
    const next = clampTableDateRange(value, toDate);
    onFromDateChange(next.fromDate);
    if (next.toDate !== toDate) onToDateChange(next.toDate);
  };

  const handleToChange = (value: string) => {
    const next = clampTableDateRange(fromDate, value);
    onFromDateChange(next.fromDate);
    onToDateChange(next.toDate);
  };

  const fromMinDate = parseDisplayDate(fromDate) ?? undefined;

  return (
    <div className="border-b border-slate-100 px-5 py-3.5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              Filter saved flights by STA/STD date range.
            </p>
          )}
        </div>
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">From date</label>
            <DatePicker value={fromDate} onChange={handleFromChange} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">To date</label>
            <DatePicker
              value={toDate}
              onChange={handleToChange}
              minDate={fromMinDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
