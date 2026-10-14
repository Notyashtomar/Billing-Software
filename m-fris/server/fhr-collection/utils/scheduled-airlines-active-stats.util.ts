import {
  firstScheduleDateString,
  normalizeDateDdMmYyyy,
  ymdFromDdMmYyyy,
} from './sta-dates.util';

function fhrHelpers(): {
  fhrLeanDocIsCancelled: (doc: Record<string, unknown>) => boolean;
  resolveFhrRowHandlingText: (doc: Record<string, unknown>) => string;
} {
  // Lazy require — util must not top-level-import FhrCollectionService (SWC TDZ cycle).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../services/fhr-collection.service').FhrCollectionService;
}

function nonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function fhrDocumentStaYmd(
  _m: Record<string, unknown> | undefined,
  t: Record<string, unknown> | undefined,
  r1?: Record<string, unknown> | null,
  r3?: Record<string, unknown> | null,
): string | null {
  const t0 = t ?? {};
  const r1o = r1 ?? {};
  const r3o = r3 ?? {};
  const staScheduleRaw = firstScheduleDateString(
    t0.STADate,
    t0.staDate,
    r1o.STADate,
    r1o.staDate,
    r3o.STADate,
  );
  const stdScheduleRaw = firstScheduleDateString(
    t0.STDDate,
    t0.stdDate,
    r1o.STDDate,
    r1o.stdDate,
    r3o.STDDate,
  );
  const anchorRaw = staScheduleRaw || stdScheduleRaw;
  if (!anchorRaw) return null;
  const norm = normalizeDateDdMmYyyy(String(staScheduleRaw || anchorRaw));
  if (!norm) return null;
  return ymdFromDdMmYyyy(norm);
}

export type ScheduledAirlinesActiveStatsPayload = {
  from: string;
  to: string;
  total: number;
  handled: number;
  cancelled: number;
  passengerFlight: number;
  freighters: number;
  additionalP: number;
  additionalF: number;
  pending: number;
  baseFlight: number;
  unSignedReport: number;
  exportedNav: number;
  notExportedNav: number;
  notExportedEqptNav: number;
  cancelledFlightData: number;
  totalNonSkd: number;
  totalRaf: number;
};

function isExportedNav(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'exported';
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

function hasObjectPayload(value: unknown): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function hasEquipmentManpower(doc: Record<string, unknown>): boolean {
  const eqE = doc.equipmentManpower;
  if (!hasObjectPayload(eqE)) return false;
  const e = eqE as Record<string, unknown>;
  const entries = Array.isArray(e.entries) ? e.entries : [];
  if (entries.length > 0) return true;
  for (const k of [
    'verifiedBy',
    'verifiedAt',
    'verifiedByCode',
    'flightNo',
    'airlinesOperator',
    'sta',
    'staDate',
    'std',
    'stdDate',
    'acType',
    'routing',
    'operations',
  ]) {
    if (String(e[k] ?? '').trim()) return true;
  }
  return false;
}

function isRowClosed(doc: Record<string, unknown>, cancelled: boolean): boolean {
  if (cancelled) return false;
  const m = doc.mainDetails;
  const td = doc.terminalDetails;
  const r1 = doc.rampDetails1;
  const lc = doc.loadControlDetails;
  const allCoreForms =
    hasObjectPayload(m) &&
    hasObjectPayload(td) &&
    hasObjectPayload(r1) &&
    hasObjectPayload(lc);
  if (allCoreForms) return true;
  return false;
}

/**
 * Scheduled Airlines active-flights panel: same FHR STA window + cancel rules as
 * {@link FhrCollectionService.getHandledAndCancelledForStaYmdWindow} and dashboard KPI strip.
 */
export function aggregateScheduledAirlinesActiveStatsFromLeanRows(
  rows: unknown[],
  fromYmd: string,
  toYmd: string,
): ScheduledAirlinesActiveStatsPayload {
  const from = String(fromYmd ?? '').trim();
  const to = String(toYmd ?? '').trim();

  const stats = {
    total: 0,
    handled: 0,
    cancelled: 0,
    passengerFlight: 0,
    freighters: 0,
    additionalP: 0,
    additionalF: 0,
    pending: 0,
    baseFlight: 0,
    unSignedReport: 0,
    exportedNav: 0,
    notExportedNav: 0,
    notExportedEqptNav: 0,
    cancelledFlightData: 0,
    totalNonSkd: 0,
    totalRaf: 0,
  };

  if (!from || !to || from > to) {
    return { from, to, ...stats };
  }

  for (const raw of rows) {
    const doc = raw as Record<string, unknown>;
    const m = (doc.mainDetails ?? {}) as Record<string, unknown>;
    const td = (doc.terminalDetails ?? {}) as Record<string, unknown>;
    const r1 = (doc.rampDetails1 ?? {}) as Record<string, unknown>;
    const r3 = (doc.rampDetails3 ?? {}) as Record<string, unknown>;

    const staYmd = fhrDocumentStaYmd(
      m,
      td,
      r1,
      r3,
    );
    if (!staYmd || staYmd < from || staYmd > to) continue;

    stats.total += 1;
    const cancelled = fhrHelpers().fhrLeanDocIsCancelled(doc);
    if (cancelled) stats.cancelled += 1;
    else stats.handled += 1;

    const handling = fhrHelpers().resolveFhrRowHandlingText(doc);
    const cateOfFlight = nonEmpty(
      m.CateofFlight,
      m.cateOfFlight,
      m.CateOfFlight,
    );
    const flightType = nonEmpty(m.FlightType, m.flightType);
    const freighter = isFreighterFromCategory(cateOfFlight, flightType);
    const exportedNav = nonEmpty(
      m.exportedNAV,
      m['Exported NAV'],
      m.ExportedNAV,
    );

    const hasMain = hasObjectPayload(doc.mainDetails);
    const hasTerminal = hasObjectPayload(doc.terminalDetails);
    const hasRamp = hasObjectPayload(doc.rampDetails1);
    const hasLoad = hasObjectPayload(doc.loadControlDetails);
    const hasEq = hasEquipmentManpower(doc);

    if (!isRowClosed(doc, cancelled)) {
      if (!cancelled) stats.pending += 1;
    }

    if (
      cancelled &&
      (hasMain || hasTerminal || hasRamp || hasLoad || hasEq)
    ) {
      stats.cancelledFlightData += 1;
    }

    if (isNonSkdHandling(handling)) stats.totalNonSkd += 1;
    if (isRafHandling(handling)) stats.totalRaf += 1;

    if (isExportedNav(exportedNav)) {
      stats.exportedNav += 1;
    } else if (!cancelled) {
      stats.notExportedNav += 1;
      if (hasEq) stats.notExportedEqptNav += 1;
    }

    const allLocks = hasRamp && hasTerminal && hasEq;
    if (!cancelled && !allLocks) stats.unSignedReport += 1;

    const baseFlight = String(m.baseFlight ?? m.BaseFlight ?? '')
      .trim()
      .toLowerCase();
    if (
      !cancelled &&
      (baseFlight === 'y' || baseFlight === 'yes' || baseFlight === 'true' || baseFlight === '1')
    ) {
      stats.baseFlight += 1;
    }

    if (isAdditionalHandling(handling)) {
      if (freighter) stats.additionalF += 1;
      else stats.additionalP += 1;
    } else if (isScheduledHandling(handling) && !cancelled) {
      if (freighter) stats.freighters += 1;
      else stats.passengerFlight += 1;
    }
  }

  return { from, to, ...stats };
}
