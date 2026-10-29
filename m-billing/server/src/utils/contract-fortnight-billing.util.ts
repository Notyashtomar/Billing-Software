export type ContractFortnightBillingRange = {
  startDay: number;
  endDay: number;
  /**
   * Legacy single rate. Treated as August 2026 only when no month rates are stored.
   * New rates live on `monthRates`.
   */
  exchangeRatePerUsd?: number;
};

export type ContractFortnightMonthRate = {
  /** Calendar month, `YYYY-MM`. */
  month: string;
  parts: Array<{ startDay: number; exchangeRatePerUsd: number }>;
};

export type ContractFortnightBillingConfig = {
  enabled?: boolean;
  partCount?: number;
  ranges?: ContractFortnightBillingRange[];
  monthRates?: ContractFortnightMonthRate[];
  /**
   * When true, the 1st belongs to the previous month’s last part
   * (1 Sep → 16–31 Aug) and the last day of a month belongs to the
   * next month’s first part (31 Jul → 1–15 Aug).
   */
  edgeDayCap?: boolean;
};

export type ContractFortnightBillingValidationResult = {
  enabled: boolean;
  partCount?: number;
  ranges?: ContractFortnightBillingRange[];
  monthRates?: ContractFortnightMonthRate[];
  edgeDayCap?: boolean;
};

/** Rates saved before month-wise ROE are the August 2026 rates. */
export const LEGACY_FORTNIGHT_ROE_MONTH = '2026-08';

/** Last calendar day of `YYYY-MM` (28, 29, 30, or 31). */
export function daysInFortnightMonth(month: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/** 28–31 are real month endings. A closing part that ends on one of these runs through that month. */
export function isFortnightMonthEndingDay(day: number): boolean {
  return day >= 28 && day <= 31;
}

export function normalizeContractFortnightBillingConfig(
  config: ContractFortnightBillingConfig | undefined,
): ContractFortnightBillingValidationResult {
  const enabled = Boolean(config?.enabled);
  if (!enabled) return { enabled: false };

  const partCount = Math.trunc(Number(config?.partCount));
  if (!Number.isFinite(partCount) || partCount < 2 || partCount > 31) {
    throw new Error('Fortnight billing parts must be between 2 and 31.');
  }

  const rawRanges = Array.isArray(config?.ranges) ? config.ranges : [];
  if (rawRanges.length !== partCount) {
    throw new Error('Fortnight billing ranges must match the selected part count.');
  }

  const ranges = rawRanges.map((range, index) => {
    const startDay = Math.trunc(Number(range?.startDay));
    const endDay = Math.trunc(Number(range?.endDay));
    if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) {
      throw new Error(`Fortnight billing part ${index + 1} requires start and end day.`);
    }
    if (startDay < 1 || startDay > 31 || endDay < 1 || endDay > 31) {
      throw new Error(`Fortnight billing part ${index + 1} must stay within 1 to 31.`);
    }
    if (startDay > endDay) {
      throw new Error(`Fortnight billing part ${index + 1} has start day after end day.`);
    }
    const exchangeRatePerUsd = Number(range?.exchangeRatePerUsd);
    return {
      startDay,
      endDay,
      ...(Number.isFinite(exchangeRatePerUsd) && exchangeRatePerUsd > 0
        ? { exchangeRatePerUsd }
        : {}),
    };
  });

  const sorted = [...ranges].sort((left, right) => left.startDay - right.startDay);
  if (sorted[0]?.startDay !== 1) {
    throw new Error('Fortnight billing ranges must start at day 1.');
  }

  let expectedStart = 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.startDay !== expectedStart) {
      if (current.startDay < expectedStart) {
        throw new Error('Fortnight billing ranges cannot overlap.');
      }
      throw new Error('Fortnight billing ranges must not leave gaps between parts.');
    }
    expectedStart = current.endDay + 1;
  }
  const closingDay = sorted[sorted.length - 1]?.endDay ?? 0;
  if (!isFortnightMonthEndingDay(closingDay)) {
    throw new Error(
      'Last billing part must end on the last day of the month (28, 29, 30, or 31).',
    );
  }

  const monthRates = normalizeFortnightMonthRates(config?.monthRates, sorted);

  return {
    enabled: true,
    partCount,
    ranges: sorted,
    monthRates,
    edgeDayCap: Boolean(config?.edgeDayCap),
  };
}

