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
 * Open FRIS on this same site, with the billing station in the query.
 * A different host keeps its own station and was sending Agartala users to COK.
 */
export function billingFrisHref(pathAndQuery: string, stationCode?: string): string {
  const fromBrowser =
    typeof window === 'undefined'
      ? ''
      : String(window.localStorage.getItem('userStationCode') || '').trim();
  return withStationCodeQuery(pathAndQuery, stationCode || fromBrowser);
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
