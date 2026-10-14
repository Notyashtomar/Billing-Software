/**
 * Portal dropdowns use fixed positioning; ancestor scroll containers do not always
 * emit bubbling scroll events on `window`. Bind dismiss/reposition to each scroll parent.
 */

export function getScrollParents(node: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let el = node?.parentElement ?? null;

  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollableY =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      el.scrollHeight > el.clientHeight;
    const scrollableX =
      (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
      el.scrollWidth > el.clientWidth;

    if (scrollableY || scrollableX) {
      parents.push(el);
    }
    el = el.parentElement;
  }

  return parents;
}

export function bindPortalScrollListeners(
  anchor: HTMLElement,
  options: {
    menu?: HTMLElement | null;
    /** Resolved on each scroll — use when the menu portal mounts after open. */
    getMenu?: () => HTMLElement | null;
    /** Extra guard (e.g. other portaled menus tied to the same anchor). */
    shouldIgnoreEvent?: (event: Event) => boolean;
    onScroll: (event: Event) => void;
    /**
     * Mobile keyboard / browser chrome — reposition only, never dismiss.
     * visualViewport changes must not close menus (that breaks touch dropdowns).
     */
    onViewportChange?: () => void;
    /** Also listen on window capture for dismiss (avoid on mobile — keyboard scroll closes pickers). */
    dismissOnWindowScroll?: boolean;
    /** Also listen on window capture (not visualViewport dismiss). */
    includeWindow?: boolean;
  },
): () => void {
  const {
    menu,
    getMenu,
    shouldIgnoreEvent,
    onScroll,
    onViewportChange,
    dismissOnWindowScroll = false,
    includeWindow = true,
  } = options;

  const dismissHandler = (event: Event) => {
    if (shouldIgnoreEvent?.(event)) return;
    const target = event.target as Node | null;
    const menuEl = getMenu?.() ?? menu ?? null;
    if (menuEl?.contains(target)) return;
    onScroll(event);
  };

  const parents = getScrollParents(anchor);
  const cleanups: Array<() => void> = [];

  if (includeWindow && dismissOnWindowScroll) {
    window.addEventListener('scroll', dismissHandler, true);
    cleanups.push(() => window.removeEventListener('scroll', dismissHandler, true));
  }

  if (includeWindow) {
    if (window.visualViewport && onViewportChange) {
      const onViewport = () => onViewportChange();
      window.visualViewport.addEventListener('resize', onViewport);
      window.visualViewport.addEventListener('scroll', onViewport);
      cleanups.push(() => {
        window.visualViewport?.removeEventListener('resize', onViewport);
        window.visualViewport?.removeEventListener('scroll', onViewport);
      });
    }
  }

  parents.forEach((parent) => {
    parent.addEventListener('scroll', dismissHandler, { passive: true });
    cleanups.push(() => parent.removeEventListener('scroll', dismissHandler));
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

function handlePortaledMenuWheel(event: WheelEvent, menu: HTMLElement) {
  // Radix Dialog (react-remove-scroll) blocks wheel on body-portaled menus — contain here.
  event.stopPropagation();

  const { scrollTop, scrollHeight, clientHeight } = menu;
  const delta = event.deltaY;
  const overflowing = scrollHeight > clientHeight + 1;
  if (!overflowing || delta === 0) return;

  const canScrollUp = scrollTop > 0;
  const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;

  if ((delta < 0 && canScrollUp) || (delta > 0 && canScrollDown)) {
    event.preventDefault();
    menu.scrollTop += delta;
    return;
  }

  // At scroll edge — don't chain to locked modal / dialog scroll parents.
  event.preventDefault();
}

/** Non-passive wheel lock for portaled menus (React onWheel is passive — preventDefault is ignored). */
export function bindPortaledMenuWheelLock(menu: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    handlePortaledMenuWheel(event, menu);
  };
  menu.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => menu.removeEventListener('wheel', onWheel, { capture: true });
}

/**
 * React `onWheel` cannot be used for menu wheel containment: React binds wheel
 * passively at the root, so `preventDefault` is ignored and logs a console
 * violation. Use `bindPortaledMenuWheelLock` from a layout effect instead.
 */
