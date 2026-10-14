/**
 * BHS MIS data indexes.
 * Sources are scheduled / XXLD billing rows + price cards + invoices (same feeds as BHS billing).
 * Does not reuse ADS equipment / royalty sheet math.
 */

export const BHS_REV_FIRST_ROW = 3;
export const BHS_REV_COL = {
  categoryDomInt: 2,
  customerCode: 3,
  airlineName: 4,
  aircraftType: 5,
  bodyType: 6,
  flightCount: 7,
  category: 8,
  validFrom: 9,
  validTo: 10,
  currency: 15,
  roe: 16,
  packagePriceUsd: 17,
  packagePriceInr: 18,
  royaltyMode: 19,
  invoiceTotal: 27,
  invoiceNo: 29,
} as const;

/** Delhi Rev_Summary letters. MAA uses BHS_REV_COL and must not follow these. */
export const DEL_REV_COL = {
  prevMonthFlights: 9, // I
  invoiceAmount: 24, // X
  invoiceAmountInr: 25, // Y
  prevInvoiceAmountInr: 28, // AB
  prevMonthOnly: 31, // AE
} as const;

export const BHS_SCHED_FIRST_ROW = 2;
export const BHS_SCHED_COL = {
  flightNo: 1,
  aircraftType: 2,
  sta: 3,
  std: 4,
  dowName: 5,
  body: 6,
  dowNum: 7,
} as const;

export const BHS_XXLD_FIRST_ROW = 26;
export const BHS_XXLD_COL = {
  serial: 1,
  date: 2,
  flightNo: 3,
  aircraftType: 4,
  customerCode: 15,
  airlineName: 16,
  qty: 17,
} as const;

export type BhsMisIndexedFlight = {
  flightNo: string;
  aircraftType: string;
  customerCode: string;
  airlineName: string;
  scheduleDate: string;
  cancelled?: boolean;
  eligible?: boolean;
  flightStatus?: string;
};

export type BhsMisInvoiceHint = {
  customerCode: string;
  billToCustomerCode?: string;
  invoiceNumber?: string;
  totalInclTax?: number;
  currency?: string;
};

export type BhsMisPriceHint = {
  customerCode: string;
  airlineName: string;
  aircraftType: string;
  category: string;
  bodyType?: string;
  packagePriceUsd?: number;
  packagePriceInr?: number;
  currency?: string;
  validFrom?: Date | string;
  validTo?: Date | string;
  royaltyMode?: string;
};

export type BhsMisRevIndexedRow = {
  categoryDomInt: string;
  customerCode: string;
  airlineName: string;
  aircraftType: string;
  bodyType: string;
  flightCount: number;
  category: string;
  validFrom?: string;
  validTo?: string;
  currency: string;
  roeToInr: number;
  packagePriceUsd?: number;
  packagePriceInr?: number;
  royaltyMode?: string;
  invoiceTotal?: number;
  invoiceNumber?: string;
  /** Previous-month eligible flights for this airline (not split by aircraft). */
  prevMonthFlightCount: number;
  /** Current-month flights for this row. Feeds Total Flights (column M). */
  currentFlightCount: number;
  /** Current-month invoice draft total in the draft currency. */
  invoiceAmount: number;
  /** Current-month draft total in INR at the current month's conversion rate. */
  invoiceAmountInr: number;
  /** Previous-month draft total in INR at the previous month's conversion rate. */
  prevInvoiceAmountInr: number;
};

export type BhsMisRevRowOptions = {
  previousFlights?: BhsMisIndexedFlight[];
  previousInvoices?: BhsMisInvoiceHint[];
  previousRoeToInr?: number;
};

export function bhsMisFlightDedupKey(row: BhsMisIndexedFlight): string {
  return `${String(row.flightNo ?? '').trim().toUpperCase()}|${String(row.scheduleDate ?? '').slice(0, 10)}|${String(row.aircraftType ?? '').trim().toUpperCase()}`;
}

export function bhsMisDedupFlights<T extends BhsMisIndexedFlight>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    unique.set(bhsMisFlightDedupKey(row), row);
  }
  return [...unique.values()];
}

