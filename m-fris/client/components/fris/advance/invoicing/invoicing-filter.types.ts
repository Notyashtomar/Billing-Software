import {
  dateRange,
  required,
  runValidators,
  selectRequired,
  validDate,
  type FieldErrors,
} from '@/lib/form-validation';

export type InvoicingDataMode = 'flight-report' | 'equipment-manpower';

export type InvoicingDateBasis = 'atd-date' | 'exported-date';

export type InvoicingFilterField = 'fromDate' | 'toDate' | 'dateBasis';

export type InvoicingFilterState = {
  dataMode: InvoicingDataMode;
  fromDate: string;
  toDate: string;
  dateBasis: InvoicingDateBasis;
};

export const DATE_BASIS_OPTIONS: { value: InvoicingDateBasis; label: string }[] = [
  { value: 'atd-date', label: 'ATD Date' },
  { value: 'exported-date', label: 'Exported Date' },
];

export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function firstOfMonthYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function createDefaultInvoicingFilter(): InvoicingFilterState {
  return {
    dataMode: 'flight-report',
    fromDate: firstOfMonthYmd(),
    toDate: todayYmd(),
    dateBasis: 'atd-date',
  };
}

export function validateInvoicingFilterFields(
  filter: InvoicingFilterState,
): FieldErrors<InvoicingFilterField> {
  const errors: FieldErrors<InvoicingFilterField> = {};

  const fromErr = runValidators(
    required(filter.fromDate, 'From date'),
    validDate(filter.fromDate, 'From date'),
  );
  if (fromErr) errors.fromDate = fromErr;

  const toErr = runValidators(
    required(filter.toDate, 'To date'),
    validDate(filter.toDate, 'To date'),
  );
  if (toErr) errors.toDate = toErr;

  if (!errors.fromDate && !errors.toDate) {
    const rangeErr = dateRange(filter.fromDate, filter.toDate, 'From date', 'To date');
    if (rangeErr) errors.toDate = rangeErr;
  }

  const basisErr = selectRequired(filter.dateBasis, 'date basis');
  if (basisErr) {
    errors.dateBasis = basisErr;
  } else if (filter.dateBasis !== 'atd-date' && filter.dateBasis !== 'exported-date') {
    errors.dateBasis = 'Select a date basis.';
  }

  return errors;
}

/** Backward-compatible single-message validation. */
export function validateInvoicingFilter(filter: InvoicingFilterState): string | null {
  const errors = validateInvoicingFilterFields(filter);
  return errors.fromDate ?? errors.toDate ?? errors.dateBasis ?? null;
}

export function dataModeLabel(mode: InvoicingDataMode): string {
  return mode === 'flight-report' ? 'Flight Report Data' : 'Equipment/Manpower Data';
}

export function dateBasisLabel(basis: InvoicingDateBasis): string {
  return DATE_BASIS_OPTIONS.find((o) => o.value === basis)?.label ?? basis;
}
