'use client';

import React, { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { isFrisAdminLikeSession } from '@/lib/fris-session';
import { fetchFrisCreationSectionRedirect } from '@/lib/fris-navigation';
import {
  CREATION_SECTION_PERMISSION_LABEL,
  isPanelEmployeeSession,
  isSubPageAllowed,
} from '@/lib/nav-permissions';
import { useFrisNavFlags } from '@/lib/use-fris-nav-flags';
import type { FrisSectionNavItem } from '@/lib/fris-responsive-nav';
import { Plane, CalendarPlus, Shield, type LucideIcon } from 'lucide-react';
import { AdvanceCardGrid } from '@/components/fris/advance/AdvanceCardGrid';
import { AdvanceSectionChrome } from '@/components/fris/advance/AdvanceSectionChrome';
import ScheduledAirlinesForm from '@/components/fris/creation/ScheduledAirlinesForm';
import AdditionalFlightsForm from '@/components/fris/creation/AdditionalFlightsForm';
import RAFForm from '@/components/fris/creation/RAFForm';

type CreationSection = 'scheduled-airlines' | 'additional-flights' | 'raf';

const SECTION_CARDS: FrisSectionNavItem<CreationSection>[] = [
  {
    id: 'scheduled-airlines',
    label: 'Scheduled Airlines',
    icon: Plane,
    description: 'Schedule flight reports',
  },
  {
    id: 'additional-flights',
    label: 'Additional Flights',
    icon: CalendarPlus,
    description: 'Diverted & extra flights',
  },
  {
    id: 'raf',
    label: 'RAF',
    icon: Shield,
    description: 'Ramp assistance form',
  },
];

const SECTION_IDS = new Set<CreationSection>(SECTION_CARDS.map((b) => b.id));

function isCreationSection(value: string | null): value is CreationSection {
  return !!value && SECTION_IDS.has(value as CreationSection);
}

function buildCreationHref(section?: CreationSection): string {
  if (!section) return '/fris/creation';
  return `/fris/creation?section=${section}`;
}

function CreationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userNavFlags = useFrisNavFlags();

  const visibleSections = useMemo(() => {
    if (typeof window === 'undefined') return [];
    if (isFrisAdminLikeSession()) return SECTION_CARDS;
    if (!isPanelEmployeeSession()) return [];
    const flags = userNavFlags;
    if (!flags) return [];
    return SECTION_CARDS.filter((section) =>
      isSubPageAllowed(
        flags,
        'creation',
        CREATION_SECTION_PERMISSION_LABEL[section.id] ?? section.label,
      ),
    );
  }, [userNavFlags]);

  const sectionParam = searchParams.get('section');

  const activeSection: CreationSection | null = useMemo(() => {
    if (!isCreationSection(sectionParam)) return null;
    if (!visibleSections.some((s) => s.id === sectionParam)) return null;
    return sectionParam;
  }, [sectionParam, visibleSections]);

  const goToHref = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleOpenSection = useCallback(
    async (id: string) => {
      if (!isCreationSection(id)) return;
      try {
        const redirectPath = await fetchFrisCreationSectionRedirect(id);
        goToHref(redirectPath.includes('section=') ? redirectPath : buildCreationHref(id));
      } catch {
        goToHref(buildCreationHref(id));
      }
    },
    [goToHref],
  );

  const handleBackToHub = useCallback(() => {
    goToHref(buildCreationHref());
  }, [goToHref]);

  const activeSectionMeta = useMemo(
    () => (activeSection ? visibleSections.find((s) => s.id === activeSection) : undefined),
    [visibleSections, activeSection],
  );

  const renderForm = () => {
    switch (activeSection) {
      case 'scheduled-airlines':
        return <ScheduledAirlinesForm />;
      case 'additional-flights':
        return <AdditionalFlightsForm />;
      case 'raf':
        return <RAFForm />;
      default:
        return null;
    }
  };

  if (visibleSections.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-600">
        <p className="text-lg font-medium">No Creation sections are assigned to your account.</p>
        <p className="mt-2 text-sm text-slate-500">Contact your administrator to request access.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <div className="mx-auto w-full p-3 sm:p-4 md:p-6">
        {!activeSection && (
          <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
            <header className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl md:text-3xl">
                Creation
              </h1>
              <p className="text-sm text-slate-500 sm:text-base">
                Choose a form to create scheduled, additional, or RAF flights.
              </p>
            </header>
            <AdvanceCardGrid
              items={visibleSections.map((s) => ({
                id: s.id,
                label: s.label,
                icon: s.icon as unknown as LucideIcon,
                description: s.description,
              }))}
              onSelect={(id) => void handleOpenSection(id)}
              ariaLabel="Creation sections"
              columnsClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            />
          </div>
        )}

        {activeSection && (
          <AdvanceSectionChrome
            title={activeSectionMeta?.label ?? 'Creation'}
            description={activeSectionMeta?.description}
            backLabel="Back to Creation"
            onBack={handleBackToHub}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {renderForm()}
              </motion.div>
            </AnimatePresence>
          </AdvanceSectionChrome>
        )}
      </div>
    </div>
  );
}

export default function CreationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] bg-gradient-to-br from-slate-50 via-white to-emerald-50/30" />
      }
    >
      <CreationPageContent />
    </Suspense>
  );
}
