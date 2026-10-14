'use client';

import React, { useCallback, useEffect, useId, useRef, useState, type ElementType } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useCompactPickerViewport } from '@/lib/use-compact-picker-viewport';
import {
  FRIS_MOBILE_SECTION_MENU_CLOSED_CLASS,
  FRIS_MOBILE_SECTION_MENU_OPEN_CLASS,
  frisSectionGridButtonClass,
  frisSectionInlineButtonClass,
  frisSectionMenuItemClass,
  frisSectionToggleButtonClass,
  type FrisSectionAccent,
  type FrisSectionNavItem,
} from '@/lib/fris-responsive-nav';

/** Keeps mobile section menus open while scrolling inside the panel; closes on outside tap / Escape. */
function useFrisMobileSectionMenu(panelId: string) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    let gestureInside = false;

    const isInsideMenu = (target: EventTarget | null) => {
      const root = rootRef.current;
      const panel = document.getElementById(panelId);
      if (!(target instanceof Node)) return false;
      return Boolean(
        (root && root.contains(target)) || (panel && panel.contains(target)),
      );
    };

    const onScroll = (event: Event) => {
      if (gestureInside || isInsideMenu(event.target)) return;
      close();
    };

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      gestureInside = isInsideMenu(event.target);
      if (!gestureInside) close();
    };

    const endGesture = () => {
      gestureInside = false;
    };

    const fitPanel = () => {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const top = panel.getBoundingClientRect().top;
      const available = Math.max(160, window.innerHeight - top - 16);
      panel.style.maxHeight = `${available}px`;
    };
    fitPanel();
    const frame = window.requestAnimationFrame(fitPanel);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', fitPanel);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('touchend', endGesture);
    document.addEventListener('touchcancel', endGesture);

    return () => {
      window.cancelAnimationFrame(frame);
      const panel = document.getElementById(panelId);
      if (panel) panel.style.maxHeight = '';
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', fitPanel);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('touchend', endGesture);
      document.removeEventListener('touchcancel', endGesture);
    };
  }, [open, panelId, close]);

  return { open, setOpen, toggle, close, rootRef };
}

type BaseProps<T extends string> = {
  sections: FrisSectionNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
  defaultAccent?: FrisSectionAccent;
  getAccent?: (id: T) => FrisSectionAccent;
};

function resolveAccent<T extends string>(
  item: FrisSectionNavItem<T>,
  getAccent: ((id: T) => FrisSectionAccent) | undefined,
  defaultAccent: FrisSectionAccent,
): FrisSectionAccent {
  return item.accent ?? getAccent?.(item.id) ?? defaultAccent;
}

function SectionIcon({
  Icon,
  isActive,
}: {
  Icon: ElementType<{ className?: string }>;
  isActive: boolean;
}) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        isActive ? 'bg-white/20' : 'bg-slate-100'
      }`}
    >
      <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-600'}`} aria-hidden />
    </span>
  );
}

