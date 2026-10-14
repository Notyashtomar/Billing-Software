import type { FhrCollectionService } from '../../fhr-collection/services/fhr-collection.service';

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Known embed paths for a station / Bird logo on `fhr_collection` (flexible Mongo fields). */
const FHR_LOGO_PATHS: Array<(doc: Record<string, unknown>) => unknown> = [
  (d) => d.stationLogo,
  (d) => d.logo,
  (d) => d.logoDataUrl,
  (d) => d.logoUrl,
  (d) => d.companyLogo,
  (d) => d.birdLogo,
  (d) => asRecord(d.mainDetails)?.stationLogo,
  (d) => asRecord(d.mainDetails)?.logo,
  (d) => asRecord(d.mainDetails)?.logoDataUrl,
  (d) => asRecord(d.terminalDetails)?.stationLogo,
  (d) => asRecord(d.terminalDetails)?.logo,
  (d) => asRecord(d.attachments)?.stationLogo,
];

function normalizeLogoSrc(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (
    s.startsWith('data:image/') ||
    s.startsWith('https://') ||
    s.startsWith('http://')
  ) {
    return s;
  }
  return null;
}

/** Route from `fhr_collection` embeds — same sources as cancelled-flights list. */
export function routeFromFhrDoc(doc: Record<string, unknown>): string {
  const m = asRecord(doc.mainDetails) ?? {};
  const td = asRecord(doc.terminalDetails) ?? {};
  return firstNonEmpty(m.Route, m.route, td.routing, td.Routing);
}

/** Logo data URL / https from `fhr_collection` when present. */
export function logoSrcFromFhrDoc(doc: Record<string, unknown>): string | null {
  for (const pick of FHR_LOGO_PATHS) {
    const found = normalizeLogoSrc(String(pick(doc) ?? ''));
    if (found) return found;
  }
  return null;
}

export function parseInstanceSerial(serial: string): number | null {
  const n = parseInt(String(serial ?? '').trim().replace(/^FL-/i, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export type CancellationFhrEmailContext = {
  route: string;
  stationLogoSrc: string | null;
};

/**
 * Enrich cancellation email assets from `fhr_collection` by instance serial.
 * Falls back to env/public logo when the document has no embedded logo.
 */
export async function resolveCancellationFhrEmailContext(
  instanceSerial: string,
  fhrCollectionService: Pick<FhrCollectionService, 'getLeanFhrBySerial'>,
): Promise<CancellationFhrEmailContext> {
  const serial = parseInstanceSerial(instanceSerial);
  let route = '';
  let stationLogoSrc: string | null = null;

  if (serial != null) {
    const doc = await fhrCollectionService.getLeanFhrBySerial(serial);
    if (doc) {
      route = routeFromFhrDoc(doc);
      stationLogoSrc = logoSrcFromFhrDoc(doc);
    }
  }

  return { route, stationLogoSrc };
}
