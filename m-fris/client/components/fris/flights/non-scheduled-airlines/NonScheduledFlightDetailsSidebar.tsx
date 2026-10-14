'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Building2,
  Scale,
  Truck,
  MessageSquare,
  Users,
  BarChart3,
  Paperclip,
  Package,
  Menu,
} from 'lucide-react';
import MainDetailsForm from './MainDetailsForm';
import TerminalDetailsForm from './TerminalDetailsForm';
import LoadControlDetailsForm from './LoadControlDetailsForm';
import RampDetailsForm from './RampDetailsForm';
import RemarksForm from './RemarksForm';
import EquipmentManpowerForm from './EquipmentManpowerForm';
import ManifestForm from './ManifestForm';
import ReportsForm from './ReportsForm';
import AttachmentsForm from './AttachmentsForm';
import type { NonScheduledFlightData } from './types';

/** Match fris layout `pt-14` / Navbar `h-14`; small upward nudge covers background seam. */
const NAVBAR_OFFSET = 'calc(3.5rem - 2px)';

export type { NonScheduledFlightData };

export type NonScheduledSidebarView =
  | 'main-details'
  | 'terminal-details'
  | 'load-control-details'
  | 'ramp-details'
  | 'remarks'
  | 'equipment-manpower'
  | 'manifest'
  | 'reports'
  | 'attachments';

type SidebarView = NonScheduledSidebarView;

export interface NonScheduledFlightDetailsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  flight: NonScheduledFlightData | null;
  /** Open a specific section when deep-linked from Missing FHR. */
  initialView?: SidebarView | null;
  /** After Terminal / Ramp / Main / Load / GSD save — refresh lock columns. */
  onFhrLocksMayHaveChanged?: (serial: string) => void;
  /** After OTP cancel/reopen — update table Cancelled status. */
  onFlightCancelledChange?: (serial: string, cancelled: boolean) => void;
}

interface SidebarButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
}

const SidebarButton = memo(function SidebarButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-600' : 'text-gray-500'}`}
      />
      {label}
    </button>
  );
});

