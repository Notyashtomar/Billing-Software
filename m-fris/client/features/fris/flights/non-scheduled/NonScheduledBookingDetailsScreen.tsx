'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Ban,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plane,
  Search,
  SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchNsRawFormData } from '@/lib/api';
import type { FrisSectionNavItem } from '@/lib/fris-responsive-nav';
import { cn } from '@/lib/utils';
import { FormFieldError } from '@/components/ui/FormFieldError';
import { FLIGHT_FILTER_ACTIONS_PB } from '@/components/fris/flights/flightFilterBarLayout';
import { useFieldErrors } from '@/lib/form-validation/useFieldErrors';
import {
  FRIS_INVALID_CONTROL,
  required,
  type FieldErrors,
} from '@/lib/form-validation';
import { NonScheduledAmberWorkspace } from '@/components/fris/flights/non-scheduled-booking/NonScheduledAmberWorkspace';
import {
  BOOKING_CONTROL,
  BOOKING_DETAILS_GROUP,
  BOOKING_FORM_CARD,
  BOOKING_FORM_HEADER,
  BOOKING_GET_BTN,
  BOOKING_LABEL,
  BOOKING_PAGE_SHELL,
  BOOKING_SEARCH_CARD,
} from '@/components/fris/flights/non-scheduled-booking/bookingPageLayout';
import {
  matchesNonScheduledBookingSection,
  nonScheduledBookingHasData,
  nsMainDetailsToBookingFlightDetails,
  type NonScheduledBookingFlightDetails,
  type NonScheduledBookingSectionId,
} from '@/components/fris/flights/non-scheduled-airlines/non-scheduled-booking-details-helpers';
import type { BookingFlightDetails } from '@/components/fris/others/booking-details-helpers';

const BOOKING_DETAILS_BASE_PATH =
  '/fris/flights/non-scheduled-airlines/booking-details';

const SECTION_IDS = new Set<NonScheduledBookingSectionId>([
  'pending',
  'verified',
  'cancelled',
]);

const SIDEBAR_ITEMS: FrisSectionNavItem<NonScheduledBookingSectionId>[] = [
  {
    id: 'pending',
    label: 'Pending Booking',
    icon: Clock3,
    description: 'Awaiting verification',
  },
  {
    id: 'verified',
    label: 'Verified Booking',
    icon: CheckCircle2,
    description: 'Confirmed bookings',
  },
  {
    id: 'cancelled',
    label: 'Cancelled Booking',
    icon: Ban,
    description: 'Cancelled movements',
  },
];

const SECTION_STATUS: Record<
  NonScheduledBookingSectionId,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: 'Pending',
    badgeClass: 'bg-amber-100 text-amber-900 ring-amber-200',
  },
  verified: {
    label: 'Verified',
    badgeClass: 'bg-amber-500 text-white ring-amber-400',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-slate-700 text-white ring-slate-500',
  },
};

const FIELD_LABELS: Record<keyof BookingFlightDetails, string> = {
  bookingNo: 'Booking No.',
  serialNo: 'Serial No.',
  airline: 'Airline',
  flightNo: 'Flight No.',
  registration: 'Registration',
  route: 'Route',
  aircraftType: 'Aircraft Type',
  staDate: 'STA Date',
  staTime: 'STA Time',
  stdDate: 'STD Date',
  stdTime: 'STD Time',
  ataDate: 'ATA Date',
  ataTime: 'ATA Time',
  atdDate: 'ATD Date',
  atdTime: 'ATD Time',
};

const FIELD_GROUPS: { title: string; keys: (keyof BookingFlightDetails)[] }[] = [
  {
    title: 'Booking',
    keys: ['bookingNo', 'serialNo'],
  },
  {
    title: 'Flight',
    keys: ['airline', 'flightNo', 'registration', 'route', 'aircraftType'],
  },
  {
    title: 'Times',
    keys: [
      'staDate',
      'staTime',
      'stdDate',
      'stdTime',
      'ataDate',
      'ataTime',
      'atdDate',
      'atdTime',
    ],
  },
];

const BOOKING_FIELD_ORDER = ['bookingNo'] as const;
type BookingField = (typeof BOOKING_FIELD_ORDER)[number];

