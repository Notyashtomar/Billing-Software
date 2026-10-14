'use client';

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import { fetchFrisAdvanceTabRedirect } from '@/lib/fris-navigation';
import {
  ADVANCE_TAB_PERMISSION_LABEL,
  isPanelEmployeeSession,
  isSubPageAllowed,
} from '@/lib/nav-permissions';
import { useFrisNavFlags } from '@/lib/use-fris-nav-flags';
import {
  ADVANCE_TABS,
  buildAdvanceHref,
  CARGO_SECTIONS,
  GATEWAY_SECTIONS,
  getAdvanceTabMeta,
  getCargoSectionMeta,
  getInvoicingSectionMeta,
  INVOICING_SECTIONS,
  isAdvanceTabId,
  type AdvanceTabId,
  type CargoSectionId,
  type GatewaySectionId,
  type InvoicingSectionId,
} from '@/lib/advance-nav-config';
import { AdvanceCardGrid } from '@/components/fris/advance/AdvanceCardGrid';
import { AdvanceSectionChrome } from '@/components/fris/advance/AdvanceSectionChrome';
import { AdvanceCargoProvider } from '@/components/fris/advance/cargo/AdvanceCargoContext';
import { CARGO_HIDDEN_SCROLL } from '@/components/fris/advance/cargo/cargoFormStyles';
import {
  createDefaultInvoicingFilter,
  dataModeLabel,
  dateBasisLabel,
  type InvoicingFilterState,
} from '@/components/fris/advance/invoicing/invoicing-filter.types';
import type { ScheduledFlightDataRow } from '@/components/fris/advance/invoicing/scheduled-flight-data-columns';
import {
  exportInvoicingFlightsToNav,
  fetchInvoicingScheduledFlightData,
} from '@/lib/invoicing-api';
import { TestingGatewayBanner } from '@/components/fris/advance/GatewayStationMark';
import { FrisSectionNavDual } from '@/components/fris/layout/FrisSectionNav';
import { PageLoading } from '@/components/ui/PageLoading';

/** Consistent outer card so every Advance tab matches the Gateway/Cargo bordered shell. */
const ADVANCE_PANEL_CARD =
  'rounded-xl border border-gray-200 bg-white p-4 shadow-sm';

