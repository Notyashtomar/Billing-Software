import { frisFetch, LONG_API_TIMEOUT_MS } from '@/lib/fris-auth-fetch';
import { getApiBase } from '@/lib/api';
import {
  friendlyStationWiseError,
  isTransientApiDown,
  withApiRetry,
  type StationWiseRetryHooks,
} from './misStationWiseApi';
import type { AirlineWiseStatusPayload } from './misAirlineWiseTypes';

const TIMEOUT_MS = 180_000;

export { friendlyStationWiseError, isTransientApiDown };

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

export async function getMisAirlineWiseStatus(
  params: { from: string; to: string; flightScope?: 'scheduled' | 'nonScheduled' },
  init?: StationWiseRetryHooks,
): Promise<AirlineWiseStatusPayload> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.flightScope) qs.set('flightScope', params.flightScope);
  return withApiRetry(async () => {
    const res = await frisFetch(`${getApiBase()}/mis/airline-wise/status?${qs.toString()}`, {
      signal: init?.signal,
      timeoutMs: TIMEOUT_MS,
    });
    if (!res.ok) {
      const err = new Error(await readApiError(res, 'Failed to load MIS Airline Wise preview.')) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as AirlineWiseStatusPayload;
  }, init);
}

export async function downloadMisAirlineWiseExcel(
  params: {
    from: string;
    to: string;
    airlineCode: string;
    flightScope?: 'scheduled' | 'nonScheduled';
  },
  init?: StationWiseRetryHooks,
): Promise<void> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    airlineCode: params.airlineCode,
  });
  if (params.flightScope) qs.set('flightScope', params.flightScope);
  const { bytes, fileName } = await withApiRetry(async () => {
    const res = await frisFetch(`${getApiBase()}/mis/airline-wise/export?${qs.toString()}`, {
      timeoutMs: Math.max(LONG_API_TIMEOUT_MS, TIMEOUT_MS),
      signal: init?.signal,
    });
    if (!res.ok) {
      const err = new Error(await readApiError(res, 'MIS Airline Wise export failed.')) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
    const name = match?.[1]
      ? decodeURIComponent(match[1])
      : (match?.[2] ?? `${params.airlineCode}_MONTHWISE.xlsx`);
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!isZip) {
      throw new Error('Export returned an empty or invalid Excel file.');
    }
    return { bytes, fileName: name };
  }, init);
  triggerBlobDownload(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  );
}
