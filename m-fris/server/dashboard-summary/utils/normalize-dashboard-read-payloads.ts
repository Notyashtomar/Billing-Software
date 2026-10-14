/**
 * Ensures HTTP read paths always emit stable shapes for dashboard card blobs.
 * Prevents `{}` fallthrough when Mongo `summary.cards.*` is missing (legacy doc,
 * partial PUT, or schema drift) — clients must never see non-array where arrays are required.
 */

export function normalizeGhaImprovementCard(raw: unknown): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ghaOverviewCodes: Array.isArray(r.ghaOverviewCodes) ? r.ghaOverviewCodes : [],
    chartRows: Array.isArray(r.chartRows) ? r.chartRows : [],
    flightsWithAnyGhaCode: Number(r.flightsWithAnyGhaCode ?? 0),
    totalAttributedIncrements: Number(r.totalAttributedIncrements ?? 0),
    flightsMissingDelayDescription: Array.isArray(r.flightsMissingDelayDescription)
      ? r.flightsMissingDelayDescription
      : [],
  };
}

export function normalizeKpiStripCard(raw: unknown): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    totalFlights: Number(r.totalFlights ?? 0),
    cancelledFlights: Number(r.cancelledFlights ?? 0),
    didFlyFlights: Number(r.didFlyFlights ?? 0),
    scheduledFlights: Number(r.scheduledFlights ?? 0),
    additionalFlights: Number(r.additionalFlights ?? 0),
  };
}

export function normalizePerformanceReportCard(
  raw: unknown,
): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    onTimeCount: Number(r.onTimeCount ?? 0),
    cancelledCount: Number(r.cancelledCount ?? 0),
    offSkdCount: Number(r.offSkdCount ?? 0),
    aCount: Number(r.aCount ?? 0),
    bCount: Number(r.bCount ?? 0),
    cCount: Number(r.cCount ?? 0),
    row3cGhaCount: Number(r.row3cGhaCount ?? 0),
    row3cNonGhaCount: Number(r.row3cNonGhaCount ?? 0),
    ghaImprovement: Number(r.ghaImprovement ?? 0),
    totalFlights: Number(r.totalFlights ?? 0),
  };
}

function isNumberMatrix(v: unknown): v is number[][] {
  return (
    Array.isArray(v) &&
    v.every((row) => Array.isArray(row) && row.every((c) => typeof c === 'number'))
  );
}

export function normalizeOnTimePerformanceCard(
  raw: unknown,
): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const matrix = isNumberMatrix(r.matrix) ? r.matrix : [];
  return {
    matrix,
    greenSum: Number(r.greenSum ?? 0),
    matrixGrandTotal: Number(r.matrixGrandTotal ?? 0),
    greenOverTotalFlightsPct: Number(r.greenOverTotalFlightsPct ?? 0),
    totalNonCancelled: Number(r.totalNonCancelled ?? 0),
  };
}

export function normalizeAirlineRatingsSecondary(raw: unknown): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    from: String(r.from ?? ''),
    to: String(r.to ?? ''),
    total: Number(r.total ?? 0),
    blanks: Number(r.blanks ?? 0),
    buckets: Array.isArray(r.buckets) ? r.buckets : [],
  };
}

function normalizeEquipmentSlotRow(raw: unknown): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const emptyEq = [] as { equipmentName: string; count: number }[];
  return {
    label: String(r.label ?? ''),
    motorisedCount: Number(r.motorisedCount ?? 0),
    motorisedPct: Number(r.motorisedPct ?? 0),
    nonMotorisedCount: Number(r.nonMotorisedCount ?? 0),
    nonMotorisedPct: Number(r.nonMotorisedPct ?? 0),
    towableCount: Number(r.towableCount ?? 0),
    towablePct: Number(r.towablePct ?? 0),
    motorisedEquipment: Array.isArray(r.motorisedEquipment)
      ? r.motorisedEquipment
      : emptyEq,
    nonMotorisedEquipment: Array.isArray(r.nonMotorisedEquipment)
      ? r.nonMotorisedEquipment
      : emptyEq,
    towableEquipment: Array.isArray(r.towableEquipment)
      ? r.towableEquipment
      : emptyEq,
  };
}

function emptyTotalRow(): Record<string, unknown> {
  return {
    motorisedCount: 0,
    motorisedPct: 0,
    nonMotorisedCount: 0,
    nonMotorisedPct: 0,
    towableCount: 0,
    towablePct: 0,
  };
}

/** Secondary card `equipmentUtilization` blob — matches client expectations. */
export function normalizeEquipmentUtilSecondary(raw: unknown): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const slotsRaw = r.slots;
  const slots = Array.isArray(slotsRaw)
    ? slotsRaw.map((s) => normalizeEquipmentSlotRow(s))
    : [];
  const tr = r.totalRow;
  const totalRow =
    tr != null && typeof tr === 'object' && !Array.isArray(tr)
      ? { ...emptyTotalRow(), ...(tr as Record<string, unknown>) }
      : emptyTotalRow();
  const ct = r.categoryTotals;
  const categoryTotals =
    ct != null && typeof ct === 'object' && !Array.isArray(ct)
      ? {
          motorisedCount: Number((ct as Record<string, unknown>).motorisedCount ?? 0),
          nonMotorisedCount: Number(
            (ct as Record<string, unknown>).nonMotorisedCount ?? 0,
          ),
          towableCount: Number((ct as Record<string, unknown>).towableCount ?? 0),
        }
      : { motorisedCount: 0, nonMotorisedCount: 0, towableCount: 0 };
  return {
    slots,
    totalRow,
    categoryTotals,
    entryCount: Number(r.entryCount ?? 0),
    unclassifiedCount: Number(r.unclassifiedCount ?? 0),
  };
}

export function normalizeAircraftCategorySecondary(
  raw: unknown,
): Record<string, unknown> {
  const r =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const scheduled =
    r.scheduled != null &&
    typeof r.scheduled === 'object' &&
    !Array.isArray(r.scheduled)
      ? (r.scheduled as Record<string, unknown>)
      : {};
  const additional =
    r.additional != null &&
    typeof r.additional === 'object' &&
    !Array.isArray(r.additional)
      ? (r.additional as Record<string, unknown>)
      : {};
  return { scheduled, additional };
}
