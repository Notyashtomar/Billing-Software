import type { DashboardFlightScope } from '@/lib/api';
import {
  DASHBOARD_PATH,
  dashboardHrefForFlightScope,
} from '@/lib/dashboardFlightScope';

/** Dashboard modal to reopen after returning from Scheduled / Non-Scheduled Airlines. */
export type DashboardScheduledReturnOpenCard =
  | 'onTimeFlights'
  | 'performanceReportDrill'
  | 'ghaImprovement'
  | 'carrierMix'
  | 'airlineRemarks';

export type DashboardScheduledReturnContext = {
  dashFrom: string;
  dashTo: string;
  dashOpenCard: DashboardScheduledReturnOpenCard;
  /** Required when `dashOpenCard` is `performanceReportDrill` (e.g. `on-time`). */
  dashDrillKey?: string | null;
  /** When `nonScheduled`, serial links open Non-Scheduled Airlines. */
  flightScope?: DashboardFlightScope;
};

export type ScheduledAirlinesFlightDateRange = {
  fromYmd: string;
  toYmd: string;
};

const NS_AIRLINES_PATH = '/fris/flights/Non-Scheduled-Airlines';
const SCHEDULED_AIRLINES_PATH = '/fris/flights/scheduledairlines';

function flightScopeFromParamGet(
  params: Pick<URLSearchParams, 'get'>,
): DashboardFlightScope {
  const raw = String(params.get('flightScope') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (
    raw === 'nonscheduled' ||
    raw === 'non-scheduled' ||
    raw === 'ns' ||
    raw === 'non_scheduled'
  ) {
    return 'nonScheduled';
  }
  return 'scheduled';
}

/** ISO schedule timestamp → local calendar yyyy-MM-dd (matches dashboard display). */
export function isoScheduleToLocalYmd(iso: string): string | null {
  const raw = String(iso ?? '').trim();
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Inclusive STA/STD window for Scheduled Airlines date filters (STA preferred). */
export function flightScheduleYmdRangeFromIso(
  staIso: string,
  stdIso: string,
): ScheduledAirlinesFlightDateRange | null {
  const staYmd = isoScheduleToLocalYmd(staIso);
  const stdYmd = isoScheduleToLocalYmd(stdIso);
  const primary = staYmd ?? stdYmd;
  if (!primary) return null;
  const secondary = stdYmd ?? staYmd ?? primary;
  return primary <= secondary
    ? { fromYmd: primary, toYmd: secondary }
    : { fromYmd: secondary, toYmd: primary };
}

/** dd/MM/yyyy, yyyy-MM-dd, or ISO → yyyy-MM-dd. */
function scheduleLabelToYmd(label: string): string | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length === 3 && parts[2]?.length === 4) {
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!d || !m || !y) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return isoScheduleToLocalYmd(raw);
}

export function flightScheduleYmdRangeFromLabels(input: {
  staYmd?: string | null;
  staDate?: string | null;
  stdDate?: string | null;
  ataDate?: string | null;
}): ScheduledAirlinesFlightDateRange | null {
  const staYmd =
    scheduleLabelToYmd(String(input.staYmd ?? '').trim()) ??
    scheduleLabelToYmd(String(input.staDate ?? '').trim());
  const stdYmd = scheduleLabelToYmd(String(input.stdDate ?? '').trim());
  const ataYmd = scheduleLabelToYmd(String(input.ataDate ?? '').trim());
  const primary = staYmd ?? stdYmd ?? ataYmd;
  if (!primary) return null;
  const secondary = stdYmd ?? staYmd ?? ataYmd ?? primary;
  return primary <= secondary
    ? { fromYmd: primary, toYmd: secondary }
    : { fromYmd: secondary, toYmd: primary };
}

function appendScheduledAirlinesDateRange(
  p: URLSearchParams,
  flightDateRange: ScheduledAirlinesFlightDateRange | null | undefined,
  fallback?: { fromYmd: string; toYmd: string },
): void {
  const fromYmd = flightDateRange?.fromYmd?.trim() || fallback?.fromYmd?.trim() || '';
  const toYmd = flightDateRange?.toYmd?.trim() || fallback?.toYmd?.trim() || '';
  if (fromYmd && toYmd) {
    p.set('from', fromYmd);
    p.set('to', toYmd);
  }
}

function appendDashboardReturnParams(
  p: URLSearchParams,
  ctx: DashboardScheduledReturnContext,
): void {
  p.set('returnTo', DASHBOARD_PATH);
  p.set('dashFrom', ctx.dashFrom);
  p.set('dashTo', ctx.dashTo);
  p.set('dashOpenCard', ctx.dashOpenCard);
  if (ctx.dashDrillKey?.trim()) {
    p.set('dashDrillKey', ctx.dashDrillKey.trim());
  }
  if (ctx.flightScope === 'nonScheduled') {
    p.set('flightScope', 'nonScheduled');
  }
}

export function buildScheduledAirlinesHrefFromDashboard(
  serial: number,
  ctx: DashboardScheduledReturnContext,
  flightDateRange?: ScheduledAirlinesFlightDateRange | null,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(Math.trunc(serial)));
  appendScheduledAirlinesDateRange(p, flightDateRange, {
    fromYmd: ctx.dashFrom,
    toYmd: ctx.dashTo,
  });
  appendDashboardReturnParams(p, ctx);
  return `${SCHEDULED_AIRLINES_PATH}?${p.toString()}`;
}

