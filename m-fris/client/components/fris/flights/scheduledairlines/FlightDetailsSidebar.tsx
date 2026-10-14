'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Menu,
  FileText,
  Building2,
  Scale,
  Truck,
  MessageSquare,
  Users,
  Sparkles,
  BarChart3,
  Paperclip,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCompactPickerViewport } from '@/lib/use-compact-picker-viewport';
import {
  FlightData,
  MainDetailsData,
  RampDetails3Data,
  normalizeRampDetails3Data,
  displayScheduledAirlinesTableSerial,
  nsFormSerialForFlight,
} from '@/utils/dataProcessor';
import { getNsRawFormSavedUrl } from '@/lib/api';
import { isFrisElevatedRole } from '@/lib/fris-session';
import { frisFetch } from '@/lib/fris-auth-fetch';
import MainDetailsForm from './MainDetailsForm';
import TerminalDetailsForm from './TerminalDetailsForm';
import LoadControlDetailsForm from './LoadControlDetailsForm';
import RampDetailsForm from './RampDetailsForm';
import DutyAllocationForm from './DutyAllocationForm';
import RampDutyAllocationReport from './RampDutyAllocationReport';
import RemarksForm from './RemarksForm';
import EquipmentManpowerForm from './EquipmentManpowerForm';
import ReportsForm from './ReportsForm';
import AttachmentsForm from './AttachmentsForm';
import dynamic from 'next/dynamic';
import type { RafCleaningKind } from '@/components/fris/flights/ramp-assistance/RafCleaningServicesForm';
import type { RafCleaningFlags } from '@/components/fris/flights/ramp-assistance/RampAssistanceFlightsTable';

const RafCleaningServicesForm = dynamic(
  () => import('@/components/fris/flights/ramp-assistance/RafCleaningServicesForm'),
  { ssr: false },
);
const RafNotExportedForm = dynamic(
  () => import('@/components/fris/flights/ramp-assistance/RafNotExportedForm'),
  { ssr: false },
);
const RafMainDetailsForm = dynamic(
  () => import('@/components/fris/flights/ramp-assistance/RafMainDetailsForm'),
  { ssr: false },
);

const fetch = frisFetch;

/** Match FRIS navbar height (`h-12` = 3rem) so panel touches navbar. */
const NAVBAR_OFFSET = '3rem';

// Interface for user permissions flags structure from database
interface UserFlags {
  'main details'?: number;
  'terminal details'?: number;
  'load control details'?: number;
  'remarks'?: number;
  'equipment/manpower'?: number;
  'cleaning services'?: number;
  'reports'?: number;
  'attachments'?: number;
  'ramp'?: {
    'ramp details'?: number;
    'duty allocation'?: number;
    'ramp duty allocation'?: number;
  };
}

export interface FlightDetailsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  flight: FlightData | null;
  /** When provided, sidebar header shows this (from main-details server response); otherwise uses flight */
  mainDetails?: MainDetailsData | null;
  /** Called when MainDetailsForm receives server data; parent should set mainDetails so header updates */
  onMainDetailsLoaded?: (data: MainDetailsData) => void;
  /** Called after remarks save updates cancellation state. */
  onFlightCancelledChange?: (slNo: string, cancelled: boolean) => void;
  /** After equipment/manpower sync; parent refreshes GSD lock in the flights table. */
  onEquipmentGsdSaved?: (slNo: string) => void;
  /** Deep-link: open directly on this form when the sidebar opens. */
  initialView?: SidebarView | null;
  /**
   * `raf` = Ramp Assistance Forms Open menu (legacy raf.aspx):
   * Main Details, Reports, Attachments, Cleaning Services, Not Exported RAF.
   * Default `scheduled` keeps Scheduled Airlines behaviour unchanged.
   */
  variant?: 'scheduled' | 'raf';
  /** Airline cleaning flags — drives RAF Cleaning Services tabs / View deep-links. */
  cleaningFlags?: RafCleaningFlags | null;
  /** When opening from View column cleaning link. */
  initialCleaningKind?: RafCleaningKind | null;
  /** RAF Not Exported status changed — parent may refresh table exportedNAV. */
  onRafExportStatusChange?: (slNo: string, exportedNAV: string) => void;
}

