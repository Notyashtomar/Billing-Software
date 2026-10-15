/** Live FRIS. Billing opens this instead of local flight/advance modules. */
export const DEPLOYED_FRIS_ORIGIN = 'https://fris.bird-in.workers.dev';

export const DEPLOYED_SCHEDULED_AIRLINES_PATH =
  '/fris/flights/scheduledairlines';

export function deployedFrisUrl(pathAndQuery: string): string {
  if (/^https?:\/\//i.test(pathAndQuery)) return pathAndQuery;
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return `${DEPLOYED_FRIS_ORIGIN}${path}`;
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
