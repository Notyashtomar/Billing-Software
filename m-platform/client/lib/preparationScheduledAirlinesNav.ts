import type { PreparationStatus } from '@/lib/billing-shared/enums';
import { billingFrisHref } from '@/lib/deployed-fris';
import {
  flightScheduleYmdRangeFromLabels,
  type ScheduledAirlinesFlightDateRange,
} from '@/lib/dashboardScheduledAirlinesNav';

const PREPARATION_PATH = '/billing/preparation';
const RAF_FORMS_PATH = '/fris/flights/ramp-assistance-forms';
const BILLING_SOURCE_RETURN_LABELS: Readonly<Record<string, string>> = {
  '/billing/scheduled-flights': 'Back to scheduled flights',
  '/billing/ads': 'Back to ADS',
  '/billing/equipment': 'Back to equipment',
  '/billing/manpower': 'Back to manpower',
  '/billing/raf': 'Back to RAF',
  '/billing/cleaning': 'Back to cleaning',
};

export type PreparationScheduledReturnContext = {
  prepTab: PreparationStatus;
  prepFrom: string;
  prepTo: string;
  prepCustomer?: string;
};

function formatYmd(value?: string | Date | null): string | undefined {
  if (!value) return undefined;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const ymd = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : undefined;
}

function pickSnapshotText(snap: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const s = String(snap[key] ?? '').trim();
    if (s) return s;
  }
  return '';
}