export type SidebarView =
  | 'menu'
  | 'main-details'
  | 'terminal-details'
  | 'load-control-details'
  | 'ramp-details'
  | 'duty-allocation'
  | 'ramp-duty-report'
  | 'remarks'
  | 'equipment-manpower'
  | 'reports'
  | 'attachements'
  | 'cleaning-services'
  | 'not-exported-raf';

const RAF_FULL_FLAGS: UserFlags = {
  'main details': 1,
  reports: 1,
  attachments: 1,
  'cleaning services': 1,
};

/** Full access to every flight-detail section. */
const FULL_SECTION_ACCESS_FLAGS: UserFlags = {
  'main details': 1,
  'terminal details': 1,
  'load control details': 1,
  remarks: 1,
  'equipment/manpower': 1,
  'cleaning services': 1,
  reports: 1,
  attachments: 1,
  ramp: {
    'ramp details': 1,
    'duty allocation': 1,
    'ramp duty allocation': 1,
  },
};

/**
 * Legacy per-section flag keys. The admin panel grants page-level access
 * (tab/sub-page flags like `flights → Scheduled Airlines`), NOT these granular
 * FHR-section flags. A panel employee's stored `userFlags` therefore never
 * contains these keys — so we must not gate the sidebar on them, or it renders
 * empty. We only honour them when a record actually carries them (legacy data).
 *
 * Exception: Main Details (Representatives / signatures) stays open for every
 * FRIS role — Employee, Manager, Super Admin — once the user can open a flight.
 */
const LEGACY_SECTION_FLAG_KEYS = [
  'main details',
  'terminal details',
  'load control details',
  'remarks',
  'equipment/manpower',
  'reports',
  'attachments',
  'ramp',
] as const;

/** Always keep Main Details reachable for Employee / Manager / Super Admin. */
function withMainDetailsAccess(flags: UserFlags): UserFlags {
  return { ...flags, 'main details': 1 };
}

function hasLegacySectionFlags(flags: unknown): boolean {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return false;
  const record = flags as Record<string, unknown>;
  // 'reports' is intentionally ignored here: it is ALSO a top-level
  // nav-permission tab (`flags.reports`) that every panel user carries, so
  // matching it would misclassify page-level permission flags as legacy
  // FHR-section flags and hide the entire flight-detail sidebar. A genuine
  // legacy record always carries an unambiguous section key (e.g. 'main
  // details'), so detecting on those alone is both correct and sufficient.
  return LEGACY_SECTION_FLAG_KEYS.some(
    (key) => key !== 'reports' && key in record,
  );
}

