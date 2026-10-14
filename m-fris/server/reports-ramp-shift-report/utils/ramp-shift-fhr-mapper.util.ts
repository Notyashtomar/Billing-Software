import type { RampScheduledAirlineRow } from '../schema/reports-ramp-shift-report.schema';
import {
  matchesRampShiftMinutes,
  parseTimeToMinutes,
  scheduleLabelToYmd,
} from './ramp-shift-time.util';
import type { RampShiftBand } from '../constants/reports-ramp-shift-report.constants';

type RawDoc = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function first(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return '';
}

function combine(d: string, t: string): string {
  if (d && t) return `${d} ${t}`.trim();
  return d || t || '';
}

function timeOnly(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (!s) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m) return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
  }
  for (const v of vals) {
    const s = str(v);
    if (!s) continue;
    const tail = /(\d{1,2}):(\d{2})\s*$/.exec(s);
    if (tail) return `${String(Number(tail[1])).padStart(2, '0')}:${tail[2]}`;
  }
  return '';
}

function delayMinsDisplay(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v).replace(/\./g, ':');
    if (!s) continue;
    const m = /^(\d{1,3}):(\d{2})$/.exec(s);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return '00:00';
}

function embed(
  fhr: Record<string, unknown> | undefined,
  key: string,
): RawDoc | undefined {
  const v = fhr?.[key];
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as RawDoc)
    : undefined;
}

function mapDelays(m: RawDoc | undefined): {
  d1: string;
  m1: string;
  d2: string;
  m2: string;
} {
  if (!m) return { d1: '', m1: '', d2: '', m2: '' };
  const lines: { reason: string; delay: string }[] = [];
  for (const list of [
    m.arrivalDelays,
    m.ArrivalDelays,
    m.departureDelays,
    m.DepartureDelays,
  ]) {
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      const o = e as RawDoc;
      const reason = first(o.ReasonofDelay, o.reasonOfDelay, o.reason);
      const delay = first(o.Delay, o.delay);
      if (reason || delay) lines.push({ reason, delay });
    }
  }
  return {
    d1: lines[0]?.reason ?? '',
    m1: lines[0]?.delay ?? '',
    d2: lines[1]?.reason ?? '',
    m2: lines[1]?.delay ?? '',
  };
}

function holdOpenFromRamp(r1: RawDoc | undefined): string {
  if (!r1) return '';
  return (
    combine(
      first(r1.holdOpenFrontDate, r1.Frontopen),
      first(r1.holdOpenFrontTime),
    ) ||
    combine(first(r1.holdOpenRearDate, r1.Rearopen), first(r1.holdOpenRearTime)) ||
    combine(first(r1.holdOpenBulkDate, r1.Bulkopen), first(r1.holdOpenBulkTime)) ||
    ''
  );
}

function holdCloseFromRamp(r1: RawDoc | undefined): string {
  if (!r1) return '';
  return (
    combine(
      first(r1.holdCloseFrontDate),
      first(r1.holdCloseFrontTime),
    ) ||
    combine(
      first(r1.lastActivityHoldDate),
      first(r1.lastActivityHoldTime),
    ) ||
    combine(first(r1.CleaningTo), first(r1.cleaningClosedTime)) ||
    ''
  );
}

function firstBagDisplay(r1: RawDoc | undefined, rowData: RawDoc): string {
  return (
    combine(
      first(r1?.firstBagArrivalHallDate, r1?.Fbarr),
      first(r1?.firstBagArrivalHallTime, r1?.firstBagInBmaTime),
    ) ||
    str(rowData.fBag) ||
    ''
  );
}

function lastBagDisplay(r1: RawDoc | undefined, rowData: RawDoc): string {
  return (
    combine(
      first(r1?.lastBagArrivalHallDate, r1?.Lbarr),
      first(r1?.lastBagArrivalHallTime, r1?.lastBagInBmaTime),
    ) ||
    str(rowData.lBag) ||
    ''
  );
}

function passesShiftBand(
  d: RawDoc,
  m: RawDoc | undefined,
  shift: RampShiftBand,
): boolean {
  const ataT = first(d.ataTime, d.ATATime, m?.ATATime);
  const staT = first(d.staTime, d.STATime, m?.STATime);
  const ataMins = parseTimeToMinutes(ataT);
  const staMins = parseTimeToMinutes(staT);
  const hasAta = Boolean(first(d.ataDate, d.ATADate, m?.ATADate) && ataT);
  const bandMins = hasAta && ataMins != null ? ataMins : staMins;
  return matchesRampShiftMinutes(bandMins, shift);
}