export function indexBhsEligibleFlights(flights: BhsMisIndexedFlight[]): {
  byAirline: Map<string, number>;
  byAirlineAircraft: Map<string, number>;
} {
  const byAirline = new Map<string, number>();
  const byAirlineAircraft = new Map<string, number>();
  for (const flight of flights) {
    if (flight.cancelled || flight.eligible !== true) continue;
    const code = String(flight.customerCode ?? '')
      .toUpperCase()
      .split('-')[0];
    if (!code) continue;
    const ac = String(flight.aircraftType ?? '')
      .toUpperCase()
      .trim();
    byAirline.set(code, (byAirline.get(code) ?? 0) + 1);
    if (ac) {
      const key = `${code}|${ac}`;
      byAirlineAircraft.set(key, (byAirlineAircraft.get(key) ?? 0) + 1);
    }
  }
  return { byAirline, byAirlineAircraft };
}

export function indexBhsInvoices(invoices: BhsMisInvoiceHint[]): Map<string, BhsMisInvoiceHint> {
  const map = new Map<string, BhsMisInvoiceHint>();
  const put = (raw: string | undefined, inv: BhsMisInvoiceHint) => {
    const code = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (!code) return;
    if (!map.has(code)) map.set(code, inv);
    const base = code.split('-')[0];
    if (base && !map.has(base)) map.set(base, inv);
  };
  for (const inv of invoices) {
    put(inv.customerCode, inv);
    put(inv.billToCustomerCode, inv);
  }
  return map;
}

function dateOnly(value?: Date | string): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return text || undefined;
}

