/**
 * Compare BHS price-card rows with the AERA ceiling for the same aircraft
 * code, sector and financial year. Pure: callers pass the order and the
 * aircraft master rows.
 */
import type { BillingAeraTariff } from '../schemas/billing-aera-tariff.schema';
import { resolveAircraftTariffCode, type AircraftMasterTariffRow } from './aircraft-tariff-code.util';
import { aeraFlightClassFor, financialYearOf, resolveAeraCeiling } from './aera-ceiling.util';

export type AeraPriceCardRowInput = {
  _id?: unknown;
  handlingType?: string | null;
  aircraftType?: string | null;
  category?: string | null;
  price?: number | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  stationCode?: string | null;
};

export type AeraPriceCardCheck = {
  /** AERA ceiling for the card's first financial year (null when no match). */
  aeraCeiling: number | null;
  aeraFinancialYear: string | null;
  aeraAircraftCode: string | null;
  aeraOrderNumber: string | null;
  /** True when the card price is above the ceiling for any FY the card covers. */
  exceedsAeraCeiling: boolean;
  /** Human message for the UI; empty when within the ceiling or not checkable. */
  aeraWarning: string;
};

const EMPTY: AeraPriceCardCheck = {
  aeraCeiling: null,
  aeraFinancialYear: null,
  aeraAircraftCode: null,
  aeraOrderNumber: null,
  exceedsAeraCeiling: false,
  aeraWarning: '',
};

function categoryToClassInput(category: string | null | undefined) {
  const text = String(category ?? '').trim();
  return {
    categoryOfFlight: /^int/i.test(text) ? 'International' : /^dom/i.test(text) ? 'Domestic' : text,
    cargo: /cargo/i.test(text),
  };
}

/** First day of each financial year the card is valid in, clipped to the order. */
function fyProbeDates(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(from.getTime());
  for (let i = 0; i < 8 && cursor.getTime() <= to.getTime(); i += 1) {
    dates.push(new Date(cursor.getTime()));
    // Jump to next 1 April.
    const year = cursor.getUTCMonth() >= 3 ? cursor.getUTCFullYear() + 1 : cursor.getUTCFullYear();
    cursor = new Date(Date.UTC(year, 3, 1));
  }
  return dates;
}

export function checkPriceCardAgainstAera(
  row: AeraPriceCardRowInput,
  order: Pick<
    BillingAeraTariff,
    'scheduled' | 'financialYears' | 'effectiveFrom' | 'controlPeriodTo' | 'orderNumber' | 'currency' | 'cargoRateColumn'
  > | null | undefined,
  aircraftMaster: AircraftMasterTariffRow[],
): AeraPriceCardCheck {
  if (!order || String(row.handlingType ?? 'BHS').toUpperCase() !== 'BHS') return EMPTY;
  const price = Number(row.price);
  if (!Number.isFinite(price) || price <= 0) return EMPTY;
  const code = resolveAircraftTariffCode(String(row.aircraftType ?? ''), aircraftMaster, row.stationCode ?? undefined);
  if (!code) return EMPTY;
  const from = row.validFrom ? new Date(row.validFrom) : null;
  const to = row.validTo ? new Date(row.validTo) : null;
  if (!from || Number.isNaN(from.getTime())) return EMPTY;
  const end = to && !Number.isNaN(to.getTime()) ? to : new Date(order.controlPeriodTo);
  const flightClass = aeraFlightClassFor(categoryToClassInput(row.category));

  let first: AeraPriceCardCheck | null = null;
  let worst: { fy: string; ceiling: number } | null = null;
  for (const probe of fyProbeDates(from, end)) {
    const hit = resolveAeraCeiling(order, { aircraftCode: code, flightClass, flightDate: probe, scope: 'full' });
    if (!hit.found) continue;
    if (!first) {
      first = {
        aeraCeiling: hit.amount,
        aeraFinancialYear: hit.financialYear,
        aeraAircraftCode: code,
        aeraOrderNumber: hit.orderNumber,
        exceedsAeraCeiling: false,
        aeraWarning: '',
      };
    }
    if (price > hit.amount && (!worst || hit.amount < worst.ceiling)) {
      worst = { fy: hit.financialYear, ceiling: hit.amount };
    }
  }
  if (!first) return EMPTY;
  if (!worst) return first;
  return {
    ...first,
    exceedsAeraCeiling: true,
    aeraWarning: `Price ${price.toLocaleString('en-IN')} is above the AERA ceiling ${worst.ceiling.toLocaleString('en-IN')} for Code ${code} ${flightClass.replace(/([a-z])([A-Z])/g, '$1 $2')} in FY ${worst.fy} (order ${first.aeraOrderNumber}).`,
  };
}