/** Highlight a flight on Scheduled Airlines (optionally scoped to its operating dates). */
export function buildScheduledAirlinesHighlightHref(
  serial: number,
  flightDateRange?: ScheduledAirlinesFlightDateRange | null,
): string {
  const p = new URLSearchParams();
  p.set('highlightSerial', String(Math.trunc(serial)));
  appendScheduledAirlinesDateRange(p, flightDateRange);
  return `${SCHEDULED_AIRLINES_PATH}?${p.toString()}`;
}

/** Filter Non-Scheduled Airlines to a single serial (`?serialNo=`). */
export function buildNonScheduledAirlinesHighlightHref(serial: number): string {
  const p = new URLSearchParams();
  p.set('serialNo', String(Math.trunc(serial)));
  return `${NS_AIRLINES_PATH}?${p.toString()}`;
}

export function buildNonScheduledAirlinesHrefFromDashboard(
  serial: number,
  ctx: DashboardScheduledReturnContext,
): string {
  const p = new URLSearchParams();
  p.set('serialNo', String(Math.trunc(serial)));
  appendDashboardReturnParams(p, { ...ctx, flightScope: 'nonScheduled' });
  return `${NS_AIRLINES_PATH}?${p.toString()}`;
}

/** Scope-aware deep link from dashboard serial clicks. */
export function buildAirlinesHrefFromDashboard(
  serial: number,
  ctx: DashboardScheduledReturnContext,
  flightDateRange?: ScheduledAirlinesFlightDateRange | null,
): string {
  if (ctx.flightScope === 'nonScheduled') {
    return buildNonScheduledAirlinesHrefFromDashboard(serial, ctx);
  }
  return buildScheduledAirlinesHrefFromDashboard(serial, ctx, flightDateRange);
}

export function buildAirlinesHighlightHref(
  serial: number,
  flightScope: DashboardFlightScope | null | undefined,
  flightDateRange?: ScheduledAirlinesFlightDateRange | null,
): string {
  if (flightScope === 'nonScheduled') {
    return buildNonScheduledAirlinesHighlightHref(serial);
  }
  return buildScheduledAirlinesHighlightHref(serial, flightDateRange);
}

export function buildDashboardReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim();
  if (!returnTo || returnTo !== DASHBOARD_PATH) return null;

  const out = new URLSearchParams();
  const dashFrom = params.get('dashFrom')?.trim();
  const dashTo = params.get('dashTo')?.trim();
  const dashOpenCard = params.get('dashOpenCard')?.trim();
  const dashDrillKey = params.get('dashDrillKey')?.trim();
  const dashOpenNotifications = params.get('dashOpenNotifications')?.trim();
  if (dashFrom) out.set('dashFrom', dashFrom);
  if (dashTo) out.set('dashTo', dashTo);
  if (dashOpenCard) out.set('dashOpenCard', dashOpenCard);
  if (dashDrillKey) out.set('dashDrillKey', dashDrillKey);
  if (dashOpenNotifications === '1') out.set('dashOpenNotifications', '1');

  if (flightScopeFromParamGet(params) === 'nonScheduled') {
    out.set('flightScope', 'nonScheduled');
  }

  const qs = out.toString();
  return qs ? `${DASHBOARD_PATH}?${qs}` : DASHBOARD_PATH;
}

export function parseDashboardReturnFromUrl(
  params: Pick<URLSearchParams, 'get'>,
): {
  dashFrom: string | null;
  dashTo: string | null;
  dashOpenCard: DashboardScheduledReturnOpenCard | null;
  dashDrillKey: string | null;
  flightScope: DashboardFlightScope;
} | null {
  const dashOpenCard = params.get('dashOpenCard')?.trim();
  if (!dashOpenCard) return null;

  const allowed: DashboardScheduledReturnOpenCard[] = [
    'onTimeFlights',
    'performanceReportDrill',
    'ghaImprovement',
    'carrierMix',
    'airlineRemarks',
  ];
  if (!allowed.includes(dashOpenCard as DashboardScheduledReturnOpenCard)) {
    return null;
  }

  return {
    dashFrom: params.get('dashFrom')?.trim() || null,
    dashTo: params.get('dashTo')?.trim() || null,
    dashOpenCard: dashOpenCard as DashboardScheduledReturnOpenCard,
    dashDrillKey: params.get('dashDrillKey')?.trim() || null,
    flightScope: flightScopeFromParamGet(params),
  };
}

/** Restore dashboard date range and reopen notification center after cancellation history visit. */
export function parseDashboardNotificationReturnFromUrl(
  params: Pick<URLSearchParams, 'get'>,
): { dashFrom: string | null; dashTo: string | null } | null {
  if (params.get('dashOpenNotifications')?.trim() !== '1') return null;
  return {
    dashFrom: params.get('dashFrom')?.trim() || null,
    dashTo: params.get('dashTo')?.trim() || null,
  };
}

/** Clean dashboard URL after restoring modal state from airlines return params. */
export function dashboardHrefAfterReturnRestore(
  flightScope: DashboardFlightScope,
): string {
  return dashboardHrefForFlightScope(flightScope);
}