function normalizeFortnightMonthRates(
  raw: ContractFortnightMonthRate[] | undefined,
  ranges: ContractFortnightBillingRange[],
): ContractFortnightMonthRate[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const monthRates: ContractFortnightMonthRate[] = [];
  for (const entry of raw) {
    const month = String(entry?.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('Each fortnight ROE entry needs a month in YYYY-MM form.');
    }
    if (seen.has(month)) {
      throw new Error(`Fortnight ROE for ${month} is listed more than once.`);
    }
    seen.add(month);
    const parts = ranges.map((range) => {
      const match = (entry.parts ?? []).find(
        (part) => Math.trunc(Number(part?.startDay)) === range.startDay,
      );
      const exchangeRatePerUsd = Number(match?.exchangeRatePerUsd);
      if (!Number.isFinite(exchangeRatePerUsd) || exchangeRatePerUsd <= 0) {
        throw new Error(
          `Fortnight ROE for ${month} needs a USD to INR rate for the part starting on day ${range.startDay}.`,
        );
      }
      return { startDay: range.startDay, exchangeRatePerUsd };
    });
    monthRates.push({ month, parts });
  }
  return monthRates.sort((left, right) => left.month.localeCompare(right.month));
}

/** Stored month rates, or the legacy part rates shown only as August 2026. */
export function effectiveFortnightMonthRates(
  config: Pick<ContractFortnightBillingValidationResult, 'ranges' | 'monthRates'>,
): ContractFortnightMonthRate[] {
  if (config.monthRates && config.monthRates.length > 0) return config.monthRates;
  const ranges = config.ranges ?? [];
  if (
    ranges.length === 0 ||
    ranges.some((range) => !(Number(range.exchangeRatePerUsd) > 0))
  ) {
    return [];
  }
  return [
    {
      month: LEGACY_FORTNIGHT_ROE_MONTH,
      parts: ranges.map((range) => ({
        startDay: range.startDay,
        exchangeRatePerUsd: Number(range.exchangeRatePerUsd),
      })),
    },
  ];
}

export function fortnightExchangeRateForPart(
  config: Pick<ContractFortnightBillingValidationResult, 'ranges' | 'monthRates'>,
  yyyyMm: string,
  startDay: number,
): number | null {
  const entry = effectiveFortnightMonthRates(config).find((row) => row.month === yyyyMm);
  const rate = Number(entry?.parts.find((part) => part.startDay === startDay)?.exchangeRatePerUsd);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function readDateString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

const ATA_DATE_KEYS = ['ataDate', 'ATADate', 'ATA Date', 'actualArrivalDate'];

/**
 * Calendar day of ATA (1 = 1st of that month, 15 = 15th).
 * Part 1–15 includes both the 1st and the 15th.
 */
export function ataCalendarDay(ymd: string): number {
  const day = Number(ymd.slice(8, 10));
  return Number.isFinite(day) ? day : NaN;
}

/** Fortnight part is the calendar day of actual arrival (ATA), not STA/STD. */
export function extractPreparationFlightYmd(record: {
  sourceRef?: Record<string, unknown> | null;
  operationalSnapshot?: Record<string, unknown> | null;
}): string | null {
  const bags = [record.operationalSnapshot, record.sourceRef];
  for (const bag of bags) {
    if (!bag) continue;
    for (const key of ATA_DATE_KEYS) {
      const raw = bag[key];
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        return raw.toISOString().slice(0, 10);
      }
      const candidate = readDateString(raw);
      if (candidate) return candidate;
    }
  }
  return null;
}

export function resolveFortnightPartRangeForMonth(
  monthYmd: string,
  range: ContractFortnightBillingRange,
): { start: Date; end: Date } {
  const year = Number(monthYmd.slice(0, 4));
  const month = Number(monthYmd.slice(5, 7));
  const monthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = Math.max(1, Math.min(monthLastDay, range.startDay));
  const endDay = Math.max(startDay, Math.min(monthLastDay, range.endDay));
  return {
    start: new Date(Date.UTC(year, month - 1, startDay, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, endDay, 23, 59, 59, 999)),
  };
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + deltaDays)).toISOString().slice(0, 10);
}

/** Closing part that ends on 28–31 covers the real last day of that month. */
export function matchFortnightPartForDay(
  ranges: ContractFortnightBillingRange[],
  monthKey: string,
  day: number,
): ContractFortnightBillingRange | null {
  const monthLastDay = daysInFortnightMonth(monthKey) ?? 31;
  const closingEnd = Math.max(...ranges.map((item) => item.endDay));
  return (
    ranges.find((item) => {
      const end =
        item.endDay === closingEnd && isFortnightMonthEndingDay(item.endDay)
          ? monthLastDay
          : Math.min(item.endDay, monthLastDay);
      return day >= item.startDay && day <= end;
    }) ?? null
  );
}

/**
 * Which part and billing month an ATA belongs to.
 * With the 1-day cap, 1 Sep is the August closing part and 31 Jul is the August opening part.
 */
