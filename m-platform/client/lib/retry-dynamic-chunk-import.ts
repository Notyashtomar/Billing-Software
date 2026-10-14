const CHUNK_RETRY_KEY = 'fris-dynamic-chunk-retry';

export function isChunkLoadFailure(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'ChunkLoadError') return true;
    if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message)) {
      return true;
    }
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause && isChunkLoadFailure(cause)) return true;
  }
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    String(error),
  );
}

export function isStaleScriptElement(target: EventTarget | null): boolean {
  if (typeof HTMLScriptElement === 'undefined') return false;
  if (!(target instanceof HTMLScriptElement)) return false;
  return /\/_next\/static\//.test(target.src || '');
}

/** One navigation to a fresh document. A second failure does not loop. */
export function reloadOnceForStaleChunks(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(CHUNK_RETRY_KEY)) return false;
    sessionStorage.setItem(CHUNK_RETRY_KEY, '1');
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_fris', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/** After the new document stays up, allow the next deploy to reload once. */
export function clearStaleChunkRetry(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CHUNK_RETRY_KEY);
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href);
  if (!url.searchParams.has('_fris')) return;
  url.searchParams.delete('_fris');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

/** Recover stale dynamic chunks after a deploy without a manual cache clear. */
export function retryDynamicChunkImport<T>(importer: () => Promise<T>): Promise<T> {
  return importer()
    .then((result) => result)
    .catch((error: unknown) => {
      if (typeof window === 'undefined' || !isChunkLoadFailure(error)) {
        throw error;
      }
      if (reloadOnceForStaleChunks()) return new Promise<T>(() => {});
      throw error;
    });
}
