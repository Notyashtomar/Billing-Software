'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Users,
  HeartPulse,
  Palmtree,
  Gift,
  CalendarDays,
  UserX,
  Moon,
  Sun,
  Briefcase,
  Luggage,
  Plane,
} from 'lucide-react';
import type { FlightData } from '@/utils/dataProcessor';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';
import PaxShiftFlightHandlingForm from '@/components/fris/reports/PaxShiftFlightHandlingForm';
import PaxShiftEmployeeSectionForm from '@/components/fris/reports/PaxShiftEmployeeSectionForm';
import PaxShiftShortShippedBagSidebarForm from '@/components/fris/reports/PaxShiftShortShippedBagSidebarForm';
import { FrisSectionNavMobileMenu } from '@/components/fris/layout/FrisSectionNav';
import { FRIS_HIDDEN_SCROLLBAR_CLASS } from '@/lib/fris-responsive-nav';
import { retainPaxShiftSessionForSerial } from '@/components/fris/reports/paxShiftReportStorageKeys';

const NAVBAR_OFFSET = '3rem';

export type PaxShiftSidebarSectionId =
  | 'staff-on-duty'
  | 'sick-leave'
  | 'casual-leave'
  | 'comp-off'
  | 'annual-leave'
  | 'absence'
  | 'chk-in-staff-d'
  | 'chk-in-staff-n'
  | 'csh-in-staff-d'
  | 'csh-in-staff-n'
  | 'mhb-staff-d'
  | 'mhb-staff-n'
  | 'short-shipped-bag'
  | 'flight-details';

const SECTIONS: {
  id: PaxShiftSidebarSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'staff-on-duty', label: 'Staff on duty (SUP/TL)', icon: Users },
  { id: 'sick-leave', label: 'Sick Leave', icon: HeartPulse },
  { id: 'casual-leave', label: 'Casual Leave', icon: Palmtree },
  { id: 'comp-off', label: 'Comp off', icon: Gift },
  { id: 'annual-leave', label: 'Annual leave', icon: CalendarDays },
  { id: 'absence', label: 'Absence', icon: UserX },
  { id: 'chk-in-staff-d', label: 'CHK-in-staff-D', icon: Sun },
  { id: 'chk-in-staff-n', label: 'CHK-in-staff-N', icon: Moon },
  { id: 'csh-in-staff-d', label: 'CSH-in-staff-D', icon: Sun },
  { id: 'csh-in-staff-n', label: 'CSH-in-staff-N', icon: Moon },
  { id: 'mhb-staff-d', label: 'MHB staff-D', icon: Briefcase },
  { id: 'mhb-staff-n', label: 'MHB staff-N', icon: Briefcase },
  { id: 'short-shipped-bag', label: 'Short shipped bag', icon: Luggage },
  { id: 'flight-details', label: 'Flight Details', icon: Plane },
];

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-h-[44px] touch-manipulation items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-600' : 'text-gray-500'}`} />
      <span className="min-w-0 leading-snug">{label}</span>
    </button>
  );
}

function employeeSectionStorageKey(flight: FlightData, sectionId: PaxShiftSidebarSectionId): string {
  const serial = String(flight.slNo ?? '').trim() || 'unknown';
  return `fris-pax-shift-emp-${serial}-${sectionId}`;
}

function shortShippedBagStorageKey(flight: FlightData): string {
  const serial = String(flight.slNo ?? '').trim() || 'unknown';
  return `fris-pax-shift-ssb-${serial}`;
}

function toPsrSectionKey(
  sectionId: PaxShiftSidebarSectionId,
): string | null {
  switch (sectionId) {
    case 'staff-on-duty':
      return 'psr-staff-on-duty';
    case 'sick-leave':
      return 'psr-sick-leave';
    case 'casual-leave':
      return 'psr-casual-leave';
    case 'comp-off':
      return 'psr-comp-off';
    case 'annual-leave':
      return 'psr-annual-leave';
    case 'absence':
      return 'psr-absence';
    case 'chk-in-staff-d':
      return 'psr-chk-in-staff-d';
    case 'chk-in-staff-n':
      return 'psr-chk-in-staff-n';
    case 'csh-in-staff-d':
      return 'psr-csh-in-staff-d';
    case 'csh-in-staff-n':
      return 'psr-csh-in-staff-n';
    case 'mhb-staff-d':
      return 'psr-mhb-staff-d';
    case 'mhb-staff-n':
      return 'psr-mhb-staff-n';
    default:
      return null;
  }
}

