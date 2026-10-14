import type { FlightData } from '@/utils/dataProcessor';
import {
  domesticInternationalBucketFromCateOfFlight,
  isScheduleCancelledFlightNo,
} from '@/utils/dataProcessor';

import type { DashboardScheduledAirlinesActiveStatsResponse } from '@/lib/api';

/** Active Flights panel keys — matches legacy FRIS / billing legend (image). */
export type ScheduledAirlinesActiveFlightStats = {
  total: number;
  passengerFlight: number;
  freighters: number;
  additionalP: number;
  additionalF: number;
  cancelled: number;
  cancelledFlightData: number;
  totalNonSkd: number;
  totalRaf: number;
  domestic: number;
  international: number;
  domesticInternational: number;
  internationalDomestic: number;
  diverted: number;
  turnaround: number;
  fifo: number;
  filo: number;
  lifo: number;
  rtr: number;
};

export type ScheduledAirlinesActiveFlightStatKey = keyof ScheduledAirlinesActiveFlightStats;

function isRowCancelled(f: FlightData): boolean {
  return f.isCancelled || isScheduleCancelledFlightNo(f.flightNo);
}

/** Open + closed (non-cancelled) vs cancelled for Scheduled Airlines KPI headers. */
export function countScheduledAirlinesKpiFromFlights(
  flights: FlightData[],
): { active: number; cancelled: number } {
  let active = 0;
  let cancelled = 0;
  for (const f of flights) {
    if (isRowCancelled(f)) cancelled += 1;
    else active += 1;
  }
  return { active, cancelled };
}

function isFreighterFromCategory(cateOfFlight: string, flightType: string): boolean {
  const cat = String(cateOfFlight ?? '').toLowerCase();
  if (cat.includes('cargo') || cat.includes('freight') || cat.includes('freighter')) {
    return true;
  }
  const ft = String(flightType ?? '').toLowerCase();
  return (
    ft.includes('freight') ||
    ft.includes('cargo') ||
    ft.includes('mail') ||
    ft === 'f' ||
    ft.includes('bcf')
  );
}

