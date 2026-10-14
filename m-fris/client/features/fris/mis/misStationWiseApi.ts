import { frisFetch, LONG_API_TIMEOUT_MS } from '@/lib/fris-auth-fetch';
import { getApiBase } from '@/lib/api';
import type { StationWiseStatusPayload } from './misStationWiseTypes';

/** Nest watch restarts often exceed the default 60s page timeout. */
const STATION_WISE_TIMEOUT_MS = 120_000;
const STATUS_RETRY_BUDGET_MS = 100_000;

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(' ');
    if (parsed.message) return parsed.message;
  } catch {
    /* use text */
  }
  return text.trim() || fallback;
}

/** Nest --watch / brief outages — safe to retry. */
export function isTransientApiDown(message: string, status?: number): boolean {
  if (status === 502 || status === 503 || status === 504) return true;
  const m = message.toLowerCase();
  return (
    m.includes('cannot reach the api') ||
    m.includes('api proxy error') ||
    m.includes('api is offline') ||
    m.includes('api is restarting') ||
    m.includes('econnrefused') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('fetch failed') ||
    m.includes('socket hang up') ||
    m.includes('timed out') ||
    m.includes('timeout')
  );
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export type StationWiseRetryHooks = {
  signal?: AbortSignal;
  /** Soft UI while waiting for Nest to come back. */
  onRetrying?: (info: { attempt: number; message: string }) => void;
};

export async function withApiRetry<T>(
  run: () => Promise<T>,
  init?: StationWiseRetryHooks & { budgetMs?: number },
): Promise<T> {
  const budgetMs = init?.budgetMs ?? STATUS_RETRY_BUDGET_MS;
  const started = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() - started < budgetMs) {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    attempt += 1;
    try {
      return await run();
    } catch (e) {
      lastError = e;
      if (e instanceof Error && e.name === 'AbortError') throw e;
      const msg = e instanceof Error ? e.message : String(e);
      const status =
        e instanceof Error && 'status' in e
          ? Number((e as Error & { status?: number }).status)
          : undefined;
      if (!isTransientApiDown(msg, status)) throw e;

      const elapsed = Date.now() - started;
      if (elapsed >= budgetMs) break;

      init?.onRetrying?.({
        attempt,
        message: 'Waiting for API… Nest may be recompiling.',
      });
      const delay = Math.min(1200 * attempt, 5000);
      await sleep(Math.min(delay, budgetMs - elapsed), init?.signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'API unavailable'));
}

export async function getMisStationWiseStatus(
  params: { from: string; to: string; flightScope?: 'scheduled' | 'nonScheduled' },
  init?: StationWiseRetryHooks,
): Promise<StationWiseStatusPayload> {
  return withApiRetry(
    async () => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      if (params.flightScope) qs.set('flightScope', params.flightScope);
      const res = await frisFetch(
        `${getApiBase()}/mis/station-wise/status?${qs.toString()}`,
        { signal: init?.signal, timeoutMs: STATION_WISE_TIMEOUT_MS },
      );
      if (!res.ok) {
        const err = new Error(
          await readApiError(res, 'Failed to load MIS Station Wise preview.'),
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as StationWiseStatusPayload;
    },
    init,
  );
}

export async function downloadMisStationWiseExcel(
  params: { from: string; to: string; flightScope?: 'scheduled' | 'nonScheduled' },
  init?: StationWiseRetryHooks,
): Promise<void> {
  await withApiRetry(
    async () => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      if (params.flightScope) qs.set('flightScope', params.flightScope);
      const res = await frisFetch(
        `${getApiBase()}/mis/station-wise/export?${qs.toString()}`,
        {
          timeoutMs: Math.max(LONG_API_TIMEOUT_MS, STATION_WISE_TIMEOUT_MS),
          signal: init?.signal,
        },
      );
      if (!res.ok) {
        const err = new Error(
          await readApiError(res, 'MIS Station Wise export failed.'),
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const match =
        /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
      const encoded = match?.[1];
      const plain = match?.[2];
      const fileName = encoded
        ? decodeURIComponent(encoded)
        : (plain ?? 'MONTHWISE.xlsx');
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (!isZip) {
        throw new Error('Export returned an empty or invalid Excel file.');
      }
      triggerBlobDownload(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        fileName,
      );
    },
    { ...init, budgetMs: 90_000 },
  );
}

export function friendlyStationWiseError(message: string): string {
  if (isTransientApiDown(message)) {
    return 'API is offline. Keep npm run dev:api running from repo root, then tap Refresh.';
  }
  return message;
}
