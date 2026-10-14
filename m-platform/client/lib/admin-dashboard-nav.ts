/** Append `from=dashboard` so destination pages can show a return-to-dashboard control. */
export function appendFromDashboardQuery(href: string): string {
  const hashIndex = href.indexOf('#');
  const path = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}from=dashboard${hash}`;
}

export const ADMIN_DASHBOARD_FROM_QUERY = 'from=dashboard';

export function isFromAdminDashboard(searchParams: URLSearchParams | null): boolean {
  return searchParams?.get('from') === 'dashboard';
}
