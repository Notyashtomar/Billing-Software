/**
 * Dashboard API payload normalization (client boundary).
 * Must NOT import from `lib/api.ts` — those fetchers import this module.
 */

const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

function warnDev(message: string, extra?: Record<string, unknown>): void {
  if (!isDev || typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }
  console.warn(`[dash_payload] ${message}`, extra ?? {});
}

export function normalizeDashboardGhaImprovementCard(
  raw: unknown,
  ctx?: { label?: string },
): {
  ghaOverviewCodes: { code: number; count: number }[];
  chartRows: { code: string; count: number }[];
  flightsWithAnyGhaCode: number;
  totalAttributedIncrements: number;
  flightsMissingDelayDescription: { flightNo: string; serial: string; codes: number[] }[];
} {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const codesRaw = r.ghaOverviewCodes;
  const ok = Array.isArray(codesRaw);
  if (!ok && codesRaw !== undefined) {
    warnDev('ghaOverviewCodes not array; coerced to []', {
      label: ctx?.label,
      typeof: typeof codesRaw,
    });
  }
  return {
    ghaOverviewCodes: ok ? (codesRaw as { code: number; count: number }[]) : [],
    chartRows: Array.isArray(r.chartRows)
      ? (r.chartRows as { code: string; count: number }[])
      : [],
    flightsWithAnyGhaCode: Number(r.flightsWithAnyGhaCode ?? 0),
    totalAttributedIncrements: Number(r.totalAttributedIncrements ?? 0),
    flightsMissingDelayDescription: Array.isArray(r.flightsMissingDelayDescription)
      ? (r.flightsMissingDelayDescription as {
          flightNo: string;
          serial: string;
          codes: number[];
        }[])
      : [],
  };
}

function emptyEquipmentUtilSlotsShape(): {
  slots: unknown[];
  totalRow: Record<string, number>;
  categoryTotals: Record<string, number>;
  entryCount: number;
  unclassifiedCount: number;
} {
  const z = {
    motorisedCount: 0,
    motorisedPct: 0,
    nonMotorisedCount: 0,
    nonMotorisedPct: 0,
    towableCount: 0,
    towablePct: 0,
  };
  return {
    slots: [],
    totalRow: { ...z },
    categoryTotals: {
      motorisedCount: 0,
      nonMotorisedCount: 0,
      towableCount: 0,
    },
    entryCount: 0,
    unclassifiedCount: 0,
  };
}

/** Mirrors `DashboardSecondaryCardsResponse` — caller casts to API type. */
export function normalizeDashboardSecondaryCardsResponse(data: unknown): Record<string, unknown> {
  const d =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const emptyEq = emptyEquipmentUtilSlotsShape();
  const equipRaw = d.equipmentUtil;
  let equipmentUtil: Record<string, unknown> = { ...emptyEq };
  if (
    equipRaw != null &&
    typeof equipRaw === 'object' &&
    !Array.isArray(equipRaw)
  ) {
    const e = equipRaw as Record<string, unknown>;
    equipmentUtil = {
      slots: Array.isArray(e.slots) ? e.slots : [],
      totalRow:
        e.totalRow != null && typeof e.totalRow === 'object' && !Array.isArray(e.totalRow)
          ? { ...emptyEq.totalRow, ...(e.totalRow as object) }
          : { ...emptyEq.totalRow },
      categoryTotals:
        e.categoryTotals != null &&
        typeof e.categoryTotals === 'object' &&
        !Array.isArray(e.categoryTotals)
          ? { ...emptyEq.categoryTotals, ...(e.categoryTotals as object) }
          : { ...emptyEq.categoryTotals },
      entryCount: Number(e.entryCount ?? 0),
      unclassifiedCount: Number(e.unclassifiedCount ?? 0),
    };
  }

  const airRaw = d.airlineRatings;
  const airlineRatings =
    airRaw != null && typeof airRaw === 'object' && !Array.isArray(airRaw)
      ? (() => {
          const a = airRaw as Record<string, unknown>;
          return {
            from: String(a.from ?? ''),
            to: String(a.to ?? ''),
            total: Number(a.total ?? 0),
            blanks: Number(a.blanks ?? 0),
            buckets: Array.isArray(a.buckets) ? a.buckets : [],
          };
        })()
      : { from: '', to: '', total: 0, blanks: 0, buckets: [] };

  const catRaw = d.aircraftCategory;
  const aircraftCategory =
    catRaw != null && typeof catRaw === 'object' && !Array.isArray(catRaw)
      ? catRaw
      : { scheduled: {}, additional: {} };

  return {
    from: String(d.from ?? ''),
    to: String(d.to ?? ''),
    equipmentMode: d.equipmentMode === '4h' ? '4h' : '6h',
    airlineRatings,
    aircraftCategory,
    equipmentUtil,
    _perf: d._perf,
  };
}