function handlingNorm(typeOfHandling: string): string {
  return String(typeOfHandling ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isScheduledHandling(typeOfHandling: string): boolean {
  const n = handlingNorm(typeOfHandling);
  if (!n) return true;
  if (n.includes('additional')) return false;
  if (n.includes('non-scheduled') || n.includes('non scheduled')) return false;
  if (n.includes('raf')) return false;
  return n === 'scheduled' || n === 'sch' || n.includes('turnaround');
}

function isAdditionalHandling(typeOfHandling: string): boolean {
  return handlingNorm(typeOfHandling).includes('additional');
}

function isNonSkdHandling(typeOfHandling: string): boolean {
  const n = handlingNorm(typeOfHandling);
  return n.includes('non-scheduled') || n.includes('non scheduled') || n.includes('non-skd');
}

function isRafHandling(typeOfHandling: string): boolean {
  return handlingNorm(typeOfHandling).includes('raf');
}

function hasCancelledFlightData(f: FlightData): boolean {
  if (!isRowCancelled(f)) return false;
  return Boolean(
    f.hasMainDetails ||
      f.hasTerminalDetails ||
      f.hasRampDetails ||
      f.hasLoadControlDetails ||
      f.hasEquipmentManpowerDetails,
  );
}

function categoryCompact(f: FlightData): string {
  return String(f.cateOfFlight ?? '')
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, '');
}

function flightSearchText(f: FlightData): string {
  return [
    f.cateOfFlight,
    f.flightType,
    f.typeOfHandling,
    f.route,
    f.baseFlight,
    f.flightStatus,
  ]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function hasToken(f: FlightData, token: string): boolean {
  return new RegExp(`\\b${token}\\b`, 'i').test(flightSearchText(f));
}

function hasDomesticInternational(f: FlightData): boolean {
  const c = categoryCompact(f);
  return (
    c.includes('domesticinternational') ||
    c.includes('domint') ||
    c.includes('dom-int')
  );
}

function hasInternationalDomestic(f: FlightData): boolean {
  const c = categoryCompact(f);
  return (
    c.includes('internationaldomestic') ||
    c.includes('intdom') ||
    c.includes('int-dom')
  );
}

function hasReturnToRamp(f: FlightData): boolean {
  const text = flightSearchText(f);
  return /\brtr\b/.test(text) || text.includes('return to ramp');
}

/** Whether a flight row belongs to a breakdown card category (counts + table filters). */
export function flightMatchesScheduledActiveStatCategory(
  f: FlightData,
  key: ScheduledAirlinesActiveFlightStatKey,
  _isLockedValue?: (v: unknown) => boolean,
): boolean {
  void _isLockedValue;
  const cancelled = isRowCancelled(f);
  const handling = String(f.typeOfHandling ?? '').trim();
  const freighter = isFreighterFromCategory(
    String(f.cateOfFlight ?? ''),
    String(f.flightType ?? ''),
  );
  const bucket = domesticInternationalBucketFromCateOfFlight(f.cateOfFlight);

  switch (key) {
    case 'total':
      return !cancelled;
    case 'passengerFlight':
      return (
        isScheduledHandling(handling) &&
        !cancelled &&
        !freighter &&
        !isAdditionalHandling(handling)
      );
    case 'freighters':
      return (
        isScheduledHandling(handling) &&
        !cancelled &&
        freighter &&
        !isAdditionalHandling(handling)
      );
    case 'additionalP':
      return isAdditionalHandling(handling) && !freighter;
    case 'additionalF':
      return isAdditionalHandling(handling) && freighter;
    case 'cancelled':
      return cancelled;
    case 'cancelledFlightData':
      return hasCancelledFlightData(f);
    case 'totalNonSkd':
      return isNonSkdHandling(handling);
    case 'totalRaf':
      return isRafHandling(handling);
    case 'domestic':
      return !cancelled && bucket === 'domestic' && !hasDomesticInternational(f) && !hasInternationalDomestic(f);
    case 'international':
      return !cancelled && bucket === 'international' && !hasDomesticInternational(f) && !hasInternationalDomestic(f);
    case 'domesticInternational':
      return !cancelled && hasDomesticInternational(f);
    case 'internationalDomestic':
      return !cancelled && hasInternationalDomestic(f);
    case 'diverted':
      return !cancelled && (hasToken(f, 'diverted') || hasToken(f, 'diversion'));
    case 'turnaround':
      return !cancelled && hasToken(f, 'turnaround');
    case 'fifo':
      return !cancelled && hasToken(f, 'fifo');
    case 'filo':
      return !cancelled && hasToken(f, 'filo');
    case 'lifo':
      return !cancelled && hasToken(f, 'lifo');
    case 'rtr':
      return !cancelled && hasReturnToRamp(f);
    default:
      return false;
  }
}

/**
 * Summary counts for the Active Flights breakdown bar (legacy FRIS legend alignment).
 */
export function computeScheduledAirlinesActiveFlightStats(
  flights: FlightData[],
  isLockedValue: (v: unknown) => boolean = () => false,
): ScheduledAirlinesActiveFlightStats {
  const stats: ScheduledAirlinesActiveFlightStats = {
    ...EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS,
  };

  for (const f of flights) {
    for (const key of Object.keys(stats) as ScheduledAirlinesActiveFlightStatKey[]) {
      if (key === 'total') continue;
      if (flightMatchesScheduledActiveStatCategory(f, key, isLockedValue)) {
        stats[key] += 1;
      }
    }
  }

  // Total = active flights (open + closed); cancelled is tracked separately.
  stats.total = Math.max(0, flights.length - stats.cancelled);

  return stats;
}

export function filterFlightsByActiveStatCategories(
  flights: FlightData[],
  selected: ReadonlySet<ScheduledAirlinesActiveFlightStatKey>,
  isLockedValue: (v: unknown) => boolean = () => false,
): FlightData[] {
  if (selected.size === 0) return flights;
  return flights.filter((f) =>
    [...selected].some((key) =>
      flightMatchesScheduledActiveStatCategory(f, key, isLockedValue),
    ),
  );
}

export function mapDashboardActiveStatsToPanelStats(
  data: DashboardScheduledAirlinesActiveStatsResponse,
): ScheduledAirlinesActiveFlightStats {
  return {
    ...EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS,
    total: data.total,
    passengerFlight: data.passengerFlight,
    freighters: data.freighters,
    additionalP: data.additionalP,
    additionalF: data.additionalF,
    cancelled: data.cancelled,
    cancelledFlightData: data.cancelledFlightData,
    totalNonSkd: data.totalNonSkd,
    totalRaf: data.totalRaf,
  };
}

export const EMPTY_SCHEDULED_AIRLINES_ACTIVE_FLIGHT_STATS: ScheduledAirlinesActiveFlightStats =
  {
    total: 0,
    passengerFlight: 0,
    freighters: 0,
    additionalP: 0,
    additionalF: 0,
    cancelled: 0,
    cancelledFlightData: 0,
    totalNonSkd: 0,
    totalRaf: 0,
    domestic: 0,
    international: 0,
    domesticInternational: 0,
    internationalDomestic: 0,
    diverted: 0,
    turnaround: 0,
    fifo: 0,
    filo: 0,
    lifo: 0,
    rtr: 0,
  };

/** Legacy FRIS legend colors + light-mode 3D card tokens */
export type ActiveFlightStatTheme = {
  accent: string;
  swatch: string;
  bgTop: string;
  bgBottom: string;
  border: string;
  shadow: string;
  hoverShadow: string;
};

export type ActiveFlightStatItem = {
  key: ScheduledAirlinesActiveFlightStatKey;
  label: string;
  theme: ActiveFlightStatTheme;
};

export const ACTIVE_FLIGHT_STAT_ITEMS: ActiveFlightStatItem[] = [
  {
    key: 'total',
    label: 'Total',
    theme: {
      accent: '#047857',
      swatch: '#10b981',
      bgTop: '#ecfdf5',
      bgBottom: '#d1fae5',
      border: '#6ee7b7',
      shadow: 'rgba(4, 120, 87, 0.22)',
      hoverShadow: 'rgba(4, 120, 87, 0.38)',
    },
  },
  {
    key: 'passengerFlight',
    label: 'Passenger flight',
    theme: {
      accent: '#1d4ed8',
      swatch: '#3b82f6',
      bgTop: '#eff6ff',
      bgBottom: '#dbeafe',
      border: '#93c5fd',
      shadow: 'rgba(37, 99, 235, 0.25)',
      hoverShadow: 'rgba(37, 99, 235, 0.42)',
    },
  },
  {
    key: 'freighters',
    label: 'Freighters',
    theme: {
      accent: '#b45309',
      swatch: '#eab308',
      bgTop: '#fffbeb',
      bgBottom: '#fef3c7',
      border: '#fcd34d',
      shadow: 'rgba(217, 119, 6, 0.28)',
      hoverShadow: 'rgba(217, 119, 6, 0.45)',
    },
  },
  {
    key: 'additionalP',
    label: 'Additional (P)',
    theme: {
      accent: '#3f4f24',
      swatch: '#556b2f',
      bgTop: '#f4f6ef',
      bgBottom: '#e2e8d4',
      border: '#8a9a5c',
      shadow: 'rgba(63, 79, 36, 0.28)',
      hoverShadow: 'rgba(63, 79, 36, 0.44)',
    },
  },
  {
    key: 'additionalF',
    label: 'Additional (F)',
    theme: {
      accent: '#5f7a52',
      swatch: '#9caf88',
      bgTop: '#f3f7f0',
      bgBottom: '#e3eddc',
      border: '#b5c9a8',
      shadow: 'rgba(95, 122, 82, 0.26)',
      hoverShadow: 'rgba(95, 122, 82, 0.42)',
    },
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    theme: {
      accent: '#92704a',
      swatch: '#c4a882',
      bgTop: '#faf6f0',
      bgBottom: '#efe4d4',
      border: '#d4bc96',
      shadow: 'rgba(146, 112, 74, 0.28)',
      hoverShadow: 'rgba(146, 112, 74, 0.44)',
    },
  },
  {
    key: 'cancelledFlightData',
    label: 'Cancelled Flight Data',
    theme: {
      accent: '#78716c',
      swatch: '#a8a29e',
      bgTop: '#fafaf9',
      bgBottom: '#f5f5f4',
      border: '#d6d3d1',
      shadow: 'rgba(120, 113, 108, 0.22)',
      hoverShadow: 'rgba(120, 113, 108, 0.36)',
    },
  },
  {
    key: 'totalNonSkd',
    label: 'Total Non-SKD',
    theme: {
      accent: '#4338ca',
      swatch: '#6366f1',
      bgTop: '#eef2ff',
      bgBottom: '#e0e7ff',
      border: '#a5b4fc',
      shadow: 'rgba(67, 56, 202, 0.24)',
      hoverShadow: 'rgba(67, 56, 202, 0.4)',
    },
  },
  {
    key: 'totalRaf',
    label: 'Total RAF',
    theme: {
      accent: '#0e7490',
      swatch: '#06b6d4',
      bgTop: '#ecfeff',
      bgBottom: '#cffafe',
      border: '#67e8f9',
      shadow: 'rgba(14, 116, 144, 0.24)',
      hoverShadow: 'rgba(14, 116, 144, 0.4)',
    },
  },
  {
    key: 'domestic',
    label: 'Domestic',
    theme: {
      accent: '#1d4ed8',
      swatch: '#3b82f6',
      bgTop: '#eff6ff',
      bgBottom: '#dbeafe',
      border: '#93c5fd',
      shadow: 'rgba(37, 99, 235, 0.25)',
      hoverShadow: 'rgba(37, 99, 235, 0.42)',
    },
  },
  {
    key: 'international',
    label: 'International',
    theme: {
      accent: '#7c3aed',
      swatch: '#a78bfa',
      bgTop: '#f5f3ff',
      bgBottom: '#ede9fe',
      border: '#c4b5fd',
      shadow: 'rgba(124, 58, 237, 0.24)',
      hoverShadow: 'rgba(124, 58, 237, 0.4)',
    },
  },
  {
    key: 'domesticInternational',
    label: 'Domestic-International',
    theme: {
      accent: '#0e7490',
      swatch: '#06b6d4',
      bgTop: '#ecfeff',
      bgBottom: '#cffafe',
      border: '#67e8f9',
      shadow: 'rgba(14, 116, 144, 0.24)',
      hoverShadow: 'rgba(14, 116, 144, 0.4)',
    },
  },
  {
    key: 'internationalDomestic',
    label: 'International-Domestic',
    theme: {
      accent: '#0369a1',
      swatch: '#0ea5e9',
      bgTop: '#f0f9ff',
      bgBottom: '#bae6fd',
      border: '#7dd3fc',
      shadow: 'rgba(3, 105, 161, 0.24)',
      hoverShadow: 'rgba(3, 105, 161, 0.42)',
    },
  },
  {
    key: 'diverted',
    label: 'Diverted',
    theme: {
      accent: '#b45309',
      swatch: '#eab308',
      bgTop: '#fffbeb',
      bgBottom: '#fef3c7',
      border: '#fcd34d',
      shadow: 'rgba(217, 119, 6, 0.28)',
      hoverShadow: 'rgba(217, 119, 6, 0.45)',
    },
  },
  {
    key: 'turnaround',
    label: 'Turnaround',
    theme: {
      accent: '#3f4f24',
      swatch: '#556b2f',
      bgTop: '#f4f6ef',
      bgBottom: '#e2e8d4',
      border: '#8a9a5c',
      shadow: 'rgba(63, 79, 36, 0.28)',
      hoverShadow: 'rgba(63, 79, 36, 0.44)',
    },
  },
  {
    key: 'fifo',
    label: 'FIFO',
    theme: {
      accent: '#15803d',
      swatch: '#22c55e',
      bgTop: '#f0fdf4',
      bgBottom: '#dcfce7',
      border: '#86efac',
      shadow: 'rgba(21, 128, 61, 0.24)',
      hoverShadow: 'rgba(21, 128, 61, 0.4)',
    },
  },
  {
    key: 'filo',
    label: 'FILO',
    theme: {
      accent: '#4338ca',
      swatch: '#6366f1',
      bgTop: '#eef2ff',
      bgBottom: '#e0e7ff',
      border: '#a5b4fc',
      shadow: 'rgba(67, 56, 202, 0.24)',
      hoverShadow: 'rgba(67, 56, 202, 0.4)',
    },
  },
  {
    key: 'lifo',
    label: 'LIFO',
    theme: {
      accent: '#c2410c',
      swatch: '#f97316',
      bgTop: '#fff7ed',
      bgBottom: '#ffedd5',
      border: '#fdba74',
      shadow: 'rgba(194, 65, 12, 0.26)',
      hoverShadow: 'rgba(194, 65, 12, 0.42)',
    },
  },
  {
    key: 'rtr',
    label: 'RTR (Return to Ramp)',
    theme: {
      accent: '#dc2626',
      swatch: '#ef4444',
      bgTop: '#fef2f2',
      bgBottom: '#fee2e2',
      border: '#fca5a5',
      shadow: 'rgba(220, 38, 38, 0.28)',
      hoverShadow: 'rgba(220, 38, 38, 0.46)',
    },
  },
];
