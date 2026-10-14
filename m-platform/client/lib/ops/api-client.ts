export class OpsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Ops override key — prefer FRIS login station when unset. */
const STATION_KEY = 'fris_ops_station_code';
const FRIS_STATION_KEY = 'userStationCode';

export function readOpsStationCode(): string {
  if (typeof window === 'undefined') return 'DEL';
  const override = window.localStorage.getItem(STATION_KEY)?.trim();
  if (override) return override;
  const fris = window.localStorage.getItem(FRIS_STATION_KEY)?.trim();
  if (fris) return fris;
  return 'DEL';
}

export function writeOpsStationCode(code: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STATION_KEY, code.trim() || 'DEL');
}

export type NestUserOption = {
  userId: string;
  userName: string;
  stationCode?: string;
};

/** Mongo users via Hono nest-bridge (not stored in D1). */
export async function fetchOpsUsers(): Promise<NestUserOption[]> {
  const data = await opsFetch<{ items: NestUserOption[] }>('/api/logs/users');
  return Array.isArray(data.items) ? data.items : [];
}

export async function opsFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Ops-Station-Code', readOpsStationCode());

  // MAAS module Bearer (localStorage) — same pattern as AMS/ULD tiles.
  if (path.startsWith('/api/maas') && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('maas_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw) as { token?: string };
        const token = String(parsed?.token ?? '').trim();
        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }
    } catch {
      /* ignore corrupt session */
    }
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const text = await res.text();
    if (!res.ok) throw new OpsApiError(text || res.statusText, res.status);
    return text as T;
  }

  const text = await res.text();
  let data: T = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
      throw new OpsApiError(
        snippet || res.statusText || 'Ops API returned non-JSON response',
        res.status || 500,
      );
    }
  }

  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/api/maas') && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('maas_auth_session');
      } catch {
        /* ignore */
      }
    }
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? typeof (data as { error: unknown }).error === 'string'
          ? String((data as { error: string }).error)
          : JSON.stringify((data as { error: unknown }).error)
        : res.statusText;
    throw new OpsApiError(msg || 'Ops API error', res.status);
  }

  return data;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
