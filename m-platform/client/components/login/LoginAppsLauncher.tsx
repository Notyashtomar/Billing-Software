'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import LoginAppsGrid, {
  filterLoginAppGroupsByAccess,
  LOGIN_APP_GROUPS,
  type LoginAppGroup,
  LoginAppsCategoryNav,
} from '@/components/login/LoginAppsGrid';
import { hasConfiguredAppAccess } from '@/lib/bwms-app-page-catalog';
import { FRIS_SESSION_UPDATED_EVENT } from '@/lib/fris-session';
import { buildLandingMapSelectUrl } from '@/lib/login-station';

/** Strong ease-out — snappy start, soft settle (Emil / Linear) */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const PANEL_SPRING = { type: 'spring' as const, stiffness: 340, damping: 32, mass: 0.9 };
const BACKDROP_MS = 0.22;

function NineDotsIcon({ className }: { className?: string }) {
  return (
    <span className={`grid grid-cols-3 gap-[3.5px] ${className ?? ''}`} aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="h-[3.5px] w-[3.5px] rounded-full bg-current" />
      ))}
    </span>
  );
}

function resolveInitialAppsGroupId(preferred?: string, groups?: LoginAppGroup[]): string {
  const filtered = groups ?? filterLoginAppGroupsByAccess();
  // Only fall back to full catalog when no grant payload exists (pre-login discovery).
  const source =
    filtered.length > 0
      ? filtered
      : hasConfiguredAppAccess()
        ? filtered
        : LOGIN_APP_GROUPS;
  if (preferred && source.some((g) => g.id === preferred)) return preferred;
  return source[0]?.id ?? LOGIN_APP_GROUPS[0]!.id;
}

