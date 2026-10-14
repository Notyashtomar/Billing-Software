import {
  AIRLINE_REMARKS_BLANK_LABEL,
  AIRLINE_REMARKS_RATING_VALUES,
  isAirlineRemarksRating,
} from 'src/remarks/remarks-rating.constants';

export type AirlineRemarkDrillCompactRow = {
  serialNo: number;
  airline: string;
  flightNo: string;
  ataDate: string;
  ataTime: string;
  airlineRemarksRating: string;
  /** Truncated remark text for table preview (no nested blobs). */
  remarkPreview: string;
};

/** Canonical tab key for breakdown charts (matches KPI buckets). */
export function canonicalAirlineRemarkTabKey(ratingRaw: string): string {
  const r = String(ratingRaw ?? '').trim();
  if (!r) return AIRLINE_REMARKS_BLANK_LABEL;
  if (isAirlineRemarksRating(r)) return r;
  return AIRLINE_REMARKS_BLANK_LABEL;
}

const ALL_TABS = [
  ...AIRLINE_REMARKS_RATING_VALUES,
  AIRLINE_REMARKS_BLANK_LABEL,
] as const;

/**
 * Top-N airlines per rating bucket for modal charts (worker precomputes so paginated rows
 * do not break chart fidelity).
 */
export function buildAirlineRemarksChartBreakdown(
  rows: { airline: string; airlineRemarksRating: string }[],
  topN = 5,
): Record<string, { airline: string; count: number }[]> {
  const out: Record<string, { airline: string; count: number }[]> = {};
  for (const tab of ALL_TABS) {
    const filtered = rows.filter(
      (row) => canonicalAirlineRemarkTabKey(row.airlineRemarksRating) === tab,
    );
    const byAirline = new Map<string, number>();
    for (const row of filtered) {
      const a = String(row.airline ?? '').trim() || '—';
      byAirline.set(a, (byAirline.get(a) ?? 0) + 1);
    }
    const sorted = [...byAirline.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([airline, count]) => ({ airline, count }));
    out[tab] = sorted;
  }
  return out;
}