export function assignFortnightAta(
  config: ContractFortnightBillingValidationResult,
  ymd: string,
): { monthKey: string; range: ContractFortnightBillingRange } | null {
  const ranges = config.ranges ?? [];
  if (ranges.length === 0) return null;
  const day = ataCalendarDay(ymd);
  if (!Number.isFinite(day)) return null;
  const monthKey = ymd.slice(0, 7);
  const monthLastDay = daysInFortnightMonth(monthKey) ?? 31;
  const opening = ranges[0];
  const closing = ranges[ranges.length - 1];
  if (config.edgeDayCap && day === 1 && closing) {
    const previous = shiftYmd(ymd, -1);
    return { monthKey: previous.slice(0, 7), range: closing };
  }
  if (config.edgeDayCap && day === monthLastDay && opening) {
    const next = shiftYmd(ymd, 1);
    return { monthKey: next.slice(0, 7), range: opening };
  }
  const range = matchFortnightPartForDay(ranges, monthKey, day);
  if (!range) return null;
  return { monthKey, range };
}

/** Invoice window + rate for flights whose ATA days fall in one fortnight part. */
export function resolveFortnightPartForFlights(
  contract: ContractFortnightBillingConfig | null | undefined,
  ataYmds: string[],
): { start: Date; end: Date; exchangeRatePerUsd: number } | null {
  const dates = ataYmds.filter((ymd) => /^\d{4}-\d{2}-\d{2}/.test(ymd));
  if (!contract?.enabled || dates.length === 0) return null;
  let config: ContractFortnightBillingValidationResult;
  try {
    config = normalizeContractFortnightBillingConfig(contract);
  } catch {
    return null;
  }
  if (!config.enabled || !config.ranges?.length) return null;
  const tallies = new Map<
    string,
    { monthKey: string; range: ContractFortnightBillingRange; count: number }
  >();
  for (const ymd of dates) {
    const assigned = assignFortnightAta(config, ymd);
    if (!assigned) continue;
    const key = `${assigned.monthKey}|${assigned.range.startDay}`;
    const row = tallies.get(key);
    if (row) row.count += 1;
    else tallies.set(key, { monthKey: assigned.monthKey, range: assigned.range, count: 1 });
  }
  const assigned = [...tallies.values()].sort((left, right) => right.count - left.count)[0];
  if (!assigned) return null;
  const rate = fortnightExchangeRateForPart(config, assigned.monthKey, assigned.range.startDay);
  const monthLastDay = daysInFortnightMonth(assigned.monthKey) ?? 31;
  const closingEnd = Math.max(...config.ranges.map((item) => item.endDay));
  const monthWindow = resolveFortnightPartRangeForMonth(`${assigned.monthKey}-01`, {
    ...assigned.range,
    endDay:
      assigned.range.endDay === closingEnd && isFortnightMonthEndingDay(assigned.range.endDay)
        ? monthLastDay
        : assigned.range.endDay,
  });
  return { ...monthWindow, exchangeRatePerUsd: rate ?? 0 };
}

/** `16-09-26 - 31-09-26`. Uses the contract day numbers, including 31 in a 30-day month. */
export function formatAdsFortnightPeriodLabel(
  monthKey: string,
  startDay: number,
  endDay: number,
): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match || !(startDay > 0) || !(endDay > 0)) return '';
  const day = (value: number) => String(Math.trunc(value)).padStart(2, '0');
  return `${day(startDay)}-${match[2]}-${match[1].slice(2)} - ${day(endDay)}-${match[2]}-${match[1].slice(2)}`;
}

/** Contract part whose start day is the invoice period start. */
export function adsFortnightRangeForPeriodStart(
  ranges: Array<{ startDay: number; endDay: number }> | null | undefined,
  billingPeriodStart: Date | string | null | undefined,
): { monthKey: string; startDay: number; endDay: number } | null {
  if (!ranges?.length || billingPeriodStart == null) return null;
  const ymd = readDateString(billingPeriodStart);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const startDay = Number(ymd.slice(8, 10));
  const range = ranges.find((item) => item.startDay === startDay);
  if (!range) return null;
  return { monthKey: ymd.slice(0, 7), startDay: range.startDay, endDay: range.endDay };
}

/** Part rate for an invoice whose period starts on that part's day. */
export function fortnightExchangeRateForBillingPeriod(
  contract: ContractFortnightBillingConfig | null | undefined,
  billingPeriodStart?: Date | string | null,
  billingPeriodEnd?: Date | string | null,
): number | null {
  if (!contract?.enabled) return null;
  let config: ContractFortnightBillingValidationResult;
  try {
    config = normalizeContractFortnightBillingConfig(contract);
  } catch {
    return null;
  }
  if (!config.enabled || !config.ranges?.length) return null;
  const start = readDateString(billingPeriodStart);
  if (!start) return null;
  const startDay = Number(start.slice(8, 10));
  const match = config.ranges.find((range) => range.startDay === startDay);
  if (!match) return null;
  return fortnightExchangeRateForPart(config, start.slice(0, 7), match.startDay);
}