/** Mirrors `DashboardPrimaryCardsResponse` — caller casts to API type. */
export function normalizeDashboardPrimaryCardsResponse(data: unknown): Record<string, unknown> {
  const d =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const kpiRaw = d.kpiStrip;
  const kpiStrip =
    kpiRaw != null && typeof kpiRaw === 'object' && !Array.isArray(kpiRaw)
      ? {
          totalFlights: Number((kpiRaw as Record<string, unknown>).totalFlights ?? 0),
          cancelledFlights: Number(
            (kpiRaw as Record<string, unknown>).cancelledFlights ?? 0,
          ),
          didFlyFlights: Number((kpiRaw as Record<string, unknown>).didFlyFlights ?? 0),
          scheduledFlights: Number(
            (kpiRaw as Record<string, unknown>).scheduledFlights ?? 0,
          ),
          additionalFlights: Number(
            (kpiRaw as Record<string, unknown>).additionalFlights ?? 0,
          ),
        }
      : {
          totalFlights: 0,
          cancelledFlights: 0,
          didFlyFlights: 0,
          scheduledFlights: 0,
          additionalFlights: 0,
        };

  const perfRaw = d.performanceReport;
  const performanceReport =
    perfRaw != null && typeof perfRaw === 'object' && !Array.isArray(perfRaw)
      ? {
          onTimeCount: Number((perfRaw as Record<string, unknown>).onTimeCount ?? 0),
          cancelledCount: Number((perfRaw as Record<string, unknown>).cancelledCount ?? 0),
          offSkdCount: Number((perfRaw as Record<string, unknown>).offSkdCount ?? 0),
          aCount: Number((perfRaw as Record<string, unknown>).aCount ?? 0),
          bCount: Number((perfRaw as Record<string, unknown>).bCount ?? 0),
          cCount: Number((perfRaw as Record<string, unknown>).cCount ?? 0),
          row3cGhaCount: Number((perfRaw as Record<string, unknown>).row3cGhaCount ?? 0),
          row3cNonGhaCount: Number(
            (perfRaw as Record<string, unknown>).row3cNonGhaCount ?? 0,
          ),
          ghaImprovement: Number((perfRaw as Record<string, unknown>).ghaImprovement ?? 0),
          totalFlights: Number((perfRaw as Record<string, unknown>).totalFlights ?? 0),
        }
      : {
          onTimeCount: 0,
          cancelledCount: 0,
          offSkdCount: 0,
          aCount: 0,
          bCount: 0,
          cCount: 0,
          row3cGhaCount: 0,
          row3cNonGhaCount: 0,
          ghaImprovement: 0,
          totalFlights: 0,
        };

  const otpRaw = d.onTimePerformance;
  let onTimePerformance: Record<string, unknown> = {
    matrix: [],
    greenSum: 0,
    matrixGrandTotal: 0,
    greenOverTotalFlightsPct: 0,
    totalNonCancelled: 0,
  };
  if (otpRaw != null && typeof otpRaw === 'object' && !Array.isArray(otpRaw)) {
    const o = otpRaw as Record<string, unknown>;
    const m = o.matrix;
    const matrixOk =
      Array.isArray(m) &&
      m.every(
        (row) =>
          Array.isArray(row) && row.every((c) => typeof c === 'number' && Number.isFinite(c)),
      );
    if (!matrixOk && m !== undefined) {
      warnDev('onTimePerformance.matrix invalid; using []', {});
    }
    onTimePerformance = {
      matrix: matrixOk ? m : [],
      greenSum: Number(o.greenSum ?? 0),
      matrixGrandTotal: Number(o.matrixGrandTotal ?? 0),
      greenOverTotalFlightsPct: Number(o.greenOverTotalFlightsPct ?? 0),
      totalNonCancelled: Number(o.totalNonCancelled ?? 0),
    };
  }

  return {
    from: String(d.from ?? ''),
    to: String(d.to ?? ''),
    equipmentMode: d.equipmentMode === '4h' ? '4h' : '6h',
    kpiStrip,
    performanceReport,
    ghaImprovement: normalizeDashboardGhaImprovementCard(d.ghaImprovement, {
      label: 'primary_cards',
    }),
    onTimePerformance,
    drilldowns: d.drilldowns,
    _perf: d._perf,
  };
}

