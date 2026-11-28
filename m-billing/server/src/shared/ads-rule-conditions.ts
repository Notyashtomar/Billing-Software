/**
 * Contract wording on an ADS equipment row that changes how the row is charged.
 * The Remarks cell of the rule carries the wording; nothing else is read from it.
 */

import { reportDateYmd } from '../utils/invoicing-flight-report.mapper';
import { classifyStationBay, type StationBayType } from './station-bay-types';

export type AdsRuleConditions = {
  /** "FOC for SGT time": time-based use is free for the scheduled ground time. */
  sgtFree: boolean;
  /** "FOC for Remote Bay" / "FOC for Contact bay": free when the flight used that kind of bay. */
  focBay: StationBayType | null;
  /** "900 Per month …": this many units are free in the billing month. */
  monthlyFreePool: number | null;
  /**
   * "Charged on request only": the rate is kept for one-off requests, but
   * routine use on a flight is never billed from the flight report.
   */
  onRequestOnly: boolean;
};

export function parseAdsRuleConditions(remarks: unknown): AdsRuleConditions {
  const text = String(remarks ?? '')
    // Yearly-increase tag appended by the rate script.
    .replace(/\s*CYI:\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const bay = text.match(/^FOC for (remote|contact) bay\.?$/i);
  // "900 Per month based on double daily flights": only the count is a rule.
  const pool = text.match(/^(\d{1,6}) per month\b/i);
  const poolSize = pool ? Number(pool[1]) : 0;
  return {
    sgtFree: /^FOC for SGT( time)?\.?$/i.test(text),
    focBay: bay ? (bay[1].toLowerCase() as StationBayType) : null,
    monthlyFreePool: poolSize > 0 ? poolSize : null,
    onRequestOnly: /^charged on request only\.?$/i.test(text),
  };
}

/** True when any rule on the contract needs the bay or the scheduled ground time. */
export function adsRulesNeedFlightContext(
  rules: ReadonlyArray<{ remarks?: unknown }> | null | undefined,
): boolean {
  return (rules ?? []).some((rule) => {
    const conditions = parseAdsRuleConditions(rule.remarks);
    return conditions.sgtFree || conditions.focBay != null;
  });
}

/** Flight report remark says the equipment was kept on standby. */
export function isAdsStandbyRemark(remarks: unknown): boolean {
  return /\bstand\s*-?\s*by\b|\bstby\b/i.test(String(remarks ?? ''));
}

/** Contract standby percent, when it is a real part-charge (above 0, below 100). */
export function adsStandbyChargePercent(
  contract: { conditionalCharges?: { standbyChargesPercent?: number | null } | null } | null | undefined,
): number | null {
  const percent = Number(contract?.conditionalCharges?.standbyChargesPercent);
  return Number.isFinite(percent) && percent > 0 && percent < 100 ? percent : null;
}

/**
 * Equipment priced per turnaround is charged once for the flight, however many
 * times it was logged. Per-person turnaround rates still count each person.
 */
export function isPerTurnaroundEquipmentUom(uom: unknown): boolean {
  const text = String(uom ?? '');
  return /turn\s*around/i.test(text) && !/person|staff|pax|head/i.test(text);
}

function clockMinutes(raw: unknown): number | null {
  const match = String(raw ?? '').trim().match(/^(\d{1,2}):?(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function scheduledMoment(date: unknown, time: unknown): number | null {
  const ymd = reportDateYmd(date);
  const minutes = clockMinutes(time);
  if (!ymd || minutes == null) return null;
  const day = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(day) ? day + minutes * 60_000 : null;
}

/** Scheduled ground time (STA to STD) in minutes. Null when either time is missing. */
export function scheduledGroundMinutes(
  main: Record<string, unknown> | null | undefined,
): number | null {
  const m = main ?? {};
  const sta = scheduledMoment(m.STADate ?? m.staDate, m.STATime ?? m.staTime);
  const std = scheduledMoment(m.STDDate ?? m.stdDate, m.STDTime ?? m.stdTime);
  if (sta == null || std == null) return null;
  const minutes = Math.round((std - sta) / 60_000);
  // A departure before the arrival or days later is not one ground stay.
  return minutes > 0 && minutes <= 48 * 60 ? minutes : null;
}

export type AdsFlightContext = {
  bayNo: string;
  bayType: StationBayType | null;
  sgtMinutes: number | null;
};

export function adsFlightContextFromFhr(
  fhr: {
    stationCode?: unknown;
    mainDetails?: Record<string, unknown> | null;
    rampDetails1?: Record<string, unknown> | null;
  },
  stationCode?: unknown,
): AdsFlightContext {
  const ramp = fhr.rampDetails1 ?? {};
  const bayNo = String(ramp.BayFinal ?? '').trim() || String(ramp.BayPlanned ?? '').trim();
  return {
    bayNo,
    bayType: classifyStationBay(String(fhr.stationCode ?? '').trim() || stationCode, bayNo),
    sgtMinutes: scheduledGroundMinutes(fhr.mainDetails),
  };
}
