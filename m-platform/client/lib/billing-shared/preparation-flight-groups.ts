/**
 * Group preparation records flight-wise for ADS-family sources
 * (ads / equipment / manpower), matching ADS usage page display.
 * Line-level records stay intact for mark-ready / invoicing.
 */

import type { BillingPreparationRecord } from './types';
import type { PreparationSourceType } from './enums';

export function isAdsFamilyPrepSource(sourceType: PreparationSourceType | string): boolean {
  return (
    sourceType === 'ads' || sourceType === 'equipment' || sourceType === 'manpower'
  );
}

/**
 * Stable flight identity for preparation rows (many equipment lines per flight).
 * Prefer FHR serial; never use usageRowId as the primary key.
 */
export function billingPrepFlightKey(row: BillingPreparationRecord): string {
  if (!isAdsFamilyPrepSource(row.sourceType)) {
    return `id:${String(row._id)}`;
  }

  const op = row.operationalSnapshot ?? {};
  const serial = String(
    row.sourceRef.serialNo ?? op.serialNumber ?? op.SerialNo ?? '',
  ).trim();
  if (serial && serial !== '0') return `s:${serial}`;

  const flightNo = String(
    row.sourceRef.flightNo ??
      op.flightNo ??
      op.flightNoEquipmentNo ??
      '',
  ).trim();
  const date = String(
    op.billingDateYmd ??
      op.dateKey ??
      op.date ??
      op.from_date ??
      op.fromDate ??
      row.billingPeriodStart ??
      '',
  )
    .trim()
    .slice(0, 10);
  const customer = String(row.customerCode ?? op.customerCode ?? '')
    .trim()
    .toUpperCase();
  if (flightNo && date) return `f:${date}|${flightNo}|${customer}`;
  if (flightNo) return `f:${flightNo}|${customer}`;
  return `id:${String(row._id)}`;
}

export type PrepFlightGroup = {
  key: string;
  lines: BillingPreparationRecord[];
  /** Representative row for shared flight-level columns. */
  row: BillingPreparationRecord;
  lineCount: number;
  isAdsFamily: boolean;
};

function equipmentLabel(line: BillingPreparationRecord): string {
  const op = line.operationalSnapshot ?? {};
  const name = String(
    op.equipment_name ??
      op.equipmentName ??
      op.particular ??
      op.serviceCode ??
      line.rateMatch?.serviceCode ??
      '',
  ).trim();
  if (name) return name;
  const usage = String(line.sourceRef.usageRowId ?? '').trim();
  return usage || line.sourceType.replace(/_/g, ' ');
}

export function prepLineEquipmentLabel(line: BillingPreparationRecord): string {
  return equipmentLabel(line);
}

/**
 * Collapse ADS-family prep lines into one display group per flight.
 * Non-ADS sources stay one group per record.
 */
export function groupPreparationRowsByFlight(
  lines: BillingPreparationRecord[],
): PrepFlightGroup[] {
  const groups = new Map<string, BillingPreparationRecord[]>();
  for (const line of lines) {
    const key = billingPrepFlightKey(line);
    const list = groups.get(key);
    if (list) list.push(line);
    else groups.set(key, [line]);
  }

  const result: PrepFlightGroup[] = [];
  for (const [key, list] of groups) {
    const first = list[0];
    const isAdsFamily = isAdsFamilyPrepSource(first.sourceType);
    const representative: BillingPreparationRecord = {
      ...first,
      contractMatch: {
        ...first.contractMatch,
        matched: list.some((l) => Boolean(l.contractMatch?.matched)),
      },
      rateMatch: {
        ...first.rateMatch,
        matched: list.some((l) => Boolean(l.rateMatch?.matched)),
      },
      // Surface first failing validation message if any line has failures.
      validationResults: list.flatMap((l) => l.validationResults ?? []),
    };
    result.push({
      key,
      lines: list,
      row: representative,
      lineCount: list.length,
      isAdsFamily,
    });
  }
  return result;
}

/** Expand selected flight group keys to underlying preparation record ids. */
export function prepLineIdsForGroups(
  groups: PrepFlightGroup[],
  selectedKeys: ReadonlySet<string>,
): string[] {
  return groups
    .filter((g) => selectedKeys.has(g.key))
    .flatMap((g) => g.lines.map((l) => String(l._id)));
}
