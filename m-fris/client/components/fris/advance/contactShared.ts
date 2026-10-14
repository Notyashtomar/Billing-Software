/** Shared Advance → Airline Contact constants and helpers. */

import { useEffect, useState } from 'react';

export type ContactRow = {
  id: string;
  email: string;
  contact: string;
  airline: string;
  airlineRepresentative: string;
  mobileNo: string;
  companyName: string;
  signatureUrl: string;
};

export type ContactFormValues = {
  email: string;
  contact: string;
  airline: string;
  airlineRepresentative: string;
  mobileNo: string;
  companyName: string;
  signatureUrl: string;
};

export const EMPTY_CONTACT_FORM: ContactFormValues = {
  email: '',
  contact: '',
  airline: '',
  airlineRepresentative: '',
  mobileNo: '',
  companyName: '',
  signatureUrl: '',
};

/** Categorized contact types for the searchable Contact dropdown. */
export const CONTACT_OPTION_GROUPS = [
  {
    group: 'Shift Reports',
    options: [
      'Ramp Shift Report',
      'GSD Shift Report',
      'Advance PX Shift Report',
      'Shift Pax',
      'FM Report',
    ],
  },
  {
    group: 'Email Notifications',
    options: [
      'Aircraft Creation Email',
      'Aircraft Creation Notification',
      'Invoice Pending Notification',
      'Training Email Notification',
      'AEP Expiry Email',
      'GEMM Rectify Email',
      'OMDA Email Notification',
      'GSE Transfer Verification',
      'GSE Acceptable Notification',
    ],
  },
  {
    group: 'Operational Logs',
    options: [
      'Negative Remarks',
      'Accountable Delays',
      'RAF',
      'Non-SKD',
      'Work Clock',
      'DO Modified Log',
      'BA Test Random Selection',
      'Do Money API Error',
    ],
  },
  {
    group: 'Financial / Rent',
    options: ['Space Rent'],
  },
] as const;

/** Flat list for AdminRadioDropdown (group shown as description). */
export const CONTACT_DROPDOWN_OPTIONS = CONTACT_OPTION_GROUPS.flatMap((group) =>
  group.options.map((opt) => ({
    value: opt,
    label: opt,
    description: group.group,
  })),
);

/** Flat string list (legacy / export / filter). */
export const CONTACT_OPTIONS = CONTACT_DROPDOWN_OPTIONS.map((o) => o.value);

/** Emil-style press feedback for toolbar / table actions. */
export const CONTACT_BTN_TRANSITION =
  'transition-[transform,opacity] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]';

export const CONTACT_PRIMARY_BTN = `inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-medium text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-600 disabled:opacity-60 ${CONTACT_BTN_TRANSITION}`;

export const CONTACT_SECONDARY_BTN = `inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 ${CONTACT_BTN_TRANSITION}`;

export const CONTACT_GHOST_BTN = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-60 ${CONTACT_BTN_TRANSITION}`;

export const CONTACT_DANGER_GHOST_BTN = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 ${CONTACT_BTN_TRANSITION}`;

export function normalizeContactEmail(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

export function normalizeRepresentativeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function matchesContactFilter(
  row: Pick<
    ContactRow,
    'email' | 'contact' | 'airline' | 'airlineRepresentative' | 'mobileNo' | 'companyName'
  >,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.email.toLowerCase().includes(q) ||
    row.contact.toLowerCase().includes(q) ||
    row.airline.toLowerCase().includes(q) ||
    row.airlineRepresentative.toLowerCase().includes(q) ||
    row.mobileNo.toLowerCase().includes(q) ||
    row.companyName.toLowerCase().includes(q)
  );
}

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
