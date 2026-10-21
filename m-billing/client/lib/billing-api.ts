/**
 * Billing API client — FRIS integration (api-backend proxy + auth cookies).
 */
import { getApiBase } from '@/lib/api';
import { getPdfLibModule } from '@/lib/dynamic-imports';
import {
  DEFAULT_API_TIMEOUT_MS,
  LONG_API_TIMEOUT_MS,
  MIS_ADS_EXPORT_TIMEOUT_MS,
} from '@/lib/fetch-with-abort';
import { frisFetch, type FrisFetchInit } from '@/lib/fris-auth-fetch';

export type BillingApiConfig = {
  getApiBase: () => string;
  fetch: (url: string, init?: FrisFetchInit) => Promise<Response>;
};

const GET_RETRY_ATTEMPTS = 2;
const GET_RETRY_DELAY_MS = 300;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Paths that often exceed the default client deadline (also often @SkipTimeout server-side). */
const LONG_BILLING_PATH_RE =
  /\/billing\/(preparation\/(ingest|refresh|create-drafts|submit-custom|bulk-ready|bulk-delete(?:-by-filter)?|unsend)|sources\/(ads|raf)(?:\/|$)|invoices\/[^/]+\/(generate|pdf|backing-sheet\/pdf|send-to-airline)|invoices\/send-to-airline|customers\/sync-from-advance|price-card-airlines\/bulk|cutover\/|mis-bhs\/|mis-ads\/|invoice-drafts\/?$|invoice-drafts\/(merge|bulk-delete|custom-bill|refresh-all)|invoice-drafts\/[^/]+\/(recompute|refresh-rates|split-ads-lines|custom-lines|lines|custom-bill|total-receivable-usd))/i;

function resolveBillingTimeoutMs(path: string, init?: FrisFetchInit): number | null {
  if (init?.timeoutMs !== undefined) return init.timeoutMs;
  if (LONG_BILLING_PATH_RE.test(path)) return LONG_API_TIMEOUT_MS;
  return DEFAULT_API_TIMEOUT_MS;
}

function sanitizeBillingErrorMessage(input: string): string {
  const msg = input.trim();
  if (!msg) return 'Billing service is temporarily unavailable. Please retry.';
  if (/timeout|timed out|request timeout/i.test(msg)) {
    return 'Billing service is taking longer than usual. Refresh to confirm status before retrying — the first request may still complete.';
  }
  if (/invalid json|unreadable response|unexpected token/i.test(msg)) {
    return 'Billing service returned an unreadable response. Please refresh and retry.';
  }
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return 'Unable to reach billing service. Check your connection and retry.';
  }
  return msg;
}

function isRetryableFetchError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|networkerror|timeout|timed out|connection|reset/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function billingUrl(base: string, path: string) {
  const root = base.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

async function parseJson<T = { data?: unknown; meta?: Record<string, unknown> }>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    const err = data && typeof data === 'object' ? (data as { message?: string }) : {};
    throw new Error(
      sanitizeBillingErrorMessage(err.message || text || `Billing API error (${res.status})`),
    );
  }

  if (data == null) {
    throw new Error(
      'Billing service returned an unreadable response. Please refresh and retry.',
    );
  }
  return data as T;
}

async function parseJsonWithFallback<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    const err = data && typeof data === 'object' ? (data as { message?: string }) : {};
    throw new Error(
      sanitizeBillingErrorMessage(err.message || text || `Billing API error (${res.status})`),
    );
  }

  if (data == null) {
    return fallback;
  }

  return data as T;
}

export type EquipmentMasterUomRecord = {
  uom: string;
  abbreviation: string;
};

export type EquipmentMasterRecord = {
  _id: string;
  itemNo: string;
  description: string;
  unitType: string;
  uoms: EquipmentMasterUomRecord[];
};

export type EquipmentMasterWrite = {
  itemNo?: string;
  description?: string;
  unitType?: string;
  uoms?: EquipmentMasterUomRecord[];
};

function annexureFileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* use the plain filename */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

