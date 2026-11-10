/**
 * AERA ceiling lookup: "what is the most we may charge for this flight?"
 *
 * Pure functions over a stored AERA tariff order. Rules coded here come from
 * the orders themselves:
 *  - a flight with an international arrival OR departure is International;
 *  - domestic non-scheduled / general aviation use the domestic scheduled rate;
 *  - cargo flights use the cargo rows (printed under Ramp or Full per order);
 *  - the financial year runs April–March and picks the column.
 */
import type {
  AeraFlightClass,
  AeraScheduledRow,
  BillingAeraTariff,
} from '../schemas/billing-aera-tariff.schema';

export type AeraHandlingScope = 'pax' | 'ramp' | 'full';

export type AeraCeilingHit = {
  amount: number;
  financialYear: string;
  flightClass: AeraFlightClass;
  aircraftCode: string;
  scope: AeraHandlingScope;
  orderNumber: string;
  currency: string;
  /**
   * True when the flight is after the order's control period and the last
   * approved financial-year column was carried forward (AERA keeps the
   * prevailing tariff in force until the next order is issued).
   */
  carriedForward?: boolean;
};

export type AeraCeilingMiss = {
  reason:
    | 'no_order'
    | 'date_outside_order'
    | 'no_aircraft_code'
    | 'no_row'
    | 'not_applicable'
    | 'no_rate';
  financialYear?: string;
  flightClass?: AeraFlightClass;
  aircraftCode?: string;
};

export type AeraCeilingResult =
  | ({ found: true } & AeraCeilingHit)
  | ({ found: false } & AeraCeilingMiss);

/** Indian financial year label for a date: 2024-07-15 → "2024-25". */
export function financialYearOf(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export type AeraFlightClassInput = {
  /** Category text from FHR / snapshot: Domestic, International, International-Domestic, Dom/Int … */
  categoryOfFlight?: string | null;
  /** Sector of the arriving leg when known (Dom / Int). */
  arrivalSector?: string | null;
  /** Sector of the departing leg when known (Dom / Int). */
  departureSector?: string | null;
  /** Cargo / freighter flight. */
  cargo?: boolean | null;
  aircraftType?: string | null;
  typeOfFlight?: string | null;
};

function isInternationalText(value: unknown): boolean {
  return /\binternational\b|\bint\b|\bintl\b/i.test(String(value ?? ''));
}

function isCargoText(...values: unknown[]): boolean {
  return values.some((v) => /\bcargo\b|\bfreight/i.test(String(v ?? '')));
}

/** International if any leg is international; cargo if flagged or hinted; otherwise domestic passenger. */
export function aeraFlightClassFor(input: AeraFlightClassInput): AeraFlightClass {
  const international =
    isInternationalText(input.categoryOfFlight) ||
    isInternationalText(input.arrivalSector) ||
    isInternationalText(input.departureSector);
  const cargo =
    input.cargo === true ||
    isCargoText(input.categoryOfFlight, input.typeOfFlight) ||
    /\dF$|\dF\b|FREIGHTER/i.test(String(input.aircraftType ?? '').trim());
  if (cargo) return international ? 'InternationalCargo' : 'DomesticCargo';
  return international ? 'InternationalPassenger' : 'DomesticPassenger';
}

function rowFor(order: Pick<BillingAeraTariff, 'scheduled'>, flightClass: AeraFlightClass, code: string) {
  return order.scheduled.find(
    (row: AeraScheduledRow) =>
      row.flightClass === flightClass && String(row.aircraftCode).toUpperCase() === code,
  );
}

/** Before the card took effect → no ceiling. After the control period → the last column carries forward. */
function orderWindow(
  order: Pick<BillingAeraTariff, 'effectiveFrom' | 'controlPeriodTo'>,
  date: Date,
): 'before' | 'inside' | 'after' {
  const from = new Date(order.effectiveFrom).getTime();
  const to = new Date(order.controlPeriodTo).getTime();
  const t = date.getTime();
  if (t < from) return 'before';
  return t <= to ? 'inside' : 'after';
}

/** Column index for the flight's FY; after the control period, the last FY column. */
function fyColumn(
  order: Pick<BillingAeraTariff, 'financialYears'>,
  fy: string,
  window: 'inside' | 'after',
): { column: number; fy: string; carriedForward: boolean } | null {
  const direct = order.financialYears.indexOf(fy);
  if (direct >= 0) return { column: direct, fy, carriedForward: false };
  if (window === 'after' && order.financialYears.length > 0) {
    const last = order.financialYears.length - 1;
    return { column: last, fy: order.financialYears[last], carriedForward: true };
  }
  return null;
}

/**
 * Ceiling for a scheduled / non-scheduled-domestic flight.
 * `scope` defaults to full handling (the BHS package). For cargo rows the
 * single printed value is returned whatever scope is asked for.
 */
export function resolveAeraCeiling(
  order: Pick<
    BillingAeraTariff,
    'scheduled' | 'financialYears' | 'effectiveFrom' | 'controlPeriodTo' | 'orderNumber' | 'currency' | 'cargoRateColumn'
  > | null | undefined,
  input: {
    aircraftCode?: string | null;
    flightClass: AeraFlightClass;
    flightDate: Date | string;
    scope?: AeraHandlingScope;
  },
): AeraCeilingResult {
  if (!order) return { found: false, reason: 'no_order' };
  const date = input.flightDate instanceof Date ? input.flightDate : new Date(input.flightDate);
  if (Number.isNaN(date.getTime())) return { found: false, reason: 'date_outside_order' };
  const window = orderWindow(order, date);
  if (window === 'before') return { found: false, reason: 'date_outside_order' };
  const code = String(input.aircraftCode ?? '').trim().toUpperCase();
  if (!/^[A-F]$/.test(code)) return { found: false, reason: 'no_aircraft_code', flightClass: input.flightClass };
  const col = fyColumn(order, financialYearOf(date), window);
  if (!col) {
    return { found: false, reason: 'date_outside_order', financialYear: financialYearOf(date), flightClass: input.flightClass, aircraftCode: code };
  }
  const { column, fy, carriedForward } = col;

  const row = rowFor(order, input.flightClass, code);
  if (!row) return { found: false, reason: 'no_row', financialYear: fy, flightClass: input.flightClass, aircraftCode: code };
  if (row.notApplicable) {
    return { found: false, reason: 'not_applicable', financialYear: fy, flightClass: input.flightClass, aircraftCode: code };
  }

  const isCargo = input.flightClass === 'DomesticCargo' || input.flightClass === 'InternationalCargo';
  const scope: AeraHandlingScope = isCargo ? (order.cargoRateColumn ?? 'ramp') : (input.scope ?? 'full');
  const series = isCargo ? (row.ramp?.[column] != null ? row.ramp : row.full) : row[scope];
  const amount = series?.[column];
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { found: false, reason: 'no_rate', financialYear: fy, flightClass: input.flightClass, aircraftCode: code };
  }
  return {
    found: true,
    amount: Number(amount),
    financialYear: fy,
    flightClass: input.flightClass,
    aircraftCode: code,
    scope,
    orderNumber: order.orderNumber,
    currency: order.currency ?? 'INR',
    ...(carriedForward ? { carriedForward: true } : {}),
  };
}

