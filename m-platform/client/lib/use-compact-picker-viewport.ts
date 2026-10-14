'use client';

import { useSyncExternalStore } from 'react';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const WIDE_VIEWPORT_QUERY = '(min-width: 1024px)';
const TALL_VIEWPORT_QUERY = '(min-height: 500px)';

const MEDIA_QUERIES = [FINE_POINTER_QUERY, WIDE_VIEWPORT_QUERY, TALL_VIEWPORT_QUERY];

/**
 * Bottom-sheet pickers for touch phones, tablets (including landscape), and narrow viewports.
 * Anchored popovers only on large screens with a fine pointer (mouse/trackpad).
 */
function prefersCompactPicker(): boolean {
  const fineDesktop =
    window.matchMedia(FINE_POINTER_QUERY).matches &&
    window.matchMedia(WIDE_VIEWPORT_QUERY).matches &&
    window.matchMedia(TALL_VIEWPORT_QUERY).matches;
  return !fineDesktop;
}

function subscribe(onChange: () => void) {
  const mqs = MEDIA_QUERIES.map((query) => window.matchMedia(query));
  mqs.forEach((mq) => mq.addEventListener('change', onChange));
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    mqs.forEach((mq) => mq.removeEventListener('change', onChange));
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

function getSnapshot(): boolean {
  return prefersCompactPicker();
}

function getServerSnapshot(): boolean {
  // Mobile / touch-first default — registration is used heavily on phones & tablets.
  return true;
}

/** True when pickers should use a full-width bottom sheet instead of a floating popover. */
export function useCompactPickerViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const COMPACT_PICKER_BACKDROP_CLASS =
  'pointer-events-auto fixed inset-0 z-[10049] bg-slate-900/30 backdrop-blur-[2px]';

export const COMPACT_PICKER_SHEET_BASE_CLASS =
  'fixed inset-x-0 bottom-0 z-[10050] mx-auto w-full max-h-[min(88dvh,calc(100dvh-3.5rem))] overflow-y-auto overscroll-y-contain touch-pan-y rounded-t-2xl border-t border-[var(--dash-border-subtle)] bg-[var(--dash-card)] text-[var(--dash-text)] shadow-[0_-12px_40px_-8px_rgba(15,23,42,0.28)] pb-[max(0.75rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pointer-events-auto';

function getHoverCapableSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(FINE_POINTER_QUERY).matches;
}

function getHoverCapableServerSnapshot(): boolean {
  return false;
}

/** True when the device has a fine pointer and supports hover (mouse/trackpad). */
export function useHoverCapable(): boolean {
  return useSyncExternalStore(subscribe, getHoverCapableSnapshot, getHoverCapableServerSnapshot);
}

export function clampPopoverPosition({
  triggerRect,
  panelWidth,
  panelHeight,
  margin = 8,
  navbarHeight = 48,
}: {
  triggerRect: DOMRect;
  panelWidth: number;
  panelHeight: number;
  margin?: number;
  navbarHeight?: number;
}): { top: number; left: number; openUpward: boolean } {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const spaceBelow = viewportH - triggerRect.bottom - margin;
  const spaceAbove = triggerRect.top - navbarHeight - margin;
  const openUpward = spaceBelow < panelHeight && spaceAbove > spaceBelow;

  let top = openUpward
    ? triggerRect.top - panelHeight - margin
    : triggerRect.bottom + margin;
  top = Math.max(navbarHeight, Math.min(top, viewportH - panelHeight - margin));

  let left = triggerRect.left;
  if (left + panelWidth > viewportW - margin) {
    left = Math.max(margin, viewportW - panelWidth - margin);
  }

  return { top, left, openUpward };
}
