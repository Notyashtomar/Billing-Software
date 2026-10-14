/**
 * Deep-link helpers for the Reports → Delay Report "Delay analytics table".
 *
 * Clicking a flight serial inside an opened delay-code popup navigates to
 * Flights → Scheduled Airlines (highlighting that flight). A "Back to delay
 * report" button then returns to the delay report with the same filters and
 * re-opens the delay-code popup the user came from.
 */
const DELAY_REPORT_PATH = '/fris/reports/delay';

export type DelayReportReturnContext = {
  fromYmd: string;
  toYmd: string;
  airline?: string;
  station?: string;
  /** Delay code whose popup should re-open on return. */
  code: string;
};

export function buildScheduledAirlinesHrefFromDelayReport(
  serial: number | string,
  ctx: DelayReportReturnContext,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(serial).trim());
  // Align the Scheduled Airlines date window with the delay report range so
  // the highlighted flight is in scope.
  p.set('from', ctx.fromYmd);
  p.set('to', ctx.toYmd);
  p.set('returnTo', DELAY_REPORT_PATH);
  p.set('delayFrom', ctx.fromYmd);
  p.set('delayTo', ctx.toYmd);
  p.set('delayCode', ctx.code);
  if (ctx.airline?.trim()) p.set('delayAirline', ctx.airline.trim());
  if (ctx.station?.trim()) p.set('delayStation', ctx.station.trim());
  return `/fris/flights/scheduledairlines?${p.toString()}`;
}

export function buildDelayReportReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim();
  if (!returnTo || returnTo !== DELAY_REPORT_PATH) return null;

  const out = new URLSearchParams();
  const from = params.get('delayFrom')?.trim() || params.get('from')?.trim() || '';
  const to = params.get('delayTo')?.trim() || params.get('to')?.trim() || '';
  const code = params.get('delayCode')?.trim() || '';
  const airline = params.get('delayAirline')?.trim() || '';
  const station = params.get('delayStation')?.trim() || '';
  if (from) out.set('delayFrom', from);
  if (to) out.set('delayTo', to);
  if (code) out.set('delayCode', code);
  if (airline) out.set('delayAirline', airline);
  if (station) out.set('delayStation', station);

  const qs = out.toString();
  return qs ? `${DELAY_REPORT_PATH}?${qs}` : DELAY_REPORT_PATH;
}

export function delayReportReturnLabel(): string {
  return 'Back to delay report';
}

/** Restore filters + the open delay-code popup when arriving back on the report. */
export function parseDelayReportReturnFromUrl(
  params: Pick<URLSearchParams, 'get'>,
): {
  fromYmd: string | null;
  toYmd: string | null;
  airline: string | null;
  station: string | null;
  code: string | null;
} | null {
  const code = params.get('delayCode')?.trim() || '';
  const from = params.get('delayFrom')?.trim() || '';
  const to = params.get('delayTo')?.trim() || '';
  if (!code && !from && !to) return null;
  return {
    fromYmd: from || null,
    toYmd: to || null,
    airline: params.get('delayAirline')?.trim() || null,
    station: params.get('delayStation')?.trim() || null,
    code: code || null,
  };
}
