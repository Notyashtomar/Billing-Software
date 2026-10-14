'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plane,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchFhrCollectionFlightLean } from '@/lib/api';
import { FrisPageHeader } from '@/components/fris/layout/FrisPageHeader';
import { cn } from '@/lib/utils';
import {
  bookingDetailsHasData,
  fhrDocToBookingFlightDetails,
  type BookingFlightDetails,
  type BookingSectionId,
} from '@/components/fris/others/booking-details-helpers';

const BOOKING_DETAILS_BASE_PATH =
  '/fris/flights/non-scheduled-airlines/booking-details';

const SECTION_IDS = new Set<BookingSectionId>(['pending', 'verified', 'cancel']);

const SIDEBAR_ITEMS: {
  id: BookingSectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'pending',
    label: 'Pending Booking',
    description: 'Look up bookings awaiting verification',
    icon: Clock3,
  },
  {
    id: 'verified',
    label: 'Verified Booking',
    description: 'Look up confirmed bookings',
    icon: CheckCircle2,
  },
  {
    id: 'cancel',
    label: 'Cancel Booking',
    description: 'Look up cancelled bookings',
    icon: Ban,
  },
];

const SECTION_META: Record<
  BookingSectionId,
  { title: string; subtitle: string; statusLabel: string; badgeClass: string }
> = {
  pending: {
    title: 'Pending booking',
    subtitle: 'Enter a booking number to view flight details for pending bookings.',
    statusLabel: 'Pending',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  verified: {
    title: 'Verified booking',
    subtitle: 'Enter a booking number to view flight details for verified bookings.',
    statusLabel: 'Verified',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  cancel: {
    title: 'Cancel booking',
    subtitle: 'Enter a booking number to view flight details for cancelled bookings.',
    statusLabel: 'Cancelled',
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

const FLIGHT_DETAIL_FIELDS: { key: keyof BookingFlightDetails; label: string }[] = [
  { key: 'bookingNo', label: 'Booking No.' },
  { key: 'serialNo', label: 'Serial No.' },
  { key: 'airline', label: 'Airline' },
  { key: 'flightNo', label: 'Flight No.' },
  { key: 'registration', label: 'Registration' },
  { key: 'route', label: 'Route' },
  { key: 'aircraftType', label: 'Aircraft Type' },
  { key: 'staDate', label: 'STA Date' },
  { key: 'staTime', label: 'STA Time' },
  { key: 'stdDate', label: 'STD Date' },
  { key: 'stdTime', label: 'STD Time' },
  { key: 'ataDate', label: 'ATA Date' },
  { key: 'ataTime', label: 'ATA Time' },
  { key: 'atdDate', label: 'ATD Date' },
  { key: 'atdTime', label: 'ATD Time' },
];

const textInputClass =
  'h-11 w-full max-w-md rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function BookingDetailsPanel({ section }: { section: BookingSectionId }) {
  const meta = SECTION_META[section];
  const [bookingNo, setBookingNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [details, setDetails] = useState<BookingFlightDetails | null>(null);

  useEffect(() => {
    setBookingNo('');
    setSearched(false);
    setDetails(null);
  }, [section]);

  const handleGet = useCallback(async () => {
    const trimmed = bookingNo.trim();
    if (!trimmed) {
      toast.warning('Please enter a booking number.');
      return;
    }

    setLoading(true);
    setSearched(false);
    setDetails(null);
    try {
      const doc = await fetchFhrCollectionFlightLean(trimmed);
      if (!doc) {
        toast.error('No booking found for this number.');
        setSearched(true);
        return;
      }

      const mapped = fhrDocToBookingFlightDetails(doc, trimmed);
      if (!bookingDetailsHasData(mapped)) {
        toast.error('Booking found but flight details are empty.');
        setSearched(true);
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
  }, [bookingNo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">{meta.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{meta.subtitle}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
            meta.badgeClass,
          )}
        >
          {meta.statusLabel}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"
      >
        <label htmlFor={`booking-no-${section}`} className="mb-2 block text-sm font-medium text-gray-700">
          Booking No.
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input
            id={`booking-no-${section}`}
            type="text"
            value={bookingNo}
            onChange={(e) => setBookingNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleGet();
            }}
            autoComplete="off"
            placeholder="Enter booking number"
            className={textInputClass}
          />
          <motion.button
            type="button"
            disabled={loading}
            whileHover={loading ? undefined : { scale: 1.02 }}
            whileTap={loading ? undefined : { scale: 0.98 }}
            onClick={() => void handleGet()}
            className={cn(
              'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-sm',
              loading ? 'cursor-not-allowed bg-amber-400' : 'bg-amber-500 hover:bg-amber-600',
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Get
          </motion.button>
        </div>
      </motion.div>

      {searched ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-gray-100 bg-emerald-800 px-5 py-4 text-white">
            <Plane className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <h3 className="text-base font-semibold">Flight details</h3>
          </div>

          {!details ? (
            <p className="px-5 py-12 text-center text-sm text-gray-500">
              No flight details for this booking number.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
              {FLIGHT_DETAIL_FIELDS.map(({ key, label }) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-900">{details[key] || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}

function BookingDetailsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSection, setSelectedSection] = useState<BookingSectionId>('pending');

  const activeSection = useMemo(() => {
    const param = searchParams.get('section');
    if (param && SECTION_IDS.has(param as BookingSectionId)) {
      return param as BookingSectionId;
    }
    return selectedSection;
  }, [searchParams, selectedSection]);

  useEffect(() => {
    const param = searchParams.get('section');
    if (param && SECTION_IDS.has(param as BookingSectionId)) {
      setSelectedSection(param as BookingSectionId);
    }
  }, [searchParams]);

  const handleSectionClick = useCallback(
    (id: BookingSectionId) => {
      setSelectedSection(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', id);
      router.replace(`${BOOKING_DETAILS_BASE_PATH}?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="flex min-h-[calc(100vh-5rem)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm">
        <div className="border-b border-slate-100 px-5 py-6">
          <h1 className="bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-lg font-bold tracking-tight text-transparent">
            Booking Details
          </h1>
          <p className="mt-1 text-xs text-slate-500">Select a booking category</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {SIDEBAR_ITEMS.map(({ id, label, icon: Icon, description }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSectionClick(id)}
                className={cn(
                  'group relative w-full rounded-xl px-4 py-3.5 text-left transition-all duration-200',
                  isActive
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <span className="relative flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition',
                      isActive ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-slate-200',
                    )}
                  >
                    <Icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-slate-600')} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{label}</span>
                    <span className={cn('block text-xs', isActive ? 'text-white/90' : 'text-slate-500')}>
                      {description}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-6 md:p-8">
          <FrisPageHeader title="Booking details" icon={FileText} />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm sm:p-8"
            >
              <BookingDetailsPanel section={activeSection} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function BookingDetailsContent() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-5rem)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30" />
      }
    >
      <BookingDetailsPageContent />
    </Suspense>
  );
}
