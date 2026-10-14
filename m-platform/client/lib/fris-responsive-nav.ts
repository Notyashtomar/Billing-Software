import type { ElementType } from 'react';

/** Hidden scrollbar chrome while keeping touch / wheel scroll (FRIS mobile nav). */
export const FRIS_HIDDEN_SCROLLBAR_CLASS =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

/**
 * Scrollable mobile section menu — fits below app navbar + page header.
 * Works in phone landscape (short viewport).
 */
export const FRIS_MOBILE_SECTION_MENU_OPEN_CLASS = `max-h-[min(calc(100dvh-7rem),28rem)] overflow-y-auto overscroll-y-contain touch-pan-y ${FRIS_HIDDEN_SCROLLBAR_CLASS}`;

export const FRIS_MOBILE_SECTION_MENU_CLOSED_CLASS =
  'max-h-0 overflow-hidden opacity-0 pointer-events-none';

export type FrisSectionAccent = 'emerald' | 'amber';

export type FrisSectionNavItem<T extends string = string> = {
  id: T;
  label: string;
  icon: ElementType<{ className?: string }>;
  description?: string;
  accent?: FrisSectionAccent;
};

export function frisSectionInlineButtonClass(
  accent: FrisSectionAccent,
  isActive: boolean,
): string {
  const base =
    'flex items-center gap-2 rounded-xl border-2 px-3.5 py-2 text-sm font-medium transition-colors duration-200 active:scale-[0.97]';

  if (accent === 'amber') {
    return isActive
      ? `${base} border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25`
      : `${base} border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/60 hover:text-amber-700`;
  }

  return isActive
    ? `${base} border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25`
    : `${base} border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700`;
}

export function frisSectionMenuItemClass(
  accent: FrisSectionAccent,
  isActive: boolean,
): string {
  const base =
    'flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-colors duration-200 active:scale-[0.99]';

  if (accent === 'amber') {
    return isActive
      ? `${base} border-2 border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25`
      : `${base} border border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/60`;
  }

  return isActive
    ? `${base} border-2 border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25`
    : `${base} border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50`;
}

export function frisSectionToggleButtonClass(accent: FrisSectionAccent): string {
  const base =
    'ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors active:scale-[0.97]';

  if (accent === 'amber') {
    return `${base} hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700`;
  }

  return `${base} hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700`;
}

export function frisSectionGridButtonClass(
  accent: FrisSectionAccent,
  isActive: boolean,
): string {
  const base =
    'flex min-w-0 items-center justify-center gap-1 rounded-lg border-2 px-1.5 py-2 text-center text-[11px] font-medium leading-tight transition-colors duration-200 active:scale-[0.98] nav-desktop:rounded-xl nav-desktop:px-2 nav-desktop:text-xs';

  if (accent === 'amber') {
    return isActive
      ? `${base} border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25`
      : `${base} border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-700`;
  }

  return isActive
    ? `${base} border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25`
    : `${base} border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700`;
}
