import {
  AIRLINE_REMARKS_BLANK_LABEL,
  AIRLINE_REMARKS_RATING_VALUES,
} from 'src/remarks/remarks-rating.constants';
import type { DashboardDailyAggregateLean } from '../interfaces/dashboard-daily-aggregate.interface';

type AirlineRatingsData = {
  from?: string;
  to?: string;
  total: number;
  blanks: number;
  buckets: { rating: string; count: number }[];
};

type CategoryMix = Record<string, number>;

type AircraftAnalysisData = {
  scheduled: CategoryMix;
  additional: CategoryMix;
};

type EquipmentSlotRow = {
  label: string;
  motorisedCount: number;
  motorisedPct: number;
  nonMotorisedCount: number;
  nonMotorisedPct: number;
  towableCount: number;
  towablePct: number;
  motorisedEquipment: { equipmentName: string; count: number }[];
  nonMotorisedEquipment: { equipmentName: string; count: number }[];
  towableEquipment: { equipmentName: string; count: number }[];
};

type EquipmentUtilData = {
  slots: EquipmentSlotRow[];
  totalRow: {
    motorisedCount: number;
    motorisedPct: number;
    nonMotorisedCount: number;
    nonMotorisedPct: number;
    towableCount: number;
    towablePct: number;
  };
  categoryTotals: {
    motorisedCount: number;
    nonMotorisedCount: number;
    towableCount: number;
  };
  entryCount: number;
  unclassifiedCount: number;
};

function weightsToPercentsSumming100(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return weights.map(() => 0);
  const units = 1000;
  const raw = weights.map((w) => (w / wsum) * units);
  const floors = raw.map((x) => Math.floor(x));
  const rem = units - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const alloc = [...floors];
  for (let k = 0; k < rem; k++) {
    alloc[order[k % order.length].i] += 1;
  }
  return alloc.map((x) => Math.round(x) / 10);
}

function sumCategoryMix(a: CategoryMix, b: CategoryMix): CategoryMix {
  const out: CategoryMix = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] ?? 0) + (Number(v) || 0);
  }
  return out;
}

function mergeEquipmentNameLists(
  a: { equipmentName: string; count: number }[],
  b: { equipmentName: string; count: number }[],
): { equipmentName: string; count: number }[] {
  const m = new Map<string, number>();
  for (const row of [...a, ...b]) {
    m.set(row.equipmentName, (m.get(row.equipmentName) ?? 0) + row.count);
  }
  return Array.from(m.entries())
    .map(([equipmentName, count]) => ({ equipmentName, count }))
    .sort(
      (x, y) =>
        y.count - x.count || x.equipmentName.localeCompare(y.equipmentName),
    );
}

export function mergeAirlineRemarkAggregates(
  days: DashboardDailyAggregateLean[],
  fromYmd: string,
  toYmd: string,
): AirlineRatingsData {
  const byRating = new Map<string, number>();
  for (const rating of AIRLINE_REMARKS_RATING_VALUES) {
    byRating.set(rating, 0);
  }
  let blanks = 0;
  let total = 0;

  for (const day of days) {
    const d = day.data as unknown as AirlineRatingsData;
    total += Number(d.total ?? 0);
    blanks += Number(d.blanks ?? 0);
    for (const b of d.buckets ?? []) {
      byRating.set(b.rating, (byRating.get(b.rating) ?? 0) + (b.count ?? 0));
    }
  }

  const buckets: { rating: string; count: number }[] =
    AIRLINE_REMARKS_RATING_VALUES.map((rating) => ({
      rating,
      count: byRating.get(rating) ?? 0,
    }));
  buckets.push({
    rating: AIRLINE_REMARKS_BLANK_LABEL,
    count: blanks,
  });

  return { from: fromYmd, to: toYmd, total, blanks, buckets };
}

export function mergeAircraftAnalysisAggregates(
  days: DashboardDailyAggregateLean[],
): AircraftAnalysisData {
  let scheduled: CategoryMix = {};
  let additional: CategoryMix = {};
  for (const day of days) {
    const d = day.data as unknown as AircraftAnalysisData;
    scheduled = sumCategoryMix(scheduled, d.scheduled ?? {});
    additional = sumCategoryMix(additional, d.additional ?? {});
  }
  return { scheduled, additional };
}

