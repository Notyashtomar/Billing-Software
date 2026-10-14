'use client';

import { cn } from '@/lib/utils';
import type { PaxDutyAllocationRecord } from '@/lib/paxDutyAllocationStorage';

export const SHIFT_FILTER_TABS = ['ALL', 'Morning', 'Day', 'Evening', 'Night'] as const;
export type ShiftFilterTab = (typeof SHIFT_FILTER_TABS)[number];

export const QUICK_DUTY_CHIPS = [
  'Check-in',
  'Gate',
  'Ramp',
  'Supervisor',
  'Arrival hall',
  'Departure hall',
  'Baggage',
  'Reservation',
  'CLC',
] as const;

export type DutyBadgeStyle = { bg: string; text: string; border: string };

export function getDutyBadgeStyle(duty: string): DutyBadgeStyle {
  const d = duty.toLowerCase();
  if (d.includes('check-in') || d.includes('checkin')) {
    return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' };
  }
  if (d.includes('gate') || d.includes('boarding')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  }
  if (d.includes('ramp')) {
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  }
  if (d.includes('supervis')) {
    return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  }
  if (d.includes('baggage')) {
    return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
  }
  if (d.includes('reservation')) {
    return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
  }
  if (d === 'clc' || d.includes('clc')) {
    return { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' };
  }
  if (d.includes('arrival') || d.includes('depart')) {
    return { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' };
  }
  return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
}

/** Filled chip when a quick-select duty is active — keeps semantic hue, not generic emerald. */
export function getDutySelectedChipClass(duty: string): string {
  const d = duty.toLowerCase();
  if (d.includes('check-in') || d.includes('checkin')) {
    return 'bg-sky-600 text-white border-sky-600 shadow-sky-600/20';
  }
  if (d.includes('gate') || d.includes('boarding')) {
    return 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/20';
  }
  if (d.includes('ramp')) {
    return 'bg-amber-600 text-white border-amber-600 shadow-amber-600/20';
  }
  if (d.includes('supervis')) {
    return 'bg-purple-600 text-white border-purple-600 shadow-purple-600/20';
  }
  if (d.includes('baggage')) {
    return 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-600/20';
  }
  if (d.includes('reservation')) {
    return 'bg-rose-600 text-white border-rose-600 shadow-rose-600/20';
  }
  if (d === 'clc' || d.includes('clc')) {
    return 'bg-teal-600 text-white border-teal-600 shadow-teal-600/20';
  }
  if (d.includes('arrival') || d.includes('depart')) {
    return 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/20';
  }
  return 'bg-slate-700 text-white border-slate-700';
}

export function getShiftBadgeClass(shift: string): string {
  const s = shift.trim().toLowerCase();
  if (s === 'morning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (s === 'day') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (s === 'evening') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (s === 'night') return 'border-slate-700 bg-slate-800 text-white';
  if (s === 'general') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-100 text-slate-700';
}

export function formatDutyDisplayDate(ymd: string): string {
  const p = ymd.split('-').map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  const [y, m, d] = p;
  try {
    return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

export function uniqueDutiesFromRecord(r: PaxDutyAllocationRecord): string[] {
  const seen: string[] = [];
  for (const s of r.staffAssignments ?? []) {
    for (const duty of s.dutyAllocations ?? []) {
      const t = String(duty ?? '').trim();
      if (t && !seen.includes(t)) seen.push(t);
    }
  }
  return seen;
}

export function DutyChip({
  duty,
  className,
}: {
  duty: string;
  className?: string;
}) {
  const badge = getDutyBadgeStyle(duty);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4',
        badge.bg,
        badge.text,
        badge.border,
        className,
      )}
    >
      {duty}
    </span>
  );
}

export function DutyChipList({
  duties,
  max = 6,
}: {
  duties: string[];
  max?: number;
}) {
  if (!duties.length) {
    return <span className="text-xs text-slate-400">No duties</span>;
  }
  const shown = duties.slice(0, max);
  const extra = duties.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((d) => (
        <DutyChip key={d} duty={d} />
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export const EMERALD_HEADER_CLASS = 'bg-emerald-600';

export const GLASS_CARD_CLASS =
  'rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md';