const emptyPartitionMeta = (): Record<string, number> => ({
  row3bCond1Count: 0,
  row3bCond2Count: 0,
  row3cGhaCount: 0,
  row3cNonGhaCount: 0,
  row3cTotalCount: 0,
});

export function normalizeDashboardPerformanceDrilldownJson(data: unknown): Record<string, unknown> {
  const d =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const pr = d.performanceReport;
  if (pr == null || typeof pr !== 'object' || Array.isArray(pr)) {
    return {};
  }
  const p = pr as Record<string, unknown>;
  const flights = Array.isArray(p.flights) ? p.flights : [];
  const schemaVersionRaw = p.schemaVersion;
  const schemaVersion =
    typeof schemaVersionRaw === 'number' && Number.isFinite(schemaVersionRaw)
      ? schemaVersionRaw
    : typeof schemaVersionRaw === 'string' && /^\d+$/.test(schemaVersionRaw)
      ? Number(schemaVersionRaw)
      : undefined;
  const pm = p.partitionMeta;
  const partitionMeta =
    pm != null && typeof pm === 'object' && !Array.isArray(pm)
      ? { ...emptyPartitionMeta(), ...(pm as Record<string, unknown>) }
      : emptyPartitionMeta();
  return {
    performanceReport: {
      flights,
      partitionMeta,
      ...(schemaVersion != null ? { schemaVersion } : {}),
    },
  };
}

export function normalizeDashboardAirlineRemarksDrilldownResponse(
  data: unknown,
): Record<string, unknown> {
  const d =
    data != null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const rs = d.ratingsSummary;
  const ratingsSummary =
    rs != null && typeof rs === 'object' && !Array.isArray(rs)
      ? (() => {
          const x = rs as Record<string, unknown>;
          return {
            from: String(x.from ?? ''),
            to: String(x.to ?? ''),
            total: Number(x.total ?? 0),
            blanks: Number(x.blanks ?? 0),
            buckets: Array.isArray(x.buckets) ? x.buckets : [],
          };
        })()
      : { from: '', to: '', total: 0, blanks: 0, buckets: [] };

  const chartRaw = d.chartTopAirlinesByRating;
  const chartTopAirlinesByRating =
    chartRaw != null && typeof chartRaw === 'object' && !Array.isArray(chartRaw)
      ? chartRaw
      : {};

  return {
    from: String(d.from ?? ''),
    to: String(d.to ?? ''),
    equipmentMode: d.equipmentMode === '4h' ? '4h' : '6h',
    ratingsSummary,
    chartTopAirlinesByRating,
    rows: Array.isArray(d.rows) ? d.rows : [],
    totalRows: Number(d.totalRows ?? 0),
    drillPaging: d.drillPaging,
    _perf: d._perf,
  };
}
