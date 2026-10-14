import type { RampScheduledAirlineRow } from '@/types/fris/reports/rampScheduledAirline';
import type { NonScheduledAirlineTableRow } from '@/components/fris/reports/rampNonScheduledMappers';
import {
  fetchRampShiftNewReportId,
  getRampShiftReport,
  listRampShiftReports,
  upsertRampShiftReport,
  type RampShiftReportListItem,
  type RampShiftReportPayload,
} from '@/lib/api';
import { normalizeResourceGrid } from '@/components/fris/reports/rampResourceGrid';

export type RampShiftFormSnapshot = {
  manager: string;
  reportBy: string;
  totalArrivals: string;
  totalDepartures: string;
  paxFlts: string;
  cargoFlts: string;
  unschedPax: string;
  unschedCargo: string;
  delayAccountable: string;
  delayUnAccountable: string;
  otpTarget: string;
  otpActual: string;
  resourceValues: string[][];
  scheduledRows: RampScheduledAirlineRow[];
  nonScheduledRows: NonScheduledAirlineTableRow[];
  operationalNotes: string;
  irregularitiesNotes: string;
};

export type RampShiftSavedReport = {
  id: string;
  shift: 'day' | 'night';
  reportDateYmd: string;
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
  mailSent: boolean;
  form: RampShiftFormSnapshot;
};

export function payloadToFormSnapshot(p: RampShiftReportPayload): RampShiftFormSnapshot {
  const o = p.operationalIndicators ?? {};
  return {
    manager: p.manager,
    reportBy: p.reportBy,
    totalArrivals: o.totalArrivals ?? '',
    totalDepartures: o.totalDepartures ?? '',
    paxFlts: o.paxFlts ?? '',
    cargoFlts: o.cargoFlts ?? '',
    unschedPax: o.unschedPax ?? '',
    unschedCargo: o.unschedCargo ?? '',
    delayAccountable: o.delayAccountable ?? '',
    delayUnAccountable: o.delayUnAccountable ?? '',
    otpTarget: o.otpTarget ?? '',
    otpActual: o.otpActual ?? '',
    resourceValues: normalizeResourceGrid(p.resourceValues),
    scheduledRows: p.scheduledRows ?? [],
    nonScheduledRows: (p.nonScheduledRows ?? []) as NonScheduledAirlineTableRow[],
    operationalNotes: p.operationalNotes ?? '',
    irregularitiesNotes: p.irregularitiesNotes ?? '',
  };
}

function listItemToSaved(r: RampShiftReportListItem): Omit<RampShiftSavedReport, 'form'> & {
  form?: RampShiftFormSnapshot;
} {
  return {
    id: r.reportId,
    shift: r.shift,
    reportDateYmd: r.reportDateYmd,
    createdAt: r.createdAt ?? '',
    createdBy: r.createdBy,
    modifiedAt: r.updatedAt ?? r.createdAt ?? '',
    modifiedBy: r.modifiedBy,
    mailSent: r.mailSent,
  };
}

export async function listRampShiftReportsAsync(
  reportDateYmd: string,
  shift: 'day' | 'night',
): Promise<RampShiftSavedReport[]> {
  const items = await listRampShiftReports(reportDateYmd, shift);
  return items.map((r) => ({
    ...listItemToSaved(r),
    form: {} as RampShiftFormSnapshot,
  }));
}

export async function getRampShiftReportAsync(
  id: string,
): Promise<RampShiftSavedReport | null> {
  try {
    const p = await getRampShiftReport(id);
    return {
      id: p.reportId,
      shift: p.shift,
      reportDateYmd: p.reportDateYmd,
      createdAt: p.createdAt ?? '',
      createdBy: p.createdBy,
      modifiedAt: p.updatedAt ?? p.createdAt ?? '',
      modifiedBy: p.modifiedBy,
      mailSent: p.mailSent,
      form: payloadToFormSnapshot(p),
    };
  } catch {
    return null;
  }
}

export async function saveRampShiftReportAsync(
  report: RampShiftSavedReport,
  savedBy: string,
): Promise<void> {
  const f = report.form;
  await upsertRampShiftReport({
    reportId: report.id,
    reportDateYmd: report.reportDateYmd,
    shift: report.shift,
    manager: f.manager,
    reportBy: f.reportBy,
    operationalIndicators: {
      totalArrivals: f.totalArrivals,
      totalDepartures: f.totalDepartures,
      paxFlts: f.paxFlts,
      cargoFlts: f.cargoFlts,
      unschedPax: f.unschedPax,
      unschedCargo: f.unschedCargo,
      delayAccountable: f.delayAccountable,
      delayUnAccountable: f.delayUnAccountable,
      otpTarget: f.otpTarget,
      otpActual: f.otpActual,
    },
    resourceValues: f.resourceValues,
    scheduledRows: f.scheduledRows,
    nonScheduledRows: f.nonScheduledRows as unknown as Record<string, unknown>[],
    operationalNotes: f.operationalNotes,
    irregularitiesNotes: f.irregularitiesNotes,
    savedBy,
    mailSent: report.mailSent,
  });
}

export async function createRampShiftReportId(): Promise<string> {
  return fetchRampShiftNewReportId();
}

export function formatRampUserLabel(name: string, userId: string): string {
  const n = name.trim();
  const id = userId.trim();
  if (!n) return id || '—';
  if (!id) return n;
  if (n.includes(`(${id})`)) return n;
  return `${n}(${id})`;
}

/** Show name only when value is stored as Name(EmployeeID). */
export function displayRampPersonName(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '—') return '—';
  const m = /^(.+?)\s*\([^)]+\)\s*$/.exec(s);
  return m ? m[1]!.trim() || '—' : s;
}

export function readLoggedInUserLabel(): string {
  if (typeof window === 'undefined') return '—';
  try {
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr) as { name?: string; userid?: string; username?: string };
      const name = String(user.name ?? localStorage.getItem('username') ?? '').trim();
      const id = String(user.userid ?? user.username ?? localStorage.getItem('userid') ?? '').trim();
      return formatRampUserLabel(name, id);
    }
  } catch {
    /* ignore */
  }
  const name = String(localStorage.getItem('username') ?? '').trim();
  const id = String(localStorage.getItem('userid') ?? localStorage.getItem('userEmail') ?? '').trim();
  return formatRampUserLabel(name, id);
}
