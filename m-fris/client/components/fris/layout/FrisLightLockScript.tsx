'use client';

import { useServerInsertedHTML } from 'next/navigation';

/**
 * Injects the FRIS light-lock bootstrap script during SSR, outside the React
 * client tree — avoids React 19 "script tag inside component" warnings while
 * still preventing a dark-mode flash before hydration.
 *
 * Uses a static file (not inline script) so OpenNext/Cloudflare Workers do not
 * corrupt quoted `/fris` path strings in the HTML document.
 */
export function FrisLightLockScript() {
  useServerInsertedHTML(() => (
    <script id="fris-light-lock-init" src="/fris-light-lock-init.js" />
  ));

  return null;
}