/** STA/STD (then ATD) window from a billing preparation operational snapshot. */
export function flightDateRangeFromOperationalSnapshot(
  snap?: Record<string, unknown> | null,
): ScheduledAirlinesFlightDateRange | null {
  if (!snap) return null;
  const fromSchedule = flightScheduleYmdRangeFromLabels({
    staDate: pickSnapshotText(snap, 'staDate', 'STADate', 'STA Date'),
    stdDate: pickSnapshotText(snap, 'stdDate', 'STDDate', 'STD Date'),
    ataDate: pickSnapshotText(snap, 'ataDate', 'ATADate', 'ATA Date'),
  });
  if (fromSchedule) return fromSchedule;
  const billingYmd = formatYmd(
    (snap.billingDateYmd ?? snap.billingDate) as string | Date | null | undefined,
  );
  if (billingYmd) return { fromYmd: billingYmd, toYmd: billingYmd };
  const atdYmd = formatYmd(
    (snap.atdDate ?? snap.ATDDate ?? snap.atd) as string | Date | null | undefined,
  );
  if (atdYmd) return { fromYmd: atdYmd, toYmd: atdYmd };
  return null;
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

export function buildScheduledAirlinesHrefFromPreparation(
  serial: string,
  ctx: PreparationScheduledReturnContext,
  snap?: Record<string, unknown> | null,
): string {
  return buildScheduledAirlinesHrefFromBillingSerial(serial, {
    fromYmd: ctx.prepFrom,
    toYmd: ctx.prepTo,
    returnTo: PREPARATION_PATH,
    snap,
    extraParams: {
      prepTab: ctx.prepTab,
      prepFrom: ctx.prepFrom,
      prepTo: ctx.prepTo,
      ...(ctx.prepCustomer?.trim()
        ? { prepCustomer: ctx.prepCustomer.trim() }
        : {}),
    },
  });
}

type BillingSerialNavOpts = {
  fromYmd: string;
  toYmd: string;
  returnTo: string;
  snap?: Record<string, unknown> | null;
  extraParams?: Record<string, string>;
};

function appendBillingSerialNavParams(
  p: URLSearchParams,
  serial: string,
  opts: BillingSerialNavOpts,
): void {
  const trimmedSerial = String(serial).trim();
  p.set('highlightSerial', trimmedSerial);
  p.set('serial', trimmedSerial);

  const pageFrom = opts.fromYmd?.trim() ?? '';
  const pageTo = opts.toYmd?.trim() ?? '';
  if (pageFrom && pageTo) {
    // Keep the billing screen's date window so the same flights stay in range.
    appendScheduledAirlinesDateRange(p, null, {
      fromYmd: pageFrom,
      toYmd: pageTo,
    });
  } else {
    appendScheduledAirlinesDateRange(
      p,
      flightDateRangeFromOperationalSnapshot(opts.snap),
    );
  }

  const snap = opts.snap;
  const airlineName = snap
    ? pickSnapshotText(snap, 'customerName', 'Airline', 'airline', 'rafAirlineName')
    : '';
  if (airlineName) p.set('airline', airlineName);

  const aircraftType = snap
    ? pickSnapshotText(snap, 'aircraftType', 'TypeCraft', 'typeCraft', 'aircraft', 'ACType')
    : '';
  if (aircraftType) p.set('aircraft', aircraftType);

  p.set('returnTo', opts.returnTo);
  if (typeof window !== 'undefined') {
    const stationCode = (
      localStorage.getItem('userStationCode') || ''
    )
      .trim()
      .toUpperCase();
    if (stationCode) p.set('stationCode', stationCode);
  }
  for (const [key, value] of Object.entries(opts.extraParams ?? {})) {
    if (value) p.set(key, value);
  }
}

/** Open Scheduled Airlines for a billing source / prep serial (ADS or BHS). */
export function buildScheduledAirlinesHrefFromBillingSerial(
  serial: string,
  opts: BillingSerialNavOpts,
): string {
  const p = new URLSearchParams();
  appendBillingSerialNavParams(p, serial, opts);
  return billingFrisHref(`/fris/flights/scheduledairlines?${p.toString()}`);
}

/**
 * Open Flights → Ramp Assistance Forms for a billing RAF serial.
 * Deep-link opens the RAF table for the date window and highlights the flight.
 */
export function buildRafFormsHrefFromBillingSerial(
  serial: string,
  opts: BillingSerialNavOpts,
): string {
  const p = new URLSearchParams();
  appendBillingSerialNavParams(p, serial, opts);
  p.set('openSidebar', '1');
  return billingFrisHref(`${RAF_FORMS_PATH}?${p.toString()}`);
}

export function buildRafFormsHrefFromPreparation(
  serial: string,
  ctx: PreparationScheduledReturnContext,
  snap?: Record<string, unknown> | null,
): string {
  return buildRafFormsHrefFromBillingSerial(serial, {
    fromYmd: ctx.prepFrom,
    toYmd: ctx.prepTo,
    returnTo: PREPARATION_PATH,
    snap,
    extraParams: {
      prepTab: ctx.prepTab,
      prepFrom: ctx.prepFrom,
      prepTo: ctx.prepTo,
      ...(ctx.prepCustomer?.trim()
        ? { prepCustomer: ctx.prepCustomer.trim() }
        : {}),
    },
  });
}

export function buildPreparationReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim();
  if (!returnTo || returnTo !== PREPARATION_PATH) return null;

  const out = new URLSearchParams();
  const tab = params.get('prepTab')?.trim();
  const from = params.get('prepFrom')?.trim() || '';
  const to = params.get('prepTo')?.trim() || '';
  const customer = params.get('prepCustomer')?.trim() || '';
  if (tab) out.set('tab', tab);
  if (from) out.set('from', from);
  if (to) out.set('to', to);
  if (customer) out.set('customer', customer);

  const qs = out.toString();
  return qs ? `${PREPARATION_PATH}?${qs}` : PREPARATION_PATH;
}

export function preparationReturnLabel(): string {
  return 'Back to preparation';
}

/** Accept only known billing pages; never turn returnTo into an open redirect. */
export function buildBillingSourceReturnHref(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim() ?? '';
  return BILLING_SOURCE_RETURN_LABELS[returnTo] ? returnTo : null;
}

export function billingSourceReturnLabel(
  params: Pick<URLSearchParams, 'get'>,
): string | null {
  const returnTo = params.get('returnTo')?.trim() ?? '';
  return BILLING_SOURCE_RETURN_LABELS[returnTo] ?? null;
}
