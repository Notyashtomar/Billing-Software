export type PortalMenuPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
};

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
const PREFERRED_MAX_HEIGHT = 280;
const MIN_MENU_HEIGHT = 120;
export const DEFAULT_PORTAL_STICKY_HEADER_INSET = 48;

function estimateMenuHeight(optionCount: number, rowHeight = 38): number {
  const chrome = 14;
  const content = optionCount * rowHeight + chrome;
  return Math.min(PREFERRED_MAX_HEIGHT, Math.max(72, content));
}

export function computePortalMenuPlacement(
  trigger: HTMLElement,
  optionCount: number,
  stickyHeaderInset = DEFAULT_PORTAL_STICKY_HEADER_INSET,
  rowHeight = 38,
): PortalMenuPlacement {
  const rect = trigger.getBoundingClientRect();
  const viewportH = window.visualViewport?.height ?? window.innerHeight;
  const viewportW = window.visualViewport?.width ?? window.innerWidth;
  const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
  const minSafeTop = viewportOffsetTop + stickyHeaderInset + VIEWPORT_MARGIN;

  const preferredHeight = estimateMenuHeight(optionCount, rowHeight);
  const spaceBelow = viewportH + viewportOffsetTop - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - minSafeTop;

  const minBelow = Math.min(preferredHeight, MIN_MENU_HEIGHT);
  const canOpenBelow = spaceBelow >= minBelow + MENU_GAP;
  const canOpenAbove = spaceAbove >= MIN_MENU_HEIGHT + MENU_GAP;

  let openUpward = false;
  if (canOpenBelow) {
    openUpward = false;
  } else if (canOpenAbove) {
    openUpward = true;
  } else {
    openUpward = spaceAbove > spaceBelow;
  }

  const available = openUpward ? spaceAbove - MENU_GAP : spaceBelow - MENU_GAP;
  const maxHeight = Math.min(
    PREFERRED_MAX_HEIGHT,
    preferredHeight,
    Math.max(available, Math.min(MIN_MENU_HEIGHT, preferredHeight)),
  );

  let top = openUpward ? rect.top - MENU_GAP - maxHeight : rect.bottom + MENU_GAP;
  if (rect.bottom <= minSafeTop) {
    top = minSafeTop + MENU_GAP;
    openUpward = false;
  } else if (top < minSafeTop) {
    top = minSafeTop;
  }
  if (!openUpward && top + maxHeight > viewportH + viewportOffsetTop - VIEWPORT_MARGIN) {
    top = Math.max(minSafeTop, viewportH + viewportOffsetTop - VIEWPORT_MARGIN - maxHeight);
  }

  const width = Math.min(Math.max(rect.width, 160), viewportW - VIEWPORT_MARGIN * 2);
  let left = rect.left;
  if (left + width > viewportW - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, viewportW - width - VIEWPORT_MARGIN);
  }
  if (left < VIEWPORT_MARGIN) {
    left = VIEWPORT_MARGIN;
  }

  return {
    top,
    left,
    width,
    maxHeight,
    openUpward,
  };
}