function SidebarButton({
  icon: Icon,
  label,
  sub = false,
  onClick,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${sub ? 'pl-8' : ''} ${
        active
          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-700'
      }`}
    >
      <Icon
        className={`shrink-0 ${sub ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${active ? 'text-emerald-600' : 'text-gray-500'}`}
      />
      {label}
    </button>
  );
}

export default function FlightDetailsSidebar({
  isOpen,
  onClose,
  flight,
  mainDetails = null,
  onMainDetailsLoaded,
  onFlightCancelledChange,
  onEquipmentGsdSaved,
  initialView = null,
  variant = 'scheduled',
  cleaningFlags = null,
  initialCleaningKind = null,
  onRafExportStatusChange,
}: FlightDetailsSidebarProps) {
  const isRaf = variant === 'raf';
  const isCompactViewport = useCompactPickerViewport();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rampExpanded, setRampExpanded] = useState(false);
  const [view, setView] = useState<SidebarView>('menu');
  const [rampDetails3Data, setRampDetails3Data] = useState<RampDetails3Data | null>(null);
  /** Mongo form serial (legacy when imported data used a different ID than instance Sl.No). */
  const resolvedSerial = flight ? nsFormSerialForFlight(flight) : '';

  const selectView = useCallback(
    (next: SidebarView) => {
      setView(next);
      if (isCompactViewport) setMobileNavOpen(false);
    },
    [isCompactViewport],
  );

  useEffect(() => {
    if (!isOpen) setMobileNavOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mobileNavOpen || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, mobileNavOpen]);

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

  // When the drawer opens or the user picks a different flight, show Main Details first.
  // Do not depend on `flight` by reference: parent often replaces `selectedFlight` with a
  // spread (e.g. after lock refresh when saving equipment/manpower), which would reset the
  // sidebar view and kick users back from Equipment/Manpower.
  useEffect(() => {
    if (isOpen && flight) {
      if (initialView && initialView !== 'menu') {
        setView(initialView);
        if (
          !isRaf &&
          (initialView === 'ramp-details' ||
            initialView === 'duty-allocation' ||
            initialView === 'ramp-duty-report')
        ) {
          setRampExpanded(true);
        }
      } else {
        setView('main-details');
      }
    }
  }, [isOpen, resolvedSerial, initialView, isRaf]);

  useEffect(() => {
    if (!isOpen) setRampDetails3Data(null);
  }, [isOpen]);

  // When Open is clicked: fetch all three ramp endpoints and log response (Ramp Details, Duty Allocation, Ramp Duty Report)
  useEffect(() => {
    if (!isOpen || !resolvedSerial || isRaf) return;
    const serial = resolvedSerial;

    const rampDetailsUrl = getNsRawFormSavedUrl('ramp-details', serial);
    fetch(rampDetailsUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        console.log('[RampDetailsForm] Server data received (on Open):', data);
      })
      .catch((err) => console.error('[RampDetailsForm] Fetch error:', err));

    const dutyAllocationUrl = getNsRawFormSavedUrl('ramp-details-2', serial);
    fetch(dutyAllocationUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        console.log('[DutyAllocationForm] Server data received (on Open):', data);
      })
      .catch((err) => console.error('[DutyAllocationForm] Fetch error:', err));

    const rampDutyReportUrl = getNsRawFormSavedUrl('ramp-details-3', serial);
    setRampDetails3Data(null);
    fetch(rampDutyReportUrl)
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        if (!text || text.trim() === '') return null;
        try {
          return text.trim() === 'null' ? null : JSON.parse(text);
        } catch {
          return null;
        }
      })
      .then((raw) => {
        const data = normalizeRampDetails3Data(raw);
        if (data) setRampDetails3Data(data);
      })
      .catch(() => setRampDetails3Data(null));
  }, [isOpen, resolvedSerial, isRaf]);

  // State to store user permission flags fetched from database
  const [userFlags, setUserFlags] = useState<UserFlags | null>(null);
  const [isLoadingFlags, setIsLoadingFlags] = useState(true);

  // Load user permissions from localStorage (stored during login)
  useEffect(() => {
    if (isRaf) {
      setUserFlags(RAF_FULL_FLAGS);
      setIsLoadingFlags(false);
      return;
    }

    const loadUserPermissions = () => {
      try {
        setIsLoadingFlags(true);
        
        // Check user role first - managers/superadmins get full access
        const userRole = localStorage.getItem('userRole');
        
        if (isFrisElevatedRole(userRole)) {
          // Manager/SuperAdmin: Full access to everything
          console.log('✅ Manager/SuperAdmin detected - granting full access');
          setUserFlags(withMainDetailsAccess(FULL_SECTION_ACCESS_FLAGS));
          return;
        }
        
        // For regular users, get flags from localStorage (stored during login)
        const storedFlags = localStorage.getItem('userFlags');
        
        if (storedFlags) {
          try {
            const parsedFlags = JSON.parse(storedFlags);
            // Admin-panel permissions are page-level (tab/sub-page flags), not
            // these granular FHR-section flags. If the stored flags don't carry
            // the legacy section keys, the user reached this editor via the
            // Scheduled Airlines page permission, so grant all sections instead
            // of hiding them (which left the sidebar empty). Legacy records that
            // DO carry section flags keep their granular behaviour — except Main
            // Details, which stays open for every FRIS role.
            if (hasLegacySectionFlags(parsedFlags)) {
              setUserFlags(withMainDetailsAccess(parsedFlags as UserFlags));
              console.log('✅ Legacy section flags loaded from localStorage:', parsedFlags);
            } else {
              setUserFlags(withMainDetailsAccess(FULL_SECTION_ACCESS_FLAGS));
              console.log('✅ Page-level access detected - granting all flight sections');
            }
            return; // Successfully loaded flags
          } catch (parseError) {
            console.error('❌ Failed to parse stored flags:', parseError);
          }
        }
        
        // If no flags in localStorage, check if user is logged in
        const userId = localStorage.getItem('userId');
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        
        if (!userId || isAuthenticated !== 'true') {
          console.warn('⚠️ User not authenticated. Please login.');
          return;
        }
        
        // No flags found but user is authenticated
        console.warn('⚠️ No user flags found in localStorage.');
        console.log('ℹ️ Flags were not stored during login - user will have no access to any sections');
        
        // For regular users without flags, deny other sections but keep Main Details
        const userDepartment = localStorage.getItem('userDepartment');
        
        if (userDepartment) {
          // Regular user should have flags but they're missing
          // Set empty flags to deny access to everything except Main Details
          console.log('ℹ️ No flags assigned - denying access except Main Details');
          const emptyFlags = {
            'main details': 0,
            'terminal details': 0,
            'load control details': 0,
            'remarks': 0,
            'equipment/manpower': 0,
            'cleaning services': 0,
            'reports': 0,
            'attachments': 0,
            'ramp': {
              'ramp details': 0,
              'duty allocation': 0,
              'ramp duty allocation': 0,
            }
          };
          setUserFlags(withMainDetailsAccess(emptyFlags));
        }
        
      } catch (error) {
        console.error('❌ Error loading user permissions:', error);
        // Set empty flags on error to deny access except Main Details
        const emptyFlags = {
          'main details': 0,
          'terminal details': 0,
          'load control details': 0,
          'remarks': 0,
          'equipment/manpower': 0,
          'cleaning services': 0,
          'reports': 0,
          'attachments': 0,
          'ramp': {
            'ramp details': 0,
            'duty allocation': 0,
            'ramp duty allocation': 0,
          }
        };
        setUserFlags(withMainDetailsAccess(emptyFlags));
      } finally {
        setIsLoadingFlags(false);
      }
    };

    loadUserPermissions();
  }, [isRaf]); // Re-run when variant changes

  // Automatically navigate to the first available section when flags are loaded
  useEffect(() => {
    if (isRaf || !userFlags || view !== 'menu') return;
    
    // List of sections in priority order
    const sections: Array<{ key: string; view: SidebarView; isRamp?: boolean; rampKey?: string }> = [
      { key: 'main details', view: 'main-details' },
      { key: 'terminal details', view: 'terminal-details' },
      { key: 'load control details', view: 'load-control-details' },
      { key: 'ramp details', view: 'ramp-details', isRamp: true, rampKey: 'ramp details' },
      { key: 'duty allocation', view: 'duty-allocation', isRamp: true, rampKey: 'duty allocation' },
      { key: 'ramp duty allocation', view: 'ramp-duty-report', isRamp: true, rampKey: 'ramp duty allocation' },
      { key: 'remarks', view: 'remarks' },
      { key: 'equipment/manpower', view: 'equipment-manpower' },
      { key: 'reports', view: 'reports' },
      { key: 'attachments', view: 'attachements' },
    ];
    
    // Find the first accessible section
    for (const section of sections) {
      if (section.isRamp && section.rampKey) {
        // Check ramp sub-section
        if (userFlags.ramp && userFlags.ramp[section.rampKey as keyof typeof userFlags.ramp] === 1) {
          setView(section.view);
          if (section.view.startsWith('ramp') || section.view === 'duty-allocation') {
            setRampExpanded(true);
          }
          return;
        }
      } else {
        // Check main section
        if (userFlags[section.key as keyof UserFlags] === 1) {
          setView(section.view);
          return;
        }
      }
    }
    
    // If no sections are accessible, stay on menu view
    console.warn('⚠️ No accessible sections found for this user');
  }, [userFlags, view, isRaf]);

  const handleClose = () => {
    setMobileNavOpen(false);
    setView('menu');
    onClose();
  };

  // Helper function to check if a button should be visible based on flags
  // Note: Admin/SuperAdmin already have all flags set to 1 during loading
  const isButtonVisible = (flagKey: string): boolean => {
    if (!userFlags) return false;
    return userFlags[flagKey as keyof UserFlags] === 1;
  };

  // Helper function to check if a ramp sub-button should be visible
  // Note: Admin/SuperAdmin already have all ramp flags set to 1 during loading
  const isRampButtonVisible = (flagKey: string): boolean => {
    if (!userFlags || !userFlags.ramp) return false;
    return userFlags.ramp[flagKey as keyof typeof userFlags.ramp] === 1;
  };

  // Check if any ramp sub-items are visible to determine if ramp section should show
  // Note: Admin/SuperAdmin already have all ramp flags set to 1 during loading
  const hasAnyRampAccess = (): boolean => {
    if (!userFlags || !userFlags.ramp) return false;
    return (
      userFlags.ramp['ramp details'] === 1 ||
      userFlags.ramp['duty allocation'] === 1 ||
      userFlags.ramp['ramp duty allocation'] === 1
    );
  };

  if (!flight) return null;
  const displaySerial = displayScheduledAirlinesTableSerial(flight);
  const flightSubtitle = `${mainDetails?.airlineName ?? flight.airline} • ${mainDetails?.aircraftType ?? flight.aircraft}`;

  const renderNavButtons = () => {
    if (isRaf) {
      return (
        <>
          <SidebarButton
            icon={FileText}
            label="Main Details"
            onClick={() => selectView('main-details')}
            active={view === 'main-details'}
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
            onClick={() => selectView('attachements')}
            active={view === 'attachements'}
          />
          <SidebarButton
            icon={Sparkles}
            label="Cleaning Services"
            onClick={() => selectView('cleaning-services')}
            active={view === 'cleaning-services'}
          />
          <SidebarButton
            icon={FileSpreadsheet}
            label="Not Exported RAF"
            onClick={() => selectView('not-exported-raf')}
            active={view === 'not-exported-raf'}
          />
        </>
      );
    }

    return (
    <>
      {isLoadingFlags ? (
        <div className="flex items-center justify-center p-4 text-sm text-gray-500">
          Loading permissions...
        </div>
      ) : (
        <>
          {isButtonVisible('main details') && (
            <SidebarButton
              icon={FileText}
              label="Main Details"
              onClick={() => selectView('main-details')}
              active={view === 'main-details'}
            />
          )}

          {isButtonVisible('terminal details') && (
            <SidebarButton
              icon={Building2}
              label="Terminal Details"
              onClick={() => selectView('terminal-details')}
              active={view === 'terminal-details'}
            />
          )}

          {isButtonVisible('load control details') && (
            <SidebarButton
              icon={Scale}
              label="Load Control Details"
              onClick={() => selectView('load-control-details')}
              active={view === 'load-control-details'}
            />
          )}

          {hasAnyRampAccess() && (
            <div>
              <button
                type="button"
                onClick={() => setRampExpanded((e) => !e)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-500" />
                  Ramp
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${rampExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence>
                {rampExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-6 space-y-0.5"
                  >
                    {isRampButtonVisible('ramp details') && (
                      <SidebarButton
                        icon={ChevronRight}
                        label="Ramp details"
                        sub
                        onClick={() => selectView('ramp-details')}
                        active={view === 'ramp-details'}
                      />
                    )}

                    {isRampButtonVisible('duty allocation') && (
                      <SidebarButton
                        icon={ChevronRight}
                        label="Duty allocation"
                        sub
                        onClick={() => selectView('duty-allocation')}
                        active={view === 'duty-allocation'}
                      />
                    )}

                    {isRampButtonVisible('ramp duty allocation') && (
                      <SidebarButton
                        icon={ChevronRight}
                        label="Ramp duty allocation report"
                        sub
                        onClick={() => selectView('ramp-duty-report')}
                        active={view === 'ramp-duty-report'}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {isButtonVisible('remarks') && (
            <SidebarButton
              icon={MessageSquare}
              label="Remarks"
              onClick={() => selectView('remarks')}
              active={view === 'remarks'}
            />
          )}

          {isButtonVisible('equipment/manpower') && (
            <SidebarButton
              icon={Users}
              label="Equipment/Manpower"
              onClick={() => selectView('equipment-manpower')}
              active={view === 'equipment-manpower'}
            />
          )}

          {isButtonVisible('cleaning services') && (
            <SidebarButton
              icon={Sparkles}
              label="Cleaning Services"
              onClick={() => selectView('cleaning-services')}
              active={view === 'cleaning-services'}
            />
          )}

          {isButtonVisible('reports') && (
            <SidebarButton
              icon={BarChart3}
              label="Reports"
              onClick={() => selectView('reports')}
              active={view === 'reports'}
            />
          )}

          {isButtonVisible('attachments') && (
            <SidebarButton
              icon={Paperclip}
              label="Attachments"
              onClick={() => selectView('attachements')}
              active={view === 'attachements'}
            />
          )}
        </>
      )}
    </>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop – below navbar so navbar stays visible */}
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
          {/* Panel – full width below navbar */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="flight-details-sidebar-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            className="fixed left-0 right-0 bottom-0 z-50 flex w-full flex-col overflow-hidden bg-white shadow-xl nav-desktop:flex-row"
            style={{
              top: NAVBAR_OFFSET,
              height: `calc(100dvh - ${NAVBAR_OFFSET})`,
            }}
          >
            <AnimatePresence>
              {isCompactViewport && mobileNavOpen ? (
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 z-10 bg-slate-900/25 nav-desktop:hidden"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close section menu"
                />
              ) : null}
            </AnimatePresence>

            <div
              className={cn(
                'absolute inset-y-0 left-0 z-20 flex w-[min(18rem,88vw)] max-w-full flex-col border-r border-gray-200 bg-gray-50 shadow-xl transition-transform duration-300 ease-out',
                'nav-desktop:relative nav-desktop:z-auto nav-desktop:w-56 nav-desktop:shrink-0 nav-desktop:translate-x-0 nav-desktop:shadow-none',
                mobileNavOpen ? 'translate-x-0' : '-translate-x-full nav-desktop:translate-x-0',
              )}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-3">
                <div className="min-w-0">
                  <h3
                    id="flight-details-sidebar-title"
                    className="truncate text-sm font-semibold text-gray-900"
                  >
                    Sl. No. {displaySerial}
                  </h3>
                  <p className="truncate text-xs text-gray-500">{flightSubtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isCompactViewport && mobileNavOpen) {
                      setMobileNavOpen(false);
                      return;
                    }
                    handleClose();
                  }}
                  className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-200"
                  aria-label={isCompactViewport && mobileNavOpen ? 'Close section menu' : 'Close flight details'}
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <nav
                className="flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] touch-pan-y"
                aria-label="Flight detail sections"
              >
                {renderNavButtons()}
              </nav>
            </div>

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 nav-desktop:hidden">
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
                    Sl. No. {displaySerial}
                  </p>
                  <p className="truncate text-xs text-gray-500">{flightSubtitle}</p>
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

              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain touch-pan-y">
              {view === 'main-details' &&
                (isRaf ? (
                  <RafMainDetailsForm
                    key={flight.slNo}
                    flight={flight}
                    mainDetails={mainDetails}
                    onMainDetailsLoaded={onMainDetailsLoaded}
                  />
                ) : (
                  <MainDetailsForm
                    key={flight.slNo}
                    flight={flight}
                    onBack={() => {}}
                    showBackButton={false}
                    onMainDetailsLoaded={onMainDetailsLoaded}
                    onCancelledChange={(cancelled) =>
                      onFlightCancelledChange?.(String(flight.slNo ?? ''), cancelled)
                    }
                    onFhrLocksMayHaveChanged={onEquipmentGsdSaved}
                  />
                ))}
              {!isRaf && view === 'terminal-details' && (
                <TerminalDetailsForm
                  flight={flight}
                  showBackButton={false}
                  mainDetails={mainDetails}
                  onFhrLocksMayHaveChanged={onEquipmentGsdSaved}
                />
              )}
              {!isRaf && view === 'load-control-details' && (
                <LoadControlDetailsForm
                  flight={flight}
                  mainDetails={mainDetails}
                  onFhrLocksMayHaveChanged={onEquipmentGsdSaved}
                />
              )}
              {!isRaf && view === 'ramp-details' && (
                <RampDetailsForm
                  flight={flight}
                  mainDetails={mainDetails}
                  onFhrLocksMayHaveChanged={onEquipmentGsdSaved}
                />
              )}
              {!isRaf && view === 'duty-allocation' && (
                <DutyAllocationForm flight={flight} onBack={handleClose} mainDetails={mainDetails} />
              )}
              {!isRaf && view === 'ramp-duty-report' && (
                <RampDutyAllocationReport flight={rampDetails3Data} flightRow={flight} mainDetails={mainDetails} />
              )}
              {!isRaf && view === 'remarks' && (
                <RemarksForm flight={flight} mainDetails={mainDetails} />
              )}
              {!isRaf && view === 'equipment-manpower' && (
                <EquipmentManpowerForm
                  flight={flight}
                  onBack={handleClose}
                  mainDetails={mainDetails}
                  onGsdLockStateSaved={(slNo) => onEquipmentGsdSaved?.(slNo)}
                />
              )}
              {view === 'reports' && (
                <ReportsForm flight={flight} mainDetails={mainDetails} />
              )}
              {view === 'attachements' && (
                <AttachmentsForm
                  flight={flight}
                  fhrNo={
                    flight.destination != null && flight.slNo != null
                      ? `${String(flight.destination).trim()}/${flight.slNo}`
                      : flight.flightNo ?? ''
                  }
                  showBackButton={false}
                  mainDetails={mainDetails}
                />
              )}
              {view === 'cleaning-services' && (
                <RafCleaningServicesForm
                  key={`${flight.slNo}-cleaning-${initialCleaningKind ?? 'default'}`}
                  flight={flight}
                  mainDetails={mainDetails}
                  cleaningFlags={
                    cleaningFlags ??
                    (isRaf
                      ? {
                          deepCleaning: true,
                          nightHaltCleaning: true,
                          exteriorCleaning: true,
                        }
                      : undefined)
                  }
                  initialKind={initialCleaningKind}
                />
              )}
              {view === 'not-exported-raf' && (
                <RafNotExportedForm
                  flight={flight}
                  mainDetails={mainDetails}
                  onStatusChange={onRafExportStatusChange}
                />
              )}
              {view !== 'main-details' &&
                view !== 'terminal-details' &&
                view !== 'load-control-details' &&
                view !== 'ramp-details' &&
                view !== 'duty-allocation' &&
                view !== 'ramp-duty-report' &&
                view !== 'remarks' &&
                view !== 'equipment-manpower' &&
                view !== 'reports' &&
                view !== 'attachements' &&
                view !== 'cleaning-services' &&
                view !== 'not-exported-raf' && (
                <div className="flex-1 flex items-center justify-center p-8">
                  {view === 'menu' ? (
                    <div className="text-center">
                      <p className="text-gray-600 text-lg font-medium mb-2">No Accessible Sections</p>
                      <p className="text-gray-500 text-sm">You don't have permission to view any flight details sections.</p>
                      <p className="text-gray-500 text-sm mt-1">Please contact your administrator for access.</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Content coming soon</p>
                  )}
                </div>
              )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
