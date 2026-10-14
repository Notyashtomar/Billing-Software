'use client';

import { useEffect, useState } from 'react';

/** Delay before backdrop/outside-dismiss activate — avoids same-tap open+close on touch. */
export const PICKER_OUTSIDE_DISMISS_DELAY_MS = 400;

export function usePickerSheetGuard(isOpen: boolean, useSheet: boolean) {
  const [backdropReady, setBackdropReady] = useState(false);

  useEffect(() => {
    if (!isOpen || !useSheet) {
      setBackdropReady(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setBackdropReady(true);
    }, PICKER_OUTSIDE_DISMISS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen, useSheet]);

  return {
    backdropReady: !useSheet || backdropReady,
    outsideDismissDelayMs: PICKER_OUTSIDE_DISMISS_DELAY_MS,
  };
}