function SectionContent({ sectionId, flight }: { sectionId: PaxShiftSidebarSectionId; flight: FlightData }) {
  const persistKey = employeeSectionStorageKey(flight, sectionId);
  const flightSerial = String(flight.slNo ?? '').trim();
  const psrSectionKey = toPsrSectionKey(sectionId);

  switch (sectionId) {
    case 'staff-on-duty':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Staff on duty (SUP/TL)"
          hint="Supervisor / team lead on duty for this flight instance."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
          showTrainingFields
        />
      );
    case 'sick-leave':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Sick Leave"
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'casual-leave':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Casual Leave"
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'comp-off':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Comp off"
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'annual-leave':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Annual leave"
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'absence':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="Absence"
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'chk-in-staff-d':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="CHK-in-staff-D"
          hint="Day shift — check-in staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'chk-in-staff-n':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="CHK-in-staff-N"
          hint="Night shift — check-in staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'csh-in-staff-d':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="CSH-in-staff-D"
          hint="Day shift — CSH staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'csh-in-staff-n':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="CSH-in-staff-N"
          hint="Night shift — CSH staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'mhb-staff-d':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="MHB staff-D"
          hint="Day — MHB staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'mhb-staff-n':
      return (
        <PaxShiftEmployeeSectionForm
          key={persistKey}
          title="MHB staff-N"
          hint="Night — MHB staff."
          storageKey={persistKey}
          flightSerial={flightSerial}
          sectionKey={psrSectionKey ?? undefined}
        />
      );
    case 'short-shipped-bag':
      return (
        <PaxShiftShortShippedBagSidebarForm
          key={shortShippedBagStorageKey(flight)}
          storageKey={shortShippedBagStorageKey(flight)}
          flight={flight}
          flightSerial={flightSerial}
        />
      );
    case 'flight-details':
      return <PaxShiftFlightHandlingForm flight={flight} />;
    default:
      return null;
  }
}

export type PaxShiftOpenSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  flight: FlightData | null;
};

export default function PaxShiftOpenSidebar({ isOpen, onClose, flight }: PaxShiftOpenSidebarProps) {
  const [section, setSection] = useState<PaxShiftSidebarSectionId>('staff-on-duty');

  useEffect(() => {
    const serial = String(flight?.slNo ?? '').trim();
    if (!isOpen || !serial) return;
    retainPaxShiftSessionForSerial(serial);
  }, [isOpen, flight?.slNo]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const scrollbarW = window.innerWidth - html.clientWidth;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && flight) setSection('staff-on-duty');
  }, [isOpen, flight?.slNo]);

  const handleClose = () => {
    onClose();
  };

  if (!flight) return null;

  const displaySerial = displayFlightInstanceSerial(flight.slNo);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="fixed inset-x-0 bottom-0 z-40 bg-slate-900/25 backdrop-blur-[3px]"
            style={{ top: NAVBAR_OFFSET }}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pax-shift-sidebar-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex w-full flex-col bg-white shadow-xl lg:flex-row"
            style={{
              top: NAVBAR_OFFSET,
              height: `calc(100dvh - ${NAVBAR_OFFSET})`,
            }}
          >
            <div className="flex shrink-0 flex-col border-b border-gray-200 bg-gray-50 lg:w-72 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <h3 id="pax-shift-sidebar-title" className="truncate text-sm font-semibold text-gray-900">
                    Sl. No. {displaySerial}
                  </h3>
                  <p className="truncate text-xs text-gray-500">
                    {flight.airline} · {flight.flightNo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-lg transition-colors hover:bg-gray-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="border-b border-gray-200 p-2 lg:hidden">
                <FrisSectionNavMobileMenu
                  sections={SECTIONS}
                  activeId={section}
                  onSelect={setSection}
                  ariaLabel="Pax shift form sections"
                  showActiveLabel
                />
              </div>

              <nav
                className={`hidden max-h-[40dvh] flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain p-2 lg:block lg:max-h-none ${FRIS_HIDDEN_SCROLLBAR_CLASS}`}
                aria-label="Pax shift sections"
              >
                {SECTIONS.map(({ id, label, icon }) => (
                  <NavButton
                    key={id}
                    icon={icon}
                    label={label}
                    active={section === id}
                    onClick={() => setSection(id)}
                  />
                ))}
              </nav>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-50">
              <SectionContent sectionId={section} flight={flight} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