export default function NonScheduledFlightDetailsSidebar({
  isOpen,
  onClose,
  flight,
  initialView = null,
  onFhrLocksMayHaveChanged,
  onFlightCancelledChange,
}: NonScheduledFlightDetailsSidebarProps) {
  const [view, setView] = useState<SidebarView>('main-details');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const notifyLocksMayHaveChanged = useCallback(() => {
    const serial = String(flight?.flightSerialNo ?? flight?.sNo ?? '').trim();
    if (!serial) return;
    onFhrLocksMayHaveChanged?.(serial);
  }, [flight?.flightSerialNo, flight?.sNo, onFhrLocksMayHaveChanged]);

  const handleClose = useCallback(() => {
    setView('main-details');
    setMobileNavOpen(false);
    onClose();
  }, [onClose]);

  const selectView = useCallback((next: SidebarView) => {
    setView(next);
    setMobileNavOpen(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- Controlled close must reset transient dialog state. */
  useEffect(() => {
    if (!isOpen) {
      setView('main-details');
      setMobileNavOpen(false);
      return;
    }
    if (initialView) {
      setView(initialView);
    }
  }, [isOpen, initialView, flight?.sNo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mobileNavOpen) {
        setMobileNavOpen(false);
        return;
      }
      handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, isOpen, mobileNavOpen]);

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

  if (!flight) return null;

  const displaySerial = flight.sNo || flight.flightSerialNo || '—';
  const flightSubtitle = [flight.airline, flight.aircraft, flight.routing]
    .filter(Boolean)
    .join(' • ');

  const navButtons = (
    <>
      <SidebarButton
        icon={FileText}
        label="Main Details"
        onClick={() => selectView('main-details')}
        active={view === 'main-details'}
      />
      <SidebarButton
        icon={Building2}
        label="Terminal Details"
        onClick={() => selectView('terminal-details')}
        active={view === 'terminal-details'}
      />
      <SidebarButton
        icon={Scale}
        label="Load Control Details"
        onClick={() => selectView('load-control-details')}
        active={view === 'load-control-details'}
      />
      <SidebarButton
        icon={Truck}
        label="Ramp Details"
        onClick={() => selectView('ramp-details')}
        active={view === 'ramp-details'}
      />
      <SidebarButton
        icon={MessageSquare}
        label="Remarks"
        onClick={() => selectView('remarks')}
        active={view === 'remarks'}
      />
      <SidebarButton
        icon={Users}
        label="Equipment/Manpower"
        onClick={() => selectView('equipment-manpower')}
        active={view === 'equipment-manpower'}
      />
      <SidebarButton
        icon={Package}
        label="Manifest"
        onClick={() => selectView('manifest')}
        active={view === 'manifest'}
      />
      <SidebarButton
        icon={BarChart3}
        label="Reports"
        onClick={() => selectView('reports')}
        active={view === 'reports'}
      />
      <SidebarButton
        icon={Paperclip}
        label="Attachments"
        onClick={() => selectView('attachments')}
        active={view === 'attachments'}
      />
    </>
  );

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
            className="fixed inset-x-0 bottom-0 z-30 bg-black/40 backdrop-blur-sm"
            style={{ top: NAVBAR_OFFSET }}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="non-scheduled-flight-details-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed bottom-0 left-0 right-0 z-40 flex w-full flex-col overflow-hidden bg-white shadow-xl nav-desktop:flex-row"
            style={{
              top: NAVBAR_OFFSET,
              height: `calc(100dvh - ${NAVBAR_OFFSET})`,
            }}
          >
            <h2 id="non-scheduled-flight-details-title" className="sr-only">
              Non-scheduled flight details for {flight.flightNo || `serial ${displaySerial}`}
            </h2>

            {/* Desktop nav */}
            <div className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50 nav-desktop:flex">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-gray-900">
                    {flight.flightNo || 'Flight'}
                  </h3>
                  <p className="truncate text-xs text-gray-500">
                    S.No {displaySerial}
                    {flightSubtitle ? ` • ${flightSubtitle}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <nav
                className="flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] touch-pan-y"
                aria-label="Non-scheduled flight detail sections"
              >
                {navButtons}
              </nav>
            </div>

            {/* Content */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white py-2.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] nav-desktop:hidden">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.97]"
                  aria-expanded={mobileNavOpen}
                  aria-label="Open flight sections menu"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    S.No {displaySerial}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {flight.flightNo}
                    {flightSubtitle ? ` • ${flightSubtitle}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100"
                  aria-label="Close flight details"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <AnimatePresence>
                {mobileNavOpen ? (
                  <>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 bg-black/30 nav-desktop:hidden"
                      aria-label="Close sections menu"
                      onClick={() => setMobileNavOpen(false)}
                    />
                    <motion.nav
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '-100%' }}
                      transition={{ type: 'tween', duration: 0.2 }}
                      className="absolute bottom-0 left-0 top-12 z-30 flex w-[min(16rem,88vw)] max-w-full flex-col overflow-hidden border-r border-gray-200 bg-white shadow-xl nav-desktop:hidden"
                      aria-label="Non-scheduled flight detail sections"
                    >
                      <div className="flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-2 pt-2 touch-pan-y">
                        {navButtons}
                      </div>
                    </motion.nav>
                  </>
                ) : null}
              </AnimatePresence>

              <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] nav-desktop:p-0">
                {view === 'main-details' ? (
                  <MainDetailsForm
                    key={String(flight.sNo)}
                    flight={flight}
                    onSave={notifyLocksMayHaveChanged}
                    onCancelledChange={(nextCancelled) => {
                      const serial = String(flight.flightSerialNo ?? flight.sNo ?? '').trim();
                      if (!serial) return;
                      onFlightCancelledChange?.(serial, nextCancelled);
                    }}
                  />
                ) : null}
                {view === 'terminal-details' ? (
                  <TerminalDetailsForm
                    flight={flight}
                    onSave={notifyLocksMayHaveChanged}
                  />
                ) : null}
                {view === 'load-control-details' ? (
                  <LoadControlDetailsForm
                    flight={flight}
                    onSave={notifyLocksMayHaveChanged}
                  />
                ) : null}
                {view === 'ramp-details' ? (
                  <RampDetailsForm
                    flight={flight}
                    onSave={notifyLocksMayHaveChanged}
                  />
                ) : null}
                {view === 'remarks' ? <RemarksForm flight={flight} /> : null}
                {view === 'equipment-manpower' ? (
                  <EquipmentManpowerForm
                    flight={flight}
                    onGsdLockStateSaved={onFhrLocksMayHaveChanged}
                  />
                ) : null}
                {view === 'manifest' ? <ManifestForm flight={flight} /> : null}
                {view === 'reports' ? <ReportsForm flight={flight} /> : null}
                {view === 'attachments' ? <AttachmentsForm flight={flight} /> : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