export function mergeEquipmentUtilAggregates(
  days: DashboardDailyAggregateLean[],
): EquipmentUtilData {
  if (days.length === 0) {
    return {
      slots: [],
      totalRow: {
        motorisedCount: 0,
        motorisedPct: 100,
        nonMotorisedCount: 0,
        nonMotorisedPct: 100,
        towableCount: 0,
        towablePct: 100,
      },
      categoryTotals: {
        motorisedCount: 0,
        nonMotorisedCount: 0,
        towableCount: 0,
      },
      entryCount: 0,
      unclassifiedCount: 0,
    };
  }

  const slotCount = (days[0].data as EquipmentUtilData).slots?.length ?? 0;
  const slotM = new Array<number>(slotCount).fill(0);
  const slotNM = new Array<number>(slotCount).fill(0);
  const slotT = new Array<number>(slotCount).fill(0);
  let entryCount = 0;
  let unclassifiedCount = 0;

  const motorLists: { equipmentName: string; count: number }[][] = Array.from(
    { length: slotCount },
    () => [],
  );
  const nonMotorLists: { equipmentName: string; count: number }[][] = Array.from(
    { length: slotCount },
    () => [],
  );
  const towableLists: { equipmentName: string; count: number }[][] = Array.from(
    { length: slotCount },
    () => [],
  );

  let labels: string[] = [];

  for (const day of days) {
    const d = day.data as unknown as EquipmentUtilData;
    entryCount += d.entryCount ?? 0;
    unclassifiedCount += d.unclassifiedCount ?? 0;
    const slots = d.slots ?? [];
    if (!labels.length && slots.length) {
      labels = slots.map((s) => s.label);
    }
    for (let i = 0; i < slotCount; i++) {
      const s = slots[i];
      if (!s) continue;
      slotM[i] += s.motorisedCount ?? 0;
      slotNM[i] += s.nonMotorisedCount ?? 0;
      slotT[i] += s.towableCount ?? 0;
      motorLists[i] = mergeEquipmentNameLists(
        motorLists[i],
        s.motorisedEquipment ?? [],
      );
      nonMotorLists[i] = mergeEquipmentNameLists(
        nonMotorLists[i],
        s.nonMotorisedEquipment ?? [],
      );
      towableLists[i] = mergeEquipmentNameLists(
        towableLists[i],
        s.towableEquipment ?? [],
      );
    }
  }

  const mPcts = weightsToPercentsSumming100(slotM);
  const nmPcts = weightsToPercentsSumming100(slotNM);
  const tPcts = weightsToPercentsSumming100(slotT);

  const slots: EquipmentSlotRow[] = Array.from({ length: slotCount }, (_, i) => ({
    label: labels[i] ?? `slot${i + 1}`,
    motorisedCount: slotM[i],
    motorisedPct: mPcts[i] ?? 0,
    nonMotorisedCount: slotNM[i],
    nonMotorisedPct: nmPcts[i] ?? 0,
    towableCount: slotT[i],
    towablePct: tPcts[i] ?? 0,
    motorisedEquipment: motorLists[i],
    nonMotorisedEquipment: nonMotorLists[i],
    towableEquipment: towableLists[i],
  }));

  const catTotM = slotM.reduce((a, b) => a + b, 0);
  const catTotNM = slotNM.reduce((a, b) => a + b, 0);
  const catTotT = slotT.reduce((a, b) => a + b, 0);

  return {
    slots,
    totalRow: {
      motorisedCount: catTotM,
      motorisedPct: 100,
      nonMotorisedCount: catTotNM,
      nonMotorisedPct: 100,
      towableCount: catTotT,
      towablePct: 100,
    },
    categoryTotals: {
      motorisedCount: catTotM,
      nonMotorisedCount: catTotNM,
      towableCount: catTotT,
    },
    entryCount,
    unclassifiedCount,
  };
}

export function enumerateYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const list: string[] = [];
  const cur = new Date(`${fromYmd}T00:00:00Z`);
  const endMs = new Date(`${toYmd}T00:00:00Z`).getTime();
  while (cur.getTime() <= endMs) {
    const d = String(cur.getUTCDate()).padStart(2, '0');
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const y = cur.getUTCFullYear();
    list.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return list;
}

type PerformanceReportData = {
  onTimeCount: number;
  cancelledCount: number;
  offSkdCount: number;
  aCount: number;
  bCount: number;
  cCount: number;
  row3cGhaCount: number;
  row3cNonGhaCount: number;
  ghaImprovement: number;
  totalFlights: number;
};

