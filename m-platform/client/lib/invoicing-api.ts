import { getApiBase, setNavisionDataExportStatus } from '@/lib/api';
import { frisFetch, LONG_API_TIMEOUT_MS } from '@/lib/fris-auth-fetch';
import type { ScheduledFlightDataRow } from '@/components/fris/advance/invoicing/scheduled-flight-data-columns';
import type {
  InvoicingDataMode,
  InvoicingDateBasis,
} from '@/components/fris/advance/invoicing/invoicing-filter.types';

function invoicingApiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isTransientFetchError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const lower = message.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('socket') ||
    lower.includes('timed out')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchInvoicingScheduledFlightData(params: {
  from: string;
  to: string;
  dateBasis: InvoicingDateBasis;
  dataMode: InvoicingDataMode;
}): Promise<ScheduledFlightDataRow[]> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    dateBasis: params.dateBasis,
    dataMode: params.dataMode,
  });
  const url = `${invoicingApiUrl('/advance-invoicing/scheduled-flight-data')}?${qs.toString()}`;
  let lastError: unknown;
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await frisFetch(url, {
        method: 'GET',
        cache: 'no-store',
        timeoutMs: LONG_API_TIMEOUT_MS,
      });
      if (res.status >= 500 && attempt < 2) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (!isTransientFetchError(err) || attempt === 2) {
        throw err instanceof Error ? err : new Error('Failed to fetch');
      }
      await sleep(700 * (attempt + 1));
    }
  }
  if (!res) {
    throw lastError instanceof Error ? lastError : new Error('Failed to fetch');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ||
        `Failed to load flight report data (${res.status})`,
    );
  }
  const json = (await res.json()) as {
    data?: { rows?: ScheduledFlightDataRow[] };
    rows?: ScheduledFlightDataRow[];
  };
  const rows = (json?.data?.rows ?? json?.rows ?? []) as ScheduledFlightDataRow[];
  return rows.map((row) => ({
    ...row,
    selectData: Boolean(row.selectData),
  }));
}

/** Mark selected flights exported to NAV (uses proven raw-flight-data PATCH per serial). */
export async function exportInvoicingFlightsToNav(
  serialNos: string[],
): Promise<{ exported: number; failed: number }> {
  const unique = [
    ...new Set(
      serialNos.map((s) => String(s ?? '').trim().replace(/^FL-/i, '')).filter(Boolean),
    ),
  ];
  if (unique.length === 0) {
    throw new Error('Select at least one flight to export.');
  }

  const results = await Promise.allSettled(
    unique.map((serial) =>
      setNavisionDataExportStatus(serial, { status: 'Y', recordType: 'flight' }),
    ),
  );

  let exported = 0;
  let failed = 0;
  let firstError = '';

  for (const result of results) {
    if (result.status === 'fulfilled') {
      exported += 1;
    } else {
      failed += 1;
      if (!firstError) {
        firstError =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason ?? 'Export failed');
      }
    }
  }

  if (exported === 0) {
    throw new Error(firstError || 'Export failed for all selected flights.');
  }

  return { exported, failed };
}
