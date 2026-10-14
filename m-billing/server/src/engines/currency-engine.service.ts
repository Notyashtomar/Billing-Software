import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BillingExchangeRate,
  BillingExchangeRateDocument,
} from '../schemas/billing.schemas';
import type { StationScopeContext } from '../common/station-scope';

/**
 * Extract calendar year-month (YYYY-MM) without local-TZ shift.
 * `2026-04-01` / ISO UTC midnight must stay April, not March in IST.
 */
export function toBillingYearMonth(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const ymd = /^(\d{4})-(\d{2})/.exec(trimmed);
    if (ymd) return `${ymd[1]}-${ymd[2]}`;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (Number.isNaN(value.getTime())) return null;
  // Prefer UTC parts for Date objects that came from YYYY-MM-DD midnight UTC.
  const utcYmd = value.toISOString().slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(utcYmd)) return utcYmd;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function monthBoundsFromYearMonth(yearMonth: string): { monthStart: Date; monthEnd: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

@Injectable()
export class CurrencyEngineService {
  private readonly factorCache = new Map<string, { at: number; value: number }>();

  constructor(
    @InjectModel(BillingExchangeRate.name)
    private readonly rateModel: Model<BillingExchangeRateDocument>,
  ) {}

  /**
   * Resolve USD→INR factor for the flight / preparation billing month.
   * Uses the master Conversion Rates month entry when present.
   */
  clearCache(): void {
    this.factorCache.clear();
  }

  async resolveFactor(
    ctx: StationScopeContext,
    currencyCode: string,
    documentDate: Date,
    billingPeriodStart?: Date | null,
  ): Promise<number> {
    if (currencyCode === 'INR') return 1;

    const stationCode = String(ctx.stationCode ?? '').trim().toUpperCase();
    if (!stationCode) {
      throw new NotFoundException(
        `No exchange rate for ${currencyCode}: station is required`,
      );
    }
    const yearMonth =
      toBillingYearMonth(billingPeriodStart) ??
      toBillingYearMonth(documentDate);
    if (!yearMonth) {
      throw new NotFoundException(`No exchange rate for ${currencyCode}: invalid billing month`);
    }
    const cacheKey = `${stationCode ?? ''}|${currencyCode.toUpperCase()}|${yearMonth}`;
    const cached = this.factorCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;

    const { monthStart, monthEnd } = monthBoundsFromYearMonth(yearMonth);
    const currency = currencyCode.toUpperCase();

    const exactStation = { stationCode };

    const monthRate = await this.rateModel
      .findOne({
        currencyCode: currency,
        startingDate: { $gte: monthStart, $lte: monthEnd },
        ...exactStation,
      })
      .sort({ startingDate: -1 })
      .lean();
    let resolved = monthRate?.rateToINR;

    if (resolved == null) {
      // Also match rates stored as local-midnight first-of-month (legacy creates).
      const localMonthStart = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)) - 1, 1);
      const localMonthEnd = new Date(
        Number(yearMonth.slice(0, 4)),
        Number(yearMonth.slice(5, 7)),
        0,
        23,
        59,
        59,
        999,
      );
      const localMonthRate = await this.rateModel
        .findOne({
          currencyCode: currency,
          startingDate: { $gte: localMonthStart, $lte: localMonthEnd },
          ...exactStation,
        })
        .sort({ startingDate: -1 })
        .lean();
      resolved = localMonthRate?.rateToINR;
    }

    if (resolved == null) {
      const fallback = await this.rateModel
        .findOne({
          currencyCode: currency,
          startingDate: { $lte: monthEnd },
          ...exactStation,
        })
        .sort({ startingDate: -1 })
        .lean();
      resolved = fallback?.rateToINR;
    }
    if (resolved == null) {
      throw new NotFoundException(
        `No exchange rate for ${currency} for ${yearMonth}`,
      );
    }
    this.factorCache.set(cacheKey, { at: Date.now(), value: resolved });
    return resolved;
  }
}