export function mapDailyRowToRampScheduled(
  item: { data?: Record<string, unknown> },
  fhr: Record<string, unknown> | undefined,
  reportDateYmd: string,
  shift: RampShiftBand,
): RampScheduledAirlineRow | null {
  const d = (item.data ?? {}) as RawDoc;
  const m = embed(fhr, 'mainDetails');
  const r1 = embed(fhr, 'rampDetails1');
  const r2 = embed(fhr, 'rampDetails2');
  const t = embed(fhr, 'terminalDetails');

  const serial = first(
    d.slNo,
    d.SlNo,
    d.serialNo,
    d.SerialNo,
    m?.SerialNo,
    m?.flightSerialNumber,
  );
  if (!serial) return null;

  if (
    d.isCancelled === true ||
    str(d.flightStatus).toLowerCase() === 'cancelled' ||
    m?.flightCancelled === true
  ) {
    return null;
  }

  const staD = first(d.staDate, d.STADate, m?.IPosDate, r1?.STADate);
  if (scheduleLabelToYmd(staD) !== reportDateYmd) return null;

  if (!passesShiftBand(d, m, shift)) return null;

  const airline = first(d.airline, d.Airline, m?.Airline, m?.Arline_Code) || '—';
  const arr = first(m?.ArrivalFltNo, d.ArrivalFltNo);
  const dep = first(m?.DepartureFltNo, d.DepartureFltNo);
  const flt =
    arr && dep && arr.toUpperCase() !== dep.toUpperCase()
      ? `${arr}/${dep}`
      : first(d.flightNo, d.FlightNo, r1?.FlightNo, dep, arr) || '—';

  const staT = first(d.staTime, d.STATime, m?.STATime, r1?.STATime);
  const ataD = first(d.ataDate, d.ATADate, m?.ATADate, r1?.ATADate);
  const ataT = first(d.ataTime, d.ATATime, m?.ATATime, r1?.ATATime);
  const stdD = first(d.stdDate, d.STDDate, m?.etdDate, r1?.STDDate);
  const stdT = first(d.stdTime, d.STDTime, m?.ETDtime, r1?.STDTime);
  const etdD = first(d.etdDate, m?.etdDate, r1?.etdDate);
  const etdT = first(d.etdTime, m?.ETDtime, r1?.etd);
  const atdD = first(d.atdDate, d.ATDDate, m?.ATDDate, r1?.ATADate);
  const atdT = first(d.atdTime, d.ATDTime, m?.ATDTime);

  const delays = mapDelays(m ?? d);
  const fBag = str(d.fBag) || str(d['F Bag']);
  const lBag = str(d.lBag) || str(d['L Bag']);

  return {
    id: `sch-${serial}`,
    serialNo: serial,
    checked: false,
    authorized: false,
    airline,
    fltNo: flt,
    reportNo: serial,
    bayArr: first(r1?.BayPlanned, r1?.bayPlanned, t?.gatePlanned) || '—',
    bayDep: first(r1?.BayFinal, r1?.bayFinal, t?.gateFinal) || '—',
    arrivalSta: timeOnly(staT, d.staTime, m?.STATime, r1?.STATime) || '—',
    arrivalEta: timeOnly(t?.eta, d.etaTime, d.ETATime) || '—',
    arrivalAta: timeOnly(ataT, d.ataTime, m?.ATATime, r1?.ATATime) || '—',
    holdOpen: holdOpenFromRamp(r1) || '—',
    holdClose: holdCloseFromRamp(r1) || str(d.hClose) || '—',
    diffAta1stBag: fBag || '—',
    diff1stBag: firstBagDisplay(r1, d) || fBag || '—',
    diffLastBag: lastBagDisplay(r1, d) || lBag || '—',
    diffLbAta: lBag || '—',
    depStd: timeOnly(stdT, d.stdTime, m?.ETDtime, r1?.STDTime) || '—',
    depEtd: timeOnly(etdT, d.etdTime, m?.ETDtime, r1?.etd) || '—',
    depAtd: timeOnly(atdT, d.atdTime, m?.ATDTime) || '—',
    delay1: delays.d1 || '—',
    delay1Mins: delayMinsDisplay(delays.m1),
    delay2: delays.d2 || '—',
    delay2Mins: delayMinsDisplay(delays.m2),
    supvrName: first(r2?.chooseEmployee, r2?.name) || '—',
    teamAtBay: first(r2?.dutyAllocation, r2?.area) || '—',
    lastCargoLot: first(r1?.lastActivityHoldTime, r1?.cgopcout) || '—',
    brs: first(r1?.bagreco, r1?.arrivalBaggageCount) || '—',
    chk: first(t?.systemBagCount, r1?.bbaBelt) || '—',
    flightStatus: first(d.flightStatus) || '—',
    aircraft: first(d.aircraft, m?.TypeCraft, m?.Regn) || '—',
    isUpcoming: !first(ataD, ataT) || ataT === '—',
  };
}
