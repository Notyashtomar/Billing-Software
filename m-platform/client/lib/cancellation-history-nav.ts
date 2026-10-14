import type { FlightCancellationRecord } from '@/lib/api';
import { CANCELLATION_ALERTS_PATH } from '@/contexts/DashboardNotificationContext';
import { DASHBOARD_PATH } from '@/lib/dashboardFlightScope';
import { displayFlightInstanceSerial } from '@/utils/dataProcessor';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CancellationHistoryNavContext = {
  dashboardFrom?: string;
  dashboardTo?: string;
};

export type CancellationHistoryDeepLink = {
  from: string | null;
  to: string | null;
  highlight: string | null;
  serial: string;
  airline: string;
  flightNo: string;
};

export function parseCancellationHistoryDeepLink(
  params: Pick<URLSearchParams, 'get'>,
): CancellationHistoryDeepLink {
  const fromRaw = params.get('from')?.trim() ?? '';
  const toRaw = params.get('to')?.trim() ?? '';
  return {
    from: YMD_RE.test(fromRaw) ? fromRaw : null,
    to: YMD_RE.test(toRaw) ? toRaw : null,
    highlight: params.get('highlight')?.trim() || null,
    serial: params.get('serial')?.trim() ?? '',
    airline: params.get('airline')?.trim() ?? '',
    flightNo: params.get('flightNo')?.trim() ?? '',
  };
}

/** Build cancellation history URL with date range, search filters, row highlight, and dashboard return context. */
export function buildCancellationHistoryHref(
  row: FlightCancellationRecord,
  ctx?: CancellationHistoryNavContext,
): string {
  const params = new URLSearchParams();
  const cancelledDate = String(row.cancelledDate ?? '').trim();
  const dashboardFrom = String(ctx?.dashboardFrom ?? '').trim();
  const dashboardTo = String(ctx?.dashboardTo ?? '').trim();

  const from =
    YMD_RE.test(dashboardFrom) ? dashboardFrom : YMD_RE.test(cancelledDate) ? cancelledDate : '';
  const to =
    YMD_RE.test(dashboardTo) ? dashboardTo : YMD_RE.test(cancelledDate) ? cancelledDate : '';

  if (from) params.set('from', from);
  if (to) params.set('to', to);

  if (row._id) params.set('highlight', row._id);

  const serial = displayFlightInstanceSerial(row.instanceSerial).trim();
  if (serial) params.set('serial', serial);
  if (row.airlineName?.trim()) params.set('airline', row.airlineName.trim());
  if (row.flightNo?.trim()) params.set('flightNo', row.flightNo.trim());

  if (dashboardFrom || dashboardTo) {
    params.set('returnTo', DASHBOARD_PATH);
    if (dashboardFrom) params.set('dashFrom', dashboardFrom);
    if (dashboardTo) params.set('dashTo', dashboardTo);
    params.set('dashOpenNotifications', '1');
  }

  const qs = params.toString();
  return qs ? `${CANCELLATION_ALERTS_PATH}?${qs}` : CANCELLATION_ALERTS_PATH;
}
