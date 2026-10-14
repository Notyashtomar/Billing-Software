import type {
  BillingBhsVolumeBand,
  BillingBhsVolumeFlightScope,
  BillingBhsVolumeSchedule,
} from './types';

export const BHS_VOLUME_SCOPE_OPTIONS: Array<{
  value: BillingBhsVolumeFlightScope;
  label: string;
}> = [
  { value: 'domestic_t1', label: 'Domestic arrival T1' },
  { value: 'domestic_t2', label: 'Domestic arrival T2' },
  { value: 'international', label: 'International' },
  { value: 'charter_domestic', label: 'Charter domestic' },
  { value: 'charter_international', label: 'Charter international' },
];

const AKASA_NOTE =
  'SGHA paragraph 1.1, price row effective 01 Jun 2026–31 May 2027 (4.5% escalation), rounded to the nearest rupee. Stepwise: each flight takes the band of its position in the month.';

/** Same figures as the server preset used to feed the Akasa Delhi contract. */
export function akasaDelhiComprehensiveSchedules(): BillingBhsVolumeSchedule[] {
  const window = { effectiveFrom: '2026-06-01', effectiveTo: '2027-05-31', note: AKASA_NOTE };
  return [
    {
      chargeKind: 'comprehensive',
      flightScope: 'domestic_t1',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'Domestic T1 comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 500, unitPriceINR: 25603 },
        { fromCount: 501, toCount: 600, unitPriceINR: 24834 },
        { fromCount: 601, toCount: null, unitPriceINR: 24322 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'domestic_t2',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'Domestic T2 comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 400, unitPriceINR: 20545 },
        { fromCount: 401, toCount: 500, unitPriceINR: 18455 },
        { fromCount: 501, toCount: null, unitPriceINR: 16365 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'international',
      carrierKind: 'any',
      allocation: 'marginal',
      overridesSavedRate: true,
      label: 'International comprehensive',
      ...window,
      bands: [
        { fromCount: 1, toCount: 150, unitPriceINR: 24140 },
        { fromCount: 151, toCount: 250, unitPriceINR: 23415 },
        { fromCount: 251, toCount: null, unitPriceINR: 22933 },
      ],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'charter_domestic',
      carrierKind: 'any',
      allocation: 'flat',
      overridesSavedRate: true,
      label: 'Charter domestic comprehensive',
      ...window,
      bands: [{ fromCount: 1, toCount: null, unitPriceINR: 27693 }],
    },
    {
      chargeKind: 'comprehensive',
      flightScope: 'charter_international',
      carrierKind: 'any',
      allocation: 'flat',
      overridesSavedRate: true,
      label: 'Charter international comprehensive',
      ...window,
      bands: [{ fromCount: 1, toCount: null, unitPriceINR: 40639 }],
    },
  ];
}

export function emptyBhsVolumeSchedule(): BillingBhsVolumeSchedule {
  return {
    chargeKind: 'comprehensive',
    flightScope: 'domestic_t1',
    carrierKind: 'any',
    allocation: 'marginal',
    overridesSavedRate: true,
    label: '',
    effectiveFrom: '',
    effectiveTo: '',
    bands: [{ fromCount: 1, toCount: 500, unitPriceINR: 0 }],
  };
}

export type VolumeMonthSlice = {
  fromCount: number;
  toCount: number | null;
  flights: number;
  unitPriceINR: number;
  amount: number;
};

export function previewVolumeMonth(
  flightCount: number,
  schedule: BillingBhsVolumeSchedule,
): VolumeMonthSlice[] {
  const count = Math.max(0, Math.trunc(flightCount));
  if (count === 0) return [];
  if (schedule.allocation === 'flat') {
    const price = Number(schedule.bands[0]?.unitPriceINR ?? 0);
    if (!Number.isFinite(price) || price <= 0) return [];
    return [
      {
        fromCount: 1,
        toCount: count,
        flights: count,
        unitPriceINR: price,
        amount: Math.round(price * count * 100) / 100,
      },
    ];
  }
  const bands = [...schedule.bands].sort((a, b) => a.fromCount - b.fromCount);
  const slices: VolumeMonthSlice[] = [];
  for (const band of bands) {
    const from = Math.trunc(Number(band.fromCount));
    const price = Number(band.unitPriceINR);
    if (!Number.isFinite(from) || from < 1 || !Number.isFinite(price) || price <= 0) continue;
    const open = band.toCount == null || !Number.isFinite(Number(band.toCount));
    const to = open ? count : Math.trunc(Number(band.toCount));
    const start = Math.max(from, 1);
    const end = Math.min(to, count);
    if (end < start) continue;
    const flights = end - start + 1;
    slices.push({
      fromCount: start,
      toCount: open && end === count ? null : end,
      flights,
      unitPriceINR: price,
      amount: Math.round(price * flights * 100) / 100,
    });
  }
  return slices;
}

export function validateBhsVolumeSchedules(schedules: BillingBhsVolumeSchedule[]): string {
  for (const [index, schedule] of schedules.entries()) {
    const name = schedule.label?.trim() || `Schedule ${index + 1}`;
    if (schedule.bands.length === 0) return `${name} needs at least one band.`;
    const bands = [...schedule.bands].sort((a, b) => a.fromCount - b.fromCount);
    for (const band of bands) {
      if (!Number.isFinite(band.fromCount) || band.fromCount < 1) {
        return `${name}: band start must be 1 or more.`;
      }
      if (!Number.isFinite(band.unitPriceINR) || band.unitPriceINR <= 0) {
        return `${name}: enter a comprehensive rate above 0.`;
      }
      if (band.toCount != null && band.toCount < band.fromCount) {
        return `${name}: band end cannot be before the start.`;
      }
    }
    if (schedule.allocation === 'flat') continue;
    if (bands[0].fromCount !== 1) return `${name}: stepwise bands must start at flight 1.`;
    for (let i = 0; i < bands.length; i += 1) {
      const band = bands[i];
      const next = bands[i + 1];
      if (!next) {
        if (band.toCount != null) {
          return `${name}: the last stepwise band must stay open (leave “to” blank).`;
        }
        break;
      }
      if (band.toCount == null) return `${name}: only the last band can be open-ended.`;
      if (next.fromCount !== band.toCount + 1) {
        return `${name}: bands must meet with no gap or overlap.`;
      }
    }
    if (schedule.effectiveFrom && schedule.effectiveTo && schedule.effectiveTo < schedule.effectiveFrom) {
      return `${name}: rate end date is before the start date.`;
    }
  }
  return '';
}

export function volumeBandLabel(band: BillingBhsVolumeBand): string {
  if (band.toCount == null) return `${band.fromCount}+`;
  return `${band.fromCount}–${band.toCount}`;
}