/** Mobile hamburger + scrollable section list (portrait & landscape phones). */
export function FrisSectionNavMobileMenu<T extends string>({
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  menuId,
  className,
  showActiveLabel = false,
}: BaseProps<T> & {
  menuId?: string;
  className?: string;
  showActiveLabel?: boolean;
}) {
  const autoId = useId();
  const panelId = menuId ?? `fris-section-menu-${autoId}`;
  const { open, toggle, close, rootRef } = useFrisMobileSectionMenu(panelId);
  const activeItem = sections.find((s) => s.id === activeId);

  const handleSelect = (id: T) => {
    close();
    onSelect(id);
  };

  return (
    <div ref={rootRef} className={cn('nav-desktop:hidden', className)}>
      <div className="flex items-center justify-between gap-3">
        {showActiveLabel ? (
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {activeItem?.label}
          </p>
        ) : null}
        <button
          type="button"
          className={frisSectionToggleButtonClass(defaultAccent)}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Close section menu' : 'Open section menu'}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      <div
        id={panelId}
        className={cn(
          'transition-[max-height,opacity] duration-300 ease-in-out',
          open ? FRIS_MOBILE_SECTION_MENU_OPEN_CLASS : FRIS_MOBILE_SECTION_MENU_CLOSED_CLASS,
        )}
      >
        <nav className="space-y-2 border-t border-slate-100 px-1 pb-6 pt-3" aria-label={ariaLabel}>
          {sections.map((item) => {
            const isActive = activeId === item.id;
            const accent = resolveAccent(item, getAccent, defaultAccent);
            const { icon: Icon, label, description } = item;

            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                whileTap={{ scale: 0.97 }}
                aria-current={isActive ? 'page' : undefined}
                className={frisSectionMenuItemClass(accent, isActive)}
              >
                <SectionIcon Icon={Icon} isActive={isActive} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{label}</span>
                  {description ? (
                    <span
                      className={`mt-0.5 block text-xs ${
                        isActive ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {description}
                    </span>
                  ) : null}
                </span>
              </motion.button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Desktop inline section buttons. */
export function FrisSectionNavInline<T extends string>({
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  className,
}: BaseProps<T> & { className?: string }) {
  return (
    <nav
      className={cn(
        'hidden shrink-0 flex-wrap items-center justify-end gap-2 nav-desktop:flex',
        className,
      )}
      aria-label={ariaLabel}
    >
      {sections.map((item) => {
        const isActive = activeId === item.id;
        const accent = resolveAccent(item, getAccent, defaultAccent);
        const { icon: Icon, label } = item;

        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.97 }}
            aria-current={isActive ? 'page' : undefined}
            className={frisSectionInlineButtonClass(accent, isActive)}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}

/** Mobile dropdown + desktop sidebar or grid — shared pattern for Advance sub-sections. */
export function FrisSectionNavDual<T extends string>({
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  desktopVariant = 'sidebar',
  menuId,
  mobileClassName,
  desktopClassName,
  showActiveLabel = true,
}: BaseProps<T> & {
  desktopVariant?: 'sidebar' | 'grid';
  menuId?: string;
  mobileClassName?: string;
  desktopClassName?: string;
  showActiveLabel?: boolean;
}) {
  return (
    <>
      <FrisSectionNavMobileMenu
        sections={sections}
        activeId={activeId}
        onSelect={onSelect}
        ariaLabel={ariaLabel}
        defaultAccent={defaultAccent}
        getAccent={getAccent}
        menuId={menuId}
        showActiveLabel={showActiveLabel}
        className={mobileClassName}
      />
      {desktopVariant === 'grid' ? (
        <FrisSectionNavGrid
          sections={sections}
          activeId={activeId}
          onSelect={onSelect}
          ariaLabel={ariaLabel}
          defaultAccent={defaultAccent}
          getAccent={getAccent}
          className={desktopClassName}
        />
      ) : (
        <FrisSectionNavSidebar
          sections={sections}
          activeId={activeId}
          onSelect={onSelect}
          ariaLabel={ariaLabel}
          defaultAccent={defaultAccent}
          getAccent={getAccent}
          className={desktopClassName}
        />
      )}
    </>
  );
}

/** Desktop collapsible icon sidebar (Gateway / Cargo). */
export function FrisSectionNavSidebar<T extends string>({
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  className,
}: BaseProps<T> & { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const sidebarTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={cn(
        'hidden w-full shrink-0 overflow-hidden nav-desktop:block nav-desktop:w-[4.25rem]',
        className,
      )}
      initial={false}
      animate={{ width: expanded ? 256 : 68 }}
      transition={sidebarTransition}
    >
      <nav
        aria-label={ariaLabel}
        className="flex flex-col gap-1.5 overflow-hidden rounded-2xl bg-white/80 p-2 shadow-lg shadow-gray-200/50 ring-1 ring-gray-100 backdrop-blur-sm"
      >
        {sections.map((item) => {
          const isActive = activeId === item.id;
          const accent = resolveAccent(item, getAccent, defaultAccent);
          const { icon: Icon, label } = item;
          const activeClass =
            accent === 'amber'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
              : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25';
          const idleClass =
            accent === 'amber'
              ? 'text-gray-600 hover:bg-amber-50 hover:text-amber-700'
              : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-700';

          return (
            <motion.button
              key={item.id}
              type="button"
              title={label}
              onClick={() => onSelect(item.id)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors duration-200',
                expanded ? '' : 'justify-center px-0',
                isActive ? activeClass : idleClass,
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <motion.span
                className="truncate"
                initial={false}
                animate={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 180 : 0 }}
                transition={sidebarTransition}
                aria-hidden={!expanded}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}
      </nav>
    </motion.aside>
  );
}

/** Desktop grid section buttons (e.g. Invoicing tabs). */
export function FrisSectionNavGrid<T extends string>({
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  className,
}: BaseProps<T> & { className?: string }) {
  return (
    <nav
      className={cn(
        'hidden w-full shrink-0 grid-cols-4 gap-1.5 nav-desktop:grid nav-desktop:gap-2 xl:grid-cols-8',
        className,
      )}
      aria-label={ariaLabel}
    >
      {sections.map((item) => {
        const isActive = activeId === item.id;
        const accent = resolveAccent(item, getAccent, defaultAccent);
        const { icon: Icon, label } = item;

        return (
          <motion.button
            key={item.id}
            type="button"
            title={label}
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.98 }}
            className={frisSectionGridButtonClass(accent, isActive)}
          >
            <Icon className="hidden h-3.5 w-3.5 shrink-0 xl:block" aria-hidden />
            <span className="min-w-0 truncate xl:whitespace-normal">{label}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}

export type FrisSectionNavHeaderProps<T extends string> = BaseProps<T> & {
  title: string;
  description?: string;
  sticky?: boolean;
  className?: string;
  menuId?: string;
};

/** Page header: dynamic title left, desktop inline tabs right, mobile hamburger menu. */
export function FrisSectionNavHeader<T extends string>({
  title,
  description,
  sections,
  activeId,
  onSelect,
  ariaLabel,
  defaultAccent = 'emerald',
  getAccent,
  sticky = true,
  className,
  menuId,
}: FrisSectionNavHeaderProps<T>) {
  const autoId = useId();
  const panelId = menuId ?? `fris-section-header-menu-${autoId}`;
  const { open, toggle, close, rootRef } = useFrisMobileSectionMenu(panelId);
  const compactLayout = useCompactPickerViewport();

  const handleSelect = (id: T) => {
    close();
    onSelect(id);
  };

  const useStickyHeader = sticky && !compactLayout;

  return (
    <header
      ref={rootRef}
      className={cn(
        'border-b border-slate-200/80 shadow-sm',
        useStickyHeader
          ? 'sticky top-0 z-20 bg-white shadow-sm'
          : 'relative z-10 bg-white',
        !useStickyHeader && compactLayout && 'bg-white',
        useStickyHeader && 'bg-white/95 backdrop-blur-sm',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-none items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-800 sm:text-xl md:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">{description}</p>
          ) : null}
        </div>

        <FrisSectionNavInline
          sections={sections}
          activeId={activeId}
          onSelect={onSelect}
          ariaLabel={ariaLabel}
          defaultAccent={defaultAccent}
          getAccent={getAccent}
        />

        <button
          type="button"
          className={cn('nav-desktop:hidden', frisSectionToggleButtonClass(defaultAccent))}
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Close section menu' : 'Open section menu'}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      <div
        id={panelId}
        className={cn(
          'nav-desktop:hidden transition-[max-height,opacity] duration-300 ease-in-out',
          open ? FRIS_MOBILE_SECTION_MENU_OPEN_CLASS : FRIS_MOBILE_SECTION_MENU_CLOSED_CLASS,
        )}
      >
        <nav
          className="space-y-2 border-t border-slate-100 px-3 pb-6 pt-3 sm:px-6"
          aria-label={ariaLabel}
        >
          {sections.map((item) => {
            const isActive = activeId === item.id;
            const accent = resolveAccent(item, getAccent, defaultAccent);
            const { icon: Icon, label, description: itemDescription } = item;

            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                whileTap={{ scale: 0.97 }}
                aria-current={isActive ? 'page' : undefined}
                className={frisSectionMenuItemClass(accent, isActive)}
              >
                <SectionIcon Icon={Icon} isActive={isActive} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{label}</span>
                  {itemDescription ? (
                    <span
                      className={`mt-0.5 block text-xs ${
                        isActive ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {itemDescription}
                    </span>
                  ) : null}
                </span>
              </motion.button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
