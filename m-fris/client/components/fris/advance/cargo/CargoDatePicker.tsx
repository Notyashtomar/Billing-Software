'use client';

import { DatePicker, type DatePickerProps } from '@/components/ui/DatePicker';

/** Cargo / Advance date fields — month and year dropdowns like admin user forms. */
export function CargoDatePicker(props: DatePickerProps) {
  return <DatePicker showYearMonthSelect className="w-full" {...props} />;
}
