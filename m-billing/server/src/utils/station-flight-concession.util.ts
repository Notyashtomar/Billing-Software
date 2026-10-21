import { normalizeFlightCategory } from './aircraft-type-match.util';

export type FlightConcessionSector = 'DOM' | 'INT' | 'GA';

export type StationFlightConcessionPercents = {
  dom?: number;
  int?: number;
  ga?: number;
};

type RoyaltyFee = {
  percent?: number;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
};

type RoyaltySide = {
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
  scheduledInternational?: RoyaltyFee;
  scheduledDomestic?: RoyaltyFee;
  generalAviation?: RoyaltyFee;
};

export type StationConcessionSettings = {
  airportCommercial?: {
    ownership?: string;
    revenueShareMechanism?: string;
  } | null;
  royaltyMaster?: {
    net?: RoyaltySide;
    gross?: RoyaltySide;
  } | null;
};

function ymd(value: Date | string | undefined): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

function rangesOverlap(
  side: RoyaltySide | undefined,
  periodFrom: string,
  periodTo: string,
): boolean {
  if (!side) return false;
  const from = ymd(side.effectiveFrom);
  const to = ymd(side.effectiveTo);
  if (!from && !to) return true;
  const sideFrom = from || '0000-01-01';
  const sideTo = to || '9999-12-31';
  const start = periodFrom || periodTo;
  const end = periodTo || periodFrom;
  if (!start && !end) return true;
  return (start || end) <= sideTo && (end || start) >= sideFrom;
}

function feePercent(fee: RoyaltyFee | undefined): number | undefined {
  const n = Number(fee?.percent);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sidePercents(side: RoyaltySide | undefined): StationFlightConcessionPercents {
  return {
    int: feePercent(side?.scheduledInternational),
    dom: feePercent(side?.scheduledDomestic),
    ga: feePercent(side?.generalAviation),
  };
}

function hasPercent(percents: StationFlightConcessionPercents): boolean {
  return percents.dom != null || percents.int != null || percents.ga != null;
}

/**
 * Station Royalty Setup fees that invoices apply by flight category.
 * A private airport uses the side chosen in Configure rules.
 * An Airport Authority uses Royalty on Gross when that side has a fee, otherwise Royalty on Net.
 */
export function stationFlightConcessionPercents(
  settings: StationConcessionSettings | null | undefined,
  documentDate: Date,
  billingPeriod?: { start?: Date | string | null; end?: Date | string | null },
): StationFlightConcessionPercents | null {
  const master = settings?.royaltyMaster;
  if (!master) return null;
  const documentYmd = ymd(documentDate);
  const periodFrom = ymd(billingPeriod?.start ?? undefined) || documentYmd;
  const periodTo = ymd(billingPeriod?.end ?? undefined) || documentYmd;
  const gross = rangesOverlap(master.gross, periodFrom, periodTo) ? sidePercents(master.gross) : {};
  const net = rangesOverlap(master.net, periodFrom, periodTo) ? sidePercents(master.net) : {};
  const ownership = String(settings?.airportCommercial?.ownership ?? '').toLowerCase();
  const mechanism = String(settings?.airportCommercial?.revenueShareMechanism ?? '').toLowerCase();
  const preferred =
    ownership === 'private' && (mechanism === 'net' || mechanism === 'gross')
      ? mechanism === 'net'
        ? net
        : gross
      : hasPercent(gross)
        ? gross
        : net;
  if (hasPercent(preferred)) return preferred;
  if (hasPercent(gross)) return gross;
  return hasPercent(net) ? net : null;
}

/** Scheduled domestic, scheduled international, or general aviation. */
export function flightConcessionSectorFromText(...values: unknown[]): FlightConcessionSector {
  const raw = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const lower = raw.toLowerCase();
  if (!lower) return 'INT';
  if (/general\s*aviation|\bga\b|non[-\s]?scheduled|charter/.test(lower)) return 'GA';
  const hasDom = /\bdomestic\b|\bdom\b/.test(lower);
  const hasInt = /\binternational\b|\bint\b/.test(lower);
  if (hasDom && hasInt) {
    const departure = normalizeFlightCategory(raw);
    return departure === 'Dom' ? 'DOM' : 'INT';
  }
  if (hasDom) return 'DOM';
  return 'INT';
}

export function preparationFlightConcessionSector(record: {
  sourceType?: string;
  operationalSnapshot?: Record<string, unknown> | null;
  sourceRef?: { operationalSnapshot?: Record<string, unknown> | null } | null;
}): FlightConcessionSector {
  if (String(record.sourceType ?? '').trim().toLowerCase() === 'raf') return 'GA';
  const snap = record.operationalSnapshot ?? record.sourceRef?.operationalSnapshot ?? {};
  return flightConcessionSectorFromText(
    snap.categoryOfFlight,
    snap.Cate_of_Flight,
    snap.flightCategory,
    snap.category,
    snap.typeOfFlight,
    snap.TypeOfFlight,
  );
}

export function stationPercentForSector(
  percents: StationFlightConcessionPercents | null | undefined,
  sector: FlightConcessionSector,
): number | undefined {
  if (!percents) return undefined;
  if (sector === 'DOM') return percents.dom;
  if (sector === 'GA') return percents.ga;
  return percents.int;
}
