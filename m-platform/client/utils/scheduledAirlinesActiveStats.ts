import type { FlightData } from '@/utils/dataProcessor';
import {
  isExportedNavStatus,
  isScheduleCancelledFlightNo,
  shouldHideScheduledAirlinesTableRow,
} from '@/utils/dataProcessor';

export type ActiveFlightsStatItem = {
  id: string;
  label: string;
  value: number;
  /** Primary row (flight mix) vs secondary row (export / reports). */
  row: 1 | 2;
  /** Tailwind classes for the color swatch (legacy legend colors). */
  swatchClass: string;
  /** Chip container: border + background tint matching the category. */
  chipClass: string;
  /** Count number emphasis color. */
  countClass: string;
  showSwatch?: boolean;
};

function isRowCancelled(f: FlightData): boolean {
  return f.isCancelled || isScheduleCancelledFlightNo(f.flightNo);
}

function isLockedYes(value?: string): boolean {
  const s = String(value ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === 'locked' || s === '1';
}

/** Freighter when aircraft / flight-type text suggests cargo (same rule as scheduled data export). */
export function isFreighterScheduledFlight(f: FlightData): boolean {
  const aircraft = String(f.aircraft ?? '').trim();
  const flightType = String(f.flightType ?? '').trim();
  const combined = `${aircraft} ${flightType}`;
  if (/freight|cargo|mail|\bfr\b|bcf/i.test(combined)) return true;
  return aircraft.length > 0 && /f/i.test(aircraft);
}

export function isAdditionalScheduledFlight(f: FlightData): boolean {
  if (f.scheduledAirlinesCreationCreatedAt) return true;
  const src = String(f.scheduleSource ?? '').toLowerCase();
  if (src.includes('scheduled_airlines_creation')) return true;
  const ft = String(f.flightType ?? '').toLowerCase();
  if (ft.includes('additional') || ft.includes('addl') || ft.includes('adhoc')) return true;
  const cat = String(f.cateOfFlight ?? '').toLowerCase();
  return cat.includes('additional');
}

function isBaseFlightRow(f: FlightData): boolean {
  const b = String(f.baseFlight ?? '').trim().toLowerCase();
  return b === 'y' || b === 'yes' || b === 'true' || b === '1';
}

function isUnsignedReport(f: FlightData): boolean {
  if (isRowCancelled(f)) return false;
  return !(
    isLockedYes(f.rampLocked) &&
    isLockedYes(f.paxLocked) &&
    isLockedYes(f.gsdLocked)
  );
}

function isPendingFlight(f: FlightData): boolean {
  if (isRowCancelled(f)) return false;
  const status = String(f.flightStatus ?? '').trim().toLowerCase();
  if (status === 'open') return true;
  return (
    !f.hasMainDetails ||
    !f.hasTerminalDetails ||
    !f.hasRampDetails ||
    !f.hasLoadControlDetails
  );
}

function isNonScheduledRow(f: FlightData): boolean {
  const ft = String(f.flightType ?? '').toLowerCase();
  const cat = String(f.cateOfFlight ?? '').toLowerCase();
  return (
    ft.includes('non-scheduled') ||
    ft.includes('non scheduled') ||
    ft.includes('nonskd') ||
    cat.includes('non-scheduled') ||
    cat.includes('non scheduled')
  );
}

function isRafRow(f: FlightData): boolean {
  const ft = String(f.flightType ?? '').toLowerCase();
  const cat = String(f.cateOfFlight ?? '').toLowerCase();
  return ft.includes('raf') || cat.includes('raf');
}

/**
 * Breakdown counts for the Scheduled Airlines “Active Flights” panel.
 * Uses the same visible row set as the table (after hide-row rules).
 */
export function computeScheduledAirlinesActiveStats(
  flights: FlightData[],
): ActiveFlightsStatItem[] {
  const rows = flights.filter((f) => !shouldHideScheduledAirlinesTableRow(f));

  let passenger = 0;
  let freighters = 0;
  let additionalP = 0;
  let additionalF = 0;
  let cancelled = 0;
  let pending = 0;
  let baseFlight = 0;
  let unsignedReport = 0;
  let exportedNav = 0;
  let notExportedNav = 0;
  let notExportedEqptNav = 0;
  let nonSkd = 0;
  let raf = 0;

  for (const f of rows) {
    if (isRowCancelled(f)) {
      cancelled += 1;
      continue;
    }

    if (isNonScheduledRow(f)) nonSkd += 1;
    if (isRafRow(f)) raf += 1;

    const additional = isAdditionalScheduledFlight(f);
    const freighter = isFreighterScheduledFlight(f);

    if (additional && freighter) additionalF += 1;
    else if (additional) additionalP += 1;
    else if (freighter) freighters += 1;
    else passenger += 1;

    if (isBaseFlightRow(f)) baseFlight += 1;
    if (isPendingFlight(f)) pending += 1;
    if (isUnsignedReport(f)) unsignedReport += 1;

    if (isExportedNavStatus(f.exportedNAV)) exportedNav += 1;
    else notExportedNav += 1;

    if (!f.hasEquipmentManpowerDetails) notExportedEqptNav += 1;
  }

  const total = rows.length;

  return [
    {
      id: 'total',
      label: 'Total',
      value: total,
      row: 1,
      swatchClass: 'bg-emerald-500',
      chipClass: 'border-emerald-300/80 bg-emerald-100/90',
      countClass: 'text-emerald-800',
      showSwatch: false,
    },
    {
      id: 'passenger',
      label: 'Passenger flight',
      value: passenger,
      row: 1,
      swatchClass: 'bg-blue-500',
      chipClass: 'border-blue-300/70 bg-blue-100/90',
      countClass: 'text-blue-800',
    },
    {
      id: 'freighters',
      label: 'Freighters',
      value: freighters,
      row: 1,
      swatchClass: 'bg-amber-400',
      chipClass: 'border-amber-300/80 bg-amber-100/95',
      countClass: 'text-amber-900',
    },
    {
      id: 'additional-p',
      label: 'Additional (P)',
      value: additionalP,
      row: 1,
      swatchClass: 'bg-emerald-700',
      chipClass: 'border-emerald-600/50 bg-emerald-200/80',
      countClass: 'text-emerald-950',
    },
    {
      id: 'additional-f',
      label: 'Additional (F)',
      value: additionalF,
      row: 1,
      swatchClass: 'bg-lime-400',
      chipClass: 'border-lime-400/80 bg-lime-100/95',
      countClass: 'text-lime-950',
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      value: cancelled,
      row: 1,
      swatchClass: 'bg-stone-400',
      chipClass: 'border-stone-400/70 bg-stone-200/90',
      countClass: 'text-stone-800',
    },
    {
      id: 'pending',
      label: 'Pending',
      value: pending,
      row: 1,
      swatchClass: 'bg-red-500',
      chipClass: 'border-red-300/80 bg-red-100/95',
      countClass: 'text-red-800',
    },
    {
      id: 'base-flight',
      label: 'Base Flight',
      value: baseFlight,
      row: 1,
      swatchClass: 'bg-violet-500',
      chipClass: 'border-violet-300/70 bg-violet-100/90',
      countClass: 'text-violet-900',
      showSwatch: false,
    },
    {
      id: 'unsigned-report',
      label: 'Un-Signed Report',
      value: unsignedReport,
      row: 2,
      swatchClass: 'bg-orange-500',
      chipClass: 'border-orange-300/70 bg-orange-100/90',
      countClass: 'text-orange-900',
      showSwatch: false,
    },
    {
      id: 'exported-nav',
      label: 'Exported [NAV]',
      value: exportedNav,
      row: 2,
      swatchClass: 'bg-sky-500',
      chipClass: 'border-sky-300/70 bg-sky-100/90',
      countClass: 'text-sky-900',
      showSwatch: false,
    },
    {
      id: 'not-exported-nav',
      label: 'Not Exported [NAV]',
      value: notExportedNav,
      row: 2,
      swatchClass: 'bg-slate-500',
      chipClass: 'border-slate-300/80 bg-slate-200/90',
      countClass: 'text-slate-800',
      showSwatch: false,
    },
    {
      id: 'not-exported-eqpt',
      label: 'Not Exported Eqpt. [NAV]',
      value: notExportedEqptNav,
      row: 2,
      swatchClass: 'bg-zinc-500',
      chipClass: 'border-zinc-300/80 bg-zinc-200/90',
      countClass: 'text-zinc-800',
      showSwatch: false,
    },
    {
      id: 'non-skd',
      label: 'Total Non-SKD',
      value: nonSkd,
      row: 2,
      swatchClass: 'bg-indigo-500',
      chipClass: 'border-indigo-300/70 bg-indigo-100/90',
      countClass: 'text-indigo-900',
      showSwatch: false,
    },
    {
      id: 'raf',
      label: 'Total RAF',
      value: raf,
      row: 2,
      swatchClass: 'bg-purple-500',
      chipClass: 'border-purple-300/70 bg-purple-100/90',
      countClass: 'text-purple-900',
      showSwatch: false,
    },
  ];
}
