/**
 * Attach outside-pointer dismiss after the opening gesture finishes.
 * Prevents the same touch from opening and immediately closing pickers on mobile.
 */
export function bindDeferredOutsidePointerDismiss(
  onPointerDown: (event: PointerEvent) => void,
  delayMs = 0,
): () => void {
  let disposed = false;
  let removeListener: (() => void) | null = null;

  const timer = window.setTimeout(() => {
    if (disposed) return;
    document.addEventListener('pointerdown', onPointerDown, true);
    removeListener = () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, delayMs);

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    removeListener?.();
  };
}
