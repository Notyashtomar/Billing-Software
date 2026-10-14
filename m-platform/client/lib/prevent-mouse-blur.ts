import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/**
 * preventDefault on pointer/touch down blocks synthesized click on iOS Safari.
 * Use this only for mouse-driven combobox blur prevention on desktop.
 */
export function preventMouseBlurDefault(
  event: ReactPointerEvent | MouseEvent,
): void {
  if ('pointerType' in event && event.pointerType !== 'mouse') {
    return;
  }
  event.preventDefault();
}
