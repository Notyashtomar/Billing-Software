'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  BookOpen,
  FileSpreadsheet,
  FileText,
  UserPlus,
} from 'lucide-react';
import type { FrisSectionNavItem } from '@/lib/fris-responsive-nav';
import { NonScheduledAmberWorkspace } from '@/components/fris/flights/non-scheduled-booking/NonScheduledAmberWorkspace';
import NonScheduledBookingForm from '@/components/fris/flights/non-scheduled-booking/NonScheduledBookingForm';
import NonScheduledChallanPanel from '@/components/fris/flights/non-scheduled-booking/NonScheduledChallanPanel';
import NonScheduledAddPassengerPanel from '@/components/fris/flights/non-scheduled-booking/NonScheduledAddPassengerPanel';
import NonScheduledReportsPanel from '@/components/fris/flights/non-scheduled-booking/NonScheduledReportsPanel';
import { BOOKING_PAGE_SHELL, BOOKING_SEARCH_CARD } from '@/components/fris/flights/non-scheduled-booking/bookingPageLayout';

const BOOKING_BASE_PATH = '/fris/flights/non-scheduled-airlines/non-scheduled-booking';

type BookingSectionId =
  | 'booking'
  | 'challan'
  | 'add-passenger'
  | 'reports'
  | 'booking-cancel-report'
  | 'challan-not-generated';

const SECTION_IDS = new Set<BookingSectionId>([
  'booking',
  'challan',
  'add-passenger',
  'reports',
  'booking-cancel-report',
  'challan-not-generated',
]);

const SIDEBAR_ITEMS: FrisSectionNavItem<BookingSectionId>[] = [
  { id: 'booking', label: 'Booking', icon: BookOpen, description: 'Create new booking' },
  { id: 'challan', label: 'Performa', icon: FileText, description: 'Generate performa' },
  {
    id: 'add-passenger',
    label: 'Add Passenger',
    icon: UserPlus,
    description: 'Passenger manifest',
  },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet, description: 'Booking reports' },
  {
    id: 'booking-cancel-report',
    label: 'Booking Cancel Report',
    icon: Ban,
    description: 'Cancelled bookings',
  },
  {
    id: 'challan-not-generated',
    label: 'If Performa Not Generated',
    icon: AlertTriangle,
    description: 'Pending performa list',
  },
];

const SECTION_HINTS: Record<
  Exclude<BookingSectionId, 'booking' | 'challan' | 'add-passenger' | 'reports'>,
  string
> = {
  'booking-cancel-report': 'Cancellation report filters and table export will be added here.',
  'challan-not-generated': 'Exception list and follow-up actions will be shown here.',
};

function SectionComingSoon({ hint }: { hint: string }) {
  return (
    <div className={BOOKING_SEARCH_CARD}>
      <p className="text-sm leading-relaxed text-slate-600">{hint}</p>
    </div>
  );
}

function SectionContent({
  section,
  bookingNo,
}: {
  section: BookingSectionId;
  bookingNo?: string | null;
}) {
  if (section === 'booking') {
    return <NonScheduledBookingForm />;
  }
  if (section === 'challan') {
    return <NonScheduledChallanPanel bookingNo={bookingNo} />;
  }
  if (section === 'add-passenger') {
    return <NonScheduledAddPassengerPanel bookingNo={bookingNo} />;
  }
  if (section === 'reports') {
    return <NonScheduledReportsPanel />;
  }
  return <SectionComingSoon hint={SECTION_HINTS[section]} />;
}

function NonScheduledBookingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedSection, setSelectedSection] = useState<BookingSectionId>('booking');

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

  const handleSectionSelect = useCallback(
    (id: BookingSectionId) => {
      setSelectedSection(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('section', id);
      // Browse modes clear deep-link bookingNo; add-passenger keeps it when already present.
      if (id !== 'add-passenger') {
        params.delete('bookingNo');
      }
      router.replace(`${BOOKING_BASE_PATH}?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const activeItem = SIDEBAR_ITEMS.find((item) => item.id === activeSection);
  const usesPlainContent = activeSection === 'booking' || activeSection === 'challan';
  const bookingNoParam = searchParams.get('bookingNo');

  return (
    <NonScheduledAmberWorkspace
      pageTitle="Non scheduled Booking"
      pageIcon={BookOpen}
      pageSubtitle="Chandigarh non-scheduled operations"
      sections={SIDEBAR_ITEMS}
      activeId={activeSection}
      onSelect={handleSectionSelect}
      menuId="non-scheduled-booking-section-menu"
      ariaLabel="Non-scheduled booking sections"
      activeSectionLabel={activeItem?.label ?? 'Booking'}
      sectionSubtitle={activeItem?.description}
      showSectionHeader={
        !usesPlainContent && activeSection !== 'add-passenger' && activeSection !== 'reports'
      }
      hidePageHeader
      plainContent={usesPlainContent}
      contentClassName={usesPlainContent ? undefined : 'p-4 sm:p-5 md:p-6'}
    >
      <SectionContent section={activeSection} bookingNo={bookingNoParam} />
    </NonScheduledAmberWorkspace>
  );
}

export function NonScheduledBookingContent() {
  return (
    <Suspense fallback={<div className={BOOKING_PAGE_SHELL} />}>
      <NonScheduledBookingPageContent />
    </Suspense>
  );
}