export default function LoginAppsLauncher() {
  const searchParams = useSearchParams();
  const openAppsFromQuery = searchParams.get('apps') === '1';
  const appsGroupFromQuery = searchParams.get('appsGroup')?.trim() || '';
  const [open, setOpen] = useState(openAppsFromQuery);
  const [mounted, setMounted] = useState(false);
  const [activeId, setActiveId] = useState(() =>
    resolveInitialAppsGroupId(appsGroupFromQuery),
  );
  /** Bump when session grants change so category/grid re-filter. */
  const [accessEpoch, setAccessEpoch] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const panelId = useId();
  const reduceMotion = useReducedMotion();
  const visibleGroups = useMemo(() => filterLoginAppGroupsByAccess(), [accessEpoch]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (openAppsFromQuery) setOpen(true);
  }, [openAppsFromQuery]);

  useEffect(() => {
    const refresh = () => setAccessEpoch((n) => n + 1);
    window.addEventListener(FRIS_SESSION_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(FRIS_SESSION_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (appsGroupFromQuery) {
      setActiveId(resolveInitialAppsGroupId(appsGroupFromQuery, visibleGroups));
    }
  }, [appsGroupFromQuery, visibleGroups]);

  // Keep active category inside the filtered set (e.g. only Finance after Billing login).
  useEffect(() => {
    if (!open) return;
    if (visibleGroups.length === 0) return;
    if (!visibleGroups.some((g) => g.id === activeId)) {
      setActiveId(visibleGroups[0]!.id);
      setSwipeDirection(1);
    }
  }, [open, activeId, visibleGroups]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => backRef.current?.focus(), 50);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
      triggerRef.current?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  const openApps = useCallback(() => {
    setAccessEpoch((n) => n + 1);
    setActiveId(resolveInitialAppsGroupId(appsGroupFromQuery, visibleGroups));
    setOpen(true);
  }, [appsGroupFromQuery, visibleGroups]);

  const handleCategorySelect = useCallback(
    (groupId: string) => {
      if (groupId === activeId) return;
      const source = visibleGroups.length > 0 ? visibleGroups : LOGIN_APP_GROUPS;
      const prev = source.findIndex((g) => g.id === activeId);
      const next = source.findIndex((g) => g.id === groupId);
      setSwipeDirection(next > prev ? 1 : -1);
      setActiveId(groupId);
    },
    [activeId, visibleGroups],
  );

  const handleActiveIdChange = useCallback((groupId: string, direction: number) => {
    setSwipeDirection(direction);
    setActiveId(groupId);
  }, []);

  const page =
    mounted &&
    createPortal(
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[90]" key="apps-page-root">
            <motion.button
              type="button"
              aria-label="Dismiss apps page"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: BACKDROP_MS, ease: 'easeOut' }}
              onClick={close}
              className="absolute inset-0 transform-gpu bg-slate-900/20 backdrop-blur-[2px]"
            />

            <motion.div
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.98, y: 16 }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.98, y: 16 }
              }
              transition={
                reduceMotion
                  ? { duration: 0.12, ease: 'easeOut' }
                  : PANEL_SPRING
              }
              className="absolute inset-0 flex transform-gpu flex-col overflow-hidden border border-slate-200/80 bg-slate-50/90 shadow-2xl backdrop-blur-xl"
              style={{
                backgroundImage: `
                  radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16, 185, 129, 0.08), transparent 55%),
                  radial-gradient(ellipse 50% 40% at 100% 15%, rgba(14, 165, 233, 0.06), transparent 50%),
                  radial-gradient(ellipse 45% 35% at 0% 90%, rgba(148, 163, 184, 0.08), transparent 50%),
                  linear-gradient(165deg, rgba(248,250,252,0.95) 0%, rgba(241,245,249,0.92) 55%, rgba(248,250,252,0.95) 100%)
                `,
              }}
            >
              {/* Navbar: logo · title · back */}
              <header className="relative z-10 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3 md:px-6">
                <div className="flex min-w-0 items-center">
                  <Link
                    href={buildLandingMapSelectUrl()}
                    className="rounded-lg transition hover:opacity-90 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                    aria-label="Back to station map"
                    title="Station map"
                  >
                    <Image
                      src="/bird%20group.png"
                      alt="Bird Group"
                      width={160}
                      height={50}
                      priority
                      className="h-8 w-auto object-contain sm:h-10"
                    />
                  </Link>
                </div>

                <div className="min-w-0 px-1 text-center sm:px-2">
                  <h2
                    id={titleId}
                    className="truncate text-balance bg-gradient-to-r from-slate-900 via-emerald-800 to-slate-900 bg-clip-text text-lg font-extrabold tracking-wide text-transparent sm:text-xl md:text-2xl lg:text-3xl"
                  >
                    BIRD WORKFORCE MANAGEMENT SYSTEM
                  </h2>
                  <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-wider text-emerald-600 opacity-90 sm:text-sm">
                    Enterprise Aviation Operational Suite
                  </p>
                </div>

                <button
                  ref={backRef}
                  type="button"
                  aria-label="Close apps"
                  onClick={close}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-300/80 bg-white/80 px-3.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md transition-[border-color,background-color,transform,color] duration-150 ease-out hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.97]"
                >
                  <ArrowLeft className="hidden h-4 w-4 min-[360px]:inline" aria-hidden />
                  <X className="h-4 w-4 min-[360px]:hidden" aria-hidden />
                  <span className="hidden min-[360px]:inline">Back</span>
                </button>
              </header>

              {/* Category tabs */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT, delay: 0.04 }}
                className="relative z-10 flex shrink-0 justify-center px-3 pb-2 sm:px-5 sm:pb-3 md:px-6"
              >
                <LoginAppsCategoryNav
                  key={`nav-${accessEpoch}`}
                  activeId={activeId}
                  onSelect={handleCategorySelect}
                  groups={visibleGroups}
                  className="max-w-4xl"
                />
              </motion.div>

              {/* Tile grid */}
              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-3 sm:px-4 sm:pb-4 md:px-5 lg:px-6">
                <LoginAppsGrid
                  key={`grid-${accessEpoch}`}
                  activeId={activeId}
                  swipeDirection={swipeDirection}
                  onActiveIdChange={handleActiveIdChange}
                  visibleGroups={visibleGroups}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body,
    );

  return (
    <>
      <div className="fixed right-4 top-4 z-30 sm:right-6 sm:top-5">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Open apps page"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={openApps}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/50 text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-[border-color,background-color,transform,color] duration-200 hover:border-emerald-400/45 hover:bg-black/65 hover:text-emerald-300 active:scale-[0.97]"
        >
          <NineDotsIcon />
        </button>
      </div>
      {page}
    </>
  );
}
