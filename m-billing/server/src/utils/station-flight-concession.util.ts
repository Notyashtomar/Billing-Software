import { normalizeFlightCategory } from './aircraft-type-match.util';
import { isInternationalOnlyAirline } from './invoice-flight-category.util';

export type FlightConcessionSector = 'DOM' | 'INT' | 'GA' | 'GA_DOM' | 'GA_INT';

export type StationFlightConcessionPercents = {
  dom?: number;
  int?: number;
  /** Older single General Aviation fee. Used when a GA flight has no domestic or international side. */
  ga?: number;
  gaDom?: number;
  gaInt?: number;
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
  generalAviationDomestic?: RoyaltyFee;
  generalAviationInternational?: RoyaltyFee;
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
  const ga = feePercent(side?.generalAviation);
  return {
    int: feePercent(side?.scheduledInternational),
    dom: feePercent(side?.scheduledDomestic),
    ga,
    gaDom: feePercent(side?.generalAviationDomestic) ?? ga,
    gaInt: feePercent(side?.generalAviationInternational) ?? ga,
  };
}

function hasPercent(percents: StationFlightConcessionPercents): boolean {
  return (
    percents.dom != null ||
    percents.int != null ||
    percents.ga != null ||
    percents.gaDom != null ||
    percents.gaInt != null
  );
}

/**
 * Station Royalty Setup fees that invoices apply by flight category.
 * A station uses the royalty type chosen in Configure rules.
 * An Airport Authority with no type saved yet uses Royalty on Gross when that side has a fee, otherwise Royalty on Net.
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
  const mechanismChosen = mechanism === 'net' || mechanism === 'gross';
  const preferred =
    mechanismChosen && (ownership === 'private' || ownership === 'aai')
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

/**
 * True when Exclusive invoices gross up the station percent: amount × p / (100 − p).
 * The royalty type chosen in Configure rules is used even when the royalty card dates miss the invoice month.
 * An Airport Authority with no type saved yet follows whichever royalty card covers the invoice.
 */
export function stationRoyaltyOnGross(
  settings: StationConcessionSettings | null | undefined,
  documentDate: Date,
  billingPeriod?: { start?: Date | string | null; end?: Date | string | null },
): boolean {
  const ownership = String(settings?.airportCommercial?.ownership ?? '').toLowerCase();
  const mechanism = String(settings?.airportCommercial?.revenueShareMechanism ?? '').toLowerCase();
  if (ownership === 'private' || mechanism === 'gross' || mechanism === 'net') {
    return mechanism === 'gross';
  }

  const master = settings?.royaltyMaster;
  if (!master) return false;
  const documentYmd = ymd(documentDate);
  const periodFrom = ymd(billingPeriod?.start ?? undefined) || documentYmd;
  const periodTo = ymd(billingPeriod?.end ?? undefined) || documentYmd;
  const gross = rangesOverlap(master.gross, periodFrom, periodTo) ? sidePercents(master.gross) : {};
  const net = rangesOverlap(master.net, periodFrom, periodTo) ? sidePercents(master.net) : {};
  if (hasPercent(gross)) return true;
  if (hasPercent(net)) return false;
  return false;
}

/** Scheduled domestic, scheduled international, or general aviation domestic / international. */
export function flightConcessionSectorFromText(...values: unknown[]): FlightConcessionSector {
  const raw = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const lower = raw.toLowerCase();
  if (!lower) return 'INT';
  const isGa = /general\s*aviation|\bga\b|non[-\s]?scheduled|charter/.test(lower);
  const hasDom = /\bdomestic\b|\bdom\b/.test(lower);
  const hasInt = /\binternational\b|\bint\b/.test(lower);
  let scheduled: 'DOM' | 'INT' | null = null;
  if (hasDom && hasInt) {
    scheduled = normalizeFlightCategory(raw) === 'Dom' ? 'DOM' : 'INT';
  } else if (hasDom) scheduled = 'DOM';
  else if (hasInt) scheduled = 'INT';
  if (isGa) {
    if (scheduled === 'DOM') return 'GA_DOM';
    if (scheduled === 'INT') return 'GA_INT';
    return 'GA';
  }
  return scheduled ?? 'INT';
}

export function preparationFlightConcessionSector(record: {
  sourceType?: string;
  operationalSnapshot?: Record<string, unknown> | null;
  sourceRef?: { operationalSnapshot?: Record<string, unknown> | null } | null;
}): FlightConcessionSector {
  const snap = record.operationalSnapshot ?? record.sourceRef?.operationalSnapshot ?? {};
  const sector = flightConcessionSectorFromText(
    snap.categoryOfFlight,
    snap.Cate_of_Flight,
    snap.flightCategory,
    snap.category,
    snap.typeOfFlight,
    snap.TypeOfFlight,
  );
  if (String(record.sourceType ?? '').trim().toLowerCase() !== 'raf') return sector;
  if (sector === 'DOM' || sector === 'GA_DOM') return 'GA_DOM';
  if (sector === 'INT' || sector === 'GA_INT') return 'GA_INT';
  return 'GA';
}

/**
 * An international-only airline keeps the international royalty on a flight
 * tagged Domestic or International-Domestic. General aviation stays on its own fee.
 */
export function concessionSectorForAirline(
  sector: FlightConcessionSector,
  contract?: {
    category?: string | null;
    categories?: Array<string | null | undefined> | null;
  } | null,
): FlightConcessionSector {
  if (!isInternationalOnlyAirline(contract)) return sector;
  if (sector === 'DOM' || sector === 'INT') return 'INT';
  return sector;
}

export function stationPercentForSector(
  percents: StationFlightConcessionPercents | null | undefined,
  sector: FlightConcessionSector,
): number | undefined {
  if (!percents) return undefined;
  if (sector === 'DOM') return percents.dom;
  if (sector === 'GA_DOM') return percents.gaDom ?? percents.ga;
  if (sector === 'GA_INT') return percents.gaInt ?? percents.ga;
  if (sector === 'GA') return percents.ga;
  return percents.int;
}