const ScheduledAirlinesPage = dynamic(
  () => import('@/components/fris/advance/ScheduledAirlinesPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AirlinePage = dynamic(
  () => import('@/components/fris/advance/AirlinePage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AircraftPage = dynamic(
  () => import('@/components/fris/advance/AircraftPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const EquipmentManpowerPage = dynamic(
  () => import('@/components/fris/advance/EquipmentManpowerPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const ManpowerPage = dynamic(
  () => import('@/components/fris/advance/ManpowerPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const StaffPage = dynamic(
  () => import('@/components/fris/advance/StaffPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const ContactPage = dynamic(
  () => import('@/components/fris/advance/ContactPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AirlineLogoPage = dynamic(
  () => import('@/components/fris/advance/AirlineLogoPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const RafAirlinePage = dynamic(
  () => import('@/components/fris/advance/RafAirlinePage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const NonScheduledAirlinePage = dynamic(
  () => import('@/components/fris/advance/NonScheduledAirlinePage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const TerminalPage = dynamic(
  () => import('@/components/fris/advance/TerminalPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const OtherServicesPage = dynamic(
  () => import('@/components/fris/advance/OtherServicesPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AircraftRegistrationPage = dynamic(
  () => import('@/components/fris/advance/AircraftRegistrationPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const DcsMasterPage = dynamic(
  () => import('@/components/fris/advance/DcsMasterPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AmsServicesPage = dynamic(
  () => import('@/components/fris/advance/AmsServicesPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const ScheduleSetupPage = dynamic(
  () => import('@/components/fris/advance/ScheduleSetupPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const ScheduleEquipmentSetupPage = dynamic(
  () => import('@/components/fris/advance/ScheduleEquipmentSetupPage'),
  { ssr: false, loading: () => <PageLoading /> },
);
const GhRepresentativeForm = dynamic(
  () => import('@/components/fris/advance/GhRepresentativeForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const AlertSetupForm = dynamic(
  () => import('@/components/fris/advance/AlertSetupForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const CargoAirlineForm = dynamic(
  () => import('@/components/fris/advance/cargo/CargoAirlineForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const CargoScheduledForm = dynamic(
  () => import('@/components/fris/advance/cargo/CargoScheduledForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const CargoServicesForm = dynamic(
  () => import('@/components/fris/advance/cargo/CargoServicesForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const CargoFlightCreationForm = dynamic(
  () => import('@/components/fris/advance/cargo/CargoFlightCreationForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const CargoUnitMasterForm = dynamic(
  () => import('@/components/fris/advance/cargo/CargoUnitMasterForm'),
  { ssr: false, loading: () => <PageLoading /> },
);
const InvoicingSectionPage = dynamic(
  () => import('@/components/fris/advance/invoicing/InvoicingSectionPage'),
  { ssr: false, loading: () => <PageLoading /> },
);

function GatewayPanel() {
  const [activeSection, setActiveSection] = useState<GatewaySectionId>('scheduled-airlines');

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <TestingGatewayBanner />
      <div className="flex min-h-0 flex-col gap-3 nav-desktop:flex-row nav-desktop:gap-4">
      <FrisSectionNavDual
        sections={GATEWAY_SECTIONS}
        activeId={activeSection}
        onSelect={setActiveSection}
        ariaLabel="Gateway sections"
        desktopVariant="sidebar"
        mobileClassName="shrink-0 rounded-2xl border border-gray-100 bg-white/80 p-3 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100 backdrop-blur-sm"
      />

      <main className="flex min-h-[min(40rem,calc(100dvh-12rem))] max-h-[calc(100dvh-8rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm nav-desktop:min-h-[40rem]">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4">
          {activeSection === 'scheduled-airlines' && <ScheduledAirlinesPage />}
          {activeSection === 'airline' && <AirlinePage />}
          {activeSection === 'aircraft' && <AircraftPage />}
          {activeSection === 'equipment-manpower' && <EquipmentManpowerPage />}
          {activeSection === 'manpower' && <ManpowerPage />}
          {activeSection === 'staff' && <StaffPage />}
          {activeSection === 'contact' && <ContactPage />}
          {activeSection === 'airline-logo' && <AirlineLogoPage />}
          {activeSection === 'raf-airline' && <RafAirlinePage />}
          {activeSection === 'non-scheduled-airline' && <NonScheduledAirlinePage />}
          {activeSection === 'terminal' && <TerminalPage />}
          {activeSection === 'other-services' && <OtherServicesPage />}
          {activeSection === 'aircraft-registration' && <AircraftRegistrationPage />}
          {activeSection === 'dcs-master' && <DcsMasterPage />}
          {activeSection === 'ams-services' && <AmsServicesPage />}
        </div>
      </main>
      </div>
    </div>
  );
}

function InvoicingPanel() {
  const [activeSection, setActiveSection] =
    useState<InvoicingSectionId>('scheduled-flight-data');
  const [filter, setFilter] = useState<InvoicingFilterState>(createDefaultInvoicingFilter);
  const [searching, setSearching] = useState(false);
  const [exportingNav, setExportingNav] = useState(false);
  const [flightReportRows, setFlightReportRows] = useState<ScheduledFlightDataRow[]>([]);
  const [exportChoice, setExportChoice] = useState<'yes' | 'no'>('no');
  const [searchedSections, setSearchedSections] = useState<
    Partial<Record<InvoicingSectionId, boolean>>
  >({});

  const activeLabel = getInvoicingSectionMeta(activeSection)?.label ?? activeSection;

  const handleFindInvoice = async () => {
    setSearching(true);
    setExportChoice('no');
    try {
      if (activeSection === 'scheduled-flight-data' && filter.dataMode === 'flight-report') {
        const rows = await fetchInvoicingScheduledFlightData({
          from: filter.fromDate,
          to: filter.toDate,
          dateBasis: filter.dateBasis,
          dataMode: filter.dataMode,
        });
        setFlightReportRows(rows);
        setSearchedSections((prev) => ({ ...prev, [activeSection]: true }));
        toast.success(
          rows.length > 0
            ? `Loaded ${rows.length} flight(s) for ${dateBasisLabel(filter.dateBasis)}.`
            : 'No flights found for the selected date range.',
        );
      } else {
        setFlightReportRows([]);
        setSearchedSections((prev) => ({ ...prev, [activeSection]: true }));
        toast.message(`${activeLabel}: equipment/manpower invoicing view is not connected yet.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Find invoice failed');
      setFlightReportRows([]);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleRow = (serialNumber: string, selected: boolean) => {
    setFlightReportRows((prev) =>
      prev.map((row) =>
        String(row.serialNumber) === serialNumber ? { ...row, selectData: selected } : row,
      ),
    );
  };

  const handleToggleAll = (selected: boolean) => {
    setFlightReportRows((prev) => prev.map((row) => ({ ...row, selectData: selected })));
  };

  const handleExportNav = async () => {
    const serials = flightReportRows
      .filter((row) => row.selectData)
      .map((row) => String(row.serialNumber ?? '').trim())
      .filter(Boolean);
    if (serials.length === 0) {
      toast.error('Select at least one flight to export.');
      return;
    }
    setExportingNav(true);
    try {
      const result = await exportInvoicingFlightsToNav(serials);
      setFlightReportRows((prev) =>
        prev.map((row) => (row.selectData ? { ...row, exportedNav: 'Yes' } : row)),
      );
      if (result.failed > 0) {
        toast.warning(`Exported ${result.exported} flight(s); ${result.failed} failed.`);
      } else {
        toast.success(
          `Exported ${result.exported} flight(s). NAV column updated on Scheduled Airlines.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportingNav(false);
    }
  };

  const handleExportExcel = () => {
    const headers =
      filter.dataMode === 'flight-report'
        ? ['Serial No', 'Flight No', 'Airline', 'STA', 'STD', 'ATD', 'Exported Date']
        : ['Serial No', 'Flight No', 'Equipment', 'Manpower', 'ATD', 'Exported Date'];
    const csv = [headers.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSection}-${filter.dataMode}-${filter.fromDate}-to-${filter.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      `Export started for ${activeLabel} (${dataModeLabel(filter.dataMode)}, ${dateBasisLabel(filter.dateBasis)}).`,
    );
  };

  return (
    <div className="flex max-h-[calc(100dvh-11rem)] min-h-[16rem] w-full min-w-0 flex-col gap-3 overflow-hidden">
      <FrisSectionNavDual
        sections={INVOICING_SECTIONS}
        activeId={activeSection}
        onSelect={setActiveSection}
        ariaLabel="Invoicing sections"
        defaultAccent="amber"
        desktopVariant="grid"
        mobileClassName="shrink-0 rounded-xl border border-gray-100 bg-white p-3 shadow-sm"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <InvoicingSectionPage
          key={activeSection}
          sectionId={activeSection}
          sectionLabel={activeLabel}
          filter={filter}
          onFilterChange={setFilter}
          onFindInvoice={() => void handleFindInvoice()}
          onExportExcel={handleExportExcel}
          searching={searching}
          hasSearched={!!searchedSections[activeSection]}
          rows={flightReportRows}
          exportChoice={exportChoice}
          onExportChoiceChange={setExportChoice}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onExportNav={() => void handleExportNav()}
          exportingNav={exportingNav}
        />
      </div>
    </div>
  );
}

function CargoPanel() {
  const [activeSection, setActiveSection] = useState<CargoSectionId>('cargo-airline');
  const scheduledScrollShell = activeSection === 'scheduled';

  return (
    <AdvanceCargoProvider>
      <div
        className={`flex min-h-0 flex-col gap-3 nav-desktop:flex-row nav-desktop:gap-4 ${
          scheduledScrollShell ? 'max-h-[calc(100dvh-11rem)] min-h-[16rem] overflow-hidden' : ''
        }`}
      >
        <FrisSectionNavDual
          sections={CARGO_SECTIONS}
          activeId={activeSection}
          onSelect={setActiveSection}
          ariaLabel="Cargo sections"
          desktopVariant="sidebar"
          mobileClassName="shrink-0 rounded-2xl border border-gray-100 bg-white/80 p-3 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100 backdrop-blur-sm"
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="shrink-0 border-b border-gray-100 bg-gray-50/50 px-4 py-2.5">
            <h2 className="text-base font-semibold text-gray-900">
              {getCargoSectionMeta(activeSection)?.label ?? 'Cargo'}
            </h2>
          </div>
          <div
            className={
              scheduledScrollShell
                ? `min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 ${CARGO_HIDDEN_SCROLL}`
                : 'min-h-0 p-4'
            }
          >
            {activeSection === 'cargo-airline' && <CargoAirlineForm />}
            {activeSection === 'scheduled' && <CargoScheduledForm />}
            {activeSection === 'services' && <CargoServicesForm />}
            {activeSection === 'flight-creation' && <CargoFlightCreationForm />}
            {activeSection === 'unit-master' && <CargoUnitMasterForm />}
          </div>
        </main>
      </div>
    </AdvanceCargoProvider>
  );
}

function AdvancePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userNavFlags = useFrisNavFlags();

  const visibleTabs = useMemo(() => {
    if (typeof window === 'undefined') return [];
    if (isFrisAdminLikeSession()) return ADVANCE_TABS;
    if (!isPanelEmployeeSession()) return [];
    const flags = userNavFlags;
    if (!flags) return [];
    return ADVANCE_TABS.filter((tab) =>
      isSubPageAllowed(flags, 'advance', ADVANCE_TAB_PERMISSION_LABEL[tab.id] ?? tab.label),
    );
  }, [userNavFlags]);

  const tabParam = searchParams.get('tab');

  const activeTab: AdvanceTabId | null = useMemo(() => {
    if (!isAdvanceTabId(tabParam)) return null;
    if (!visibleTabs.some((t) => t.id === tabParam)) return null;
    return tabParam;
  }, [tabParam, visibleTabs]);

  const goToHref = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleOpenTab = useCallback(
    async (id: string) => {
      if (!isAdvanceTabId(id)) return;
      try {
        const redirectPath = await fetchFrisAdvanceTabRedirect(id);
        goToHref(redirectPath.includes('tab=') ? redirectPath : buildAdvanceHref(id));
      } catch {
        goToHref(buildAdvanceHref(id));
      }
    },
    [goToHref],
  );

  const handleBackToHub = useCallback(() => {
    goToHref(buildAdvanceHref());
  }, [goToHref]);

  if (visibleTabs.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">No Advance sections are assigned to your account.</p>
        <p className="mt-2 text-sm text-slate-500">Contact your administrator to request access.</p>
      </div>
    );
  }

  const activeTabMeta = activeTab ? getAdvanceTabMeta(activeTab) : undefined;

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div
        className={`mx-auto w-full p-3 sm:p-4 md:p-6 ${
          activeTab === 'invoicing' ? 'min-h-0' : 'min-h-[200px]'
        }`}
      >
        {!activeTab && (
          <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
            <header className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl md:text-3xl">
                Advance
              </h1>
              <p className="text-sm text-slate-500 sm:text-base">
                Choose a section to configure masters, schedules, cargo, or invoicing.
              </p>
            </header>
            <AdvanceCardGrid
              items={visibleTabs}
              onSelect={(id) => void handleOpenTab(id)}
              ariaLabel="Advance sections"
            />
          </div>
        )}

        {activeTab && (
          <AdvanceSectionChrome
            title={activeTabMeta?.label ?? 'Advance'}
            description={activeTabMeta?.description}
            backLabel="Back to Advance"
            onBack={handleBackToHub}
            contentClassName={activeTab === 'invoicing' ? 'min-h-0' : undefined}
          >
            {activeTab === 'gateway' && <GatewayPanel />}
            {activeTab === 'cargo' && <CargoPanel />}
            {activeTab === 'invoicing' && <InvoicingPanel />}
            {activeTab === 'schedule' && (
              <div className={ADVANCE_PANEL_CARD}>
                <ScheduleSetupPage />
              </div>
            )}
            {activeTab === 'schedule-equipment' && (
              <div className={ADVANCE_PANEL_CARD}>
                <ScheduleEquipmentSetupPage />
              </div>
            )}
            {activeTab === 'gh-representative' && (
              <div className={ADVANCE_PANEL_CARD}>
                <GhRepresentativeForm />
              </div>
            )}
            {activeTab === 'alert' && (
              <div className={ADVANCE_PANEL_CARD}>
                <AlertSetupForm />
              </div>
            )}
          </AdvanceSectionChrome>
        )}
      </div>
    </div>
  );
}

export default function AdvancePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdvancePageContent />
    </Suspense>
  );
}
