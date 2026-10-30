import { getApiBase } from '@/lib/api';

/** Live FRIS. Billing opens this instead of local flight/advance modules. */
export const DEPLOYED_FRIS_ORIGIN = 'https://fris.bird-in.workers.dev';

export const DEPLOYED_SCHEDULED_AIRLINES_PATH =
  '/fris/flights/scheduledairlines';

export function deployedFrisUrl(pathAndQuery: string): string {
  if (/^https?:\/\//i.test(pathAndQuery)) return pathAndQuery;
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return `${DEPLOYED_FRIS_ORIGIN}${path}`;
}

/**
 * Open the deployed FRIS site, with the billing login station in the query.
 * A local /fris path 404s on the billing dev server.
 */
export function billingFrisHref(pathAndQuery: string, stationCode?: string): string {
  const fromBrowser =
    typeof window === 'undefined'
      ? ''
      : String(window.localStorage.getItem('userStationCode') || '').trim();
  return deployedFrisUrl(withStationCodeQuery(pathAndQuery, stationCode || fromBrowser));
}

/** Keep the billing login station when opening FRIS, so IXA does not land on COK. */
export function withStationCodeQuery(pathAndQuery: string, stationCode?: string): string {
  const code = String(stationCode ?? '').trim().toUpperCase();
  if (!code) return pathAndQuery;
  const hashIndex = pathAndQuery.indexOf('#');
  const hash = hashIndex >= 0 ? pathAndQuery.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? pathAndQuery.slice(0, hashIndex) : pathAndQuery;
  const splitAt = withoutHash.indexOf('?');
  const path = splitAt >= 0 ? withoutHash.slice(0, splitAt) : withoutHash;
  const params = new URLSearchParams(splitAt >= 0 ? withoutHash.slice(splitAt + 1) : '');
  params.set('stationCode', code);
  return `${path}?${params.toString()}${hash}`;
}

/**
 * Open live FRIS in a new tab already signed in.
 * Billing and FRIS are different sites, so the billing cookie is not sent.
 * A 90-second code is minted here and redeemed on the FRIS origin.
 */
export function openDeployedFris(href: string): void {
  const target = new URL(href, DEPLOYED_FRIS_ORIGIN);
  const popup = window.open('about:blank', '_blank');
  void (async () => {
    try {
      const base = getApiBase().replace(/\/$/, '');
      const res = await fetch(`${base}/auth/fris-handoff`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Auth-Scope': 'fris' },
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      const code = String(data.code ?? '').trim();
      if (res.ok && code) {
        target.hash = `handoff=${encodeURIComponent(code)}`;
      }
    } catch {
      /* Live FRIS will show its own login if the handoff could not be issued. */
    }
    const url = target.toString();
    if (popup) popup.location.href = url;
    else window.location.assign(url);
  })();
}

/** Advance and Flights routes that billing should open on the deployed FRIS. */
export function isBillingDeployedFrisPath(path: string): boolean {
  const route = (path.split('?')[0] ?? path).trim();
  return (
    route === '/fris/advance' ||
    route.startsWith('/fris/advance/') ||
    route === '/fris/flights' ||
    route.startsWith('/fris/flights/')
  );
}
