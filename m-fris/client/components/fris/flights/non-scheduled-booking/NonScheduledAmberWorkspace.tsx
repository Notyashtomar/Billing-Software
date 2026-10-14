'use client';

import type { ElementType, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FrisSectionNavDual } from '@/components/fris/layout/FrisSectionNav';
import type { FrisSectionNavItem } from '@/lib/fris-responsive-nav';
import { cn } from '@/lib/utils';
import {
  BOOKING_PAGE_BODY,
  BOOKING_PAGE_SHELL,
  BOOKING_SCROLL_AREA,
} from './bookingPageLayout';

type NonScheduledAmberWorkspaceProps<T extends string> = {
  pageTitle: string;
  pageIcon: ElementType<{ className?: string }>;
  pageSubtitle?: string;
  sections: FrisSectionNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  menuId: string;
  ariaLabel: string;
  activeSectionLabel: string;
  sectionSubtitle?: string;
  showSectionHeader?: boolean;
  hidePageHeader?: boolean;
  /** Booking form: no white card shell — form sits directly in the scroll area. */
  plainContent?: boolean;
  contentClassName?: string;
  children: ReactNode;
};

export function NonScheduledAmberWorkspace<T extends string>({
  pageTitle,
  pageIcon: PageIcon,
  pageSubtitle,
  sections,
  activeId,
  onSelect,
  menuId,
  ariaLabel,
  activeSectionLabel,
  sectionSubtitle,
  showSectionHeader = false,
  hidePageHeader = false,
  plainContent = false,
  contentClassName,
  children,
}: NonScheduledAmberWorkspaceProps<T>) {
  return (
    <div className={BOOKING_PAGE_SHELL}>
      {hidePageHeader ? null : (
        <header className="shrink-0 border-b border-amber-100/80 bg-white/90 px-3 py-3.5 shadow-sm backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25 sm:h-11 sm:w-11">
              <PageIcon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg md:text-xl">
                {pageTitle}
              </h1>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {pageSubtitle ?? activeSectionLabel}
              </p>
            </div>
          </div>
        </header>
      )}

      <div className={BOOKING_PAGE_BODY}>
        <FrisSectionNavDual
          sections={sections}
          activeId={activeId}
          onSelect={onSelect}
          ariaLabel={ariaLabel}
          defaultAccent="amber"
          desktopVariant="sidebar"
          menuId={menuId}
          mobileClassName="shrink-0 rounded-2xl border border-amber-100 bg-white/90 p-2.5 shadow-lg shadow-amber-100/40 ring-1 ring-amber-50 backdrop-blur-sm sm:p-3"
          desktopClassName="nav-desktop:max-h-full"
        />

        {plainContent ? (
          <div className={cn(BOOKING_SCROLL_AREA, contentClassName)}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-amber-100/80 bg-white shadow-sm',
            )}
          >
            {showSectionHeader && sectionSubtitle ? (
              <div className="shrink-0 border-b border-amber-50 bg-amber-50/40 px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                  {activeSectionLabel}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{sectionSubtitle}</p>
              </div>
            ) : null}

            <div className={cn(BOOKING_SCROLL_AREA, contentClassName ?? 'p-4 sm:p-5 md:p-6')}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