export function mergePerformanceReportAggregates(
  days: DashboardDailyAggregateLean[],
): PerformanceReportData {
  const out: PerformanceReportData = {
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
  for (const day of days) {
    const d = day.data as unknown as PerformanceReportData;
    out.onTimeCount += Number(d.onTimeCount ?? 0);
    out.cancelledCount += Number(d.cancelledCount ?? 0);
    out.offSkdCount += Number(d.offSkdCount ?? 0);
    out.aCount += Number(d.aCount ?? 0);
    out.bCount += Number(d.bCount ?? 0);
    out.cCount += Number(d.cCount ?? 0);
    out.row3cGhaCount += Number(d.row3cGhaCount ?? 0);
    out.row3cNonGhaCount += Number(d.row3cNonGhaCount ?? 0);
    out.ghaImprovement += Number(d.ghaImprovement ?? 0);
    out.totalFlights += Number(d.totalFlights ?? 0);
  }
  return out;
}

type GhaAggregateData = {
  ghaOverviewCodes: { code: number; count: number }[];
  chartRows: { code: string; count: number }[];
  flightsWithAnyGhaCode: number;
  totalAttributedIncrements: number;
  flightsMissingDelayDescription: {
    flightNo: string;
    serial: string;
    codes: number[];
  }[];
};

export function mergeGhaImprovementAggregates(
  days: DashboardDailyAggregateLean[],
): GhaAggregateData {
  const codeCounts = new Map<number, number>();
  let flightsWithAnyGhaCode = 0;
  let totalAttributedIncrements = 0;
  const missingByKey = new Map<
    string,
    { flightNo: string; serial: string; codes: Set<number> }
  >();

  for (const day of days) {
    const d = day.data as unknown as GhaAggregateData;
    flightsWithAnyGhaCode += Number(d.flightsWithAnyGhaCode ?? 0);
    totalAttributedIncrements += Number(d.totalAttributedIncrements ?? 0);
    for (const row of d.ghaOverviewCodes ?? []) {
      codeCounts.set(row.code, (codeCounts.get(row.code) ?? 0) + row.count);
    }
    for (const m of d.flightsMissingDelayDescription ?? []) {
      const key = `${m.serial}::${m.flightNo}`;
      let bucket = missingByKey.get(key);
      if (!bucket) {
        bucket = {
          flightNo: m.flightNo,
          serial: m.serial,
          codes: new Set(),
        };
        missingByKey.set(key, bucket);
      }
      for (const c of m.codes ?? []) bucket.codes.add(c);
    }
  }

  const ghaOverviewCodes = [...codeCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, count]) => ({ code, count }));

  return {
    ghaOverviewCodes,
    chartRows: ghaOverviewCodes.map(({ code, count }) => ({
      code: String(code),
      count,
    })),
    flightsWithAnyGhaCode,
    totalAttributedIncrements,
    flightsMissingDelayDescription: [...missingByKey.values()].map((b) => ({
      flightNo: b.flightNo,
      serial: b.serial,
      codes: [...b.codes].sort((x, y) => x - y),
    })),
  };
}

type OtpCardData = {
  matrix: number[][];
  greenSum: number;
  matrixGrandTotal: number;
  greenOverTotalFlightsPct: number;
  totalNonCancelled: number;
};

const OTP_GREEN_CELLS: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [2, 0],
  [2, 1],
];

export function mergeOnTimePerformanceAggregates(
  days: DashboardDailyAggregateLean[],
): OtpCardData {
  const matrix: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  let totalNonCancelled = 0;

  for (const day of days) {
    const d = day.data as unknown as OtpCardData;
    totalNonCancelled += Number(d.totalNonCancelled ?? 0);
    const m = d.matrix ?? [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        matrix[r]![c]! += Number(m[r]?.[c] ?? 0);
      }
    }
  }

  let greenSum = 0;
  let matrixGrandTotal = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      matrixGrandTotal += matrix[r]![c] ?? 0;
    }
  }
  for (const [r, c] of OTP_GREEN_CELLS) {
    greenSum += matrix[r]![c] ?? 0;
  }
  const denom = totalNonCancelled > 0 ? totalNonCancelled : matrixGrandTotal;
  const greenOverTotalFlightsPct =
    denom <= 0 ? 0 : Math.round((greenSum / denom) * 1000) / 10;

  return {
    matrix,
    greenSum,
    matrixGrandTotal,
    greenOverTotalFlightsPct,
    totalNonCancelled,
  };
}

type KpiStripData = {
  totalFlights: number;
  cancelledFlights: number;
  didFlyFlights: number;
  scheduledFlights: number;
  additionalFlights: number;
};

export function mergeKpiStripAggregates(
  days: DashboardDailyAggregateLean[],
): KpiStripData {
  const out: KpiStripData = {
    totalFlights: 0,
    cancelledFlights: 0,
    didFlyFlights: 0,
    scheduledFlights: 0,
    additionalFlights: 0,
  };
  for (const day of days) {
    const d = day.data as unknown as KpiStripData;
    out.totalFlights += Number(d.totalFlights ?? 0);
    out.cancelledFlights += Number(d.cancelledFlights ?? 0);
    out.didFlyFlights += Number(d.didFlyFlights ?? 0);
    out.scheduledFlights += Number(d.scheduledFlights ?? 0);
    out.additionalFlights += Number(d.additionalFlights ?? 0);
  }
  return out;
}
