'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { AdminRadioDropdown } from '@/components/ui/admin-radio-dropdown';
import { FormFieldError } from '@/components/ui/FormFieldError';
import {
  DATE_BASIS_OPTIONS,
  validateInvoicingFilterFields,
  type InvoicingDateBasis,
  type InvoicingFilterField,
  type InvoicingFilterState,
} from '@/components/fris/advance/invoicing/invoicing-filter.types';
import { FRIS_INVALID_CONTROL } from '@/lib/form-validation';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import { cn } from '@/lib/utils';

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-700 sm:text-sm';
const DROPDOWN_CLASS =
  'box-border h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const INVALID_PICKER_WRAP =
  '[&_button]:!border-red-500 [&_button]:!ring-2 [&_button]:!ring-red-200';

const FIELD_ORDER: readonly InvoicingFilterField[] = ['fromDate', 'toDate', 'dateBasis'];

type Props = {
  filter: InvoicingFilterState;
  onChange: (next: InvoicingFilterState) => void;
  onFindInvoice: () => void;
  onExportExcel: () => void;
  searching?: boolean;
  radioName?: string;
};

export default function InvoicingFilterBar({
  filter,
  onChange,
  onFindInvoice,
  onExportExcel,
  searching = false,
  radioName = 'invoicing-data-mode',
}: Props) {
  const { errors, clearField, applyAndFocus } = useFieldErrors<InvoicingFilterField>(FIELD_ORDER);

  const patch = (partial: Partial<InvoicingFilterState>) =>
    onChange({ ...filter, ...partial });

  const runValidated = (action: () => void) => {
    const next = validateInvoicingFilterFields(filter);
    if (applyAndFocus(next)) return;
    action();
  };

  return (
    <section className="shrink-0 overflow-visible rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="p-4 lg:p-5">
        <div className="flex w-full flex-col gap-4 xl:flex-row xl:items-end xl:gap-4">
          <fieldset className="m-0 min-w-0 shrink-0 border-0 p-0 xl:border-r xl:border-gray-100 xl:pr-4">
            <legend className="sr-only">Data type</legend>
            {/* Match labeled field height so radios sit on the control row (desktop only) */}
            <span className={cn(LABEL_CLASS, 'invisible hidden select-none xl:block')} aria-hidden>
              &nbsp;
            </span>
            <div className="flex min-h-10 flex-col justify-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={radioName}
                  checked={filter.dataMode === 'flight-report'}
                  onChange={() => patch({ dataMode: 'flight-report' })}
                  className="size-4 shrink-0 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-medium leading-tight text-gray-800 sm:text-sm">
                  Flight Report Data
                </span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={radioName}
                  checked={filter.dataMode === 'equipment-manpower'}
                  onChange={() => patch({ dataMode: 'equipment-manpower' })}
                  className="size-4 shrink-0 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-medium leading-tight text-gray-800 sm:text-sm">
                  Equipment/Manpower Data
                </span>
              </label>
            </div>
          </fieldset>

          <div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-3 sm:grid-cols-3 sm:gap-3 xl:gap-4">
            <div className={cn('min-w-0', errors.fromDate && INVALID_PICKER_WRAP)}>
              <label htmlFor="field-fromDate" className={LABEL_CLASS}>
                From
              </label>
              <DatePicker
                id="field-fromDate"
                value={filter.fromDate}
                onChange={(fromDate) => {
                  patch({ fromDate });
                  clearField('fromDate');
                }}
                valueFormat="yyyy-MM-dd"
                placeholder="From"
                className="h-10 w-full text-sm"
                ariaLabel="From date"
              />
              <FormFieldError id="field-fromDate-error" message={errors.fromDate} />
            </div>
            <div className={cn('min-w-0', errors.toDate && INVALID_PICKER_WRAP)}>
              <label htmlFor="field-toDate" className={LABEL_CLASS}>
                To
              </label>
              <DatePicker
                id="field-toDate"
                value={filter.toDate}
                onChange={(toDate) => {
                  patch({ toDate });
                  clearField('toDate');
                }}
                valueFormat="yyyy-MM-dd"
                placeholder="To"
                className="h-10 w-full text-sm"
                ariaLabel="To date"
              />
              <FormFieldError id="field-toDate-error" message={errors.toDate} />
            </div>
            <div className="relative z-10 min-w-0">
              <label htmlFor="field-dateBasis" className={LABEL_CLASS}>
                Date basis
              </label>
              <AdminRadioDropdown
                id="field-dateBasis"
                value={filter.dateBasis}
                onChange={(v) => {
                  patch({ dateBasis: v as InvoicingDateBasis });
                  clearField('dateBasis');
                }}
                options={DATE_BASIS_OPTIONS}
                aria-invalid={!!errors.dateBasis}
                aria-describedby={errors.dateBasis ? 'field-dateBasis-error' : undefined}
                className={cn(DROPDOWN_CLASS, errors.dateBasis && FRIS_INVALID_CONTROL)}
              />
              <FormFieldError id="field-dateBasis-error" message={errors.dateBasis} />
            </div>
          </div>

          <div className="relative z-20 shrink-0 xl:pl-1">
            {/* Match labeled field height so actions sit on the control row (desktop only) */}
            <span className={cn(LABEL_CLASS, 'invisible hidden select-none xl:block')} aria-hidden>
              &nbsp;
            </span>
            <div className="flex h-10 flex-nowrap items-center gap-2">
              <motion.button
                type="button"
                onClick={() => runValidated(onFindInvoice)}
                disabled={searching}
                aria-busy={searching}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-4 text-sm font-medium text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 disabled:opacity-60"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {searching ? 'Finding…' : 'Find Invoice'}
              </motion.button>
              <motion.button
                type="button"
                onClick={() => runValidated(onExportExcel)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                Export Excel
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
