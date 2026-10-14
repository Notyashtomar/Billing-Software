'use client';

import { useEffect } from 'react';
import {
  clearStaleChunkRetry,
  isChunkLoadFailure,
  isStaleScriptElement,
  reloadOnceForStaleChunks,
} from '@/lib/retry-dynamic-chunk-import';

/** After a deploy, one reload loads the new HTML and its hashed scripts. */
export function StaleChunkReload() {
  useEffect(() => {
    let failed = false;

    const onError = (event: Event) => {
      const errorEvent = event as ErrorEvent;
      const failedScript = isStaleScriptElement(event.target);
      const failedImport = isChunkLoadFailure(errorEvent.error ?? errorEvent.message);
      if (!failedScript && !failedImport) return;
      failed = true;
      reloadOnceForStaleChunks();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadFailure(event.reason)) return;
      failed = true;
      event.preventDefault();
      reloadOnceForStaleChunks();
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onRejection);
    const timer = window.setTimeout(() => {
      if (!failed) clearStaleChunkRetry();
    }, 4000);

    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onRejection);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