export function createBillingApi({ getApiBase, fetch }: BillingApiConfig) {
  const request = async (path: string, init?: FrisFetchInit) => {
    const url = billingUrl(getApiBase(), path);
    const method = (init?.method ?? 'GET').toUpperCase();
    const isMisAdsHeavy = /\/billing\/mis-ads\/(export|preview)/i.test(path);
    const isAdsSourcesList = /\/billing\/sources\/ads(?:\?|$)/i.test(path);
    const isLongBilling = LONG_BILLING_PATH_RE.test(path);
    const attempts =
      method === 'GET' || method === 'HEAD'
        ? isMisAdsHeavy || isAdsSourcesList
          ? 1
          : GET_RETRY_ATTEMPTS
        : 1;
    const timeoutMs = resolveBillingTimeoutMs(path, init);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          ...init,
          timeoutMs,
        });
        if (
          attempt < attempts &&
          RETRYABLE_STATUSES.has(res.status) &&
          !(isLongBilling && (res.status === 408 || res.status === 504))
        ) {
          await sleep(GET_RETRY_DELAY_MS * attempt);
          continue;
        }
        return res;
      } catch (error) {
        lastError = error;
        const timedOut = /timeout|timed out/i.test(
          error instanceof Error ? error.message : String(error ?? ''),
        );
        if (
          attempt < attempts &&
          isRetryableFetchError(error) &&
          !isMisAdsHeavy &&
          !(timedOut && LONG_BILLING_PATH_RE.test(path))
        ) {
          await sleep(GET_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(
          sanitizeBillingErrorMessage(error instanceof Error ? error.message : String(error)),
        );
      }
    }

    throw new Error(
      sanitizeBillingErrorMessage(
        lastError instanceof Error ? lastError.message : String(lastError ?? ''),
      ),
    );
  };

  const listSources = (
    endpoint: string,
    params: {
      from: string;
      to: string;
      dateBasis?: string;
      customerCode?: string;
    },
  ) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.dateBasis) qs.set('dateBasis', params.dateBasis);
    if (params.customerCode) qs.set('customerCode', params.customerCode);
    const path = `/billing/sources/${endpoint}?${qs}`;
    return request(path).then((r) =>
      parseJsonWithFallback<{
        data: import('@/lib/billing-shared/billing-sources').BillingSourcesResponse;
      }>(r, {
        data: {
          rows: [],
          summary: { total: 0, eligible: 0, errors: 0, ready: 0 },
          from: params.from,
          to: params.to,
          sourceType: endpoint,
        },
      }),
    );
  };

  const fetchInvoicePdfBlob = async (id: string) => {
    const res = await request(`/billing/invoices/${id}/pdf`);
    return parsePdfDownloadResponse(res);
  };

  const parsePdfDownloadResponse = async (res: Response) => {
    const json = await parseJson<{
      data: { contentType: string; body: string; encoding?: 'base64'; fileName: string };
    }>(res);
    const { contentType, body, encoding, fileName } = json.data;
    const bytes =
      encoding === 'base64'
        ? Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
        : new TextEncoder().encode(body);
    return { blob: new Blob([bytes], { type: contentType }), fileName };
  };

  /** Trigger a real file download (works; Chrome PDF-viewer Download on blob: URLs does not). */
  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'invoice.pdf';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const mergePdfBlobs = async (blobs: Blob[]): Promise<Blob> => {
    if (blobs.length === 0) {
      throw new Error('No invoice PDFs to merge.');
    }
    const { PDFDocument } = await getPdfLibModule();
    const merged = await PDFDocument.create();
    for (const blob of blobs) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const pdf = await PDFDocument.load(bytes);
      const copied = await merged.copyPages(pdf, pdf.getPageIndices());
      copied.forEach((page) => merged.addPage(page));
    }
    const out = await merged.save();
    return new Blob([Uint8Array.from(out)], { type: 'application/pdf' });
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  /**
   * Open PDF in a preview window with an app-owned Download control.
   * Do not hand a bare blob: URL to Chrome's PDF viewer — its Download button
   * re-fetches the blob and fails with "Check internet connection".
   */
  const openPdfBlob = (blob: Blob, fileName = 'invoice.pdf') => {
    const url = URL.createObjectURL(blob);
    const preview = window.open('', '_blank');
    if (!preview) {
      URL.revokeObjectURL(url);
      throw new Error('Pop-up blocked — allow pop-ups to view the PDF.');
    }

    const safeName = (fileName || 'invoice.pdf').replace(/[\r\n\u0000]/g, '').trim() || 'invoice.pdf';
    const title = escapeHtml(safeName);
    const urlJson = JSON.stringify(url);
    const nameJson = JSON.stringify(safeName);

    preview.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #111827;
      color: #f9fafb;
    }
    header {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
    }
    h1 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: #059669;
      color: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 14px;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: #047857; }
    button:focus-visible { outline: 2px solid #6ee7b7; outline-offset: 2px; }
    iframe {
      flex: 1;
      width: 100%;
      border: 0;
      background: #525659;
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <button type="button" id="download-btn">Download PDF</button>
  </header>
  <iframe title="${title}" src="${url}"></iframe>
  <script>
    document.getElementById('download-btn').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = ${urlJson};
      a.download = ${nameJson};
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  </script>
</body>
</html>`);
    preview.document.close();

    const revoke = () => URL.revokeObjectURL(url);
    const timer = window.setTimeout(revoke, 30 * 60_000);
    const poll = window.setInterval(() => {
      if (preview.closed) {
        window.clearInterval(poll);
        window.clearTimeout(timer);
        revoke();
      }
    }, 1500);
  };

  return {
    getDashboard: () =>
      request('/billing/dashboard').then((r) => parseJson<{ data: unknown }>(r)),

    getExecutiveDashboard: (params: { period: string; airline?: string; service?: string }) => {
      const qs = new URLSearchParams({ period: params.period });
      if (params.airline && params.airline !== 'All airlines') qs.set('airline', params.airline);
      if (params.service && params.service !== 'All') qs.set('service', params.service);
      return request(`/billing/dashboard/executive?${qs.toString()}`).then((r) =>
        parseJson<{ data: ExecutiveDashboardMetrics }>(r),
      );
    },

    listCustomers: (params?: {
      search?: string;
      page?: number;
      limit?: number;
      active?: 'true' | 'false' | 'all';
    }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.active) qs.set('active', params.active);
      const q = qs.toString();
      return request(`/billing/customers${q ? `?${q}` : ''}`).then((r) =>
        parseJson<{ data: unknown[]; meta?: { total?: number; totalPages?: number } }>(r),
      );
    },

    createCustomer: (body: Record<string, unknown>) =>
      request('/billing/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateCustomer: (id: string, body: Record<string, unknown>) =>
      request(`/billing/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteCustomer: (id: string) =>
      request(`/billing/customers/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    bulkDeleteCustomers: (ids: string[]) =>
      request('/billing/customers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    deleteAllCustomers: () =>
      request('/billing/customers/delete-all', { method: 'POST' }).then((r) => parseJson(r)),

    uploadCustomerAnnexure: (id: string, category: 'ADS' | 'BHS', file: File) => {
      const body = new FormData();
      body.append('category', category);
      body.append('file', file);
      return request(`/billing/customers/${id}/annexure`, {
        method: 'POST',
        body,
      }).then((r) => parseJson(r));
    },

    deleteCustomerAnnexure: (id: string, category: 'ADS' | 'BHS') =>
      request(`/billing/customers/${id}/annexure?category=${category}`, { method: 'DELETE' }).then(
        (r) => parseJson(r),
      ),

    openCustomerAnnexure: async (customerCode: string, category: 'ADS' | 'BHS') => {
      const qs = new URLSearchParams({
        customerCode: customerCode.trim().toUpperCase(),
        category,
      });
      const res = await request(`/billing/customers/annexure-file?${qs.toString()}`);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || type.includes('application/json')) {
        await parseJson(res);
        return;
      }
      const blob = await res.blob();
      const pdf = blob.type.includes('pdf')
        ? blob
        : new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
      const fileName = annexureFileNameFromDisposition(
        res.headers.get('content-disposition'),
        `${customerCode.trim().toUpperCase()}-${category}-annexure.pdf`,
      );
      openPdfBlob(pdf, fileName);
    },

    listAircraftMaster: () =>
      request('/billing/aircraft-master').then((r) =>
        parseJson<{ data: Array<Record<string, unknown>> }>(r),
      ),

    importAircraftMaster: (body: { headers: string[]; rows: Array<Record<string, string>> }) =>
      request('/billing/aircraft-master/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson<{ data: Array<Record<string, unknown>> }>(r)),

    listEquipmentMaster: () =>
      request('/billing/equipment-master').then((r) =>
        parseJson<{ data: EquipmentMasterRecord[] }>(r),
      ),

    createEquipmentMaster: (body: EquipmentMasterWrite) =>
      request('/billing/equipment-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson<{ data: EquipmentMasterRecord }>(r)),

    updateEquipmentMaster: (id: string, body: EquipmentMasterWrite) =>
      request(`/billing/equipment-master/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson<{ data: EquipmentMasterRecord }>(r)),

    deleteEquipmentMaster: (id: string) =>
      request(`/billing/equipment-master/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    listServiceCatalog: (params?: { category?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.search) qs.set('search', params.search);
      const q = qs.toString();
      return request(`/billing/service-catalog${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    createServiceCatalog: (body: Record<string, unknown>) =>
      request('/billing/service-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateServiceCatalog: (serviceCode: string, body: Record<string, unknown>) =>
      request(`/billing/service-catalog/${encodeURIComponent(serviceCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteServiceCatalog: (serviceCode: string) =>
      request(`/billing/service-catalog/${encodeURIComponent(serviceCode)}`, {
        method: 'DELETE',
      }).then((r) => parseJson(r)),

    bulkDeleteServiceCatalog: (serviceCodes: string[]) =>
      request('/billing/service-catalog/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceCodes }),
      }).then((r) => parseJson(r)),

    deleteAllServiceCatalog: () =>
      request('/billing/service-catalog/delete-all', { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    listContracts: (customerCode?: string) => {
      const q = customerCode ? `?customerCode=${encodeURIComponent(customerCode)}` : '';
      return request(`/billing/contracts${q}`).then((r) => parseJson(r));
    },

    getContract: (id: string) =>
      request(`/billing/contracts/${encodeURIComponent(id)}`).then((r) => parseJson(r)),

    createContract: (body: Record<string, unknown>) =>
      request('/billing/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    activateContract: (
      id: string,
      body?: { kycOverride?: boolean; kycOverrideReason?: string },
    ) =>
      request(`/billing/contracts/${id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }).then((r) => parseJson(r)),

    updateContract: (id: string, body: Record<string, unknown>) =>
      request(`/billing/contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteContract: (id: string) =>
      request(`/billing/contracts/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    bulkDeleteContracts: (ids: string[]) =>
      request('/billing/contracts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    deleteAllContracts: () =>
      request('/billing/contracts/delete-all', { method: 'POST' }).then((r) => parseJson(r)),

    listRateCards: (params?: { customerCode?: string; serviceCode?: string }) => {
      const qs = new URLSearchParams();
      if (params?.customerCode?.trim()) {
        qs.set('customerCode', params.customerCode.trim().toUpperCase());
      }
      if (params?.serviceCode?.trim()) {
        qs.set('serviceCode', params.serviceCode.trim());
      }
      const q = qs.toString();
      return request(`/billing/rate-cards${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    createRateCard: (body: Record<string, unknown>) =>
      request('/billing/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateRateCard: (id: string, body: Record<string, unknown>) =>
      request(`/billing/rate-cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteRateCard: (id: string) =>
      request(`/billing/rate-cards/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    bulkDeleteRateCards: (ids: string[]) =>
      request('/billing/rate-cards/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    deleteAllRateCards: () =>
      request('/billing/rate-cards/delete-all', { method: 'POST' }).then((r) => parseJson(r)),

    listPriceCardAirlines: (params?: { handlingType?: string; customerCode?: string }) => {
      const qs = new URLSearchParams();
      if (params?.handlingType) qs.set('handlingType', params.handlingType);
      if (params?.customerCode?.trim()) {
        qs.set('customerCode', params.customerCode.trim().toUpperCase());
      }
      const q = qs.toString();
      return request(`/billing/price-card-airlines${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    createPriceCardAirlinesBulk: (body: Record<string, unknown>) =>
      request('/billing/price-card-airlines/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deletePriceCardAirline: (id: string) =>
      request(`/billing/price-card-airlines/${id}`, { method: 'DELETE' }).then((r) =>
        parseJson(r),
      ),

    updatePriceCardAirline: (id: string, body: Record<string, unknown>) =>
      request(`/billing/price-card-airlines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    listRafAdhocRates: () =>
      request('/billing/raf-adhoc-rates').then((r) => parseJson(r)),

    createRafAdhocRates: (body: Record<string, unknown>) =>
      request('/billing/raf-adhoc-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateRafAdhocRate: (id: string, body: Record<string, unknown>) =>
      request(`/billing/raf-adhoc-rates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteRafAdhocRate: (id: string) =>
      request(`/billing/raf-adhoc-rates/${id}`, { method: 'DELETE' }).then((r) =>
        parseJson(r),
      ),

    getSettings: () => request('/billing/settings').then((r) => parseJson(r)),

    updateSettings: (body: Record<string, unknown>) =>
      request('/billing/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    listTaxRules: () => request('/billing/tax-rules').then((r) => parseJson(r)),

    createTaxRule: (body: Record<string, unknown>) =>
      request('/billing/tax-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateTaxRule: (id: string, body: Record<string, unknown>) =>
      request(`/billing/tax-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    listExchangeRates: () => request('/billing/exchange-rates').then((r) => parseJson(r)),

    getEffectiveExchangeRate: (params: { currencyCode: string; date: string }) => {
      const qs = new URLSearchParams({
        currencyCode: params.currencyCode,
        date: params.date,
      });
      return request(`/billing/exchange-rates/effective?${qs}`).then((r) => parseJson(r));
    },

    createExchangeRate: (body: Record<string, unknown>) =>
      request('/billing/exchange-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateExchangeRate: (id: string, body: Record<string, unknown>) =>
      request(`/billing/exchange-rates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteExchangeRate: (id: string) =>
      request(`/billing/exchange-rates/${id}`, {
        method: 'DELETE',
      }).then((r) => parseJson(r)),

    listSequences: () => request('/billing/sequences').then((r) => parseJson(r)),

    createSequence: (body: Record<string, unknown>) =>
      request('/billing/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateSequence: (id: string, body: Record<string, unknown>) =>
      request(`/billing/sequences/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    deleteSequence: (id: string) =>
      request(`/billing/sequences/${id}`, {
        method: 'DELETE',
      }).then((r) => parseJson(r)),

    listSources,

    listScheduledFlights: (params: {
      from: string;
      to: string;
      dateBasis?: string;
      customerCode?: string;
    }) => listSources('scheduled-flights', params),

    listCleaning: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('cleaning', params),

    listRaf: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('raf', params),

    listRafAirlines: () =>
      request('/billing/sources/raf/airlines').then((r) =>
        parseJson<{
          success?: boolean;
          data?: Array<{
            customerCode: string;
            name: string;
            deepCleaning?: boolean;
            nightHaltCleaning?: boolean;
            exteriorCleaning?: boolean;
          }>;
        }>(r),
      ),

    listMaas: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('maas', params),

    listAds: (params: {
      from: string;
      to: string;
      dateBasis?: string;
      customerCode?: string;
    }) => listSources('ads', params),

    listAdsAircraftTypes: (params: {
      from: string;
      to: string;
      customerCode: string;
      dateBasis?: string;
    }) => {
      const qs = new URLSearchParams();
      qs.set('from', params.from);
      qs.set('to', params.to);
      qs.set('customerCode', params.customerCode);
      if (params.dateBasis) qs.set('dateBasis', params.dateBasis);
      return request(`/billing/sources/ads/aircraft-types?${qs.toString()}`).then((r) =>
        parseJson(r),
      );
    },

    listCustom: (params: {
      from: string;
      to: string;
      dateBasis?: string;
      customerCode?: string;
    }) => listSources('custom', params),

    listXxldScheduled: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('xxld', params),

    listXxldNonScheduled: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('xxld/non-scheduled', params),

    listEquipment: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('equipment', params),

    listManpower: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('manpower', params),

    listNonScheduled: (params: { from: string; to: string; customerCode?: string }) =>
      listSources('non-scheduled', params),

    listPreparation: (params?: {
      status?: string;
      from?: string;
      to?: string;
      customerCode?: string;
      sourceType?: string;
      page?: number;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.customerCode) qs.set('customerCode', params.customerCode);
      if (params?.sourceType) qs.set('sourceType', params.sourceType);
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const q = qs.toString();
      const path = `/billing/preparation${q ? `?${q}` : ''}`;
      return request(path).then((r) =>
        parseJsonWithFallback<{
          data: import('@/lib/billing-shared/types').BillingPreparationRecord[];
          meta?: {
            tabCounts?: Record<string, number>;
            scopedTabCounts?: Record<string, number>;
            scopedTotal?: number;
            scopedReadyCount?: number;
            scopedCustomCount?: number;
            total?: number;
            page?: number;
            limit?: number;
          };
        }>(r, { data: [], meta: { total: 0 } }),
      );
    },

    updateCustomBilling: (
      id: string,
      body: {
        lines: Array<{
          particular: string;
          used: number;
          charged: number;
          aircraftType?: string;
          unit: string;
          ratePerUnit: number;
        }>;
        concessionPercent?: number;
        conversionRate?: number | null;
      },
    ) =>
      request(`/billing/preparation/${id}/custom-billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    submitCustomBilling: (body: {
      preparationRecordIds?: string[];
      customerCode?: string;
      billingPeriodStart?: string;
      billingPeriodEnd?: string;
      concessionPercent?: number;
      conversionRate?: number;
      flightNo?: string;
      bookingNo?: string;
      registrationNo?: string;
      routing?: string;
      opsType?: string;
      aircraftType?: string;
      categoryOfFlight?: string;
      lines?: Array<{
        particular: string;
        used: number;
        charged: number;
        aircraftType?: string;
        unit: string;
        ratePerUnit: number;
      }>;
    }) =>
      request('/billing/preparation/submit-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    getPreparation: (id: string) =>
      request(`/billing/preparation/${id}`).then((r) => parseJson(r)),

    ingestPreparation: (body: {
      billingPeriodStart: string;
      billingPeriodEnd: string;
      rows: unknown[];
    }) =>
      request('/billing/preparation/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) =>
        parseJson(r),
      ),

    validatePreparation: (id: string) =>
      request(`/billing/preparation/${id}/validate`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    refreshPreparation: (params?: {
      from?: string;
      to?: string;
      customerCode?: string;
      status?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.customerCode) qs.set('customerCode', params.customerCode);
      if (params?.status) qs.set('status', params.status);
      const q = qs.toString();
      return request(`/billing/preparation/refresh${q ? `?${q}` : ''}`, {
        method: 'POST',
      }).then((r) =>
        parseJson<{
          data?: {
            refreshed?: number;
            statusChanged?: number;
            failed?: number;
            total?: number;
          };
        }>(r),
      );
    },

    updatePreparationChecklist: (
      id: string,
      body: {
        manualOverrides?: Record<string, boolean>;
        customChecks?: Array<{
          id: string;
          label: string;
          message?: string;
          passed: boolean;
        }>;
        cancellationBilling?: {
          enabled: boolean;
          bhsChargeablePercent?: number;
        };
      },
    ) =>
      request(`/billing/preparation/${id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    sendBackPreparation: (
      id: string,
      body: {
        targetStatus: 'eligible' | 'pending' | 'validation_error';
        reason?: string;
      },
    ) =>
      request(`/billing/preparation/${id}/send-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    addPreparationRemark: (
      id: string,
      body: {
        body: string;
        audience: 'preparation' | 'draft_invoicing' | 'all';
        directedToUserId?: string;
        directedToUserName?: string;
      },
    ) =>
      request(`/billing/preparation/${id}/remarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    rejectPreparation: (id: string, reason?: string) =>
      request(`/billing/preparation/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }).then((r) => parseJson(r)),

    markPreparationReady: (id: string) =>
      request(`/billing/preparation/${id}/ready`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    bulkMarkPreparationReady: (ids: string[]) =>
      request('/billing/preparation/bulk-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) =>
        parseJson<{
          data?: {
            succeeded?: number;
            failed?: number;
            results?: Array<{ id: string; ok: boolean; message?: string }>;
          };
        }>(r),
      ),

    bulkMarkPreparationReadyByFilter: (body: {
      status: 'pending' | 'eligible' | 'validation_error';
      from?: string;
      to?: string;
      customerCode?: string;
    }) =>
      request('/billing/preparation/bulk-ready-by-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) =>
        parseJson<{
          data?: {
            succeeded?: number;
            failed?: number;
            results?: Array<{ id: string; ok: boolean; message?: string }>;
          };
        }>(r),
      ),

    bulkDeletePreparation: (ids: string[]) =>
      request('/billing/preparation/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) =>
        parseJson<{
          data?: {
            deleted?: number;
            failed?: Array<{ id: string; message: string }>;
            failedCount?: number;
            requested?: number;
          };
        }>(r),
      ),

    bulkDeletePreparationByFilter: (body: {
      status:
        | 'pending'
        | 'eligible'
        | 'validation_error'
        | 'rejected'
        | 'ready_for_invoice';
      from?: string;
      to?: string;
      customerCode?: string;
    }) =>
      request('/billing/preparation/bulk-delete-by-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) =>
        parseJson<{
          data?: {
            deleted?: number;
            failed?: Array<{ id: string; message: string }>;
            failedCount?: number;
            requested?: number;
          };
        }>(r),
      ),

    unsendPreparationBySource: (body: {
      billingPeriodStart: string;
      billingPeriodEnd?: string;
      sourceType: string;
      serialNos?: string[];
      usageRowIds?: string[];
    }) =>
      request('/billing/preparation/unsend-by-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) =>
        parseJson<{
          data?: {
            unsent?: number;
            failed?: Array<{ serialNo: string; message: string }>;
            requested?: number;
            unsentSerialNos?: string[];
            unsentUsageRowIds?: string[];
          };
        }>(r),
      ),

    createDraftsFromPreparation: (body: {
      preparationRecordIds?: string[];
      groupByCustomer?: boolean;
      mergeOpenDraft?: boolean;
      billingPeriodStart?: string;
      billingPeriodEnd?: string;
      customerCode?: string;
      documentDate?: string;
    }) =>
      request('/billing/preparation/create-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: 300_000,
      }).then((r) => parseJson(r)),

    listReadyInvoiceCustomers: (params?: {
      from?: string;
      to?: string;
      customerCode?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.customerCode) qs.set('customerCode', params.customerCode);
      const q = qs.toString();
      return request(`/billing/preparation/ready-customers${q ? `?${q}` : ''}`).then((r) =>
        parseJson<{ data: string[] }>(r),
      );
    },

    preparationPresenceHeartbeat: (body: {
      sessionId: string;
      periodFrom?: string;
      periodTo?: string;
      interests?: Array<{
        customerCode: string;
        category: 'BHS' | 'ADS';
        flightKeys: string[];
      }>;
    }) =>
      request('/billing/preparation/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) =>
        parseJson<{
          data?: {
            conflicts?: Array<{
              userId: string;
              userName: string;
              customerCode: string;
              category: 'BHS' | 'ADS';
              overlappingFlightKeys: string[];
              lastSeenAt: string;
            }>;
          };
        }>(r),
      ),

    clearPreparationPresence: (sessionId: string) =>
      request(`/billing/preparation/presence/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }).then((r) => parseJson(r)),

    listInvoiceDrafts: (params?: { status?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      qs.set('limit', String(params?.limit ?? 5000));
      const q = qs.toString();
      const path = `/billing/invoice-drafts${q ? `?${q}` : ''}`;
      return request(path).then((r) =>
        parseJsonWithFallback<{ data: unknown[]; meta?: unknown }>(r, { data: [] }),
      );
    },

    getInvoiceDraft: (id: string) =>
      request(`/billing/invoice-drafts/${id}`).then((r) => parseJson(r)),

    addDraftPreparationRemark: (
      draftId: string,
      body: {
        body: string;
        audience: 'preparation' | 'draft_invoicing' | 'all';
        directedToUserId?: string;
        directedToUserName?: string;
        preparationRecordId?: string;
      },
    ) =>
      request(`/billing/invoice-drafts/${draftId}/remarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    submitDraftApproval: (id: string) =>
      request(`/billing/invoice-drafts/${id}/submit-approval`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    convertDraftToUsd: (id: string) =>
      request(`/billing/invoice-drafts/${id}/convert-to-usd`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    convertDraftToInr: (id: string) =>
      request(`/billing/invoice-drafts/${id}/convert-to-inr`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    setDraftTotalReceivableUsd: (id: string) =>
      request(`/billing/invoice-drafts/${id}/total-receivable-usd`, {
        method: 'POST',
      }).then((r) => parseJson(r)),

    setDraftTotalReceivableInr: (id: string) =>
      request(`/billing/invoice-drafts/${id}/total-receivable-inr`, {
        method: 'POST',
      }).then((r) => parseJson(r)),

    recomputeDraftFromPreparation: (id: string) =>
      request(`/billing/invoice-drafts/${id}/recompute-from-preparation`, {
        method: 'POST',
      }).then((r) => parseJson(r)),

    refreshDraftRates: (id: string) =>
      request(`/billing/invoice-drafts/${id}/refresh-rates`, {
        method: 'POST',
      }).then((r) => parseJson(r)),

    refreshAllInvoiceDrafts: () =>
      request(`/billing/invoice-drafts/refresh-all`, {
        method: 'POST',
      }).then((r) => parseJson(r)),

    updateCustomInvoiceDraftLines: (
      id: string,
      body: {
        concessionPercent?: number;
        conversionRate?: number | null;
        lines: Array<{
          particular: string;
          used: number;
          charged: number;
          aircraftType?: string;
          unit: string;
          ratePerUnit: number;
        }>;
      },
    ) =>
      request(`/billing/invoice-drafts/${id}/custom-lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateInvoiceDraftLines: (
      id: string,
      body: {
        lines: Array<{
          lineNo: number;
          description?: string;
          quantity?: number;
          unitPrice?: number;
          uom?: string;
          usedQuantity?: number;
          pricingBasis?: string;
        }>;
      },
    ) =>
      request(`/billing/invoice-drafts/${id}/lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    updateCustomBillDraft: (
      id: string,
      body: {
        billToName?: string;
        billToAddress?: string;
        billToGstin?: string;
        billToPan?: string;
        billToStateCode?: string;
        placeOfSupply?: string;
        serviceStation?: string;
        serviceTableTitle?: string;
        concessionPercent?: number;
        lines?: Array<{
          lineNo: number;
          description?: string;
          quantity?: number;
          unitPrice?: number;
          uom?: string;
          particular?: string;
          used?: number;
          charged?: number;
          aircraftType?: string;
          ratePerUnit?: number;
        }>;
      },
    ) =>
      request(`/billing/invoice-drafts/${id}/custom-bill`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    splitAdsInvoiceDraft: (id: string, lineNos: number[]) =>
      request(`/billing/invoice-drafts/${id}/split-ads-lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineNos }),
      }).then((r) => parseJson(r)),

    deleteInvoiceDraft: (id: string) =>
      request(`/billing/invoice-drafts/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    bulkDeleteInvoiceDrafts: (ids: string[]) =>
      request('/billing/invoice-drafts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    mergeInvoiceDrafts: (ids: string[]) =>
      request('/billing/invoice-drafts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    listReviewQueue: (params?: { status?: string }) => {
      const qs = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
      return request(`/billing/review${qs}`).then((r) => parseJson(r));
    },

    approveReview: (invoiceId: string) =>
      request(`/billing/review/${invoiceId}/approve`, { method: 'POST' }).then((r) => parseJson(r)),

    listInvoices: (params?: {
      status?: string;
      customerCode?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.customerCode) qs.set('customerCode', params.customerCode);
      qs.set('limit', String(params?.limit ?? 5000));
      const q = qs.toString();
      return request(`/billing/invoices${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    getInvoice: (id: string) => request(`/billing/invoices/${id}`).then((r) => parseJson(r)),

    deleteInvoice: (id: string) =>
      request(`/billing/invoices/${id}`, { method: 'DELETE' }).then((r) => parseJson(r)),

    bulkDeleteInvoices: (ids: string[]) =>
      request('/billing/invoices/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    listInvoiceBin: (params?: { customerCode?: string }) => {
      const qs = params?.customerCode
        ? `?customerCode=${encodeURIComponent(params.customerCode)}`
        : '';
      return request(`/billing/invoice-bin${qs}`).then((r) => parseJson(r));
    },

    moveInvoicesToBin: (ids: string[]) =>
      request('/billing/invoice-bin/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    restoreInvoicesFromBin: (ids: string[]) =>
      request('/billing/invoice-bin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    bulkDeleteInvoiceBin: (ids: string[]) =>
      request('/billing/invoice-bin/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    generateInvoice: (id: string) =>
      request(`/billing/invoices/${id}/generate`, { method: 'POST' }).then((r) => parseJson(r)),

    postInvoice: (id: string, body: { postingDate: string }) =>
      request(`/billing/invoices/${id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    sendInvoicesToAirline: (ids: string[]) =>
      request('/billing/invoices/send-to-airline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then((r) => parseJson(r)),

    sendInvoiceToAirline: (id: string) =>
      request(`/billing/invoices/${id}/send-to-airline`, { method: 'POST' }).then((r) =>
        parseJson(r),
      ),

    getInvoicePdf: (id: string) =>
      request(`/billing/invoices/${id}/pdf`).then((r) =>
        parseJson<{
          data: { contentType: string; body: string; encoding?: 'base64'; fileName: string };
        }>(r),
      ),

    fetchInvoicePdfBlob,

    openInvoicePdf: async (id: string) => {
      const { blob, fileName } = await fetchInvoicePdfBlob(id);
      openPdfBlob(blob, fileName);
    },

    openInvoiceSamplePdf: async () => {
      const res = await request('/billing/invoices/pdf/sample');
      const { blob, fileName } = await parsePdfDownloadResponse(res);
      openPdfBlob(blob, fileName);
    },

    downloadInvoiceSamplePdf: async () => {
      const res = await request('/billing/invoices/pdf/sample');
      const { blob, fileName } = await parsePdfDownloadResponse(res);
      triggerBlobDownload(blob, fileName);
    },

    downloadInvoicePdf: async (id: string) => {
      const { blob, fileName } = await fetchInvoicePdfBlob(id);
      triggerBlobDownload(blob, fileName);
    },

    /** Fetch each invoice PDF and merge into one downloadable file (all pages, all airlines). */
    downloadCombinedInvoicePdfs: async (ids: string[], fileName: string) => {
      const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
      if (uniqueIds.length === 0) {
        throw new Error('No invoices selected for PDF export.');
      }
      const blobs: Blob[] = [];
      for (const id of uniqueIds) {
        const { blob } = await fetchInvoicePdfBlob(id);
        blobs.push(blob);
      }
      const combined = await mergePdfBlobs(blobs);
      triggerBlobDownload(combined, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
    },

    listCreditMemos: () => request('/billing/credit-memos').then((r) => parseJson(r)),

    createCreditMemo: (body: {
      customerCode: string;
      appliesToInvoiceId: string;
      reason: string;
      documentDate: string;
      lines?: Array<Record<string, unknown>>;
    }) =>
      request('/billing/credit-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    postCreditMemo: (id: string) =>
      request(`/billing/credit-memos/${id}/post`, { method: 'POST' }).then((r) => parseJson(r)),

    listBackingSheets: () => request('/billing/backing-sheets').then((r) => parseJson(r)),

    listReports: () => request('/billing/reports').then((r) => parseJson(r)),

    generateReport: (type: string, body: { from: string; to: string; customerCode?: string }) =>
      request(`/billing/reports/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    listAuditLogs: (params?: { entityType?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.entityType) qs.set('entityType', params.entityType);
      if (params?.limit) qs.set('limit', String(params.limit));
      const q = qs.toString();
      return request(`/billing/audit${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    getCutoverStatus: () => request('/billing/cutover/status').then((r) => parseJson(r)),

    getCutoverReconciliation: (params: { from: string; to: string; customerCode?: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      if (params.customerCode) qs.set('customerCode', params.customerCode);
      return request(`/billing/cutover/reconciliation?${qs}`).then((r) => parseJson(r));
    },

    updateCutoverSettings: (body: {
      nativeBillingEnabled?: boolean;
      cutoverPhase?: string;
      parallelRunStartDate?: string;
      bcReadOnlyDate?: string;
      frisPrimaryDate?: string;
    }) =>
      request('/billing/cutover/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    backfillPreparation: (body: {
      billingPeriodStart: string;
      billingPeriodEnd: string;
      dryRun?: boolean;
    }) =>
      request('/billing/cutover/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    importBcBaseline: (body: {
      billingPeriodStart: string;
      billingPeriodEnd: string;
      rows: Array<{ customerCode?: string; invoiceNumber?: string; totalInclTax: number }>;
    }) =>
      request('/billing/cutover/import-bc-baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    listParallelSnapshots: (params?: { limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      const q = qs.toString();
      return request(`/billing/cutover/snapshots${q ? `?${q}` : ''}`).then((r) => parseJson(r));
    },

    captureParallelSnapshot: (body: {
      from: string;
      to: string;
      weekLabel?: string;
      weekNumber?: number;
      customerCode?: string;
    }) =>
      request('/billing/cutover/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    signOffParallelPeriod: (body: { from: string; to: string; notes?: string; force?: boolean }) =>
      request('/billing/cutover/sign-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    startParallelRun: () =>
      request('/billing/cutover/start-parallel-run', { method: 'POST' }).then((r) => parseJson(r)),

    getDecommissionReadiness: () =>
      request('/billing/cutover/decommission/readiness').then((r) => parseJson(r)),

    getLegacyExportPolicy: () =>
      request('/billing/cutover/legacy-export-policy').then((r) => parseJson(r)),

    listDecommissionRecords: () =>
      request('/billing/cutover/decommission/records').then((r) => parseJson(r)),

    executeDecommission: (body: { notes?: string; force?: boolean }) =>
      request('/billing/cutover/decommission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    rollbackDecommission: (body: { reason: string }) =>
      request('/billing/cutover/decommission/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => parseJson(r)),

    getMisBhsStatus: (params: { from: string; to: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      return request(`/billing/mis-bhs/status?${qs.toString()}`).then((r) => parseJson(r));
    },

    downloadMisBhsExcel: async (params: { from: string; to: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      const res = await request(`/billing/mis-bhs/export?${qs.toString()}`, {
        timeoutMs: LONG_API_TIMEOUT_MS,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          sanitizeBillingErrorMessage(
            (() => {
              try {
                const parsed = JSON.parse(text) as { message?: string };
                return parsed.message ?? text;
              } catch {
                return text;
              }
            })(),
          ),
        );
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const fileName = match?.[1] ?? `BHS_MIS_${params.from.slice(0, 7)}.xlsx`;
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
      if (!isZip) {
        throw new Error('MIS BHS export returned an empty or invalid Excel file. Try again.');
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerBlobDownload(blob, fileName);
    },

    getMisAdsStatus: (params: { from: string; to: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      return request(`/billing/mis-ads/status?${qs.toString()}`).then((r) => parseJson(r));
    },

    getMisAdsPreview: (params: { from: string; to: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      return request(`/billing/mis-ads/preview?${qs.toString()}`, {
        timeoutMs: MIS_ADS_EXPORT_TIMEOUT_MS,
      }).then((r) => parseJson(r));
    },

    downloadMisAdsExcel: async (params: { from: string; to: string }) => {
      const qs = new URLSearchParams({ from: params.from, to: params.to });
      const res = await request(`/billing/mis-ads/export?${qs.toString()}`, {
        timeoutMs: MIS_ADS_EXPORT_TIMEOUT_MS,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          sanitizeBillingErrorMessage(
            (() => {
              try {
                const parsed = JSON.parse(text) as { message?: string };
                return parsed.message ?? text;
              } catch {
                return text;
              }
            })(),
          ),
        );
      }
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const fileName = match?.[1] ?? `ADS_MIS_${params.from.slice(0, 7)}.xlsx`;
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error('MIS ADS export did not return an Excel file. Refresh and retry.');
      }
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerBlobDownload(blob, fileName);
    },

    syncCustomersFromAdvance: () =>
      request('/billing/customers/sync-from-advance', { method: 'POST' }).then((r) => parseJson(r)),
  };
}

export type ExecutiveDashboardMetrics = {
  periodLabel: string;
  compareLabel: string;
  grossExclTax: number;
  previousGrossExclTax: number;
  grossChangeAmount: number;
  grossChangePercent: number | null;
  flights: number;
  previousFlights: number;
  eligibleFlights: number;
  invoicedFlights: number;
  completionPercent: number;
  additionalExclTax: number;
  invoicedInclTax: number;
};

export type BillingApi = ReturnType<typeof createBillingApi>;

export const billingApi = createBillingApi({ getApiBase, fetch: frisFetch });
