import { getApiBase } from '@/lib/api';

type FrisNavigateResponse = {
  success?: boolean;
  redirectPath?: string;
};

async function fetchFrisRedirect(
  path: string,
  queryKey: string,
  queryValue: string,
): Promise<string> {
  const base = getApiBase().replace(/\/$/, '');
  const url = `${base}${path}?${queryKey}=${encodeURIComponent(queryValue)}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Navigation request failed (${res.status})`);
  }

  const json = (await res.json()) as FrisNavigateResponse;
  const redirectPath = String(json.redirectPath ?? '').trim();
  if (!redirectPath) {
    throw new Error('Navigation response missing redirectPath');
  }
  return redirectPath;
}

/** Server-validated redirect for Advance page tabs (same path as navbar dropdown). */
export async function fetchFrisAdvanceTabRedirect(tab: string): Promise<string> {
  return fetchFrisRedirect('/auth/fris/navigate/advance', 'tab', tab);
}

/** Server-validated redirect for Creation page sections (same path as navbar dropdown). */
export async function fetchFrisCreationSectionRedirect(
  section: string,
): Promise<string> {
  return fetchFrisRedirect('/auth/fris/navigate/creation', 'section', section);
}
