/**
 * AbortController helpers for API fetches — stop indefinite UI waiting.
 * Does not cancel already-committed server work; surfaces a clear timeout to the page.
 */

/** Default deadline for authenticated API calls via {@link frisFetch}. */
export const DEFAULT_API_TIMEOUT_MS = 60_000;

/** Heavy billing / import / pipeline work (ingest, PDF, sync, excel). */
export const LONG_API_TIMEOUT_MS = 180_000;

/** MAA ADS MIS workbook: FHR + contract pricing for a full month. */
export const MIS_ADS_EXPORT_TIMEOUT_MS = 600_000;

export type FetchWithAbortOptions = {
  /** Deadline in ms. `null` disables the auto timeout (caller must abort). */
  timeoutMs?: number | null;
  /** Existing signal (e.g. React effect cleanup). Combined with the timeout. */
  signal?: AbortSignal | null;
};

export type ComposedAbort = {
  signal: AbortSignal;
  /** Clear the timeout timer; call in `finally`. */
  cleanup: () => void;
  /** True when our deadline fired (not caller abort). */
  didTimeout: () => boolean;
};

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  if (err instanceof Error) {
    return err.name === 'AbortError' || err.name === 'TimeoutError';
  }
  return false;
}

export function timeoutErrorMessage(timeoutMs: number): string {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `Request timed out after ${seconds}s. The server may still be working — refresh before retrying.`;
}

/**
 * Build a signal that aborts when `timeoutMs` elapses and/or when `signal` aborts.
 */
export function composeAbortSignal(options: FetchWithAbortOptions = {}): ComposedAbort {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal: userSignal } = options;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromUser = () => {
    if (!controller.signal.aborted) {
      controller.abort(userSignal?.reason);
    }
  };

  if (userSignal) {
    if (userSignal.aborted) {
      abortFromUser();
    } else {
      userSignal.addEventListener('abort', abortFromUser, { once: true });
    }
  }

  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      if (!controller.signal.aborted) {
        controller.abort(timeoutErrorMessage(timeoutMs));
      }
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId != null) clearTimeout(timeoutId);
      if (userSignal) {
        userSignal.removeEventListener('abort', abortFromUser);
      }
    },
    didTimeout: () => timedOut,
  };
}

/**
 * `fetch` with AbortController deadline. Converts deadline abort into an Error
 * whose message includes "timed out" so UI/error sanitizers treat it as timeout.
 */
export async function fetchWithAbort(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithAbortOptions = {},
): Promise<Response> {
  const timeoutMs =
    options.timeoutMs === undefined ? DEFAULT_API_TIMEOUT_MS : options.timeoutMs;
  const composed = composeAbortSignal({
    timeoutMs,
    signal: options.signal ?? init.signal,
  });

  try {
    return await fetch(input, {
      ...init,
      signal: composed.signal,
    });
  } catch (err) {
    if (composed.didTimeout()) {
      throw new Error(
        timeoutMs != null ? timeoutErrorMessage(timeoutMs) : timeoutErrorMessage(DEFAULT_API_TIMEOUT_MS),
      );
    }
    if (isAbortError(err)) {
      throw err;
    }
    throw err;
  } finally {
    composed.cleanup();
  }
}
