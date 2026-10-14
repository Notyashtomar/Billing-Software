'use client';

import { useEffect } from 'react';

/**
 * The FRIS shell manages its own scrolling through the `<main>` container
 * (`flex-1 overflow-y-auto` inside a `100dvh` shell). The document itself must never
 * scroll — otherwise display scaling rounding (Windows 125%/150%) or the OS
 * "always show scrollbars" setting leaves a redundant native scrollbar next to
 * `main`'s scrollbar (the "two scrollbars" issue).
 *
 * This locks `html`/`body` overflow while any FRIS page is mounted and restores
 * the previous values on unmount so non-FRIS routes keep normal page scrolling.
 */
export function FrisScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return null;
}
