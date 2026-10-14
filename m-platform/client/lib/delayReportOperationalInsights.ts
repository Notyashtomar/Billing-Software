import { formatMinutesAsDisplay } from '@/components/fris/reports/delay-report/delayReportUtils';

export type OperationalInsightSummaryStats = {
  fromYmd: string;
  toYmd: string;
  airline: string;
  station: string;
  delayedFlights: number;
  totalDelayMinutes: number;
  avgDelayPerFlight: number;
  topDelayCode: { code: string; flightCount: number } | null;
  worstStation: { name: string; flightCount: number } | null;
  worstAirline: { name: string; flightCount: number } | null;
};

export type OperationalInsightDelayRow = {
  code: string;
  description: string;
  flightCount: number;
  totalMinutes: number;
  avgMinutes: number;
  pctOfDelay: number;
  severity: string;
};

export type OperationalInsightDelayTables = {
  gha: OperationalInsightDelayRow[];
  nonGha: OperationalInsightDelayRow[];
};

function clampInsightCount(count: number): number {
  return Math.min(10, Math.max(3, Math.trunc(count) || 3));
}

/** Deterministic insights from delay analytics when Groq is unavailable or returns invalid output. */
export function buildRuleBasedOperationalInsights(
  summary: OperationalInsightSummaryStats,
  tables: OperationalInsightDelayTables,
  requestedCount: number,
): string[] {
  const count = clampInsightCount(requestedCount);
  const insights: string[] = [];
  const airlineFilter = summary.airline && summary.airline !== 'All airlines' ? summary.airline : null;
  const stationFilter = summary.station && summary.station !== 'All stations' ? summary.station : null;

  const allRows = [...tables.gha, ...tables.nonGha].sort(
    (a, b) => b.totalMinutes - a.totalMinutes || b.flightCount - a.flightCount,
  );

  const scopeParts = [
    airlineFilter ? `airline ${airlineFilter}` : null,
    stationFilter ? `station ${stationFilter}` : null,
  ].filter(Boolean);
  const scope = scopeParts.length ? ` (${scopeParts.join(', ')})` : '';

  insights.push(
    `Between ${summary.fromYmd} and ${summary.toYmd}${scope}, ${summary.delayedFlights} delayed flights recorded ${formatMinutesAsDisplay(summary.totalDelayMinutes)} total delay, averaging ${summary.avgDelayPerFlight.toFixed(1)} minutes per movement.`,
  );

  const topRow = allRows[0];
  if (topRow && topRow.flightCount > 0) {
    insights.push(
      `Delay code ${topRow.code} (${topRow.description}) is the largest contributor with ${topRow.flightCount} flights, ${topRow.pctOfDelay.toFixed(1)}% of delay minutes, and an average of ${topRow.avgMinutes.toFixed(0)} min per event.`,
    );
  }

  if (summary.worstStation?.name) {
    insights.push(
      `${summary.worstStation.name} shows the highest station-level delay concentration with ${summary.worstStation.flightCount} affected flights in the selected period.`,
    );
  }

  if (summary.worstAirline?.name) {
    insights.push(
      `${summary.worstAirline.name} leads airline delay share with ${summary.worstAirline.flightCount} delayed flights — review turnaround and gate allocation with the carrier.`,
    );
  }

  const ghaMinutes = tables.gha.reduce((sum, row) => sum + row.totalMinutes, 0);
  const nonGhaMinutes = tables.nonGha.reduce((sum, row) => sum + row.totalMinutes, 0);
  const delayPool = ghaMinutes + nonGhaMinutes;
  if (delayPool > 0) {
    const ghaPct = (ghaMinutes / delayPool) * 100;
    insights.push(
      `GHA-attributed codes account for ${ghaPct.toFixed(1)}% of delay minutes versus ${(100 - ghaPct).toFixed(1)}% non-GHA — align stand and ramp resources to the dominant bucket.`,
    );
  }

  const severeRows = allRows.filter(
    (row) => row.severity === 'Alert' || row.severity === 'High' || row.severity === 'Watch',
  );
  for (const row of severeRows) {
    if (insights.length >= count) break;
    if (insights.some((text) => text.includes(`code ${row.code}`))) continue;
    insights.push(
      `Code ${row.code} (${row.description}) is flagged ${row.severity} with ${row.pctOfDelay.toFixed(1)}% of total delay — verify root-cause actions and escalation thresholds.`,
    );
  }

  for (const row of allRows) {
    if (insights.length >= count) break;
    if (insights.some((text) => text.includes(`code ${row.code}`))) continue;
    insights.push(
      `Track code ${row.code} (${row.description}): ${row.flightCount} flights, ${formatMinutesAsDisplay(row.totalMinutes)} total, ${row.pctOfDelay.toFixed(1)}% share.`,
    );
  }

  while (insights.length < count) {
    insights.push(
      `Continue monitoring delay-code trends through the period end (${summary.toYmd}) and rebalance staff at peak hours if rotation-related codes remain elevated.`,
    );
  }

  return insights.slice(0, count);
}

/** Normalize Groq / model output into a string array (lenient). */
export function parseInsightsFromModelContent(rawContent: string): string[] {
  const cleaned = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  const tryParse = (text: string): string[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return null;
      const strings = parsed
        .map((item) => String(item ?? '').trim())
        .filter(Boolean);
      return strings.length > 0 ? strings : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const nested = tryParse(arrayMatch[0]);
    if (nested) return nested;
  }

  return cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 20);
}

export function finalizeOperationalInsights(
  aiInsights: string[] | null,
  summary: OperationalInsightSummaryStats,
  tables: OperationalInsightDelayTables,
  requestedCount: number,
): { insights: string[]; source: 'ai' | 'rules' | 'mixed' } {
  const count = clampInsightCount(requestedCount);
  const fallback = buildRuleBasedOperationalInsights(summary, tables, count);

  if (!aiInsights || aiInsights.length === 0) {
    return { insights: fallback, source: 'rules' };
  }

  const merged: string[] = [];
  for (const item of aiInsights) {
    const text = item.trim();
    if (text && !merged.includes(text)) merged.push(text);
    if (merged.length >= count) break;
  }

  if (merged.length === 0) {
    return { insights: fallback, source: 'rules' };
  }

  for (const item of fallback) {
    if (merged.length >= count) break;
    if (!merged.includes(item)) merged.push(item);
  }

  return {
    insights: merged.slice(0, count),
    source: merged.length === aiInsights.length && merged.length >= count ? 'ai' : 'mixed',
  };
}