function isDomestic(category: string): boolean {
  const c = category.toLowerCase();
  return /domestic/.test(c) && !/international/.test(c);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function airlineBaseCode(raw?: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .split('-')[0];
}

/** Full airline name for Rev_Summary. Drops a leading IATA code such as "AI - Air India". */
export function bhsMisAirlineFullName(airlineName?: string, customerCode?: string): string {
  const code = airlineBaseCode(customerCode);
  const name = String(airlineName ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return '';
  const prefixed = name.match(/^([A-Za-z0-9]{2,4})\s*[-–/:]\s*(.+)$/);
  if (prefixed) {
    const prefix = prefixed[1].toUpperCase();
    const rest = prefixed[2].trim();
    if ((!code || prefix === code) && rest && rest.toUpperCase() !== code) return rest;
  }
  if (code && name.toUpperCase() === code) return '';
  return name;
}

/** INR amount. INR drafts stay as billed. Other currencies use the month's USD→INR rate. */
export function convertBillingAmountToInr(
  amount: number,
  currency: string | undefined,
  roeToInr: number,
): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  const code = String(currency ?? 'INR').trim().toUpperCase();
  if (code === 'INR' || code === '') return roundMoney(value);
  const rate = Number(roeToInr);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return roundMoney(value * safeRate);
}

export type BhsAirlineInvoiceRollup = {
  amount: number;
  inr: number;
  currency: string;
  invoiceNumber?: string;
};

/** Sum billable drafts per airline. Mixed currencies collapse to the INR total. */
export function rollupBhsInvoicesByAirline(
  invoices: BhsMisInvoiceHint[],
  roeToInr: number,
): Map<string, BhsAirlineInvoiceRollup> {
  const map = new Map<
    string,
    BhsAirlineInvoiceRollup & { currencies: Set<string> }
  >();
  for (const inv of invoices) {
    const bases = new Set<string>();
    for (const raw of [inv.customerCode, inv.billToCustomerCode]) {
      const base = airlineBaseCode(raw);
      if (base) bases.add(base);
    }
    const amount = Number(inv.totalInclTax ?? 0) || 0;
    const currency = String(inv.currency ?? 'INR').trim().toUpperCase() || 'INR';
    const inr = convertBillingAmountToInr(amount, currency, roeToInr);
    for (const base of bases) {
      const bucket = map.get(base) ?? {
        amount: 0,
        inr: 0,
        currency,
        invoiceNumber: inv.invoiceNumber,
        currencies: new Set<string>(),
      };
      bucket.amount = roundMoney(bucket.amount + amount);
      bucket.inr = roundMoney(bucket.inr + inr);
      bucket.currencies.add(currency);
      if (!bucket.invoiceNumber && inv.invoiceNumber) bucket.invoiceNumber = inv.invoiceNumber;
      map.set(base, bucket);
    }
  }
  const out = new Map<string, BhsAirlineInvoiceRollup>();
  for (const [key, bucket] of map) {
    const mixed = bucket.currencies.size > 1;
    out.set(key, {
      amount: mixed ? bucket.inr : bucket.amount,
      inr: bucket.inr,
      currency: mixed ? 'INR' : bucket.currency,
      invoiceNumber: bucket.invoiceNumber,
    });
  }
  return out;
}

/** One Rev_summary row per price-card airline×type, counts from indexed scheduled sources. */
export function buildBhsMisRevRows(
  priceCards: BhsMisPriceHint[],
  invoices: BhsMisInvoiceHint[],
  flights: BhsMisIndexedFlight[],
  roeToInr: number,
  options?: BhsMisRevRowOptions,
): BhsMisRevIndexedRow[] {
  const previousFlights = options?.previousFlights;
  const countSource = previousFlights ?? flights;
  const flightIndex = indexBhsEligibleFlights(countSource);
  const currentIndex = indexBhsEligibleFlights(flights);
  const prevAirlineIndex = indexBhsEligibleFlights(previousFlights ?? flights);
  const invoiceRollup = rollupBhsInvoicesByAirline(invoices, roeToInr);
  const prevRoe = options?.previousRoeToInr ?? roeToInr;
  const prevRollup = rollupBhsInvoicesByAirline(options?.previousInvoices ?? [], prevRoe);
  return priceCards.map((pc) => {
    const code = String(pc.customerCode ?? '')
      .trim()
      .toUpperCase();
    const base = code.includes('-') ? code.split('-')[0] : code;
    const ac = String(pc.aircraftType ?? '')
      .toUpperCase()
      .trim();
    let flightCount = flightIndex.byAirlineAircraft.get(`${base}|${ac}`);
    if (flightCount === undefined || flightCount === 0) {
      flightCount = flightIndex.byAirline.get(base) ?? 0;
    }
    let currentFlightCount = currentIndex.byAirlineAircraft.get(`${base}|${ac}`);
    if (currentFlightCount === undefined || currentFlightCount === 0) {
      currentFlightCount = currentIndex.byAirline.get(base) ?? 0;
    }
    const inv = invoiceRollup.get(base);
    const prev = prevRollup.get(base);
    return {
      categoryDomInt: isDomestic(String(pc.category ?? '')) ? 'Dom' : 'Int',
      customerCode: base,
      airlineName: pc.airlineName,
      aircraftType: pc.aircraftType,
      bodyType: pc.bodyType || 'NB',
      flightCount,
      category: pc.category,
      validFrom: dateOnly(pc.validFrom),
      validTo: dateOnly(pc.validTo),
      currency: String(pc.currency ?? 'INR').toUpperCase(),
      roeToInr,
      packagePriceUsd: pc.packagePriceUsd,
      packagePriceInr: pc.packagePriceInr,
      royaltyMode: pc.royaltyMode,
      invoiceTotal: inv ? inv.amount : undefined,
      invoiceNumber: inv?.invoiceNumber,
      prevMonthFlightCount: prevAirlineIndex.byAirline.get(base) ?? 0,
      currentFlightCount,
      invoiceAmount: inv?.amount ?? 0,
      invoiceAmountInr: inv?.inr ?? 0,
      prevInvoiceAmountInr: prev?.inr ?? 0,
    };
  });
}

export function flightsToRecoLikes(flights: BhsMisIndexedFlight[]) {
  return flights.map((f) => ({
    flightNo: f.flightNo,
    customerCode: f.customerCode,
    scheduleDate: f.scheduleDate,
    cancelled: f.cancelled,
    flightStatus: f.flightStatus,
  }));
}