function BookingDetailsPanel({ section }: { section: NonScheduledBookingSectionId }) {
  const status = SECTION_STATUS[section];
  const [bookingNo, setBookingNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [details, setDetails] = useState<NonScheduledBookingFlightDetails | null>(null);
  const [sectionMismatch, setSectionMismatch] = useState(false);
  const { errors, clearField, applyAndFocus } = useFieldErrors<BookingField>(BOOKING_FIELD_ORDER);

  useEffect(() => {
    setBookingNo('');
    setSearched(false);
    setDetails(null);
    setSectionMismatch(false);
    clearField('bookingNo');
  }, [section, clearField]);

  const handleGet = useCallback(async () => {
    const next: FieldErrors<BookingField> = {};
    const reqErr = required(bookingNo, 'Booking / serial number');
    if (reqErr) next.bookingNo = reqErr;
    if (applyAndFocus(next)) {
      toast.warning('Please fix the highlighted fields.');
      return;
    }
    const trimmed = bookingNo.trim();

    setLoading(true);
    setSearched(false);
    setDetails(null);
    setSectionMismatch(false);

    try {
      const raw = await fetchNsRawFormData('main-details', trimmed);
      if (!raw || typeof raw !== 'object') {
        toast.error('No booking found for this number.');
        setSearched(true);
        return;
      }

      const mapped = nsMainDetailsToBookingFlightDetails(
        raw as Record<string, unknown>,
        trimmed,
      );

      if (!nonScheduledBookingHasData(mapped)) {
        toast.error('Booking found but flight details are empty.');
        setSearched(true);
        return;
      }

      if (!matchesNonScheduledBookingSection(section, mapped)) {
        setSectionMismatch(true);
        setDetails(mapped);
        setSearched(true);
        toast.warning(`This record is not listed as ${status.label.toLowerCase()}.`);
        return;
      }

      setDetails(mapped);
      setSearched(true);
      toast.success('Flight details loaded.');
    } catch {
      toast.error('Could not load booking details. Try again.');
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [applyAndFocus, bookingNo, section, status.label]);

  return (
    <div className="space-y-5">
      <div className={BOOKING_SEARCH_CARD}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            Search by booking or serial number to view flight details.
          </p>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
              status.badgeClass,
            )}
          >
            {status.label}
          </span>
        </div>

        <label htmlFor="field-bookingNo" className={BOOKING_LABEL}>
          Booking / Serial No.
        </label>
        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <input
              id="field-bookingNo"
              type="text"
              value={bookingNo}
              onChange={(e) => {
                setBookingNo(e.target.value);
                clearField('bookingNo');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleGet();
              }}
              autoComplete="off"
              placeholder="e.g. 1001 or booking reference"
              aria-invalid={!!errors.bookingNo}
              aria-describedby={errors.bookingNo ? 'field-bookingNo-error' : undefined}
              className={cn(BOOKING_CONTROL, 'w-full', errors.bookingNo && FRIS_INVALID_CONTROL)}
            />
            <FormFieldError id="field-bookingNo-error" message={errors.bookingNo} />
          </div>
          <div className={cn('w-full shrink-0 sm:w-auto', FLIGHT_FILTER_ACTIONS_PB)}>
            <motion.button
              type="button"
              disabled={loading}
              whileTap={loading ? undefined : { scale: 0.98 }}
              onClick={() => void handleGet()}
              className={cn(BOOKING_GET_BTN, 'w-full sm:w-auto')}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4 shrink-0" aria-hidden />
              )}
              Get details
            </motion.button>
          </div>
        </div>
      </div>

      {searched ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={BOOKING_FORM_CARD}
        >
          <div className={cn(BOOKING_FORM_HEADER, 'flex items-center gap-2')}>
            <Plane className="h-4 w-4 shrink-0 text-white/90" aria-hidden />
            <h3 className="text-sm font-semibold text-white sm:text-base">Flight details</h3>
          </div>

          {sectionMismatch ? (
            <div
              className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5"
              role="status"
            >
              <SearchX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                A record was found, but it is not in the{' '}
                <strong className="font-semibold">{status.label.toLowerCase()}</strong> list.
              </span>
            </div>
          ) : null}

          {!details ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center sm:px-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 ring-1 ring-amber-100">
                <SearchX className="h-6 w-6" aria-hidden />
              </span>
              <p className="text-sm font-medium text-slate-700">No matching record</p>
              <p className="max-w-sm text-xs text-slate-500">
                Check the number and try again, or switch category if the booking status differs.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              {FIELD_GROUPS.map((group) => (
                <section key={group.title} className={BOOKING_DETAILS_GROUP}>
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-800/80">
                    {group.title}
                  </h4>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.keys.map((key) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {FIELD_LABELS[key]}
                        </dt>
                        <dd className="mt-0.5 text-sm font-medium text-slate-900">
                          {details[key] || '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}

function NonScheduledBookingDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSection, setSelectedSection] =
    useState<NonScheduledBookingSectionId>('pending');

  const activeSection = useMemo(() => {
    const param = searchParams.get('section');
    if (param === 'cancel') return 'cancelled' as NonScheduledBookingSectionId;
    if (param && SECTION_IDS.has(param as NonScheduledBookingSectionId)) {
      return param as NonScheduledBookingSectionId;
    }
    return selectedSection;
  }, [searchParams, selectedSection]);

  useEffect(() => {
    const param = searchParams.get('section');
    const normalized =
      param === 'cancel' ? 'cancelled' : (param as NonScheduledBookingSectionId | null);
    if (normalized && SECTION_IDS.has(normalized)) {
      setSelectedSection(normalized);
    }
  }, [searchParams]);

  const handleSectionSelect = useCallback(
    (id: NonScheduledBookingSectionId) => {
      setSelectedSection(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', id);
      router.replace(`${BOOKING_DETAILS_BASE_PATH}?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeItem = SIDEBAR_ITEMS.find((item) => item.id === activeSection);

  return (
    <NonScheduledAmberWorkspace
      pageTitle="Booking Details"
      pageIcon={FileText}
      pageSubtitle="Non-scheduled · look up by status"
      sections={SIDEBAR_ITEMS}
      activeId={activeSection}
      onSelect={handleSectionSelect}
      menuId="non-scheduled-booking-details-section-menu"
      ariaLabel="Non-scheduled booking detail sections"
      activeSectionLabel={activeItem?.label ?? 'Pending Booking'}
      contentClassName="p-4 sm:p-5"
    >
      <BookingDetailsPanel section={activeSection} />
    </NonScheduledAmberWorkspace>
  );
}

export function NonScheduledBookingDetailsContent() {
  return (
    <Suspense fallback={<div className={BOOKING_PAGE_SHELL} />}>
      <NonScheduledBookingDetailsPageContent />
    </Suspense>
  );
}
