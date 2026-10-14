/** Ramp report: map NS raw API documents (PascalCase + optional `additionalData`) to read-only table rows. */

export type NonScheduledAirlineTableRow = {
  id: string;
  sno: number;
  authorized: boolean;
  airline: string;
  fltNo: string;
  reportNo: string;
  bayArr: string;
  bayDep: string;
  arrivalSta: string;
  /** Display column matching legacy “ETA/ATA” (eta and ata combined). */
  arrivalEtaAta: string;
  holdOpen: string;
  holdClose: string;
  diffAta1stBag: string;
  diff1stBag: string;
  diffLastBag: string;
  diffLbAta: string;
  depStd: string;
  depEtd: string;
  depAtd: string;
  delay1: string;
  delay1Mins: string;
  delay2: string;
  delay2Mins: string;
  supvrName: string;
  teamAtBay: string;
  lastCargoLot: string;
  brs: string;
  chk: string;
};

type RawDoc = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function getVal(r: RawDoc, names: string[]): string {
  for (const n of names) {
    if (n in r && r[n] != null && str(r[n]) !== '') return str(r[n]);
  }
  return '';
}

function fromAdditional(r: RawDoc, k: string): string {
  const a = r.additionalData;
  if (a && typeof a === 'object' && k in a) {
    return str((a as RawDoc)[k]);
  }
  for (const n of [k, k.replace(/_/g, ' '), k.toLowerCase()]) {
    const v = getVal(r, [n]);
    if (v) return v;
  }
  return '';
}

function combine(d: string, t: string): string {
  if (d && t) return `${d} ${t}`.trim();
  if (d) return d;
  if (t) return t;
  return '';
}

import {
  matchesRampShiftMinutes,
  parseTimeToMinutes,
  scheduleLabelToYmd,
} from '@/components/fris/reports/rampShiftTime';

export { parseTimeToMinutes as parseStaTimeToMinutes } from '@/components/fris/reports/rampShiftTime';

function mapOne(
  raw: unknown,
  shift: 'day' | 'night',
  fallbackId: string,
  reportDateYmd?: string,
): NonScheduledAirlineTableRow | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as RawDoc;
  const reportNo = getVal(r, ['SerialNo', 'serialNo', 'slNo', 'SlNo', 'ReportNo', 'reportNo']);
  if (!reportNo) return null;

  const ataTime = getVal(r, ['ATATime', 'ataTime', 'ATA', 'ata']);
  const staTime = getVal(r, ['STATime', 'staTime', 'STA', 'sta']);
  const shiftMins = parseTimeToMinutes(ataTime) ?? parseTimeToMinutes(staTime);
  if (!matchesRampShiftMinutes(shiftMins, shift)) return null;

  const staD = getVal(r, ['STADate', 'staDate', 'STADat']);
  if (reportDateYmd) {
    const staYmd = scheduleLabelToYmd(staD);
    if (staYmd && staYmd !== reportDateYmd) return null;
  }

  const airline = getVal(r, ['Airline', 'airline', 'Arline_Code', 'airlineName']);
  const flt = getVal(r, ['FlightNo', 'flightNo', 'FLT', 'fltNo']);
  const stdD = getVal(r, ['STDDate', 'stdDate', 'STDDt']);
  const stdT = getVal(r, ['STDTime', 'stdTime']);
  const atad = getVal(r, ['ATADate', 'ataDate']);
  const atat = getVal(r, ['ATATime', 'ataTime', 'ArrivalATA', 'arrivalAtaTime']);
  const arrEta = fromAdditional(r, 'ETA') || fromAdditional(r, 'etaTime') || getVal(r, ['ETATime', 'eta', 'ETATim']);
  const arrAta = combine(atad, atat) || (atat && !atad ? atat : '') || (atad && !atat ? atad : '');
  const etaAtaDisplay = [arrEta, arrAta].map((p) => str(p).replace(/^—$/, '')).filter((p) => p && p !== '—');
  const atdd = getVal(r, ['ATDDate', 'atdDate', 'deptatadate']);
  const atdt = getVal(r, ['ATDTime', 'atdTime']);
  const etdD = getVal(r, ['ETDdate', 'ETDDate', 'etdDate']);
  const etdT = getVal(r, ['ETDtime', 'ETDTime', 'etdTime', 'Etd time']);

  const id = `ns-${reportNo}`.replace(/\s/g, '') || fallbackId;

  return {
    id,
    sno: 0,
    authorized: false,
    airline: airline || '—',
    fltNo: flt || '—',
    reportNo,
    bayArr: fromAdditional(r, 'BayArr') || fromAdditional(r, 'bayArr') || getVal(r, ['ArrBay', 'arrivalBay']) || '—',
    bayDep: fromAdditional(r, 'BayDep') || fromAdditional(r, 'bayDep') || getVal(r, ['DepBay', 'depBay']) || '—',
    arrivalSta: combine(staD, staTime) || '—',
    arrivalEtaAta: etaAtaDisplay.length > 0 ? etaAtaDisplay.join(' / ') : '—',
    holdOpen: fromAdditional(r, 'HoldOpen') || '—',
    holdClose: fromAdditional(r, 'HoldClose') || '—',
    diffAta1stBag: fromAdditional(r, 'DiffATA1stBag') || '—',
    diff1stBag: fromAdditional(r, 'Diff1stBag') || '—',
    diffLastBag: fromAdditional(r, 'DiffLastBag') || '—',
    diffLbAta: fromAdditional(r, 'DiffLBATA') || '—',
    depStd: combine(stdD, stdT) || '—',
    depEtd: combine(etdD, etdT) || '—',
    depAtd: combine(atdd, atdt) || '—',
    delay1: fromAdditional(r, 'Delay1') || '—',
    delay1Mins: fromAdditional(r, 'Delay1Mins') || '—',
    delay2: fromAdditional(r, 'Delay2') || '—',
    delay2Mins: fromAdditional(r, 'Delay2Mins') || '—',
    supvrName: fromAdditional(r, 'SupvrName') || '—',
    teamAtBay: fromAdditional(r, 'TeamAtBay') || '—',
    lastCargoLot: fromAdditional(r, 'LastCargoLotOnBay') || '—',
    brs: fromAdditional(r, 'BRS') || '—',
    chk: fromAdditional(r, 'CHK') || '—',
  };
}

/**
 * Deduplicate by `reportNo` (SerialNo), then map. Rows are re-numbered 1..n in display order.
 */
export function buildNonScheduledTableRows(
  raw: unknown[],
  shift: 'day' | 'night',
  reportDateYmd?: string,
): NonScheduledAirlineTableRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const bySerial = new Map<string, unknown>();
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const r = item as RawDoc;
    const k = getVal(r, ['SerialNo', 'serialNo', 'slNo', 'SlNo', 'ReportNo', 'reportNo']);
    if (k && !bySerial.has(String(k))) bySerial.set(String(k), item);
  }

  const rows: NonScheduledAirlineTableRow[] = [];
  let n = 0;
  for (const [, item] of bySerial) {
    n += 1;
    const row = mapOne(item, shift, `_ns-${n}`, reportDateYmd);
    if (row) rows.push(row);
  }
  return rows.map((r, i) => ({ ...r, sno: i + 1 }));
}