/** International non-scheduled / GA ceiling by MTOW band. */
export function resolveAeraNonScheduledCeiling(
  order: Pick<
    BillingAeraTariff,
    'internationalNonScheduled' | 'financialYears' | 'effectiveFrom' | 'controlPeriodTo' | 'orderNumber' | 'currency'
  > | null | undefined,
  input: { mtowKg?: number | null; flightDate: Date | string },
): { found: true; amount: number; financialYear: string; mtowFromKg: number; mtowToKg: number | null; orderNumber: string } | { found: false; reason: AeraCeilingMiss['reason'] | 'no_mtow' } {
  if (!order) return { found: false, reason: 'no_order' };
  const date = input.flightDate instanceof Date ? input.flightDate : new Date(input.flightDate);
  if (Number.isNaN(date.getTime())) return { found: false, reason: 'date_outside_order' };
  const window = orderWindow(order, date);
  if (window === 'before') return { found: false, reason: 'date_outside_order' };
  const mtow = Number(input.mtowKg);
  if (!Number.isFinite(mtow) || mtow <= 0) return { found: false, reason: 'no_mtow' };
  const col = fyColumn(order, financialYearOf(date), window);
  if (!col) return { found: false, reason: 'date_outside_order' };
  const { column, fy } = col;
  const band = order.internationalNonScheduled.find(
    (b) => mtow >= b.mtowFromKg && (b.mtowToKg == null || mtow <= b.mtowToKg),
  );
  const amount = band?.rates?.[column];
  if (!band || amount == null) return { found: false, reason: 'no_rate' };
  return { found: true, amount: Number(amount), financialYear: fy, mtowFromKg: band.mtowFromKg, mtowToKg: band.mtowToKg, orderNumber: order.orderNumber };
}

/** Compare a billed unit price with the ceiling. */
export function aeraCeilingCheck(
  unitPrice: number,
  ceiling: AeraCeilingResult,
): { exceeds: boolean; ceiling: number | null; excessAmount: number } {
  if (!ceiling.found) return { exceeds: false, ceiling: null, excessAmount: 0 };
  const excess = Math.round((Number(unitPrice) - ceiling.amount) * 100) / 100;
  return { exceeds: excess > 0, ceiling: ceiling.amount, excessAmount: Math.max(0, excess) };
}
