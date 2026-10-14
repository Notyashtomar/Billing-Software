/** True on phones/tablets (coarse touch); false on mouse-first desktops. */
export function isTouchPrimaryViewport(): boolean {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
